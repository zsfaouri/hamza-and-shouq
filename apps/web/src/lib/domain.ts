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
    mediaName: "",
    mediaMimeType: "",
    mediaData: "",
    includeRsvpLinks: true,
    updatedAt: nowIso(),
  };
}

export function createTemplate(name = "Wedding invitation", body = defaultTemplate().body): Template {
  return {
    ...defaultTemplate(),
    id: crypto.randomUUID(),
    name: name.trim() || "Wedding invitation",
    body: body.trim() || defaultTemplate().body,
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
  const metaConfigured = Boolean(process.env.META_PHONE_NUMBER_ID && process.env.META_ACCESS_TOKEN);
  const requestedProvider = process.env.WHATSAPP_PROVIDER === "meta" || process.env.WHATSAPP_PROVIDER === "personal"
    ? process.env.WHATSAPP_PROVIDER
    : "personal";
  const template = defaultTemplate();
  return {
    version: 1,
    campaign: defaultCampaign(),
    template,
    templates: [template],
    activeTemplateId: template.id,
    whatsapp: {
      provider: requestedProvider === "meta" && metaConfigured ? "meta" : "personal",
      graphVersion: process.env.META_GRAPH_VERSION || "v23.0",
      phoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
      accessToken: process.env.META_ACCESS_TOKEN || "",
      verifyToken: process.env.META_VERIFY_TOKEN || "hamza-shouq-webhook",
      senderPhone: process.env.WHATSAPP_SENDER_PHONE || "962795941263",
      personalBridgeUrl: process.env.PERSONAL_WHATSAPP_API_URL || "",
      personalBridgeToken: process.env.PERSONAL_WHATSAPP_TOKEN || "",
    },
  };
}

export function activeTemplate(state: AppState): Template {
  return state.templates.find((item) => item.id === state.activeTemplateId) || state.template || state.templates[0] || defaultTemplate();
}

export function syncActiveTemplate(state: AppState) {
  const active = activeTemplate(state);
  state.activeTemplateId = active.id;
  state.template = active;
  if (!state.templates.some((item) => item.id === active.id)) state.templates = [active, ...state.templates];
  return active;
}

export function upsertTemplate(state: AppState, template: Template, activate = true) {
  const next = {
    ...defaultTemplate(),
    ...template,
    name: template.name.trim() || "Wedding invitation",
    body: template.body.trim() || defaultTemplate().body,
    updatedAt: nowIso(),
  };
  const index = state.templates.findIndex((item) => item.id === next.id);
  if (index >= 0) state.templates[index] = next;
  else state.templates.push(next);
  if (activate) state.activeTemplateId = next.id;
  syncActiveTemplate(state);
  return next;
}

export function setActiveTemplate(state: AppState, templateId: string) {
  if (!state.templates.some((item) => item.id === templateId)) return false;
  state.activeTemplateId = templateId;
  syncActiveTemplate(state);
  return true;
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
