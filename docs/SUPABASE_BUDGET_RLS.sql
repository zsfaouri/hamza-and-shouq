ALTER TABLE "Budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BudgetCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BudgetPermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BudgetAuditLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_full_access" ON "Budget"
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON "BudgetCategory"
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON "Vendor"
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON "Expense"
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON "Payment"
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON "BudgetPermission"
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON "BudgetAuditLog"
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "deny_anon" ON "Budget" FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON "BudgetCategory" FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON "Vendor" FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON "Expense" FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON "Payment" FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON "BudgetPermission" FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON "BudgetAuditLog" FOR ALL TO anon USING (false);
