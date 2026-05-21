import assert from "node:assert/strict";
import { activeTemplate, createTemplate, defaultState, ensureInvitationMessage, imageDataUrl, pruneUnsavedGuestInvitations, rebuildMessages, renderBody, repairLegacyInvitations, setActiveTemplate, setRsvp, stampRecipientSnapshot, upsertTemplate } from "../src/lib/domain";
import { findLegacyRecipientByPhone, findLegacyRecipientByToken, legacyRecipientContact, normalizeJordanPhone } from "../src/lib/legacy-recipients";
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
const legacy = ensureInvitationMessage(state, "unknownToken1");
assert.equal(legacy?.token, "unknownToken1");
assert.equal(legacy?.contactId, "legacy-unknownToken1");
assert.equal(setRsvp(state, "unknownToken1", "NO"), true);
assert.equal(state.campaign.messages.find((item) => item.token === "unknownToken1")?.rsvp, "NO");
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

const snapshotState = defaultState();
const snapshotTemplate = createTemplate("Snapshot", "Dear {{name}} link {{rsvp_link}}");
upsertTemplate(snapshotState, snapshotTemplate, true);
const snapshotContact: Contact = { id: "snap-contact", name: "Correct Recipient", phone: "962799999999", sourceTab: "Test", fields: {} };
const snapshotMessage: Message = {
  id: "snap-message",
  contactId: snapshotContact.id,
  recipientName: "Wrong Recipient",
  recipientPhone: "000",
  recipientSnapshotAt: "",
  token: "snapToken",
  body: "Dear Wrong Recipient",
  status: "READY",
  providerMessageId: "",
  error: "",
  sentAt: "",
  rsvp: "",
  rsvpAt: "",
};
snapshotState.campaign.contacts = [snapshotContact];
snapshotState.campaign.messages = [snapshotMessage];
stampRecipientSnapshot(snapshotState, snapshotMessage, snapshotContact, "2026-05-21T00:00:00.000Z");
assert.equal(snapshotMessage.recipientName, "Correct Recipient");
assert.equal(snapshotMessage.recipientPhone, "962799999999");
assert.equal(snapshotMessage.recipientSnapshotAt, "2026-05-21T00:00:00.000Z");
assert.match(snapshotMessage.body, /Dear Correct Recipient/);
assert.doesNotMatch(snapshotMessage.body, /Wrong Recipient/);
assert.equal(normalizeJordanPhone("07 90344602"), "790344602");
assert.equal(normalizeJordanPhone("+962 7 9034 4602"), "790344602");
assert.equal(findLegacyRecipientByPhone("+962 7 9034 4602")?.name, "السيد حسام التكروري و عقيلته");
assert.equal(findLegacyRecipientByToken("DWvMGRZ8")?.name, "عطوفة اكثم المجالي و عائلته");
assert.equal(findLegacyRecipientByToken("JybYzueR")?.name, "السيد طلال المجالي و عقيلته");
assert.equal(findLegacyRecipientByToken("p4M8nMun")?.name, "السيد عمرو الصغير و عقيلته");
assert.equal(findLegacyRecipientByToken("aNyY7wEs")?.name, "السيد حسام المجالي و عائلته");
assert.equal(findLegacyRecipientByPhone("0799999999"), null);
assert.equal(legacyRecipientContact({ name: "Guest A", phone: "0790344602" }, "tok1").phone, "962790344602");

const recoveredState = defaultState();
const recoveredMessage = ensureInvitationMessage(recoveredState, "fjDZh3dq");
assert.equal(recoveredMessage?.recipientName, "المهندس أنس الذنبيات و عقيلته");
assert.ok(recoveredMessage?.recipientSnapshotAt);
assert.equal(recoveredMessage?.status, "SENT");
assert.ok(recoveredMessage?.sentAt);

console.log("domain tests passed");
