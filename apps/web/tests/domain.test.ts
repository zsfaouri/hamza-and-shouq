import assert from "node:assert/strict";
import { renderBody, setRsvp } from "../src/lib/domain";
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
  includeRsvpLinks: true,
  updatedAt: new Date(0).toISOString(),
};

const body = renderBody(template, contact, "token-1");
assert.match(body, /Hi Zein/);
assert.match(body, /Seats: 2/);
assert.match(body, /\/rsvp\/token-1\?response=YES/);
assert.match(body, /\/rsvp\/token-1\?response=NO/);

const message: Message = {
  id: "m1",
  contactId: "c1",
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
  whatsapp: {
    provider: "meta",
    graphVersion: "v23.0",
    phoneNumberId: "",
    accessToken: "",
    verifyToken: "verify",
    senderPhone: "",
    personalBridgeUrl: "",
    personalBridgeToken: "",
  },
} satisfies AppState;

assert.equal(setRsvp(state, "token-1", "YES"), true);
assert.equal(state.campaign.messages[0].rsvp, "YES");
assert.equal(setRsvp(state, "bad", "NO"), false);

console.log("domain tests passed");
