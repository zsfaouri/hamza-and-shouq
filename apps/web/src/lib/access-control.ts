export const SHEET_LISTS = ["Hamza", "Shouq", "Maha", "Zein", "Yazan"] as const;

export type AccessRole = "admin" | "zein-admin" | "hamza" | "shouq";

export type AccessPermissions = {
  canViewAll: boolean;
  canManageAccess: boolean;
  canManageCampaigns: boolean;
  canEditTemplates: boolean;
  canImportContacts: boolean;
  canPrepareMessages: boolean;
  canSendMessages: boolean;
  canManageWhatsApp: boolean;
  readOnly: boolean;
};

export type AccessUserRecord = {
  id: string;
  name: string;
  username: string;
  password: string;
  role: AccessRole;
  allowedTabs: string[];
  active: boolean;
};

export type SessionUser = Omit<AccessUserRecord, "password"> & {
  permissions: AccessPermissions;
};

export const DEFAULT_ACCESS_USERS: AccessUserRecord[] = [
  {
    id: "user-admin",
    name: "Admin",
    username: "admin",
    password: "admin123",
    role: "admin",
    allowedTabs: [...SHEET_LISTS],
    active: true,
  },
  {
    id: "user-zein",
    name: "Zein Admin",
    username: "zein",
    password: "zein123",
    role: "zein-admin",
    allowedTabs: ["Zein"],
    active: true,
  },
  {
    id: "user-hamza",
    name: "Hamza",
    username: "hamza",
    password: "hamza123",
    role: "hamza",
    allowedTabs: [...SHEET_LISTS],
    active: true,
  },
  {
    id: "user-shouq",
    name: "Shouq",
    username: "shouq",
    password: "shouq123",
    role: "shouq",
    allowedTabs: ["Shouq"],
    active: true,
  },
];

export function normalizeRole(value: unknown): AccessRole {
  return value === "zein-admin" || value === "hamza" || value === "shouq" ? value : "admin";
}

export function normalizeTabs(value: unknown, role: AccessRole) {
  const requested = Array.isArray(value) ? value.map(String) : [];
  const known = requested.filter((tab) => SHEET_LISTS.includes(tab as (typeof SHEET_LISTS)[number]));
  if (role === "admin" || role === "hamza") return [...SHEET_LISTS];
  if (role === "shouq") return ["Shouq"];
  return known.length ? known : ["Zein"];
}

export function permissionsForRole(role: AccessRole): AccessPermissions {
  if (role === "admin") {
    return {
      canViewAll: true,
      canManageAccess: true,
      canManageCampaigns: true,
      canEditTemplates: true,
      canImportContacts: true,
      canPrepareMessages: true,
      canSendMessages: true,
      canManageWhatsApp: true,
      readOnly: false,
    };
  }

  if (role === "zein-admin") {
    return {
      canViewAll: false,
      canManageAccess: false,
      canManageCampaigns: false,
      canEditTemplates: false,
      canImportContacts: true,
      canPrepareMessages: true,
      canSendMessages: true,
      canManageWhatsApp: false,
      readOnly: false,
    };
  }

  return {
    canViewAll: role === "hamza",
    canManageAccess: false,
    canManageCampaigns: false,
    canEditTemplates: false,
    canImportContacts: false,
    canPrepareMessages: false,
    canSendMessages: false,
    canManageWhatsApp: false,
    readOnly: true,
  };
}

export function publicUser(user: AccessUserRecord): SessionUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    allowedTabs: user.allowedTabs,
    active: user.active,
    permissions: permissionsForRole(user.role),
  };
}

export function userCanReadSourceTab(user: SessionUser, sourceTab?: string | null) {
  if (user.permissions.canViewAll) return true;
  if (!sourceTab) return user.role === "admin" || user.role === "hamza";
  return user.allowedTabs.includes(sourceTab);
}

export function userCanImportTabs(user: SessionUser, tabs: string[]) {
  if (!user.permissions.canImportContacts) return false;
  if (user.role === "admin") return true;
  return tabs.length > 0 && tabs.every((tab) => user.allowedTabs.includes(tab));
}

export function filterContactsForUser<T extends { sourceTab?: string | null }>(contacts: T[], user: SessionUser) {
  return contacts.filter((contact) => userCanReadSourceTab(user, contact.sourceTab));
}

export function filterMessagesForUser<T extends { contact: { sourceTab?: string | null } }>(messages: T[], user: SessionUser) {
  return messages.filter((message) => userCanReadSourceTab(user, message.contact.sourceTab));
}

export function filterCampaignForUser<
  T extends {
    contacts: Array<{ sourceTab?: string | null }>;
    messages: Array<{ status: string; contact: { sourceTab?: string | null } }>;
    totalCount: number;
    sentCount: number;
    failedCount: number;
  },
>(campaign: T, user: SessionUser): T {
  const contacts = filterContactsForUser(campaign.contacts, user);
  const messages = filterMessagesForUser(campaign.messages, user);
  return {
    ...campaign,
    contacts,
    messages,
    totalCount: contacts.length,
    sentCount: messages.filter((message) => message.status === "SENT").length,
    failedCount: messages.filter((message) => message.status === "FAILED").length,
  };
}
