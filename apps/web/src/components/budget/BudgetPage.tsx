"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { SessionUser } from "@/lib/access-control";
import { budgetDelete, budgetExportUrl, budgetGet, budgetPost, budgetPut } from "@/lib/budget-api";

/* ── Types ─────────────────────────────────────────────────── */
type Overview = {
  id: string; totalBudget: number; currency: string; notes?: string | null;
  totalCommitted: number; totalPaid: number; totalUnpaid: number; remaining: number; isOverBudget: boolean;
  byCategory: Array<{ id: string; name: string; color: string | null; cap: number | null; committed: number; paid: number }>;
  upcomingPayments: Array<{ id: string; description: string; totalAmount: number; amountPaid: number; remaining: number; dueDate: string; vendor: string | null; category: string | null }>;
};
type Category = { id: string; name: string; color?: string | null; cap?: number | null };
type Vendor   = { id: string; name: string; categoryId?: string | null; category?: Category | null; contactPerson?: string | null; phone?: string | null; agreedPrice: number; contractUrl?: string | null; notes?: string | null; amountPaid: number; remaining: number; expenseCount: number };
type Payment  = { id: string; expenseId: string; amount: number; paidAt: string; method: string; paidBy: string; receiptUrl?: string | null; notes?: string | null };
type Expense  = { id: string; description: string; categoryId?: string | null; category?: Category | null; vendorId?: string | null; vendor?: Vendor | null; totalAmount: number; amountPaid: number; remaining: number; dueDate?: string | null; notes?: string | null; payments: Payment[] };
type Permission = { id: string; userKey: string; role: "ADMIN" | "VIEWER"; grantedAt: string; grantedBy?: string | null };
type AuditItem  = { id: string; actorKey: string; action: string; entityId?: string | null; before?: unknown; after?: unknown; createdAt: string };
type Tab = "overview" | "expenses" | "vendors" | "admin";

const ACTION_LABELS: Record<string, string> = {
  CREATE_EXPENSE: "Added expense", UPDATE_EXPENSE: "Updated expense", DELETE_EXPENSE: "Deleted expense",
  ADD_PAYMENT: "Recorded payment", DELETE_PAYMENT: "Removed payment", UPDATE_BUDGET: "Changed budget",
  GRANT_PERMISSION: "Granted access", REVOKE_PERMISSION: "Revoked access", EXPORT_BUDGET: "Exported budget",
};

function fmt(v: number, currency = "JOD") {
  return `${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currency}`;
}
function pct(paid: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((paid / total) * 100));
}

