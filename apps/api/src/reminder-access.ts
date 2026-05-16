import type { Request, Response } from "express";

export const reminderLists = ["Hamza", "Shouq", "Maha", "Zein", "Yazan"] as const;

type ReminderAccess = {
  canViewReminders: boolean;
  canManageReminders: boolean;
  allowedTabs: string[];
};

const accessByActor: Record<string, ReminderAccess> = {
  admin: { canViewReminders: true, canManageReminders: true, allowedTabs: [...reminderLists] },
  hamza: { canViewReminders: true, canManageReminders: false, allowedTabs: [...reminderLists] },
  zein: { canViewReminders: true, canManageReminders: true, allowedTabs: ["Zein"] },
  shouq: { canViewReminders: false, canManageReminders: false, allowedTabs: ["Shouq"] },
};

export function actorKey(req: Request) {
  return (req.headers["x-actor"] as string | undefined)?.trim().toLowerCase()
    || (typeof req.query.actor === "string" ? req.query.actor.trim().toLowerCase() : "");
}

export function reminderAccessForActor(actor: string) {
  return accessByActor[actor] ?? { canViewReminders: false, canManageReminders: false, allowedTabs: [] };
}

export async function requireReminders(req: Request, res: Response, level: "VIEW" | "MANAGE") {
  const actor = actorKey(req);
  const access = reminderAccessForActor(actor);
  const ok = level === "MANAGE" ? access.canManageReminders : access.canViewReminders || access.canManageReminders;
  if (!actor || !ok) {
    res.status(403).json({});
    return false;
  }
  return true;
}

export function scopedTabsForActor(actor: string, requested: string[]) {
  const access = reminderAccessForActor(actor);
  if (actor === "admin") return requested;
  if (!requested.length) return access.allowedTabs;
  return requested.filter((tab) => access.allowedTabs.includes(tab));
}

export function canAccessReminderTabs(actor: string, targetSourceTabs: string[]) {
  if (actor === "admin" || actor === "hamza") return true;
  const access = reminderAccessForActor(actor);
  return targetSourceTabs.length > 0 && targetSourceTabs.every((tab) => access.allowedTabs.includes(tab));
}
