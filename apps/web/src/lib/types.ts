export type RsvpResponse = "YES" | "NO";

export type Contact = {
  id: string;
  name: string;
  phone: string;
  sourceTab: string;
  fields: Record<string, string>;
};

export type Template = {
  id: string;
  name: string;
  body: string;
  mediaUrl: string;
  mediaName: string;
  mediaMimeType: string;
  mediaData: string;
  includeRsvpLinks: boolean;
  updatedAt: string;
};

export type MessageStatus = "READY" | "SENT" | "FAILED";

export type Message = {
  id: string;
  contactId: string;
  token: string;
  body: string;
  status: MessageStatus;
  providerMessageId: string;
  error: string;
  sentAt: string;
  rsvp: RsvpResponse | "";
  rsvpAt: string;
};

export type Campaign = {
  id: string;
  name: string;
  sheetUrl: string;
  selectedTabs: string[];
  contacts: Contact[];
  messages: Message[];
  updatedAt: string;
};

export type WhatsAppSettings = {
  provider: "meta" | "personal";
  graphVersion: string;
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  senderPhone: string;
  personalBridgeUrl: string;
  personalBridgeToken: string;
};

export type WhatsAppStatus = {
  provider: "meta" | "personal";
  configured: boolean;
  state: string;
  qr: string;
  qrDataUrl: string;
  accountPhone: string;
  displayName: string;
  error: string;
  mode: "cloud" | "bridge" | "local";
};

export type AppState = {
  version: 1;
  campaign: Campaign;
  template: Template;
  whatsapp: WhatsAppSettings;
};

export type SheetTab = {
  name: string;
  gid: string;
  rowCount: number;
  contactCount: number;
  preview: Array<{ name: string; phone: string }>;
};

export type SheetPreview = {
  sheetId: string;
  headers: string[];
  tabs: SheetTab[];
  contacts: Contact[];
};
