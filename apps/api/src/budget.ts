import { BudgetAction, type BudgetRole } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { getPrisma } from "./db.js";

const prisma = getPrisma();
const BUDGET_ID = "main-budget";

export const budgetRouter = Router();

const optStr = z.string().optional().nullable().transform((value) => (value === "" ? null : value ?? null));
const optNum = z.coerce.number().optional().nullable().transform((value) => value ?? null);

function actor(req: Request) {
  return (req.headers["x-actor"] as string | undefined)?.trim() || (typeof req.query.actor === "string" ? req.query.actor.trim() : "");
}

function num(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function money(value: unknown): number {
  return Number(value ?? 0);
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function handleError(res: Response, error: unknown) {
  console.error("[budget]", error);
  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  if (message.includes("P2003") || message.includes("foreign key")) {
    return res.status(400).json({ error: "Related record not found. Please refresh and try again." });
  }
  if (message.includes("P2002") || message.includes("Unique constraint")) {
    return res.status(409).json({ error: "A record with this value already exists." });
  }
  return res.status(500).json({ error: message });
}

function budgetHandler(handler: (req: Request, res: Response) => Promise<unknown> | unknown) {
  return async (req: Request, res: Response) => {
    try {
      await handler(req, res);
    } catch (error) {
      handleError(res, error);
    }
  };
}

async function requireBudget(req: Request, res: Response, minRole: "VIEWER" | "ADMIN"): Promise<boolean> {
  const actorKey = actor(req);
  if (!actorKey) {
    res.status(403).json({});
    return false;
  }

  await ensureBudget();

  if (actorKey === "admin") return true;

  const perm = await prisma.budgetPermission.findUnique({
    where: { budgetId_userKey: { budgetId: BUDGET_ID, userKey: actorKey } },
    select: { role: true },
  });

  if (!perm) {
    res.status(403).json({});
    return false;
  }
  if (minRole === "ADMIN" && perm.role !== "ADMIN") {
    res.status(403).json({});
    return false;
  }
  return true;
}

async function audit(
  actorKey: string,
  action: BudgetAction,
  entityId?: string,
  before?: unknown,
  after?: unknown,
) {
  await prisma.budgetAuditLog.create({
    data: {
      budgetId: BUDGET_ID,
      actorKey,
      action,
      entityId,
      before: before ? JSON.stringify(before) : undefined,
      after: after ? JSON.stringify(after) : undefined,
    },
  });
}

async function ensureBudget() {
  return prisma.budget.upsert({
    where: { id: BUDGET_ID },
    update: {},
    create: { id: BUDGET_ID, totalBudget: 25000, currency: "JOD" },
  });
}

async function overview() {
  const budget = await ensureBudget();
  const [categories, expenses, totalPaidAgg] = await Promise.all([
    prisma.budgetCategory.findMany({ where: { budgetId: BUDGET_ID }, orderBy: { name: "asc" } }),
    prisma.expense.findMany({
      where: { budgetId: BUDGET_ID },
      include: { category: true, vendor: true, payments: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.payment.aggregate({ where: { budgetId: BUDGET_ID }, _sum: { amount: true } }),
  ]);

  const totalBudget = num(budget.totalBudget);
  const totalCommitted = expenses.reduce((sum, expense) => sum + num(expense.totalAmount), 0);
  const totalPaid = num(totalPaidAgg._sum.amount);
  const totalUnpaid = totalCommitted - totalPaid;
  const remaining = totalBudget - totalCommitted;
  const now = new Date();
  const dueLimit = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  return {
    id: budget.id,
    totalBudget,
    currency: budget.currency,
    notes: budget.notes,
    totalCommitted,
    totalPaid,
    totalUnpaid,
    remaining,
    isOverBudget: totalCommitted > totalBudget,
    byCategory: categories.map((category) => {
      const categoryExpenses = expenses.filter((expense) => expense.categoryId === category.id);
      return {
        id: category.id,
        name: category.name,
        color: category.color,
        cap: category.cap ? num(category.cap) : null,
        committed: categoryExpenses.reduce((sum, expense) => sum + num(expense.totalAmount), 0),
        paid: categoryExpenses.reduce((sum, expense) => sum + expense.payments.reduce((paid, payment) => paid + num(payment.amount), 0), 0),
      };
    }),
    upcomingPayments: expenses
      .map((expense) => {
        const amountPaid = expense.payments.reduce((sum, payment) => sum + num(payment.amount), 0);
        return {
          id: expense.id,
          description: expense.description,
          totalAmount: num(expense.totalAmount),
          amountPaid,
          remaining: num(expense.totalAmount) - amountPaid,
          dueDate: expense.dueDate?.toISOString() ?? null,
          vendor: expense.vendor?.name ?? null,
          category: expense.category?.name ?? null,
        };
      })
      .filter((expense) => expense.dueDate && new Date(expense.dueDate) >= now && new Date(expense.dueDate) <= dueLimit && expense.remaining > 0),
  };
}

budgetRouter.get("/", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "VIEWER"))) return;
  res.json(await overview());
}));

