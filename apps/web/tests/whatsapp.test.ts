import assert from "node:assert/strict";
import { parseInboundRsvpReply } from "../src/lib/rsvp-inbound";
import { whatsappConfigured } from "../src/lib/whatsapp";
import type { WhatsAppSettings } from "../src/lib/types";

const base: WhatsAppSettings = {
  provider: "meta",
  graphVersion: "v23.0",
  phoneNumberId: "",
  accessToken: "",
  verifyToken: "verify",
  senderPhone: "962795941263",
  personalBridgeUrl: "",
  personalBridgeToken: "",
  openwaApiUrl: "",
  openwaApiKey: "",
};

assert.equal(whatsappConfigured(base), false);
assert.equal(whatsappConfigured({ ...base, phoneNumberId: "123", accessToken: "token" }), true);
assert.equal(whatsappConfigured({ ...base, provider: "personal", personalBridgeUrl: "https://bridge.example.com" }), true);
assert.equal(parseInboundRsvpReply("attending"), "YES");
assert.equal(parseInboundRsvpReply("not attending"), "NO");
assert.equal(parseInboundRsvpReply("RSVP_YES"), "YES");
assert.equal(parseInboundRsvpReply("RSVP_NO"), "NO");
assert.equal(parseInboundRsvpReply("نعم"), "YES");
assert.equal(parseInboundRsvpReply("لا"), "NO");
assert.equal(parseInboundRsvpReply("أكيد"), "YES");
assert.equal(parseInboundRsvpReply("لن أحضر"), "NO");

console.log("whatsapp tests passed");
