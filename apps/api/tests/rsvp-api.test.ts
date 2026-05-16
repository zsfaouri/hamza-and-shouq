import assert from "node:assert/strict";

import { getPrisma } from "../src/db.js";
import { recordInboundRsvpFromPhone } from "../src/rsvp.js";
import { normalizePhone } from "../src/template.js";

const API = process.env.TEST_API_URL ?? "http://localhost:4100";
const prisma = getPrisma();

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed ${response.status}: ${text}`);
  return text ? JSON.parse(text) as T : undefined as T;
}

async function main() {
  let campaignId = "";
  let templateId = "";

  try {
    const template = await api<{ id: string }>("/api/templates", {
      method: "POST",
      body: JSON.stringify({
        name: `RSVP API Test ${Date.now()}`,
        type: "wedding_invitation",
        languageMode: "english_only",
        bodyEn: "Test invitation for {{name}}. RSVP: {{rsvp_link}}",
        bodyAr: "",
        guestNameMode: "auto",
        attendeesCountMode: "none",
        includeRsvpLink: true,
        includeLocationLink: false,
        includeMedia: false,
        variablesUsed: ["name", "rsvp_link"],
      }),
    });
    templateId = template.id;

    const campaign = await api<{ id: string }>("/api/campaigns", {
      method: "POST",
      body: JSON.stringify({
        name: `RSVP API Test ${Date.now()}`,
        templateId,
      }),
    });
    campaignId = campaign.id;

    const contact = await prisma.contact.create({
      data: {
        campaignId,
        name: "RSVP Test Guest",
        phone: normalizePhone("0790000000"),
        customFields: "{}",
      },
    });

    await api<{ prepared: number }>(`/api/campaigns/${campaignId}/prepare`, { method: "POST" });

    const prepared = await prisma.message.findFirstOrThrow({
      where: { campaignId, contactId: contact.id },
      include: { rsvpToken: true },
    });

    assert.match(prepared.body, /response=YES/);
    assert.match(prepared.body, /response=NO/);
    assert.ok(prepared.rsvpToken?.token);

    const yesPage = await fetch(`${API}/rsvp/${prepared.rsvpToken.token}?response=YES`);
    assert.equal(yesPage.status, 200);
    assert.match(await yesPage.text(), /attending/);

    const yesStats = await api<{ yes: number; no: number }>(`/api/campaigns/${campaignId}/stats`);
    assert.equal(yesStats.yes, 1);
    assert.equal(yesStats.no, 0);

    const inbound = await recordInboundRsvpFromPhone(prisma, "0790000000", "not attending", "962");
    assert.equal(inbound.matched, true);
    assert.equal(inbound.response, "NO");

    const noStats = await api<{ yes: number; no: number }>(`/api/campaigns/${campaignId}/stats`);
    assert.equal(noStats.yes, 0);
    assert.equal(noStats.no, 1);
  } finally {
    if (campaignId) await prisma.campaign.delete({ where: { id: campaignId } }).catch(() => undefined);
    if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

await main();
console.log("rsvp-api tests passed");
