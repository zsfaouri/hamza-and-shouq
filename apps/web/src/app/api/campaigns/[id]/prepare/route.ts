import { id as newId, json, renderTemplate, store } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = store().campaigns.find((item) => item.id === id);
  if (!campaign?.template) return json({ error: "Campaign or template not found" }, { status: 404 });
  campaign.messages = campaign.contacts.map((contact) => {
    const token = newId("rsvp");
    const rsvpLink = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://web-zsfaouris-projects.vercel.app"}/rsvp/${token}`;
    const body = renderTemplate(campaign.template?.bodyEn ?? "", {
      ...contact.customFields,
      name: contact.name,
      phone: contact.phone,
      rsvp_link: rsvpLink,
    });
    return {
      id: newId("message"),
      body,
      status: "PENDING" as const,
      error: null,
      contact,
      rsvpToken: { response: null, clickedAt: null },
    };
  });
  campaign.status = campaign.messages.length ? "READY" : "DRAFT";
  return json({ prepared: campaign.messages.length });
}
