import assert from "node:assert/strict";

import { getPrisma } from "../src/db.js";

const API = process.env.TEST_API_URL ?? "http://localhost:4100";
const prisma = getPrisma();

const template = await prisma.template.create({
  data: {
    name: `Sheet Safety Template ${Date.now()}`,
    bodyEn: "Test {{name}}",
    variablesUsed: "[]",
  },
});
const campaign = await prisma.campaign.create({
  data: {
    name: `Sheet Safety Campaign ${Date.now()}`,
    templateId: template.id,
    status: "DRAFT",
  },
});

try {
  const response = await fetch(`${API}/api/campaigns/${campaign.id}/contacts/google-sheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://docs.google.com/spreadsheets/d/fake/edit",
      selectedTabs: [],
    }),
  });
  const data = await response.json() as { error?: string };
  assert.equal(response.status, 400);
  assert.equal(data.error, "Select at least one detected sheet tab before importing.");

  const contactCount = await prisma.contact.count({ where: { campaignId: campaign.id } });
  assert.equal(contactCount, 0);
} finally {
  await prisma.campaign.delete({ where: { id: campaign.id } }).catch(() => undefined);
  await prisma.template.delete({ where: { id: template.id } }).catch(() => undefined);
  await prisma.$disconnect();
}

console.log("google-sheet-import-safety tests passed");
