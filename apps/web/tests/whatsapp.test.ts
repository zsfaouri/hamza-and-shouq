import assert from "node:assert/strict";
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
};

assert.equal(whatsappConfigured(base), false);
assert.equal(whatsappConfigured({ ...base, phoneNumberId: "123", accessToken: "token" }), true);
assert.equal(whatsappConfigured({ ...base, provider: "personal", personalBridgeUrl: "https://bridge.example.com" }), true);

console.log("whatsapp tests passed");
