import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type WhatsAppProvider = "personal" | "meta";

export type AppSettings = {
  provider: WhatsAppProvider;
  defaultCountryCode: string;
  personalSenderPhone: string;
  meta: {
    graphVersion: string;
    phoneNumberId: string;
    accessToken: string;
    appSecret: string;
    verifyToken: string;
    sendMode: "text" | "template";
    templateName: string;
    templateLanguage: string;
  };
};

const settingsPath = join(process.cwd(), "app-settings.json");

const defaultSettings: AppSettings = {
  provider: (process.env.WHATSAPP_PROVIDER as WhatsAppProvider) || "personal",
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "962",
  personalSenderPhone: process.env.PERSONAL_SENDER_PHONE || "",
  meta: {
    graphVersion: process.env.META_GRAPH_VERSION || "v23.0",
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
    accessToken: process.env.META_ACCESS_TOKEN || "",
    appSecret: process.env.META_APP_SECRET || "",
    verifyToken: process.env.META_VERIFY_TOKEN || "hamza-shouq-webhook",
    sendMode: (process.env.META_SEND_MODE as "text" | "template") || "text",
    templateName: process.env.META_TEMPLATE_NAME || "",
    templateLanguage: process.env.META_TEMPLATE_LANGUAGE || "en_US",
  },
};

export function getSettings(): AppSettings {
  if (!existsSync(settingsPath)) return defaultSettings;
  const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as Partial<AppSettings>;
  return {
    ...defaultSettings,
    ...parsed,
    meta: {
      ...defaultSettings.meta,
      ...parsed.meta,
    },
  };
}

export function saveSettings(input: AppSettings) {
  writeFileSync(settingsPath, JSON.stringify(input, null, 2));
  return input;
}

export function publicSettings(settings = getSettings()) {
  return {
    ...settings,
    meta: {
      ...settings.meta,
      accessToken: settings.meta.accessToken ? "configured" : "",
      appSecret: settings.meta.appSecret ? "configured" : "",
    },
  };
}
