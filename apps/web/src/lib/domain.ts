import type { AppState, Campaign, Contact, Message, RsvpResponse, Template } from "./types";

export function nowIso() {
  return new Date().toISOString();
}

export function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return "https://www.hamzaandshouq.com";
}

export function defaultTemplate(): Template {
  return {
    id: "template-main",
    name: "Wedding invitation",
    body: `بسم الله الرحمن الرحيم

*دعوة زفاف* 🎉

السلام عليكم {{name}}،

يسعدنا دعوتكم لحضور حفل زفاف

*حمزة و شوق*

نتشرف بحضوركم ومشاركتنا فرحتنا.

━━━━━━━━━━━━━━━

✅ *للتأكيد:* {{attending_link}}

❌ *للاعتذار:* {{not_attending_link}}

أو أرسل رداً:
▪️ اكتب *1* أو *حاضر* للتأكيد
▪️ اكتب *2* أو *معتذر* للاعتذار

━━━━━━━━━━━━━━━

_بانتظاركم بإذن الله_ 🤍`,
    mediaUrl: "",
    mediaName: "",
    mediaMimeType: "",
    mediaData: "",
    includeRsvpLinks: false,
    updatedAt: nowIso(),
  };
}

export function imageDataUrl(mimeType: string, mediaData: string) {
  if (!mimeType || !mediaData) return "";
  return `data:${mimeType};base64,${mediaData}`;
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
  const openwaConfigured = Boolean(process.env.OPENWA_API_URL);
  const requestedProvider = (process.env.WHATSAPP_PROVIDER as "meta" | "personal" | "openwa") || "openwa";
  const template = defaultTemplate();

  let provider: "meta" | "personal" | "openwa" = "openwa";
  if (requestedProvider === "meta" && metaConfigured) provider = "meta";
  else if (requestedProvider === "personal") provider = "personal";
  else if (requestedProvider === "openwa" && openwaConfigured) provider = "openwa";
  else if (!openwaConfigured && !metaConfigured) provider = "openwa"; // default, will show setup prompt

  return {
    version: 1,
    campaign: defaultCampaign(),
    template,
    templates: [template],
    activeTemplateId: template.id,
    whatsapp: {
      provider,
      graphVersion: process.env.META_GRAPH_VERSION || "v23.0",
      phoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
      accessToken: process.env.META_ACCESS_TOKEN || "",
      verifyToken: process.env.META_VERIFY_TOKEN || "hamza-shouq-webhook",
      senderPhone: process.env.WHATSAPP_SENDER_PHONE || "962795941263",
      personalBridgeUrl: process.env.PERSONAL_WHATSAPP_API_URL || "",
      personalBridgeToken: process.env.PERSONAL_WHATSAPP_TOKEN || "",
      openwaApiUrl: process.env.OPENWA_API_URL || "",
      openwaApiKey: process.env.OPENWA_API_KEY || "",
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

export function shortToken() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function validInvitationToken(token: string) {
  return /^[A-Za-z0-9][A-Za-z0-9-]{5,63}$/.test(token);
}

export function renderBody(template: Template, contact: Contact, token: string) {
  const site = siteUrl();
  const base = `${site}?t=${encodeURIComponent(token)}`;
  const values: Record<string, string> = {
    attending_link: `${base}&response=YES`,
    not_attending_link: `${base}&response=NO`,
    rsvp_link: base,
    invitation_image: template.mediaData ? `${site}/invitation` : "",
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
    const token = previous?.token || shortToken();
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

export function ensureInvitationMessage(state: AppState, token: string) {
  const existing = state.campaign.messages.find((item) => item.token === token);
  if (existing) return existing;
  if (!validInvitationToken(token)) return null;

  const contact = nextLegacyContact(state, token);
  const message: Message = {
    id: crypto.randomUUID(),
    contactId: contact.id,
    token,
    body: renderBody(activeTemplate(state), contact, token),
    status: "READY",
    providerMessageId: "",
    error: "",
    sentAt: "",
    rsvp: "",
    rsvpAt: "",
  };
  state.campaign.contacts.push(contact);
  state.campaign.messages.push(message);
  state.campaign.updatedAt = nowIso();
  return message;
}

export function repairLegacyInvitations(state: AppState) {
  let changed = false;
  for (const message of state.campaign.messages) {
    const contact = state.campaign.contacts.find((item) => item.id === message.contactId);
    if (!contact || contact.sourceTab !== "legacy-link" || contact.name !== "Guest") continue;
    const replacement = nextLegacyContact(state, message.token);
    if (replacement.id === message.contactId) continue;
    message.contactId = replacement.id;
    message.body = renderBody(activeTemplate(state), replacement, message.token);
    changed = true;
  }
  if (changed) state.campaign.updatedAt = nowIso();
  return changed;
}

function nextLegacyContact(state: AppState, token: string): Contact {
  const realContacts = state.campaign.contacts.filter((contact) => contact.sourceTab !== "legacy-link");
  const seenPrimary = new Set<string>();
  const usedRealContactIds = new Set<string>();
  for (const message of state.campaign.messages) {
    if (message.token === token) continue;
    if (!realContacts.some((contact) => contact.id === message.contactId)) continue;
    if (!seenPrimary.has(message.contactId)) {
      seenPrimary.add(message.contactId);
      continue;
    }
    usedRealContactIds.add(message.contactId);
  }
  const reusable = realContacts.find((contact) => !usedRealContactIds.has(contact.id));
  if (reusable) return reusable;

  const contact = {
    id: `legacy-${token}`,
    name: "Guest",
    phone: "",
    sourceTab: "legacy-link",
    fields: { legacyToken: token },
  };
  state.campaign.contacts.push(contact);
  return contact;
}
