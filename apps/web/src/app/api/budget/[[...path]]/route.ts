type Category = { id: string; name: string; cap: number | null; color: string | null; createdAt: string };
type Vendor = { id: string; categoryId: string | null; name: string; contactPerson: string | null; phone: string | null; agreedPrice: number; contractUrl: string | null; notes: string | null; createdAt: string; updatedAt: string };
type Expense = { id: string; categoryId: string | null; vendorId: string | null; description: string; totalAmount: number; dueDate: string | null; notes: string | null; createdBy: string; createdAt: string; updatedAt: string };
type Payment = { id: string; expenseId: string; amount: number; paidAt: string; method: string; paidBy: string; receiptUrl: string | null; notes: string | null; createdAt: string };
type Permission = { id: string; userKey: string; role: "ADMIN" | "VIEWER"; grantedAt: string; grantedBy: string | null };
type Audit = { id: string; actorKey: string; action: string; entityId: string | null; before?: unknown; after?: unknown; createdAt: string };
type Store = {
  budget: { id: string; totalBudget: number; currency: string; notes: string | null; createdAt: string; updatedAt: string };
  categories: Category[];
  vendors: Vendor[];
  expenses: Expense[];
  payments: Payment[];
  permissions: Permission[];
  audit: Audit[];
};

const defaultCategories = [
  ["Venue", "#6366F1"], ["Catering", "#F59E0B"], ["Decoration", "#EC4899"],
  ["Photography", "#10B981"], ["Videography", "#3B82F6"], ["Music / DJ", "#8B5CF6"],
  ["Wedding Dress", "#F43F5E"], ["Groom Suit", "#0EA5E9"], ["Invitations", "#14B8A6"],
  ["Gifts", "#F97316"], ["Transportation", "#84CC16"], ["Accommodation", "#06B6D4"],
  ["Miscellaneous", "#9CA3AF"],
] as const;

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function store() {
  const globalWithStore = globalThis as typeof globalThis & { __hsBudgetStore?: Store };
  if (!globalWithStore.__hsBudgetStore) {
    globalWithStore.__hsBudgetStore = {
      budget: { id: "main-budget", totalBudget: 25000, currency: "JOD", notes: null, createdAt: now(), updatedAt: now() },
      categories: defaultCategories.map(([name, color]) => ({
        id: `cat-${name.toLowerCase().replace(/\W+/g, "-")}`,
        name,
        color,
        cap: null,
        createdAt: now(),
      })),
      vendors: [],
      expenses: [],
      payments: [],
      permissions: [
        { id: "perm-admin", userKey: "admin", role: "ADMIN", grantedAt: now(), grantedBy: null },
        { id: "perm-hamza", userKey: "hamza", role: "VIEWER", grantedAt: now(), grantedBy: "admin" },
      ],
      audit: [],
    };
  }
  return globalWithStore.__hsBudgetStore;
}

function actor(request: Request, url: URL) {
  return (request.headers.get("x-actor") || url.searchParams.get("actor") || "").trim().toLowerCase();
}

function roleFor(actorKey: string) {
  if (actorKey === "admin") return "ADMIN";
  return store().permissions.find((permission) => permission.userKey === actorKey)?.role ?? null;
}

function requireBudget(actorKey: string, minRole: "VIEWER" | "ADMIN") {
  const role = roleFor(actorKey);
  return Boolean(role && (minRole === "VIEWER" || role === "ADMIN"));
}

