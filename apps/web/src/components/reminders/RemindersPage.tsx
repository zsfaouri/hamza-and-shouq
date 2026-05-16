"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/access-control";
import { apiGet } from "@/lib/api";
import { remindersGet, remindersPost, remindersPut } from "@/lib/reminders-api";

type Template = { id: string; name: string; bodyEn: string; bodyAr?: string | null };
type ReminderStatus = "DRAFT" | "SCHEDULED" | "RESCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";
type ReminderType = "CONFIRMED" | "PENDING" | "CONFIRMED_AND_PENDING";
type SendStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";
type Counts = { total: number; sent: number; failed: number; skipped: number; pending: number };
type Reminder = {
  id: string;
  name: string;
  reminderType: ReminderType;
  targetSourceTabs: string[];
  scheduledAt: string;
  timezone: string;
  status: ReminderStatus;
  createdBy: string;
  createdAt: string;
  template?: Template;
  counts: Counts;
};
type Recipient = {
  id: string;
  name: string;
  phone: string;
  sourceTab?: string | null;
  rsvpStatusAtScheduleTime: string;
  sendStatus: SendStatus;
  sentAt?: string | null;
  failedReason?: string | null;
};
type AuditLog = { id: string; action: string; performedBy: string; metadata?: unknown; createdAt: string };
type RescheduleLog = { id: string; oldScheduledAt: string; newScheduledAt: string; changedBy: string; reason?: string | null; changedAt: string };
type ReminderDetail = Reminder & { recipients: Recipient[]; auditLogs: AuditLog[]; rescheduleLogs: RescheduleLog[] };
type Preview = {
  total: number;
  confirmed: number;
  pending: number;
  excluded: number;
  bySourceTab: { name: string; confirmed: number; pending: number; excluded: number }[];
};

const sourceTabs = ["Hamza", "Shouq", "Maha", "Zein", "Yazan"];
const typeLabels: Record<ReminderType, string> = {
  CONFIRMED: "Confirmed guests",
  PENDING: "Pending guests",
  CONFIRMED_AND_PENDING: "Both",
};
const actionLabels: Record<string, string> = {
  CREATED: "Created",
  SCHEDULED: "Scheduled",
  RESCHEDULED: "Rescheduled",
  CANCELLED: "Cancelled",
  SENDING_STARTED: "Sending started",
  SENDING_COMPLETED: "Sending completed",
  RECIPIENT_SKIPPED: "Recipient skipped",
  RECIPIENT_FAILED: "Recipient failed",
};

function isoFromDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function localParts(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(Math.ceil(date.getMinutes() / 15) * 15).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: min === "60" ? `${String(hh === "23" ? 0 : Number(hh) + 1).padStart(2, "0")}:00` : `${hh}:${min}` };
}

function statusClass(status: string) {
  if (status === "SENT") return "badge b-g";
  if (status === "FAILED") return "badge b-r";
  if (status === "SENDING") return "badge b-blue";
  if (status === "SCHEDULED" || status === "RESCHEDULED") return "badge b-a";
  return "badge b-x";
}

