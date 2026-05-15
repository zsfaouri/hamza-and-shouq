import { userCanReadSourceTab } from "@/lib/access-control";
import { forbidden, unauthorized, userFromRequest } from "@/lib/auth";
import {
  ensureStarterCampaignContactsFromGoogleSheet,
  hydrateStore,
  json,
  persistStore,
  prepareCampaignMessages,
} from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const data = await hydrateStore();
  const user = userFromRequest(_request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canPrepareMessages) return forbidden();
  const campaign = data.campaigns.find((item) => item.id === id);
  if (!campaign?.template) return json({ error: "Campaign or template not found" }, { status: 404 });
  await ensureStarterCampaignContactsFromGoogleSheet(campaign);
  const prepared = prepareCampaignMessages(campaign, (contact) => userCanReadSourceTab(user, contact.sourceTab));
  await persistStore();
  return json({ prepared });
}
