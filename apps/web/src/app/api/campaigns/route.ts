import { id, json, store } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(store().campaigns.map((campaign) => ({
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
  const data = store();
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
  return json(campaign);
}
