-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'READY', 'SENDING', 'SENT', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "RsvpResponse" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "BudgetRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "BudgetAction" AS ENUM ('CREATE_EXPENSE', 'UPDATE_EXPENSE', 'DELETE_EXPENSE', 'ADD_PAYMENT', 'DELETE_PAYMENT', 'UPDATE_BUDGET', 'GRANT_PERMISSION', 'REVOKE_PERMISSION', 'EXPORT_BUDGET');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('CONFIRMED', 'PENDING', 'CONFIRMED_AND_PENDING');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RESCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReminderSendStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReminderAction" AS ENUM ('CREATED', 'SCHEDULED', 'RESCHEDULED', 'CANCELLED', 'SENDING_STARTED', 'SENDING_COMPLETED', 'RECIPIENT_SKIPPED', 'RECIPIENT_FAILED');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "sourceTab" TEXT,
    "listOwner" TEXT,
    "importBatchId" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'wedding_invitation',
    "languageMode" TEXT NOT NULL DEFAULT 'english_only',
    "bodyEn" TEXT NOT NULL,
    "bodyAr" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "guestNameMode" TEXT NOT NULL DEFAULT 'auto',
    "manualGuestName" TEXT,
    "attendeesCountMode" TEXT NOT NULL DEFAULT 'none',
    "manualAttendeesCount" TEXT,
    "includeRsvpLink" BOOLEAN NOT NULL DEFAULT true,
    "includeLocationLink" BOOLEAN NOT NULL DEFAULT false,
    "includeMedia" BOOLEAN NOT NULL DEFAULT false,
    "locationLink" TEXT,
    "hostNames" TEXT,
    "weddingDate" TEXT,
    "venue" TEXT,
    "variablesUsed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "waMessageId" TEXT,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RsvpToken" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3),
    "response" "RsvpResponse",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RsvpToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "totalBudget" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'JOD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetCategory" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cap" DECIMAL(12,3),
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "agreedPrice" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "contractUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "categoryId" TEXT,
    "vendorId" TEXT,
    "description" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "amount" DECIMAL(12,3) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'cash',
    "paidBy" TEXT NOT NULL,
    "receiptUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetPermission" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "userKey" TEXT NOT NULL,
    "role" "BudgetRole" NOT NULL DEFAULT 'VIEWER',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "BudgetPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAuditLog" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "action" "BudgetAction" NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reminderType" "ReminderType" NOT NULL,
    "templateId" TEXT NOT NULL,
    "targetSourceTabs" TEXT[],
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Amman',
    "status" "ReminderStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,

    CONSTRAINT "ReminderCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRecipient" (
    "id" TEXT NOT NULL,
    "reminderCampaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceTab" TEXT,
    "rsvpStatusAtScheduleTime" TEXT NOT NULL,
    "sendStatus" "ReminderSendStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRescheduleLog" (
    "id" TEXT NOT NULL,
    "reminderCampaignId" TEXT NOT NULL,
    "oldScheduledAt" TIMESTAMP(3) NOT NULL,
    "newScheduledAt" TIMESTAMP(3) NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "ReminderRescheduleLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderAuditLog" (
    "id" TEXT NOT NULL,
    "reminderCampaignId" TEXT NOT NULL,
    "action" "ReminderAction" NOT NULL,
    "performedBy" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_phone_idx" ON "Contact"("phone");

-- CreateIndex
CREATE INDEX "Contact_campaignId_idx" ON "Contact"("campaignId");

-- CreateIndex
CREATE INDEX "Contact_sourceTab_idx" ON "Contact"("sourceTab");

-- CreateIndex
CREATE INDEX "Contact_campaignId_sourceTab_idx" ON "Contact"("campaignId", "sourceTab");

-- CreateIndex
CREATE INDEX "Template_createdBy_idx" ON "Template"("createdBy");

-- CreateIndex
CREATE INDEX "Message_campaignId_status_idx" ON "Message"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RsvpToken_messageId_key" ON "RsvpToken"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "RsvpToken_token_key" ON "RsvpToken"("token");

-- CreateIndex
CREATE INDEX "BudgetCategory_budgetId_idx" ON "BudgetCategory"("budgetId");

-- CreateIndex
CREATE INDEX "Vendor_budgetId_idx" ON "Vendor"("budgetId");

-- CreateIndex
CREATE INDEX "Vendor_categoryId_idx" ON "Vendor"("categoryId");

-- CreateIndex
CREATE INDEX "Expense_budgetId_idx" ON "Expense"("budgetId");

-- CreateIndex
CREATE INDEX "Expense_budgetId_categoryId_idx" ON "Expense"("budgetId", "categoryId");

-- CreateIndex
CREATE INDEX "Expense_dueDate_idx" ON "Expense"("dueDate");

-- CreateIndex
CREATE INDEX "Payment_budgetId_idx" ON "Payment"("budgetId");

-- CreateIndex
CREATE INDEX "Payment_expenseId_idx" ON "Payment"("expenseId");

-- CreateIndex
CREATE INDEX "Payment_paidBy_idx" ON "Payment"("paidBy");

-- CreateIndex
CREATE INDEX "BudgetPermission_userKey_idx" ON "BudgetPermission"("userKey");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetPermission_budgetId_userKey_key" ON "BudgetPermission"("budgetId", "userKey");

-- CreateIndex
CREATE INDEX "BudgetAuditLog_budgetId_createdAt_idx" ON "BudgetAuditLog"("budgetId", "createdAt");

-- CreateIndex
CREATE INDEX "BudgetAuditLog_actorKey_idx" ON "BudgetAuditLog"("actorKey");

-- CreateIndex
CREATE INDEX "ReminderCampaign_status_idx" ON "ReminderCampaign"("status");

-- CreateIndex
CREATE INDEX "ReminderCampaign_scheduledAt_idx" ON "ReminderCampaign"("scheduledAt");

-- CreateIndex
CREATE INDEX "ReminderCampaign_createdBy_idx" ON "ReminderCampaign"("createdBy");

-- CreateIndex
CREATE INDEX "ReminderRecipient_reminderCampaignId_idx" ON "ReminderRecipient"("reminderCampaignId");

-- CreateIndex
CREATE INDEX "ReminderRecipient_reminderCampaignId_sendStatus_idx" ON "ReminderRecipient"("reminderCampaignId", "sendStatus");

-- CreateIndex
CREATE INDEX "ReminderRecipient_contactId_idx" ON "ReminderRecipient"("contactId");

-- CreateIndex
CREATE INDEX "ReminderRescheduleLog_reminderCampaignId_idx" ON "ReminderRescheduleLog"("reminderCampaignId");

-- CreateIndex
CREATE INDEX "ReminderAuditLog_reminderCampaignId_createdAt_idx" ON "ReminderAuditLog"("reminderCampaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RsvpToken" ADD CONSTRAINT "RsvpToken_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RsvpToken" ADD CONSTRAINT "RsvpToken_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetCategory" ADD CONSTRAINT "BudgetCategory_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BudgetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BudgetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPermission" ADD CONSTRAINT "BudgetPermission_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAuditLog" ADD CONSTRAINT "BudgetAuditLog_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderCampaign" ADD CONSTRAINT "ReminderCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRecipient" ADD CONSTRAINT "ReminderRecipient_reminderCampaignId_fkey" FOREIGN KEY ("reminderCampaignId") REFERENCES "ReminderCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRecipient" ADD CONSTRAINT "ReminderRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRescheduleLog" ADD CONSTRAINT "ReminderRescheduleLog_reminderCampaignId_fkey" FOREIGN KEY ("reminderCampaignId") REFERENCES "ReminderCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderAuditLog" ADD CONSTRAINT "ReminderAuditLog_reminderCampaignId_fkey" FOREIGN KEY ("reminderCampaignId") REFERENCES "ReminderCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

