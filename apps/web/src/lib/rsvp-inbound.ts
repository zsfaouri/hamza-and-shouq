import { setRsvp } from "./domain";
import type { AppState, RsvpResponse } from "./types";

const yesPhrases = [
  "1",
  "y",
  "yes",
  "attend",
  "attending",
  "confirm",
  "confirmed",
  "rsvp yes",
  "rsvp attending",
  "attending yes",
  "نعم",
  "حاضر",
  "بحضر",
  "اكيد",
  "ساحضر",
];

const noPhrases = [
  "0",
  "2",
  "n",
  "no",
  "not attending",
  "not attend",
  "cannot attend",
  "cant attend",
  "can't attend",
  "decline",
  "declined",
  "rsvp no",
  "rsvp decline",
  "not attending no",
  "لا",
  "كلا",
  "معتذر",
  "اعتذر",
  "لن احضر",
  "مش حاضر",
  "غير حاضر",
];

export function phoneDigits(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function normalizeRsvpText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => {
    if (text === phrase) return true;
    if (phrase.length === 1) return false;
    return new RegExp(`(^| )${escapeRegExp(phrase)}( |$)`).test(text);
  });
}

export function parseInboundRsvpReply(value: string): RsvpResponse | "" {
  const text = normalizeRsvpText(value);
  if (!text) return "";
  if (matchesAny(text, noPhrases)) return "NO";
  if (matchesAny(text, yesPhrases)) return "YES";
  return "";
}

export function applyInboundRsvp(state: AppState, phone: string, text: string) {
  const response = parseInboundRsvpReply(text);
  if (!response) return { updated: false, response: "" as const, reason: "No RSVP intent detected." };

  const inboundPhone = phoneDigits(phone);
  if (inboundPhone.length < 7) return { updated: false, response, reason: "Missing sender phone." };

  const inboundTail = inboundPhone.slice(-9);
  const contact = state.campaign.contacts.find((item) => {
    const contactPhone = phoneDigits(item.phone);
    if (contactPhone.length < 7) return false;
    return contactPhone.endsWith(inboundTail) || inboundPhone.endsWith(contactPhone.slice(-9));
  });
  if (!contact) return { updated: false, response, reason: "No matching contact." };

  const message = state.campaign.messages.find((item) => item.contactId === contact.id);
  if (!message) return { updated: false, response, reason: "No matching message." };

  const updated = setRsvp(state, message.token, response);
  return { updated, response, reason: updated ? "" : "RSVP update failed." };
}