budgetRouter.put("/", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const schema = z.object({
    totalBudget: z.coerce.number().min(0).optional(),
    currency: z.string().min(1).optional(),
    notes: optStr,
  });
  const input = schema.parse(req.body);
  const before = await ensureBudget();
  const after = await prisma.budget.update({
    where: { id: BUDGET_ID },
    data: {
      ...(input.totalBudget !== undefined ? { totalBudget: money(input.totalBudget) } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
  await audit(actor(req), BudgetAction.UPDATE_BUDGET, after.id, before, after);
  res.json(await overview());
}));

budgetRouter.get("/my-permissions", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "VIEWER"))) return;
  const actorKey = actor(req);
  if (actorKey === "admin") return res.json({ role: "ADMIN" });
  const permission = await prisma.budgetPermission.findUnique({
    where: { budgetId_userKey: { budgetId: BUDGET_ID, userKey: actorKey } },
  });
  if (!permission) return res.status(403).json({});
  res.json({ role: permission.role });
}));

budgetRouter.get("/permissions", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  res.json(await prisma.budgetPermission.findMany({ where: { budgetId: BUDGET_ID }, orderBy: { userKey: "asc" } }));
}));

budgetRouter.post("/permissions", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const input = z.object({ userKey: z.string().min(1), role: z.enum(["ADMIN", "VIEWER"]) }).parse(req.body);
  const permission = await prisma.budgetPermission.upsert({
    where: { budgetId_userKey: { budgetId: BUDGET_ID, userKey: input.userKey } },
    update: { role: input.role as BudgetRole, grantedBy: actor(req) },
    create: { budgetId: BUDGET_ID, userKey: input.userKey, role: input.role as BudgetRole, grantedBy: actor(req) },
  });
  await audit(actor(req), BudgetAction.GRANT_PERMISSION, input.userKey, undefined, permission);
  res.json(permission);
}));

budgetRouter.delete("/permissions/:key", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const userKey = String(req.params.key ?? "");
  if (userKey === "admin") return res.status(403).json({});
  const before = await prisma.budgetPermission.findUnique({ where: { budgetId_userKey: { budgetId: BUDGET_ID, userKey } } });
  if (before) {
    await prisma.budgetPermission.delete({ where: { budgetId_userKey: { budgetId: BUDGET_ID, userKey } } });
    await audit(actor(req), BudgetAction.REVOKE_PERMISSION, userKey, before);
  }
  res.json({ ok: true });
}));

budgetRouter.get("/categories", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "VIEWER"))) return;
  res.json(await prisma.budgetCategory.findMany({ where: { budgetId: BUDGET_ID }, orderBy: { name: "asc" } }));
}));

budgetRouter.post("/categories", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const input = z.object({ name: z.string().min(1), cap: optNum, color: optStr }).parse(req.body);
  res.json(await prisma.budgetCategory.create({
    data: { budgetId: BUDGET_ID, name: input.name, cap: input.cap == null ? null : money(input.cap), color: input.color },
  }));
}));