export function RemindersPage({ initialUser }: { initialUser: SessionUser }) {
  const actorKey = initialUser.key;
  const canManage = initialUser.permissions.canManageReminders;
  const [templates, setTemplates] = useState<Template[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [details, setDetails] = useState<Record<string, ReminderDetail>>({});
  const [filter, setFilter] = useState<SendStatus | "ALL">("ALL");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [step, setStep] = useState(1);
  const start = localParts(new Date(Date.now() + 45 * 60_000));
  const [form, setForm] = useState({
    name: "",
    reminderType: "CONFIRMED_AND_PENDING" as ReminderType,
    templateId: "",
    allLists: true,
    tabs: [] as string[],
    date: start.date,
    time: start.time,
    timezone: "Asia/Amman",
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reschedule, setReschedule] = useState<{ id: string; date: string; time: string; reason: string } | null>(null);

  async function refresh() {
    const [nextTemplates, nextReminders] = await Promise.all([
      apiGet<Template[]>("/api/templates"),
      remindersGet<Reminder[]>("/api/reminders", actorKey),
    ]);
    setTemplates(nextTemplates);
    setReminders(nextReminders);
    if (!form.templateId && nextTemplates[0]) setForm((current) => ({ ...current, templateId: nextTemplates[0].id }));
  }

  useEffect(() => {
    void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Reminder load failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = reminders.filter((item) => ["SCHEDULED", "RESCHEDULED", "SENDING"].includes(item.status));
  const history = reminders.filter((item) => ["SENT", "CANCELLED", "FAILED"].includes(item.status));
  const sentThisMonth = reminders.filter((item) => {
    const created = new Date(item.createdAt);
    const now = new Date();
    return item.status === "SENT" && created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;
  const failedCount = reminders.filter((item) => item.status === "FAILED" || item.counts.failed > 0).length;
  const selectedTabs = form.allLists ? [] : form.tabs;
  const selectedTemplate = templates.find((template) => template.id === form.templateId);
  const scheduledAt = useMemo(() => {
    try { return isoFromDateTime(form.date, form.time); } catch { return ""; }
  }, [form.date, form.time]);
  const futureEnough = scheduledAt ? new Date(scheduledAt).getTime() >= Date.now() + 30 * 60_000 : false;

  async function loadDetail(id: string) {
    if (details[id]) {
      setDetails((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }
    const detail = await remindersGet<ReminderDetail>(`/api/reminders/${id}`, actorKey);
    setDetails((current) => ({ ...current, [id]: detail }));
  }

  async function runPreview() {
    setError("");
    const result = await remindersPost<Preview>("/api/reminders/preview", {
      reminderType: form.reminderType,
      targetSourceTabs: selectedTabs,
    }, actorKey);
    setPreview(result);
    setStep(3);
  }

  async function scheduleReminder() {
    setError("");
    const created = await remindersPost<Reminder>("/api/reminders", {
      name: form.name,
      reminderType: form.reminderType,
      templateId: form.templateId,
      targetSourceTabs: selectedTabs,
      scheduledAt,
      timezone: form.timezone,
    }, actorKey);
    await remindersPost(`/api/reminders/${created.id}/schedule`, {}, actorKey);
    setNotice("Reminder scheduled.");
    setCreateOpen(false);
    setStep(1);
    setPreview(null);
    await refresh();
    window.location.href = `/reminders#${created.id}`;
  }

  async function cancelReminder(id: string) {
    if (!window.confirm("Cancel this reminder?")) return;
    await remindersPost(`/api/reminders/${id}/cancel`, {}, actorKey);
    setNotice("Reminder cancelled.");
    await refresh();
  }

  async function saveReschedule() {
    if (!reschedule) return;
    await remindersPut(`/api/reminders/${reschedule.id}/reschedule`, {
      scheduledAt: isoFromDateTime(reschedule.date, reschedule.time),
      reason: reschedule.reason || null,
    }, actorKey);
    setReschedule(null);
    setNotice("Reminder rescheduled.");
    await refresh();
  }

  const failedRecipients = Object.values(details).flatMap((detail) => detail.recipients.filter((recipient) => recipient.sendStatus === "FAILED"));

  return (
    <main className="reminders-page">
      <section className="access-top">
        <div>
          <h1>Reminder Scheduler</h1>
          <p>Scheduled WhatsApp reminders based on confirmed and pending RSVP status.</p>
        </div>
        <div className="btn-row">
          <Link className="btn" href="/">Dashboard</Link>
          {canManage && <button className="btn btn-p" onClick={() => setCreateOpen(true)}>Create Reminder</button>}
        </div>
      </section>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <div className="notice err">{error}</div> : null}

      <section className="reminder-overview">
        <Stat label="Scheduled" value={active.length} />
        <Stat label="Sent this month" value={sentThisMonth} />
        <Stat label="Failed" value={failedCount} tone={failedCount ? "r" : undefined} />
      </section>

      {createOpen && canManage ? (
        <section className="card reminder-flow">
          <div className="card-head">
            <span className="card-title">Create Reminder</span>
            <button className="btn btn-sm" onClick={() => setCreateOpen(false)}>Close</button>
          </div>
          <div className="reminder-steps">
            {[1, 2, 3, 4].map((item) => <button key={item} className={`step-dot${step === item ? " on" : ""}`} onClick={() => setStep(item)}>{item}</button>)}
          </div>

          {step === 1 && (
            <div className="card-body reminder-form">
              <Field label="Reminder name">
                <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="Reminder type">
                <div className="segmented">
                  {(Object.keys(typeLabels) as ReminderType[]).map((type) => (
                    <button key={type} type="button" className={form.reminderType === type ? "on" : ""} onClick={() => setForm({ ...form, reminderType: type })}>
                      {typeLabels[type]}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="WhatsApp template">
                <select className="select" value={form.templateId} onChange={(event) => setForm({ ...form, templateId: event.target.value })}>
                  <option value="">Select template</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </Field>
              <button className="btn btn-p" disabled={!form.name || !form.templateId} onClick={() => setStep(2)}>Next</button>
            </div>
          )}

          {step === 2 && (
            <div className="card-body reminder-form">
              <Field label="Source tabs">
                <div className="access-list-checks">
                  <label>
                    <input type="checkbox" checked={form.allLists} onChange={(event) => setForm({ ...form, allLists: event.target.checked, tabs: [] })} />
                    All lists
                  </label>
                  {sourceTabs.map((tab) => (
                    <label key={tab}>
                      <input
                        type="checkbox"
                        checked={!form.allLists && form.tabs.includes(tab)}
                        onChange={(event) => {
                          const tabs = event.target.checked ? [...form.tabs, tab] : form.tabs.filter((item) => item !== tab);
                          setForm({ ...form, allLists: false, tabs });
                        }}
                      />
                      {tab}
                    </label>
                  ))}
                </div>
              </Field>
              <div className="reminder-grid">
                <Field label="Schedule date"><input className="input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field>
                <Field label="Schedule time"><input className="input" type="time" step={900} value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></Field>
                <Field label="Timezone">
                  <select className="select" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}>
                    <option value="Asia/Amman">Asia/Amman</option>
                    <option value="UTC">UTC</option>
                  </select>
                </Field>
              </div>
              {!futureEnough ? <p className="form-warning">Schedule time must be at least 30 minutes in the future.</p> : null}
              <button className="btn btn-p" disabled={!futureEnough || (!form.allLists && form.tabs.length === 0)} onClick={runPreview}>Preview recipients</button>
            </div>
          )}

          {step === 3 && preview && (
            <div className="card-body reminder-form">
              <div className="reminder-breakdown">
                <Stat label="Eligible" value={preview.total} />
                <Stat label="Confirmed" value={preview.confirmed} />
                <Stat label="Pending" value={preview.pending} />
                <Stat label="Declined excluded" value={preview.excluded} />
              </div>
              <p className="form-warning">Declined guests are automatically excluded.</p>
              <table className="tbl">
                <thead><tr><th>List</th><th>Confirmed</th><th>Pending</th><th>Excluded</th></tr></thead>
                <tbody>
                  {preview.bySourceTab.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.confirmed}</td><td>{row.pending}</td><td>{row.excluded}</td></tr>)}
                </tbody>
              </table>
              {preview.total === 0 ? <div className="notice err">No eligible recipients.</div> : null}
              <button className="btn btn-p" disabled={preview.total === 0} onClick={() => setStep(4)}>Next</button>
            </div>
          )}

          {step === 4 && preview && (
            <div className="card-body reminder-form">
              <div className="summary-list">
                <span>Name: {form.name}</span>
                <span>Type: {typeLabels[form.reminderType]}</span>
                <span>Template: {selectedTemplate?.name}</span>
                <span>Lists: {form.allLists ? "All lists" : form.tabs.join(", ")}</span>
                <span>Scheduled: {new Date(scheduledAt).toLocaleString()} {form.timezone}</span>
                <span>Recipients: {preview.total}</span>
              </div>
              <button className="btn btn-p" onClick={scheduleReminder}>Schedule Reminder</button>
            </div>
          )}
        </section>
      ) : null}

      <section className="card">
        <div className="card-head"><span className="card-title">Active Reminders</span></div>
        <ReminderList
          reminders={active}
          details={details}
          filter={filter}
          setFilter={setFilter}
          canManage={canManage}
          onDetail={loadDetail}
          onCancel={cancelReminder}
          onReschedule={(reminder) => {
            const parts = localParts(new Date(reminder.scheduledAt));
            setReschedule({ id: reminder.id, date: parts.date, time: parts.time, reason: "" });
          }}
        />
      </section>

      <section className="card">
        <div className="card-head"><span className="card-title">Reminder History</span></div>
        <ReminderList reminders={history} details={details} filter={filter} setFilter={setFilter} canManage={false} onDetail={loadDetail} />
      </section>

      <section className="card">
        <div className="card-head"><span className="card-title">Failed Recipients</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Phone</th><th>List</th><th>Reason</th></tr></thead>
            <tbody>
              {failedRecipients.length ? failedRecipients.map((recipient) => (
                <tr key={recipient.id}><td>{recipient.name}</td><td>{recipient.phone}</td><td>{recipient.sourceTab ?? ""}</td><td>{recipient.failedReason}</td></tr>
              )) : <tr><td colSpan={4} className="tbl-empty">Expand a reminder to inspect failed recipients.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {reschedule ? (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-head">
              <strong>Reschedule reminder</strong>
              <button className="btn btn-sm" onClick={() => setReschedule(null)}>Close</button>
            </div>
            <div className="modal-body reminder-form">
              <Field label="New date"><input className="input" type="date" value={reschedule.date} onChange={(event) => setReschedule({ ...reschedule, date: event.target.value })} /></Field>
              <Field label="New time"><input className="input" type="time" step={900} value={reschedule.time} onChange={(event) => setReschedule({ ...reschedule, time: event.target.value })} /></Field>
              <Field label="Reason"><textarea className="textarea" value={reschedule.reason} onChange={(event) => setReschedule({ ...reschedule, reason: event.target.value })} /></Field>
            </div>
            <div className="modal-foot">
              <button className="btn btn-p" onClick={saveReschedule}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ReminderList({ reminders, details, filter, setFilter, canManage, onDetail, onCancel, onReschedule }: {
  reminders: Reminder[];
  details: Record<string, ReminderDetail>;
  filter: SendStatus | "ALL";
  setFilter: (status: SendStatus | "ALL") => void;
  canManage: boolean;
  onDetail: (id: string) => Promise<void>;
  onCancel?: (id: string) => Promise<void>;
  onReschedule?: (reminder: Reminder) => void;
}) {
  if (!reminders.length) return <div className="tbl-empty">No reminders.</div>;
  return (
    <div className="reminder-list">
      {reminders.map((reminder) => {
        const detail = details[reminder.id];
        const recipients = detail?.recipients.filter((recipient) => filter === "ALL" || recipient.sendStatus === filter) ?? [];
        return (
          <article className="reminder-card" id={reminder.id} key={reminder.id}>
            <div className="reminder-card-main">
              <div>
                <strong>{reminder.name}</strong>
                <span>{typeLabels[reminder.reminderType]} via {reminder.template?.name ?? "Template"}</span>
              </div>
              <span className={statusClass(reminder.status)}>{reminder.status}</span>
            </div>
            <div className="reminder-card-meta">
              <span>{new Date(reminder.scheduledAt).toLocaleString()} {reminder.timezone}</span>
              <span>{reminder.targetSourceTabs.length ? reminder.targetSourceTabs.join(", ") : "All lists"}</span>
              <span>{reminder.counts.total} recipients</span>
              <span>{reminder.counts.sent} sent</span>
              <span>{reminder.counts.failed} failed</span>
              <span>{reminder.counts.skipped} skipped</span>
            </div>
            <div className="reminder-card-actions">
              {canManage && !["SENDING", "SENT", "CANCELLED"].includes(reminder.status) && <button className="btn btn-sm" onClick={() => onReschedule?.(reminder)}>Reschedule</button>}
              {canManage && !["SENDING", "SENT"].includes(reminder.status) && <button className="btn btn-sm" onClick={() => onCancel?.(reminder.id)}>Cancel</button>}
              <button className="btn btn-sm" onClick={() => void onDetail(reminder.id)}>{detail ? "Hide details" : "View recipients"}</button>
            </div>
            {detail ? (
              <div className="reminder-detail">
                <div className="filter-bar">
                  {(["ALL", "PENDING", "SENT", "FAILED", "SKIPPED"] as const).map((status) => (
                    <button key={status} className={`filter-chip${filter === status ? " active" : ""}`} onClick={() => setFilter(status)}>{status}</button>
                  ))}
                </div>
                <table className="tbl">
                  <thead><tr><th>Name</th><th>Phone</th><th>List</th><th>RSVP at schedule</th><th>Status</th><th>Reason</th></tr></thead>
                  <tbody>
                    {recipients.map((recipient) => (
                      <tr key={recipient.id}>
                        <td>{recipient.name}</td><td>{recipient.phone}</td><td>{recipient.sourceTab ?? ""}</td><td>{recipient.rsvpStatusAtScheduleTime}</td>
                        <td><span className={statusClass(recipient.sendStatus)}>{recipient.sendStatus}</span></td><td>{recipient.failedReason ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="reminder-history-grid">
                  <div>
                    <h3>Audit</h3>
                    {detail.auditLogs.map((log) => <p key={log.id}>{new Date(log.createdAt).toLocaleString()} - {actionLabels[log.action] ?? log.action} - {log.performedBy}</p>)}
                  </div>
                  <div>
                    <h3>Reschedule log</h3>
                    {detail.rescheduleLogs.length ? detail.rescheduleLogs.map((log) => (
                      <p key={log.id}>{new Date(log.oldScheduledAt).toLocaleString()} to {new Date(log.newScheduledAt).toLocaleString()} - {log.changedBy}</p>
                    )) : <p>No reschedules.</p>}
                  </div>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "r" }) {
  return <div className={`stat${tone ? ` ${tone}` : ""}`}><div className="stat-accent" /><div className="stat-lbl">{label}</div><div className="stat-val">{value}</div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><label className="lbl">{label}</label>{children}</div>;
}
