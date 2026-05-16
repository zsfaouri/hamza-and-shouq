import assert from "node:assert/strict";

import {
  appendRsvpActionLinks,
  createRsvpLinks,
  parseIncomingRsvpReply,
} from "../src/rsvp.js";
import { resolveVariables } from "../src/template.js";

const links = createRsvpLinks("https://api.example.com", "token-123");

assert.equal(links.view, "https://api.example.com/rsvp/token-123");
assert.equal(links.yes, "https://api.example.com/rsvp/token-123?response=YES");
assert.equal(links.no, "https://api.example.com/rsvp/token-123?response=NO");

const variables = resolveVariables({
  contact: { name: "Zein", phone: "962799999999", customFields: {} },
  template: { includeRsvpLink: true },
  rsvpLink: links.view,
  rsvpYesLink: links.yes,
  rsvpNoLink: links.no,
});

assert.equal(variables.rsvp_link, links.view);
assert.equal(variables.rsvp_yes_link, links.yes);
assert.equal(variables.rsvp_no_link, links.no);
assert.equal(variables.attending_link, links.yes);
assert.equal(variables.not_attending_link, links.no);

assert.equal(parseIncomingRsvpReply("Attending"), "YES");
assert.equal(parseIncomingRsvpReply("yes I will attend"), "YES");
assert.equal(parseIncomingRsvpReply("حاضر"), "YES");
assert.equal(parseIncomingRsvpReply("Not attending"), "NO");
assert.equal(parseIncomingRsvpReply("no sorry"), "NO");
assert.equal(parseIncomingRsvpReply("اعتذر"), "NO");
assert.equal(parseIncomingRsvpReply("thank you"), null);

assert.equal(
  appendRsvpActionLinks("Invitation", "Invitation", links, true),
  `Invitation\n\nAttending: ${links.yes}\nNot attending: ${links.no}`,
);
assert.equal(
  appendRsvpActionLinks("Use {{rsvp_yes_link}}", `Use ${links.yes}`, links, true),
  `Use ${links.yes}`,
);
assert.equal(
  appendRsvpActionLinks("Please RSVP here: {{rsvp_link}}", `Please RSVP here: ${links.view}`, links, true),
  `Please RSVP here: ${links.view}\n\nAttending: ${links.yes}\nNot attending: ${links.no}`,
);
assert.equal(
  appendRsvpActionLinks("Invitation", "Invitation", links, false),
  "Invitation",
);

console.log("rsvp-flow tests passed");
