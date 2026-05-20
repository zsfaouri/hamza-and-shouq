import assert from "node:assert/strict";
import { activeTemplate, createTemplate, defaultState, ensureInvitationMessage, imageDataUrl, pruneUnsavedGuestInvitations, rebuildMessages, renderBody, repairLegacyInvitations, setActiveTemplate, setRsvp, upsertTemplate } from "../src/lib/domain";
import type { AppState, Contact, Message, Template } from "../src/lib/types";

const contact: Contact = {
  id: "c1",
  name: "Zein",
  phone: "962790000000",
  sourceTab: "Test",
  fields: { seats: "2" },
};
const template: Template = {
  id: "t1",
  name: "Invite",
  body: "Hi {{name}}. Seats: {{seats}}. Yes {{attending_link}} No {{not_attending_link}}",
  mediaUrl: "",
  mediaName: "",
  mediaMimeType: "",
  mediaData: "",
  includeRsvpLinks: true,
  updatedAt: new Date(0).toISOString(),
};

const body = renderBody(template, contact, "token-1");
assert.match(body, /Hi Zein/);
assert.match(body, /Seats: 2/);
assert.match(body, /\?t=token-1&response=YES/);
assert.match(body, /\?t=token-1&response=NO/);

const message: Message = {
  id: "m1",
  contactId: "c1",
  recipientName: "Zein",
  recipientPhone: "962790000000",
  recipientSnapshotAt: new Date(0).toISOString(),
  token: "token-1",
  body,
  status: "READY",
  providerMessageId: "",
  error: "",
  sentAt: "",
  rsvp: "",
  rsvpAt: "",
};
const state = {
  version: 1,
  campaign: { id: "campaign-main", name: "Test", sheetUrl: "", selectedTabs: [], contacts: [contact], messages: [message], updatedAt: "" },
  template,
  templates: [template],
  activeTemplateId: template.id,
  whatsapp: {
    provider: "meta",
    graphVersion: "v23.0",
    phoneNumberId: "",
    accessToken: "",
    verifyToken: "verify",
    senderPhone: "",
    personalBridgeUrl: "",
    personalBridgeToken: "",
    openwaApiUrl: "",
    openwaApiKey: "",
  },
} satisfies AppState;

assert.equal(setRsvp(state, "token-1", "YES"), true);
assert.equal(state.campaign.messages[0].rsvp, "YES");
assert.equal(setRsvp(state, "bad", "NO"), false);
const legacy = ensureInvitationMessage(state, "JybYzueR");
assert.equal(legacy?.token, "JybYzueR");
assert.equal(legacy?.contactId, "legacy-JybYzueR");
assert.equal(setRsvp(state, "JybYzueR", "NO"), true);
assert.equal(state.campaign.messages.find((item) => item.token === "JybYzueR")?.rsvp, "NO");
assert.equal(ensureInvitationMessage(state, "../bad"), null);
state.campaign.contacts.push({ id: "legacy-old", name: "Guest", phone: "", sourceTab: "legacy-link", fields: { legacyToken: "oldToken" } });
state.campaign.contacts.push({ id: "c2", name: "Maha", phone: "962790000001", sourceTab: "Test", fields: { legacyToken: "oldToken" } });
state.campaign.messages.push({ ...message, id: "legacy-message", contactId: "legacy-old", token: "oldToken", rsvp: "" });
assert.equal(repairLegacyInvitations(state), true);
assert.equal(state.campaign.messages.find((item) => item.token === "oldToken")?.contactId, "c2");

const importedAgain: Contact = {
  id: "new-contact-id",
  name: "Zein",
  phone: "962790000000",
  sourceTab: "Import",
  fields: {},
};
state.campaign.contacts = [importedAgain];
rebuildMessages(state.campaign, template);
assert.equal(state.campaign.messages.find((item) => item.contactId === "new-contact-id")?.token, "token-1");
assert.equal(state.campaign.messages.find((item) => item.contactId === "new-contact-id")?.recipientName, "Zein");
state.campaign.messages[0].status = "SENT";
state.campaign.messages[0].sentAt = new Date(0).toISOString();
state.campaign.contacts = [];
rebuildMessages(state.campaign, template);
assert.equal(state.campaign.messages[0].token, "token-1");
assert.equal(state.campaign.messages[0].recipientName, "Zein");
state.campaign.contacts.push({ id: "legacy-unsent", name: "Guest", phone: "", sourceTab: "legacy-link", fields: { legacyToken: "dropme" } });
state.campaign.messages.push({ ...message, id: "legacy-unsent-message", contactId: "legacy-unsent", token: "dropme", recipientName: "Guest", recipientPhone: "", recipientSnapshotAt: "", rsvp: "", status: "READY", sentAt: "", providerMessageId: "" });
assert.equal(pruneUnsavedGuestInvitations(state), true);
assert.equal(state.campaign.messages.some((item) => item.token === "dropme"), false);

const multi = defaultState();
assert.equal(multi.templates.length, 1);
const second = createTemplate("Reminder", "Reminder for {{name}}");
upsertTemplate(multi, second, true);
assert.equal(multi.templates.length, 2);
assert.equal(multi.activeTemplateId, second.id);
assert.equal(activeTemplate(multi).name, "Reminder");
assert.equal(multi.template.name, "Reminder");
setActiveTemplate(multi, "template-main");
assert.equal(activeTemplate(multi).name, "Wedding invitation");
assert.equal(multi.template.id, "template-main");
assert.equal(imageDataUrl("image/png", "abc123"), "data:image/png;base64,abc123");
assert.equal(imageDataUrl("", "abc123"), "");

console.log("domain tests passed");