budgetRouter.put("/categories/:id", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const input = z.object({ name: z.string().min(1).optional(), cap: optNum, color: optStr }).parse(req.body);
  res.json(await prisma.budgetCategory.update({
    where: { id: String(req.params.id) },
    data: { ...(input.name ? { name: input.name } : {}), ...(input.cap !== undefined ? { cap: input.cap == null ? null : money(input.cap) } : {}), ...(input.color !== undefined ? { color: input.color } : {}) },
  }));
}));

budgetRouter.delete("/categories/:id", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  await prisma.budgetCategory.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
}));

budgetRouter.get("/vendors", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "VIEWER"))) return;
  const vendors = await prisma.vendor.findMany({
    where: { budgetId: BUDGET_ID },
    include: { category: true, expenses: { include: { payments: true } } },
    orderBy: { name: "asc" },
  });
  res.json(vendors.map((vendor) => {
    const amountPaid = vendor.expenses.reduce((sum, expense) => sum + expense.payments.reduce((paid, payment) => paid + num(payment.amount), 0), 0);
    return { ...vendor, agreedPrice: num(vendor.agreedPrice), amountPaid, remaining: num(vendor.agreedPrice) - amountPaid, expenseCount: vendor.expenses.length };
  }));
}));

budgetRouter.post("/vendors", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const input = z.object({
    name: z.string().min(1),
    categoryId: optStr,
    contactPerson: optStr,
    phone: optStr,
    agreedPrice: z.coerce.number().optional().default(0),
    contractUrl: optStr,
    notes: optStr,
  }).parse(req.body);
  res.json(await prisma.vendor.create({ data: { ...input, budgetId: BUDGET_ID, agreedPrice: money(input.agreedPrice) } }));
}));

budgetRouter.put("/vendors/:id", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const input = z.object({
    name: z.string().min(1).optional(),
    categoryId: optStr,
    contactPerson: optStr,
    phone: optStr,
    agreedPrice: z.coerce.number().optional(),
    contractUrl: optStr,
    notes: optStr,
  }).parse(req.body);
  res.json(await prisma.vendor.update({ where: { id: String(req.params.id) }, data: { ...input, ...(input.agreedPrice !== undefined ? { agreedPrice: money(input.agreedPrice) } : {}) } }));
}));

budgetRouter.delete("/vendors/:id", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  await prisma.vendor.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
}));

budgetRouter.get("/expenses", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "VIEWER"))) return;
  const dueBefore = typeof req.query.dueBefore === "string" ? new Date(req.query.dueBefore) : undefined;
  const expenses = await prisma.expense.findMany({
    where: {
      budgetId: BUDGET_ID,
      ...(typeof req.query.categoryId === "string" ? { categoryId: req.query.categoryId } : {}),
      ...(typeof req.query.vendorId === "string" ? { vendorId: req.query.vendorId } : {}),
      ...(dueBefore ? { dueDate: { lte: dueBefore } } : {}),
      ...(typeof req.query.paidBy === "string" ? { payments: { some: { paidBy: req.query.paidBy } } } : {}),
    },
    include: { category: true, vendor: true, payments: { orderBy: { paidAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  const shaped = expenses.map((expense) => {
    const amountPaid = expense.payments.reduce((sum, payment) => sum + num(payment.amount), 0);
    return { ...expense, totalAmount: num(expense.totalAmount), amountPaid, remaining: num(expense.totalAmount) - amountPaid };
  });
  if (req.query.paid === "true") return res.json(shaped.filter((expense) => expense.remaining <= 0));
  if (req.query.paid === "false") return res.json(shaped.filter((expense) => expense.remaining > 0));
  res.json(shaped);
}));

budgetRouter.post("/expenses", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const input = z.object({
    description: z.string().min(1),
    categoryId: optStr,
    vendorId: optStr,
    totalAmount: z.coerce.number(),
    dueDate: optStr,
    notes: optStr,
  }).parse(req.body);
  const expense = await prisma.expense.create({
    data: { ...input, budgetId: BUDGET_ID, totalAmount: money(input.totalAmount), dueDate: input.dueDate ? new Date(input.dueDate) : null, createdBy: actor(req) },
  });
  await audit(actor(req), BudgetAction.CREATE_EXPENSE, expense.id, undefined, expense);
  res.json(expense);
}));

