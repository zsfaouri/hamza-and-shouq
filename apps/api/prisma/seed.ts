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
        "Hi {{name}}, you're invited to Hamza and Shouq's wedding on {{date}} at {{venue}}. Please RSVP here: {{rsvp_link}}",
      bodyAr:
        "مرحباً {{name}}، ندعوك لحضور حفل زفاف حمزة وشوق بتاريخ {{date}} في {{venue}}. الرجاء تأكيد الحضور: {{rsvp_link}}",
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
}

main().finally(() => prisma.$disconnect());
