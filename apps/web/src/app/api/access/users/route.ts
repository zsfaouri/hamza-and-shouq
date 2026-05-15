import { normalizeRole, normalizeTabs, publicUser } from "@/lib/access-control";
import { forbidden, unauthorized, userFromRequest } from "@/lib/auth";
import { hydrateStore, json, persistStore } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canManageAccess) return forbidden();
  return json({ users: data.accessUsers.map(publicUser) });
}

export async function PUT(request: Request) {
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canManageAccess) return forbidden();

  const body = await request.json() as { users?: Array<{ id?: string; role?: string; allowedTabs?: string[]; active?: boolean }> };
  const updates = new Map((body.users ?? []).map((item) => [String(item.id ?? ""), item]));
  data.accessUsers = data.accessUsers.map((record) => {
    const update = updates.get(record.id);
    if (!update || record.id === user.id) return record;
    const role = normalizeRole(update.role);
    return {
      ...record,
      role,
      active: update.active !== false,
      allowedTabs: normalizeTabs(update.allowedTabs, role),
    };
  });

  await persistStore();
  return json({ users: data.accessUsers.map(publicUser) });
}