budgetRouter.put("/expenses/:id", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const input = z.object({
    description: z.string().min(1).optional(),
    categoryId: optStr,
    vendorId: optStr,
    totalAmount: z.coerce.number().optional(),
    dueDate: optStr,
    notes: optStr,
  }).parse(req.body);
  const before = await prisma.expense.findUnique({ where: { id: String(req.params.id) } });
  const after = await prisma.expense.update({
    where: { id: String(req.params.id) },
    data: { ...input, ...(input.totalAmount !== undefined ? { totalAmount: money(input.totalAmount) } : {}), ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}) },
  });
  await audit(actor(req), BudgetAction.UPDATE_EXPENSE, after.id, before, after);
  res.json(after);
}));

budgetRouter.delete("/expenses/:id", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const before = await prisma.expense.findUnique({ where: { id: String(req.params.id) } });
  await prisma.expense.delete({ where: { id: String(req.params.id) } });
  await audit(actor(req), BudgetAction.DELETE_EXPENSE, String(req.params.id), before);
  res.json({ ok: true });
}));

budgetRouter.get("/payments", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "VIEWER"))) return;
  res.json(await prisma.payment.findMany({
    where: { budgetId: BUDGET_ID, ...(typeof req.query.expenseId === "string" ? { expenseId: req.query.expenseId } : {}), ...(typeof req.query.paidBy === "string" ? { paidBy: req.query.paidBy } : {}) },
    include: { expense: true },
    orderBy: { paidAt: "desc" },
  }));
}));

budgetRouter.post("/payments", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const input = z.object({
    expenseId: z.string().min(1),
    amount: z.coerce.number(),
    paidAt: z.string().min(1),
    method: optStr,
    paidBy: z.string().min(1),
    receiptUrl: optStr,
    notes: optStr,
  }).parse(req.body);
  const payment = await prisma.payment.create({
    data: { ...input, budgetId: BUDGET_ID, amount: money(input.amount), paidAt: new Date(input.paidAt), method: input.method ?? "cash" },
  });
  await audit(actor(req), BudgetAction.ADD_PAYMENT, payment.id, undefined, payment);
  res.json(payment);
}));

budgetRouter.delete("/payments/:id", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const before = await prisma.payment.findUnique({ where: { id: String(req.params.id) } });
  await prisma.payment.delete({ where: { id: String(req.params.id) } });
  await audit(actor(req), BudgetAction.DELETE_PAYMENT, String(req.params.id), before);
  res.json({ ok: true });
}));

budgetRouter.get("/audit", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const [items, total] = await Promise.all([
    prisma.budgetAuditLog.findMany({ where: { budgetId: BUDGET_ID }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.budgetAuditLog.count({ where: { budgetId: BUDGET_ID } }),
  ]);
  res.json({ items, page, limit, total, hasNext: page * limit < total });
}));

budgetRouter.get("/export", budgetHandler(async (req, res) => {
  if (!(await requireBudget(req, res, "ADMIN"))) return;
  const expenses = await prisma.expense.findMany({
    where: { budgetId: BUDGET_ID },
    include: { category: true, vendor: true, payments: { orderBy: { paidAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  const rows = [["Expense ID", "Description", "Category", "Vendor", "Total Amount (JOD)", "Due Date", "Payment ID", "Payment Date", "Amount (JOD)", "Method", "Paid By", "Notes"]];
  for (const expense of expenses) {
    const payments = expense.payments.length ? expense.payments : [null];
    for (const payment of payments) {
      rows.push([
        expense.id,
        expense.description,
        expense.category?.name ?? "",
        expense.vendor?.name ?? "",
        num(expense.totalAmount).toFixed(3),
        expense.dueDate?.toISOString().slice(0, 10) ?? "",
        payment?.id ?? "",
        payment?.paidAt.toISOString().slice(0, 10) ?? "",
        payment ? num(payment.amount).toFixed(3) : "",
        payment?.method ?? "",
        payment?.paidBy ?? "",
        payment?.notes ?? "",
      ]);
    }
  }
  await audit(actor(req), BudgetAction.EXPORT_BUDGET);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="budget-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(rows.map((row) => row.map(csvCell).join(",")).join("\n"));
}));