function forbidden() {
  return Response.json({}, { status: 403 });
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function audit(actorKey: string, action: string, entityId?: string | null, before?: unknown, after?: unknown) {
  store().audit.unshift({ id: id("audit"), actorKey, action, entityId: entityId ?? null, before, after, createdAt: now() });
}

function categoryById(categoryId: string | null) {
  return categoryId ? store().categories.find((category) => category.id === categoryId) ?? null : null;
}

function vendorById(vendorId: string | null) {
  return vendorId ? store().vendors.find((vendor) => vendor.id === vendorId) ?? null : null;
}

function paymentsForExpense(expenseId: string) {
  return store().payments.filter((payment) => payment.expenseId === expenseId);
}

function expenseView(expense: Expense) {
  const payments = paymentsForExpense(expense.id);
  const amountPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  return {
    ...expense,
    category: categoryById(expense.categoryId),
    vendor: vendorById(expense.vendorId),
    payments,
    amountPaid,
    remaining: expense.totalAmount - amountPaid,
  };
}

function vendorView(vendor: Vendor) {
  const vendorExpenses = store().expenses.filter((expense) => expense.vendorId === vendor.id);
  const amountPaid = vendorExpenses.flatMap((expense) => paymentsForExpense(expense.id)).reduce((sum, payment) => sum + payment.amount, 0);
  return {
    ...vendor,
    category: categoryById(vendor.categoryId),
    amountPaid,
    remaining: vendor.agreedPrice - amountPaid,
    expenseCount: vendorExpenses.length,
  };
}

function overview() {
  const data = store();
  const expenseViews = data.expenses.map(expenseView);
  const totalCommitted = expenseViews.reduce((sum, expense) => sum + expense.totalAmount, 0);
  const totalPaid = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const today = Date.now();
  const in14 = today + 14 * 24 * 60 * 60 * 1000;
  return {
    ...data.budget,
    totalCommitted,
    totalPaid,
    totalUnpaid: totalCommitted - totalPaid,
    remaining: data.budget.totalBudget - totalCommitted,
    isOverBudget: totalCommitted > data.budget.totalBudget,
    byCategory: data.categories.map((category) => {
      const expenses = expenseViews.filter((expense) => expense.categoryId === category.id);
      return {
        id: category.id,
        name: category.name,
        color: category.color,
        cap: category.cap,
        committed: expenses.reduce((sum, expense) => sum + expense.totalAmount, 0),
        paid: expenses.reduce((sum, expense) => sum + expense.amountPaid, 0),
      };
    }),
    upcomingPayments: expenseViews
      .filter((expense) => expense.dueDate && new Date(expense.dueDate).getTime() >= today && new Date(expense.dueDate).getTime() <= in14 && expense.remaining > 0)
      .map((expense) => ({
        id: expense.id,
        description: expense.description,
        totalAmount: expense.totalAmount,
        amountPaid: expense.amountPaid,
        remaining: expense.remaining,
        dueDate: expense.dueDate,
        vendor: expense.vendor?.name ?? null,
        category: expense.category?.name ?? null,
      })),
  };
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

async function handler(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const params = await context.params;
  const segments = params.path ?? [];
  const route = segments.join("/");
  const url = new URL(request.url);
  const actorKey = actor(request, url);
  const method = request.method;

  if (route === "my-permissions" && method === "GET") {
    if (!requireBudget(actorKey, "VIEWER")) return forbidden();
    return Response.json({ role: roleFor(actorKey) });
  }
  if (!requireBudget(actorKey, route.startsWith("permissions") || route === "audit" || route === "export" || method !== "GET" ? "ADMIN" : "VIEWER")) return forbidden();

  if (route === "" && method === "GET") return Response.json(overview());
  if (route === "" && method === "PUT") {
    const before = { ...store().budget };
    const body = await request.json();
    store().budget = {
      ...store().budget,
      totalBudget: numberValue(body.totalBudget, store().budget.totalBudget),
      currency: String(body.currency || store().budget.currency),
      notes: body.notes ? String(body.notes) : null,
      updatedAt: now(),
    };
    audit(actorKey, "UPDATE_BUDGET", store().budget.id, before, store().budget);
    return Response.json(store().budget);
  }

  if (route === "categories" && method === "GET") return Response.json(store().categories);
  if (route === "categories" && method === "POST") {
    const body = await request.json();
    const category = { id: id("cat"), name: String(body.name), cap: body.cap ? numberValue(body.cap) : null, color: body.color ? String(body.color) : null, createdAt: now() };
    store().categories.push(category);
    return Response.json(category);
  }

  if (route === "vendors" && method === "GET") return Response.json(store().vendors.map(vendorView));
  if (route === "vendors" && method === "POST") {
    const body = await request.json();
    const vendor: Vendor = {
      id: id("vendor"),
      categoryId: body.categoryId ? String(body.categoryId) : null,
      name: String(body.name),
      contactPerson: body.contactPerson ? String(body.contactPerson) : null,
      phone: body.phone ? String(body.phone) : null,
      agreedPrice: numberValue(body.agreedPrice),
      contractUrl: body.contractUrl ? String(body.contractUrl) : null,
      notes: body.notes ? String(body.notes) : null,
      createdAt: now(),
      updatedAt: now(),
    };
    store().vendors.push(vendor);
    return Response.json(vendorView(vendor));
  }

  if (route === "expenses" && method === "GET") return Response.json(store().expenses.map(expenseView));
  if (route === "expenses" && method === "POST") {
    const body = await request.json();
    const expense: Expense = {
      id: id("expense"),
      categoryId: body.categoryId ? String(body.categoryId) : null,
      vendorId: body.vendorId ? String(body.vendorId) : null,
      description: String(body.description),
      totalAmount: numberValue(body.totalAmount),
      dueDate: body.dueDate ? new Date(String(body.dueDate)).toISOString() : null,
      notes: body.notes ? String(body.notes) : null,
      createdBy: actorKey,
      createdAt: now(),
      updatedAt: now(),
    };
    store().expenses.push(expense);
    audit(actorKey, "CREATE_EXPENSE", expense.id, undefined, expense);
    return Response.json(expenseView(expense));
  }

  if (route === "payments" && method === "GET") return Response.json(store().payments);
  if (route === "payments" && method === "POST") {
    const body = await request.json();
    const payment: Payment = {
      id: id("payment"),
      expenseId: String(body.expenseId),
      amount: numberValue(body.amount),
      paidAt: body.paidAt ? new Date(String(body.paidAt)).toISOString() : now(),
      method: String(body.method || "cash"),
      paidBy: String(body.paidBy || actorKey),
      receiptUrl: body.receiptUrl ? String(body.receiptUrl) : null,
      notes: body.notes ? String(body.notes) : null,
      createdAt: now(),
    };
    store().payments.push(payment);
    audit(actorKey, "ADD_PAYMENT", payment.id, undefined, payment);
    return Response.json(payment);
  }

  if (route === "permissions" && method === "GET") return Response.json(store().permissions);
  if (route === "permissions" && method === "POST") {
    const body = await request.json();
    const userKey = String(body.userKey || "").trim().toLowerCase();
    const role = body.role === "ADMIN" ? "ADMIN" : "VIEWER";
    const current = store().permissions.find((permission) => permission.userKey === userKey);
    if (current) current.role = role;
    else store().permissions.push({ id: id("perm"), userKey, role, grantedAt: now(), grantedBy: actorKey });
    audit(actorKey, "GRANT_PERMISSION", userKey, undefined, { userKey, role });
    return Response.json(store().permissions.find((permission) => permission.userKey === userKey));
  }
  if (segments[0] === "permissions" && segments[1] && method === "DELETE") {
    const before = store().permissions.find((permission) => permission.userKey === segments[1]);
    store().permissions = store().permissions.filter((permission) => permission.userKey !== segments[1] || permission.userKey === "admin");
    audit(actorKey, "REVOKE_PERMISSION", segments[1], before);
    return Response.json({ ok: true });
  }

  if (route === "audit" && method === "GET") {
    const page = Math.max(1, numberValue(url.searchParams.get("page"), 1));
    const limit = Math.max(1, numberValue(url.searchParams.get("limit"), 50));
    const start = (page - 1) * limit;
    return Response.json({ items: store().audit.slice(start, start + limit), page, hasNext: store().audit.length > start + limit });
  }

  if (route === "export" && method === "GET") {
    audit(actorKey, "EXPORT_BUDGET");
    const rows = [["Expense ID", "Description", "Category", "Vendor", "Total Amount (JOD)", "Due Date", "Payment ID", "Payment Date", "Amount (JOD)", "Method", "Paid By", "Notes"]];
    for (const expense of store().expenses.map(expenseView)) {
      const payments = expense.payments.length ? expense.payments : [{ id: "", paidAt: "", amount: "", method: "", paidBy: "", notes: "" }];
      for (const payment of payments) {
        rows.push([expense.id, expense.description, expense.category?.name ?? "", expense.vendor?.name ?? "", String(expense.totalAmount), expense.dueDate ?? "", payment.id, payment.paidAt, String(payment.amount), payment.method, payment.paidBy, payment.notes ?? ""]);
      }
    }
    return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\n"), {
      headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="budget-export-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

export const dynamic = "force-dynamic";
export const GET = handler;
export const PUT = handler;
export const POST = handler;
export const DELETE = handler;
