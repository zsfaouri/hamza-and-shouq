import type { AppState, Campaign, Contact, Message, RsvpResponse, Template } from "./types";

export function nowIso() {
  return new Date().toISOString();
}

export function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL) return "https://web-zsfaouris-projects.vercel.app";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function defaultTemplate(): Template {
  return {
    id: "template-main",
    name: "Wedding invitation",
    body: "Hi {{name}}, you are invited to Hamza and Shouq's wedding.\n\nAttending: {{attending_link}}\nNot attending: {{not_attending_link}}",
    mediaUrl: "",
    includeRsvpLinks: true,
    updatedAt: nowIso(),
  };
}

export function defaultCampaign(): Campaign {
  return {
    id: "campaign-main",
    name: "Wedding invitations",
    sheetUrl: "",
    selectedTabs: [],
    contacts: [],
    messages: [],
    updatedAt: nowIso(),
  };
}

export function defaultState(): AppState {
  return {
    version: 1,
    campaign: defaultCampaign(),
    template: defaultTemplate(),
    whatsapp: {
      provider: "meta",
      graphVersion: process.env.META_GRAPH_VERSION || "v23.0",
      phoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
      accessToken: process.env.META_ACCESS_TOKEN || "",
      verifyToken: process.env.META_VERIFY_TOKEN || "hamza-shouq-webhook",
      senderPhone: process.env.WHATSAPP_SENDER_PHONE || "962795941263",
    },
  };
}

function value(contact: Contact, key: string) {
  if (key === "name") return contact.name;
  if (key === "phone") return contact.phone;
  if (key === "source_tab") return contact.sourceTab;
  return contact.fields[key] || "";
}

export function renderBody(template: Template, contact: Contact, token: string) {
  const base = `${siteUrl()}/rsvp/${encodeURIComponent(token)}`;
  const values: Record<string, string> = {
    attending_link: `${base}?response=YES`,
    not_attending_link: `${base}?response=NO`,
    rsvp_link: base,
  };
  const rendered = template.body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    return values[key] || value(contact, key);
  });
  if (!template.includeRsvpLinks) return rendered;
  if (/\{\{\s*(attending_link|not_attending_link|rsvp_link)\s*\}\}/i.test(template.body)) return rendered;
  return `${rendered.trimEnd()}\n\nAttending: ${values.attending_link}\nNot attending: ${values.not_attending_link}`;
}

export function rebuildMessages(campaign: Campaign, template: Template) {
  const existing = new Map(campaign.messages.map((message) => [message.contactId, message]));
  campaign.messages = campaign.contacts.map((contact): Message => {
    const previous = existing.get(contact.id);
    const token = previous?.token || crypto.randomUUID();
    return {
      id: previous?.id || crypto.randomUUID(),
      contactId: contact.id,
      token,
      body: renderBody(template, contact, token),
      status: previous?.status || "READY",
      providerMessageId: previous?.providerMessageId || "",
      error: previous?.error || "",
      sentAt: previous?.sentAt || "",
      rsvp: previous?.rsvp || "",
      rsvpAt: previous?.rsvpAt || "",
    };
  });
  campaign.updatedAt = nowIso();
}

export function setRsvp(state: AppState, token: string, response: RsvpResponse) {
  const message = state.campaign.messages.find((item) => item.token === token);
  if (!message) return false;
  message.rsvp = response;
  message.rsvpAt = nowIso();
  state.campaign.updatedAt = nowIso();
  return true;
}
