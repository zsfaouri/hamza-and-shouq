import { filterCampaignForUser } from "@/lib/access-control";
import { forbidden, unauthorized, userFromRequest } from "@/lib/auth";
import { ensureStarterCampaignContactsFromGoogleSheet, hydrateStore, id, json, persistStore } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  const changed = (await Promise.all(data.campaigns.map((campaign) => ensureStarterCampaignContactsFromGoogleSheet(campaign))))
    .some(Boolean);
  if (changed) await persistStore();
  return json(data.campaigns.map((campaign) => filterCampaignForUser(campaign, user)).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    totalCount: campaign.totalCount,
    sentCount: campaign.sentCount,
    failedCount: campaign.failedCount,
    templateId: campaign.templateId,
    template: campaign.template,
  })));
}

export async function POST(request: Request) {
  const body = await request.json();
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canManageCampaigns) return forbidden();
  const templateId = String(body.templateId ?? data.templates[0]?.id ?? "");
  const campaign = {
    id: id("campaign"),
    name: String(body.name ?? "Wedding Invitations"),
    status: "DRAFT" as const,
    totalCount: 0,
    sentCount: 0,
    failedCount: 0,
    templateId,
    template: data.templates.find((template) => template.id === templateId) ?? null,
    contacts: [],
    messages: [],
  };
  data.campaigns.unshift(campaign);
  await persistStore();
  return json(campaign);
}
