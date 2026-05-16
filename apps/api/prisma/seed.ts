import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const template = await prisma.template.upsert({
    where: { id: "starter-template" },
    update: {},
    create: {
      id: "starter-template",
      name: "Wedding Invite EN",
      bodyEn:
        "Hi {{name}}, you're invited to Hamza and Shouq's wedding on {{date}} at {{venue}}.\n\nAttending: {{rsvp_yes_link}}\nNot attending: {{rsvp_no_link}}",
      bodyAr:
        "مرحباً {{name}}، ندعوك لحضور حفل زفاف حمزة وشوق بتاريخ {{date}} في {{venue}}.\n\nAttending: {{rsvp_yes_link}}\nNot attending: {{rsvp_no_link}}",
    },
  });

  await prisma.campaign.upsert({
    where: { id: "starter-campaign" },
    update: {},
    create: {
      id: "starter-campaign",
      name: "Wedding Invitations",
      templateId: template.id,
      status: "DRAFT",
    },
  });

  const BUDGET_ID = "main-budget";

  const budget = await prisma.budget.upsert({
    where: { id: BUDGET_ID },
    update: {},
    create: {
      id: BUDGET_ID,
      totalBudget: 25000,
      currency: "JOD",
    },
  });

  await prisma.budgetPermission.upsert({
    where: { budgetId_userKey: { budgetId: budget.id, userKey: "admin" } },
    update: {},
    create: { budgetId: budget.id, userKey: "admin", role: "ADMIN" },
  });

  await prisma.budgetPermission.upsert({
    where: { budgetId_userKey: { budgetId: budget.id, userKey: "hamza" } },
    update: {},
    create: { budgetId: budget.id, userKey: "hamza", role: "VIEWER" },
  });

  const categories = [
    { name: "Venue", color: "#6366F1" },
    { name: "Catering", color: "#F59E0B" },
    { name: "Decoration", color: "#EC4899" },
    { name: "Photography", color: "#10B981" },
    { name: "Videography", color: "#3B82F6" },
    { name: "Music / DJ", color: "#8B5CF6" },
    { name: "Wedding Dress", color: "#F43F5E" },
    { name: "Groom Suit", color: "#0EA5E9" },
    { name: "Invitations", color: "#14B8A6" },
    { name: "Gifts", color: "#F97316" },
    { name: "Transportation", color: "#84CC16" },
    { name: "Accommodation", color: "#06B6D4" },
    { name: "Miscellaneous", color: "#9CA3AF" },
  ];

  for (const cat of categories) {
    const id = `cat-${cat.name.toLowerCase().replace(/[\s/]+/g, "-")}`;
    await prisma.budgetCategory.upsert({
      where: { id },
      update: {},
      create: { id, budgetId: budget.id, name: cat.name, color: cat.color },
    });
  }

  console.log("Budget seed complete: budget, permissions, and 13 categories created.");
}

main().finally(() => prisma.$disconnect());