/* ── Main component ─────────────────────────────────────────── */
export function BudgetPageClient({ initialUser }: { initialUser: SessionUser }) {
  const actorKey = initialUser.key;
  const isAdmin  = initialUser.permissions.canManageBudgetPermissions;

  const [overview, setOverview]   = useState<Overview | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors]     = useState<Vendor[]>([]);
  const [expenses, setExpenses]   = useState<Expense[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [audit, setAudit]         = useState<{ items: AuditItem[]; page: number; hasNext: boolean }>({ items: [], page: 1, hasNext: false });
  const [tab, setTab]             = useState<Tab>("overview");
  const [modal, setModal]         = useState<"expense" | "payment" | "vendor" | "budget" | null>(null);
  const [paymentExpense, setPaymentExpense] = useState<Expense | null>(null);
  const [openExpense, setOpenExpense] = useState<string | null>(null);
  const [notice, setNotice]       = useState("");

  const load = useCallback(async (page = 1) => {
    const [ov, cats, vens, exps] = await Promise.all([
      budgetGet<Overview>("/api/budget", actorKey),
      budgetGet<Category[]>("/api/budget/categories", actorKey),
      budgetGet<Vendor[]>("/api/budget/vendors", actorKey),
      budgetGet<Expense[]>("/api/budget/expenses", actorKey),
    ]);
    setOverview(ov); setCategories(cats); setVendors(vens); setExpenses(exps);
    if (isAdmin) {
      const [perms, aud] = await Promise.all([
        budgetGet<Permission[]>("/api/budget/permissions", actorKey),
        budgetGet<{ items: AuditItem[]; page: number; hasNext: boolean }>(`/api/budget/audit?page=${page}&limit=50`, actorKey),
      ]);
      setPermissions(perms); setAudit(aud);
    }
  }, [actorKey, isAdmin]);

  useEffect(() => { void load(1); }, [load]);

  const alerts = useMemo(() => {
    if (!overview) return [];
    const out: Array<{ type: "error" | "warning" | "info"; text: string }> = [];
    if (overview.isOverBudget) out.push({ type: "error", text: `Over budget by ${fmt(Math.abs(overview.remaining), overview.currency)}` });
    if (overview.upcomingPayments.length > 0) out.push({ type: "warning", text: `${overview.upcomingPayments.length} payment(s) due within 14 days` });
    const noContract = vendors.filter((v) => v.agreedPrice > 0 && v.expenseCount === 0 && !v.contractUrl);
    if (noContract.length > 0) out.push({ type: "info", text: `${noContract.length} vendor(s) missing contract` });
    return out;
  }, [overview, vendors]);

  async function done(msg: string) {
    setNotice(msg);
    await load(audit.page);
    setTimeout(() => setNotice(""), 3000);
  }

  if (!overview) {
    return (
      <div className="budget-shell">
        <div className="budget-loading">Loading budget…</div>
      </div>
    );
  }

  return (
    <div className="budget-shell">

      {/* ── Topbar ── */}
      <div className="budget-topbar">
        <div>
          <h1 className="budget-title">Wedding Budget</h1>
          <span className="budget-subtitle">{overview.currency} · {fmt(overview.totalBudget, overview.currency)} planned</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isAdmin && <button className="btn" onClick={() => setModal("budget")}>Edit Budget</button>}
          {isAdmin && <a className="btn" href={budgetExportUrl(actorKey)}>Export CSV</a>}
          <Link className="btn btn-p" href="/">← Dashboard</Link>
        </div>
      </div>

      {/* ── Alerts ── */}
      {alerts.length > 0 && (
        <div className="budget-alerts">
          {alerts.map((a) => (
            <div key={a.text} className={`budget-alert budget-alert-${a.type}`}>{a.text}</div>
          ))}
        </div>
      )}

      {/* ── Notice ── */}
      {notice && <div className="notice" role="status" style={{ margin: "0 24px" }}>{notice}</div>}

      {/* ── Tab bar ── */}
      <div className="budget-tabs">
        <button className={`budget-tab${tab === "overview"  ? " active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
        <button className={`budget-tab${tab === "expenses"  ? " active" : ""}`} onClick={() => setTab("expenses")}>
          Expenses
          {expenses.some((e) => e.remaining > 0) && <span className="budget-tab-dot" />}
        </button>
        <button className={`budget-tab${tab === "vendors"   ? " active" : ""}`} onClick={() => setTab("vendors")}>Vendors</button>
        {isAdmin && <button className={`budget-tab${tab === "admin" ? " active" : ""}`} onClick={() => setTab("admin")}>Admin</button>}
      </div>

      {/* ── Tab content ── */}
      <div className="budget-content">

        {/* OVERVIEW */}
        {tab === "overview" && (
          <>
            {/* 3 hero stats */}
            <div className="budget-hero-stats">
              <HeroStat label="Total Budget"   value={fmt(overview.totalBudget,   overview.currency)} />
              <HeroStat label="Total Paid"     value={fmt(overview.totalPaid,     overview.currency)} tone="g" />
              <HeroStat label="Remaining"      value={fmt(overview.remaining,     overview.currency)} tone={overview.remaining < 0 ? "r" : "g"} />
            </div>

            {/* Secondary stats */}
            <div className="budget-secondary-stats">
              <MiniStat label="Committed"  value={fmt(overview.totalCommitted, overview.currency)} tone={overview.totalCommitted > overview.totalBudget * 0.8 ? "a" : undefined} />
              <MiniStat label="Unpaid"     value={fmt(overview.totalUnpaid,   overview.currency)} tone={overview.totalUnpaid > 0 ? "r" : undefined} />
              <MiniStat label="Due soon"   value={`${overview.upcomingPayments.length} item${overview.upcomingPayments.length !== 1 ? "s" : ""}`} tone={overview.upcomingPayments.length > 0 ? "a" : undefined} />
            </div>

            <div className="two">
              {/* Donut chart */}
              <div className="card">
                <div className="card-head"><span className="card-title">Spending by Category</span></div>
                <div className="card-body">
                  {overview.byCategory.some((c) => c.committed > 0) ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={overview.byCategory.filter((c) => c.committed > 0)}
                          dataKey="committed" nameKey="name"
                          innerRadius={52} outerRadius={82}
                        >
                          {overview.byCategory.map((c) => <Cell key={c.id} fill={c.color ?? "#9CA3AF"} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmt(Number(v), overview.currency)} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="budget-empty">No expenses recorded yet.</div>
                  )}
                </div>
              </div>

              {/* Upcoming payments */}
              <div className="card">
                <div className="card-head"><span className="card-title">Due in 14 Days</span></div>
                <div className="card-body" style={{ padding: 0 }}>
                  {overview.upcomingPayments.length ? (
                    overview.upcomingPayments.map((p) => (
                      <div key={p.id} className="upcoming-item">
                        <div>
                          <div className="upcoming-desc">{p.description}</div>
                          <div className="upcoming-meta">{p.vendor ?? p.category ?? "—"} · due {p.dueDate?.slice(0, 10)}</div>
                        </div>
                        <div className="upcoming-amount">{fmt(p.remaining, overview.currency)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="budget-empty">No payments due soon.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Category breakdown rows */}
            <div className="card">
              <div className="card-head"><span className="card-title">Category Breakdown</span></div>
              <div className="card-body" style={{ padding: 0 }}>
                {overview.byCategory.filter((c) => c.committed > 0).map((c) => (
                  <div key={c.id} className="category-row">
                    <span className="category-dot" style={{ background: c.color ?? "#9CA3AF" }} />
                    <span className="category-name">{c.name}</span>
                    <div className="category-bar-wrap">
                      <div className="category-bar-fill" style={{ width: `${pct(c.paid, c.committed)}%`, background: c.color ?? "#9CA3AF" }} />
                    </div>
                    <span className="category-pct">{pct(c.paid, c.committed)}%</span>
                    <span className="category-amt">{fmt(c.committed, overview.currency)}</span>
                  </div>
                ))}
                {overview.byCategory.every((c) => c.committed === 0) && (
                  <div className="budget-empty">No expenses yet.</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* EXPENSES */}
        {tab === "expenses" && (
          <div className="card">
            <div className="card-head">
              <span className="card-title">Expenses</span>
              {isAdmin && <button className="btn btn-p btn-sm" onClick={() => setModal("expense")}>+ Add Expense</button>}
            </div>
            {expenses.length ? expenses.map((exp) => (
              <Fragment key={exp.id}>
                <div className="expense-row" onClick={() => setOpenExpense(openExpense === exp.id ? null : exp.id)}>
                  <div className="expense-info">
                    <div className="expense-desc">{exp.description}</div>
                    <div className="expense-meta">
                      {exp.category?.name && <span className="badge b-x">{exp.category.name}</span>}
                      {exp.vendor?.name && <span style={{ color: "var(--label-3)", fontSize: 12 }}>{exp.vendor.name}</span>}
                      {exp.dueDate && <span style={{ color: "var(--label-3)", fontSize: 12 }}>due {exp.dueDate.slice(0, 10)}</span>}
                    </div>
                  </div>
                  <div className="expense-right">
                    <div className="expense-progress-wrap">
                      <div className="expense-progress-bar">
                        <div className="expense-progress-fill" style={{ width: `${pct(exp.amountPaid, exp.totalAmount)}%` }} />
                      </div>
                      <span className="expense-pct">{pct(exp.amountPaid, exp.totalAmount)}% paid</span>
                    </div>
                    <div className="expense-amounts">
                      <span className="expense-total">{fmt(exp.totalAmount, overview.currency)}</span>
                      <span className={`badge ${exp.remaining <= 0 ? "b-g" : "b-a"}`}>{exp.remaining <= 0 ? "Paid" : `${fmt(exp.remaining, overview.currency)} left`}</span>
                    </div>
                  </div>
                  <span className="expense-chevron">{openExpense === exp.id ? "▴" : "▾"}</span>
                </div>

                {openExpense === exp.id && (
                  <div className="payment-panel">
                    {exp.payments.length ? (
                      exp.payments.map((pay) => (
                        <div key={pay.id} className="payment-item">
                          <span className="payment-date">{pay.paidAt.slice(0, 10)}</span>
                          <span className="payment-amount">{fmt(pay.amount, overview.currency)}</span>
                          <span className="payment-method badge b-x">{pay.method}</span>
                          <span className="payment-by" style={{ color: "var(--label-2)", fontSize: 12 }}>by {pay.paidBy}</span>
                          {pay.receiptUrl && <a className="payment-receipt" href={pay.receiptUrl} target="_blank" rel="noreferrer">Receipt</a>}
                        </div>
                      ))
                    ) : (
                      <p style={{ fontSize: 13, color: "var(--label-3)" }}>No payments recorded yet.</p>
                    )}
                    {isAdmin && (
                      <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={(e) => { e.stopPropagation(); setPaymentExpense(exp); setModal("payment"); }}>
                        + Add Payment
                      </button>
                    )}
                  </div>
                )}
              </Fragment>
            )) : (
              <div className="budget-empty">No expenses yet. Click Add Expense to get started.</div>
            )}
          </div>
        )}

        {/* VENDORS */}
        {tab === "vendors" && (
          <div className="card">
            <div className="card-head">
              <span className="card-title">Vendors</span>
              {isAdmin && <button className="btn btn-p btn-sm" onClick={() => setModal("vendor")}>+ Add Vendor</button>}
            </div>
            {vendors.length ? vendors.map((v) => (
              <div key={v.id} className="vendor-row">
                <div className="vendor-info">
                  <div className="vendor-name">{v.name}</div>
                  <div className="vendor-meta">
                    {v.category?.name && <span className="badge b-x">{v.category.name}</span>}
                    {v.contactPerson && <span style={{ fontSize: 12, color: "var(--label-3)" }}>{v.contactPerson}</span>}
                    {v.phone && <span style={{ fontSize: 12, color: "var(--label-3)" }}>{v.phone}</span>}
                  </div>
                </div>
                <div className="vendor-right">
                  <div className="vendor-amounts">
                    <div>
                      <div style={{ fontSize: 11, color: "var(--label-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Agreed</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{fmt(v.agreedPrice, overview.currency)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--label-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Paid</div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--green-dark)" }}>{fmt(v.amountPaid, overview.currency)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--label-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Remaining</div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: v.remaining > 0 ? "var(--amber)" : "var(--green-dark)" }}>{fmt(v.remaining, overview.currency)}</div>
                    </div>
                  </div>
                  {v.contractUrl
                    ? <a className="btn btn-sm" href={v.contractUrl} target="_blank" rel="noreferrer">Contract</a>
                    : <span style={{ fontSize: 12, color: "var(--label-3)" }}>No contract</span>}
                </div>
              </div>
            )) : (
              <div className="budget-empty">No vendors yet. Click Add Vendor to get started.</div>
            )}
          </div>
        )}

        {/* ADMIN */}
        {tab === "admin" && isAdmin && (
          <>
            {/* Permissions */}
            <div className="card">
              <div className="card-head"><span className="card-title">Budget Access</span></div>
              <div className="card-body">
                <form style={{ display: "flex", gap: 8 }} onSubmit={async (e) => { e.preventDefault(); await budgetPost("/api/budget/permissions", Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement)), actorKey); await done("Access granted."); }}>
                  <input className="input" name="userKey" placeholder="user key (e.g. hamza)" required style={{ flex: 1 }} />
                  <select className="select" name="role" style={{ width: 120 }}><option>VIEWER</option><option>ADMIN</option></select>
                  <button className="btn btn-p" type="submit">Grant</button>
                </form>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 0 }}>
                  {permissions.map((p) => (
                    <div key={p.id} className="permission-row">
                      <span className="permission-key">{p.userKey}</span>
                      <span className={`badge ${p.role === "ADMIN" ? "b-r" : "b-x"}`}>{p.role}</span>
                      <span style={{ fontSize: 12, color: "var(--label-3)", flex: 1 }}>granted {p.grantedAt?.slice(0, 10)}</span>
                      {p.userKey !== "admin" && (
                        <button className="btn btn-sm" onClick={async () => { await budgetDelete(`/api/budget/permissions/${p.userKey}`, actorKey); await done("Access revoked."); }}>Revoke</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Audit log */}
            <div className="card">
              <div className="card-head">
                <span className="card-title">Audit Log</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-sm" disabled={audit.page <= 1} onClick={() => load(audit.page - 1)}>← Prev</button>
                  <button className="btn btn-sm" disabled={!audit.hasNext} onClick={() => load(audit.page + 1)}>Next →</button>
                </div>
              </div>
              <div style={{ padding: 0 }}>
                {audit.items.map((item) => (
                  <div key={item.id} className="audit-row">
                    <span className="audit-time">{new Date(item.createdAt).toLocaleString()}</span>
                    <span className="audit-actor badge b-x">{item.actorKey}</span>
                    <span className="audit-action">{ACTION_LABELS[item.action] ?? item.action}</span>
                    {item.entityId && <span style={{ fontSize: 12, color: "var(--label-3)" }}>{item.entityId.slice(0, 8)}…</span>}
                  </div>
                ))}
                {!audit.items.length && <div className="budget-empty">No audit log entries yet.</div>}
              </div>
            </div>
          </>
        )}

      </div>

      {/* ── Modals ── */}
      {modal === "budget" && (
        <Modal title="Edit Budget" close={() => setModal(null)}>
          <form onSubmit={async (e) => { e.preventDefault(); const d = new FormData(e.currentTarget as HTMLFormElement); await budgetPut("/api/budget", { totalBudget: d.get("totalBudget"), currency: d.get("currency"), notes: d.get("notes") }, actorKey); setModal(null); await done("Budget updated."); }}>
            <div className="modal-body">
              <F name="totalBudget" label="Total Budget" type="number" step="0.001" defaultValue={overview.totalBudget} />
              <F name="currency" label="Currency" defaultValue={overview.currency} />
              <F name="notes" label="Notes" defaultValue={overview.notes ?? ""} />
            </div>
            <div className="modal-foot"><button className="btn btn-p" type="submit">Save</button></div>
          </form>
        </Modal>
      )}

      {modal === "expense" && (
        <Modal title="Add Expense" close={() => setModal(null)}>
          <form onSubmit={async (e) => { e.preventDefault(); await budgetPost("/api/budget/expenses", Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement)), actorKey); setModal(null); await done("Expense added."); }}>
            <div className="modal-body">
              <F name="description" label="Description" required />
              <Sel name="categoryId" label="Category" items={categories} />
              <Sel name="vendorId" label="Vendor" items={vendors} optional />
              <F name="totalAmount" label="Total Amount" type="number" step="0.001" required />
              <F name="dueDate" label="Due Date" type="date" />
              <FA name="notes" label="Notes" />
            </div>
            <div className="modal-foot"><button className="btn btn-p" type="submit">Add Expense</button></div>
          </form>
        </Modal>
      )}

      {modal === "payment" && paymentExpense && (
        <Modal title={`Add Payment — ${paymentExpense.description}`} close={() => setModal(null)}>
          <form onSubmit={async (e) => { e.preventDefault(); await budgetPost("/api/budget/payments", { ...Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement)), expenseId: paymentExpense.id }, actorKey); setModal(null); await done("Payment recorded."); }}>
            <div className="modal-body">
              <F name="amount" label="Amount" type="number" step="0.001" required />
              <F name="paidAt" label="Paid Date" type="date" required />
              <label className="field"><span className="lbl">Method</span>
                <select className="select" name="method"><option>Cash</option><option>Bank Transfer</option><option>Card</option><option>Cheque</option></select>
              </label>
              <F name="paidBy" label="Paid By" required />
              <F name="receiptUrl" label="Receipt URL" />
              <FA name="notes" label="Notes" />
            </div>
            <div className="modal-foot"><button className="btn btn-p" type="submit">Record Payment</button></div>
          </form>
        </Modal>
      )}

      {modal === "vendor" && (
        <Modal title="Add Vendor" close={() => setModal(null)}>
          <form onSubmit={async (e) => { e.preventDefault(); await budgetPost("/api/budget/vendors", Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement)), actorKey); setModal(null); await done("Vendor added."); }}>
            <div className="modal-body">
              <F name="name" label="Vendor Name" required />
              <Sel name="categoryId" label="Category" items={categories} optional />
              <F name="contactPerson" label="Contact Person" />
              <F name="phone" label="Phone" />
              <F name="agreedPrice" label="Agreed Price" type="number" step="0.001" />
              <F name="contractUrl" label="Contract URL" />
              <FA name="notes" label="Notes" />
            </div>
            <div className="modal-foot"><button className="btn btn-p" type="submit">Add Vendor</button></div>
          </form>
        </Modal>
      )}

    </div>
  );
}

/* ── Stat components ─────────────────────────────────────────── */
function HeroStat({ label, value, tone }: { label: string; value: string; tone?: "g" | "r" | "a" }) {
  return (
    <div className={`budget-hero-card${tone ? ` ${tone}` : ""}`}>
      <div className="budget-hero-label">{label}</div>
      <div className="budget-hero-value">{value}</div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "g" | "r" | "a" }) {
  const colors: Record<string, string> = { g: "var(--green-dark)", r: "var(--red)", a: "var(--amber)" };
  return (
    <div className="budget-mini-card">
      <div className="budget-mini-label">{label}</div>
      <div className="budget-mini-value" style={tone ? { color: colors[tone] } : {}}>{value}</div>
    </div>
  );
}

/* ── Modal shell ─────────────────────────────────────────────── */
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <div className="modal-head">
          <span className="card-title">{title}</span>
          <button className="btn btn-sm" onClick={close}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Form helpers ────────────────────────────────────────────── */
function F(p: { name: string; label: string; type?: string; step?: string; defaultValue?: string | number; required?: boolean }) {
  return <label className="field"><span className="lbl">{p.label}{p.required && <span style={{ color: "var(--red)", marginLeft: 2 }}>*</span>}</span><input className="input" {...p} /></label>;
}
function FA({ name, label }: { name: string; label: string }) {
  return <label className="field"><span className="lbl">{label}</span><textarea className="textarea" name={name} /></label>;
}
function Sel({ name, label, items, optional }: { name: string; label: string; items: Array<{ id: string; name: string }>; optional?: boolean }) {
  return (
    <label className="field"><span className="lbl">{label}</span>
      <select className="select" name={name}>
        {optional && <option value="">None</option>}
        {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
    </label>
  );
}
