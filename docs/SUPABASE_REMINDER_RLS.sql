ALTER TABLE "ReminderCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReminderRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReminderRescheduleLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReminderAuditLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_full_access" ON "ReminderCampaign"
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON "ReminderRecipient"
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON "ReminderRescheduleLog"
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON "ReminderAuditLog"
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "deny_anon" ON "ReminderCampaign" FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON "ReminderRecipient" FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON "ReminderRescheduleLog" FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON "ReminderAuditLog" FOR ALL TO anon USING (false);
