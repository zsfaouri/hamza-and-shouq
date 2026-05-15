"use client";

/* eslint-disable @next/next/no-img-element */
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL, apiGet, apiPost, apiPut } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────── */
type Template    = { id: string; name: string; bodyEn: string; bodyAr?: string | null; mediaUrl?: string | null; mediaType?: string | null };
type Campaign    = { id: string; name: string; status: string; totalCount: number; sentCount: number; failedCount: number; template?: Template | null };
type Contact     = { id: string; name: string; phone: string; sourceTab?: string | null };
type Message     = { id: string; status: string; contact: Contact; rsvpToken?: { response?: "YES" | "NO" | null } | null };
type CDetail     = Campaign & { contacts: Contact[]; messages: Message[] };
type Stats       = { sent: number; failed: number; pending: number; yes: number; no: number };
type WaStatus    = { provider: "personal" | "meta"; personal: { state: string; qr: string | null; error?: string | null }; meta: { configured: boolean; phoneNumberId: string; graphVersion: string; sendMode: string; templateName: string } };
type WaSettings  = { provider: "personal" | "meta"; personalBackendUrl: string };

const empty: Stats = { sent: 0, failed: 0, pending: 0, yes: 0, no: 0 };

/* ── Helpers ────────────────────────────────────────────────── */
const waBadge  = (w: WaStatus) => { if (w.provider === "meta") return w.meta.configured ? "badge b-g" : "badge b-r"; const s = w.personal.state; if (s === "ready") return "badge b-g"; if (s === "disconnected" || s === "disabled") return "badge b-r"; return "badge b-a"; };
const waLabel  = (w: WaStatus) => { if (w.provider === "meta") return w.meta.configured ? "Meta ready" : "Meta not set"; return w.personal.state; };
const msgBadge = (s: string)   => s === "SENT" ? "badge b-g" : s === "FAILED" ? "badge b-r" : "badge b-a";
const cmpBadge = (s: string)   => s === "SENT" ? "b-g" : s === "SENDING" ? "b-a" : s === "FAILED" ? "b-r" : "b-x";

function preserveQr(cur: WaStatus, next: WaStatus): WaStatus {
  if (next.provider === "personal" && cur.personal.qr && !next.personal.qr && next.personal.state !== "ready")
    return { ...next, personal: { ...next.personal, state: cur.personal.state === "qr" ? "qr" : next.personal.state, qr: cur.personal.qr } };
  return next;
}

/* ── Dashboard ──────────────────────────────────────────────── */
export function Dashboard() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selId, setSelId]         = useState("");
  const [campaign, setCampaign]   = useState<CDetail | null>(null);
  const [stats, setStats]         = useState<Stats>(empty);
  const [wa, setWa]               = useState<WaStatus>({ provider: "personal", personal: { state: "loading", qr: null }, meta: { configured: false, phoneNumberId: "", graphVersion: "", sendMode: "text", templateName: "" } });
  const [waSet, setWaSet]         = useState<WaSettings>({ provider: "personal", personalBackendUrl: "" });
  const [notice, setNotice]       = useState("");
  const [isErr, setIsErr]         = useState(false);
  const [loading, setLoading]     = useState<string | null>(null);
  const [active, setActive]       = useState("campaign");
  const [sheetUrl, setSheetUrl]   = useState("https://docs.google.com/spreadsheets/d/1021Z6KyT-dF97FVJAG3c4Nr6thASDpuhPu-hFC_fTA0/edit?usp=sharing");

  const [tmpl, setTmpl] = useState({
    name: "Wedding Invite EN",
    bodyEn: "Hi {{name}}, you're invited to Hamza and Shouq's wedding on {{date}} at {{venue}}. Please RSVP here: {{rsvp_link}}",
    bodyAr: "", mediaUrl: "", mediaType: "",
  });
  const [cmp, setCmp] = useState({ name: "Wedding Invitations", templateId: "" });

  const inited = useRef(false);
  const ntimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function notify(msg: string, err = false) {
    if (ntimer.current) clearTimeout(ntimer.current);
    setNotice(msg); setIsErr(err);
    ntimer.current = setTimeout(() => setNotice(""), 4000);
  }

  async function refresh() {
    try {
      const [nextT, nextC, nextWa, nextS] = await Promise.all([
        apiGet<Template[]>("/api/templates"),
        apiGet<Campaign[]>("/api/campaigns"),
        apiGet<WaStatus>("/api/whatsapp/status"),
        apiGet<WaSettings>("/api/settings"),
      ]);
      setTemplates(nextT); setCampaigns(nextC);
      setWa((c) => preserveQr(c, nextWa));
      setWaSet(nextS);
      if (!inited.current) {
        inited.current = true;
        if (nextC[0]) setSelId(nextC[0].id);
        if (nextT[0]) setCmp((c) => c.templateId ? c : { ...c, templateId: nextT[0].id });
      }
    } catch { /* silent poll */ }
  }

  async function loadCampaign(id: string) {
    if (!id) return;
    const [d, s] = await Promise.all([apiGet<CDetail>(`/api/campaigns/${id}`), apiGet<Stats>(`/api/campaigns/${id}/stats`)]);
    setCampaign(d); setStats(s);
  }

  useEffect(() => { void refresh(); const t = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(t); }, []);
  useEffect(() => { void loadCampaign(selId); }, [selId]);
  useEffect(() => {
    const ids = ["campaign", "template", "contacts", "whatsapp", "access"];
    const obs = ids.map((id) => {
      const el = document.getElementById(id); if (!el) return null;
      const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setActive(id); }, { rootMargin: "-20% 0px -70% 0px" });
      o.observe(el); return o;
    });
    return () => obs.forEach((o) => o?.disconnect());
  }, []);

  const preview = useMemo(() => {
    const row = campaign?.contacts[0] ?? { name: "Ahmed", phone: "+962790000000" };
    return tmpl.bodyEn.replaceAll("{{name}}", row.name).replaceAll("{{phone}}", row.phone).replaceAll("{{date}}", "Friday, 20 June").replaceAll("{{venue}}", "Amman").replaceAll("{{rsvp_link}}", `${API_URL}/rsvp/example-token`);
  }, [campaign?.contacts, tmpl.bodyEn]);

  async function run(key: string, fn: () => Promise<void>) {
    setLoading(key);
    try { await fn(); } catch (e) { notify(e instanceof Error ? e.message : "Something went wrong.", true); }
    finally { setLoading(null); }
  }

  const onSaveTmpl    = (e: FormEvent) => { e.preventDefault(); run("tmpl", async () => { const s = await apiPost<Template>("/api/templates", { ...tmpl, bodyAr: tmpl.bodyAr || null, mediaUrl: tmpl.mediaUrl || null, mediaType: tmpl.mediaType || null }); notify("Template saved."); setTemplates((c) => [s, ...c]); setCmp((c) => ({ ...c, templateId: s.id })); }); };
  const onUpdateTmpl  = (e: FormEvent) => { e.preventDefault(); if (!campaign?.template) return; run("tmpl", async () => { const u = await apiPut<Template>(`/api/templates/${campaign.template!.id}`, { name: tmpl.name, bodyEn: tmpl.bodyEn, bodyAr: tmpl.bodyAr || null, mediaUrl: tmpl.mediaUrl || null, mediaType: tmpl.mediaType || null }); setTemplates((c) => c.map((t) => t.id === u.id ? u : t)); notify("Template updated."); }); };
  const onCreateCmp   = (e: FormEvent) => { e.preventDefault(); run("cmp", async () => { const c = await apiPost<Campaign>("/api/campaigns", cmp); notify("Campaign created."); setCampaigns((p) => [c, ...p]); setSelId(c.id); }); };
  const onContacts    = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!campaign) return; run("contacts", async () => { await apiPost(`/api/campaigns/${campaign.id}/contacts`, new FormData(e.currentTarget)); notify("Contacts imported."); await loadCampaign(campaign.id); }); };
  const onMedia       = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); run("media", async () => { const m = await apiPost<{ url: string; type: string }>("/api/media", new FormData(e.currentTarget)); setTmpl((c) => ({ ...c, mediaUrl: m.url, mediaType: m.type })); notify("Media uploaded."); }); };
  const onPrepare     = () => { if (!campaign) return; run("prepare", async () => { await apiPost(`/api/campaigns/${campaign.id}/prepare`); notify("Messages prepared."); await loadCampaign(campaign.id); }); };
  const onSend        = () => { if (!campaign) return; const n = campaign.contacts.length; if (!window.confirm(`Send to ${n} contact${n !== 1 ? "s" : ""}? This cannot be undone.`)) return; run("send", async () => { await apiPost(`/api/campaigns/${campaign.id}/send`); notify("Sending started."); await loadCampaign(campaign.id); }); };
  const onStartWa     = () => run("wa", async () => { const w = await apiPost<WaStatus>("/api/whatsapp/start"); setWa((c) => preserveQr(c, w)); notify(w.personal.qr ? "WhatsApp QR generated." : "WhatsApp session starting."); });
  const onSaveWaSet   = (e: FormEvent) => { e.preventDefault(); run("wa-set", async () => { await apiPut("/api/settings", waSet); const w = await apiGet<WaStatus>("/api/whatsapp/status"); setWa((c) => preserveQr(c, w)); notify("Settings saved."); }); };

  return (
    <div className="app">

      {/* ── Sidebar (light, macOS style) ── */}
      <aside className="sidebar">
        <div className="s-brand">
          <div className="s-mark">
            <img src="/logo.png" alt="" />
          </div>
          <div>
            <div className="s-name">Hamza &amp; Shouq</div>
            <div className="s-sub">Campaign system</div>
          </div>
        </div>

        <nav className="s-nav" aria-label="Navigation">
          <span className="s-section">Menu</span>
          <NavItem href="#campaign" on={active === "campaign"} icon={<IconGrid />}>Campaign</NavItem>
          <NavItem href="#template" on={active === "template"} icon={<IconTemplate />}>Template</NavItem>
          <NavItem href="#contacts" on={active === "contacts"} icon={<IconContacts />}>Contacts</NavItem>
          <NavItem href="#whatsapp" on={active === "whatsapp"} icon={<IconWa />}>WhatsApp</NavItem>
          <NavItem href="#access" on={active === "access"} icon={<IconAccess />}>Access</NavItem>
        </nav>

        <div className="s-footer">
          <div className="s-foot-label">API Endpoint</div>
          <div className="s-foot-val">{API_URL || "Vercel same-origin"}</div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">

        {/* Topbar — translucent blur */}
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-title">Invitations</span>
            <span className="topbar-sub">Hamza &amp; Shouq · Wedding 2026</span>
          </div>
          <span className={waBadge(wa)}>{waLabel(wa)}</span>
        </header>

        <div className="content">

          {/* Notice */}
          <div aria-live="polite" className="sr-only">{notice}</div>
          {notice && <div className={`notice${isErr ? " err" : ""}`} role="status">{isErr ? "⚠ " : "✓ "}{notice}</div>}

          {/* Stats */}
          <section className="stats" aria-label="Campaign stats">
            <StatCard label="Sent"     val={stats.sent}    c="g" />
            <StatCard label="Failed"   val={stats.failed}  c="r" />
            <StatCard label="RSVP Yes" val={stats.yes}     c="g" />
            <StatCard label="RSVP No"  val={stats.no}      c="a" />
            <StatCard label="Pending"  val={stats.pending} />
          </section>

          {/* ── Campaign ── */}
          <section id="campaign" className="two">
            <div className="card">
              <div className="card-head">
                <span className="card-title">New Campaign</span>
              </div>
              <div className="card-body">
                <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={onCreateCmp}>
                  <Field label="Campaign name" req>
                    <input className="input" value={cmp.name} required onChange={(e) => setCmp((c) => ({ ...c, name: e.target.value }))} />
                  </Field>
                  <Field label="Template" req>
                    <select className="select" value={cmp.templateId} required onChange={(e) => setCmp((c) => ({ ...c, templateId: e.target.value }))}>
                      <option value="">Select a template…</option>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                  <button className="btn btn-p btn-w" type="submit" disabled={loading === "cmp"}>
                    {loading === "cmp" ? "Creating…" : "Create Campaign"}
                  </button>
                </form>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <span className="card-title">Active Campaign</span>
                {campaign && <span className={`badge ${cmpBadge(campaign.status)}`}>{campaign.status}</span>}
              </div>
              <div className="card-body">
                <Field label="Campaign">
                  <select className="select" value={selId} onChange={(e) => setSelId(e.target.value)}>
                    <option value="">No campaign selected…</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                {campaign && (
                  <p style={{ fontSize: 13, color: "var(--label-3)" }}>
                    {campaign.totalCount} contacts · {campaign.sentCount} sent · {campaign.failedCount} failed
                  </p>
                )}
                <div className="btn-row" style={{ marginTop: 4 }}>
                  <button className="btn" style={{ flex: 1 }} onClick={onPrepare} disabled={!campaign || loading === "prepare"}>
                    {loading === "prepare" ? "Preparing…" : "Prepare"}
                  </button>
                  <button className="btn btn-p" style={{ flex: 1 }} onClick={onSend} disabled={!campaign || loading === "send"}>
                    {loading === "send" ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ── Template ── */}
          <section id="template" className="two">
            <form className="card" onSubmit={campaign?.template ? onUpdateTmpl : onSaveTmpl}>
              <div className="card-head">
                <span className="card-title">Template Editor</span>
              </div>
              <div className="card-body">
                <Field label="Name" req>
                  <input className="input" value={tmpl.name} required onChange={(e) => setTmpl((c) => ({ ...c, name: e.target.value }))} />
                </Field>
                <Field label="English body" req>
                  <textarea className="textarea" value={tmpl.bodyEn} required onChange={(e) => setTmpl((c) => ({ ...c, bodyEn: e.target.value }))} />
                </Field>
                <Field label="Arabic body (optional)">
                  <textarea className="textarea" dir="rtl" placeholder="اكتب هنا…" value={tmpl.bodyAr} onChange={(e) => setTmpl((c) => ({ ...c, bodyAr: e.target.value }))} />
                </Field>
                <button className="btn btn-p btn-w" type="submit" disabled={loading === "tmpl"}>
                  {loading === "tmpl" ? "Saving…" : (campaign?.template ? "Update Template" : "Save Template")}
                </button>
              </div>
            </form>

            <div className="card">
              <div className="card-head">
                <span className="card-title">Preview</span>
                <span className="card-hint">{"{{name}}"} {"{{date}}"} {"{{venue}}"} {"{{rsvp_link}}"}</span>
              </div>
              <div className="card-body">
                <div className="preview">{preview}</div>
                <hr className="divider" />
                <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={onMedia}>
                  <Field label="Attach media (image · video · PDF)">
                    <input className="input" name="file" type="file" />
                  </Field>
                  <div className="btn-row" style={{ alignItems: "center" }}>
                    <button className="btn" type="submit" disabled={loading === "media"}>
                      {loading === "media" ? "Uploading…" : "Upload"}
                    </button>
                    {tmpl.mediaUrl && <span className="badge b-g">Media attached</span>}
                  </div>
                </form>
              </div>
            </div>
          </section>

          {/* ── Contacts ── */}
          <section id="contacts" className="two">
            <div className="card">
              <div className="card-head"><span className="card-title">Spreadsheet Import</span></div>
              <div className="card-body">
                <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={onContacts}>
                  <Field label="Upload .xlsx or .csv">
                    <input className="input" name="file" type="file" accept=".xlsx,.csv" />
                  </Field>
                  <button className="btn btn-p btn-w" type="submit" disabled={!campaign || loading === "contacts"}>
                    {loading === "contacts" ? "Importing…" : "Import Contacts"}
                  </button>
                </form>
              </div>
            </div>

            <SheetImporter
              campaignId={campaign?.id ?? null}
              defaultUrl={sheetUrl}
              onUrlChange={setSheetUrl}
              onImported={() => campaign && loadCampaign(campaign.id)}
              notify={notify}
            />
          </section>

          {/* ── WhatsApp ── */}
          <section id="whatsapp" className="two">
            <div className="card">
              <div className="card-head">
                <span className="card-title">WhatsApp Session</span>
                <span className={waBadge(wa)}>{waLabel(wa)}</span>
              </div>
              <div className="card-body">
                <button className="btn btn-w" onClick={onStartWa} disabled={loading === "wa"}>
                  {loading === "wa" ? "Starting…" : "Start Session"}
                </button>
                {wa.personal.qr ? (
                  <div className="qr-box">
                    <img src={wa.personal.qr} alt="Scan in WhatsApp to log in" />
                    <p className="qr-hint">Open WhatsApp → Linked Devices → Link a Device, then scan</p>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--label-3)" }}>
                    {wa.personal.error ?? "QR code appears here when login is needed."}
                  </p>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><span className="card-title">Settings &amp; Send Rules</span></div>
              <div className="card-body">
                <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={onSaveWaSet}>
                  <Field label="Sending provider">
                    <select className="select" value={waSet.provider} onChange={(e) => setWaSet((c) => ({ ...c, provider: e.target.value as "personal" | "meta" }))}>
                      <option value="personal">Personal WhatsApp (QR scan)</option>
                      <option value="meta">Meta WhatsApp Business API</option>
                    </select>
                  </Field>
                  <Field label="Personal backend URL">
                    <input className="input" value={waSet.personalBackendUrl ?? ""} placeholder="https://api.yourhost.com" onChange={(e) => setWaSet((c) => ({ ...c, personalBackendUrl: e.target.value }))} />
                  </Field>
                  <button className="btn btn-p btn-w" type="submit" disabled={loading === "wa-set"}>
                    {loading === "wa-set" ? "Saving…" : "Save Settings"}
                  </button>
                </form>
                <hr className="divider" />
                {[["🕐", "4 s delay between every message"], ["👥", "Known contacts only — no cold lists"], ["📊", "Under 100 sends per day to stay safe"], ["✅", "Prepare & review before you send"]].map(([icon, text]) => (
                  <div key={text} className="rule-row">
                    <span className="rule-icon">{icon}</span>
                    <span className="rule-text">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Messages table with sourceTab filter ── */}
          <section id="access" className="access-shell">
            <AccessPanel />
          </section>

          <MessagesTable campaign={campaign} />

        </div>
      </main>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */
function NavItem({ href, on, icon, children }: { href: string; on: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return <a href={href} className={`s-item${on ? " on" : ""}`}>{icon}{children}</a>;
}

function StatCard({ label, val, c }: { label: string; val: number; c?: "g" | "r" | "a" }) {
  return (
    <div className={`stat${c ? ` ${c}` : ""}`}>
      <div className="stat-accent" />
      <div className="stat-lbl">{label}</div>
      <div className="stat-val">{val}</div>
    </div>
  );
}

function Field({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="lbl">{label}{req && <span className="req" aria-hidden="true">*</span>}</label>
      {children}
    </div>
  );
}

/* ── SheetImporter ───────────────────────────────────────────── */
function AccessPanel() {
  const roles = [
    { name: "Owner", access: "Full system access", users: "Zaid" },
    { name: "Admin", access: "Campaigns, contacts, templates, WhatsApp settings", users: "Hamza, Shouq" },
    { name: "Sender", access: "Prepare, review, and send approved campaigns", users: "Unassigned" },
    { name: "Viewer", access: "Read-only dashboard and RSVP tracking", users: "Unassigned" },
  ];
  const permissions = [
    ["Campaigns", "Full", "Full", "Send", "View"],
    ["Templates", "Full", "Edit", "View", "View"],
    ["Contacts", "Full", "Import", "View", "View"],
    ["WhatsApp", "Full", "Settings", "Send", "View"],
    ["Access", "Full", "View", "None", "None"],
  ];

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Roles &amp; Access</span>
        <span className="badge b-g">Visible</span>
      </div>
      <div className="card-body">
        <div className="access-grid">
          {roles.map((role) => (
            <div className="access-role" key={role.name}>
              <div className="access-role-head">
                <span className="access-role-name">{role.name}</span>
                <span className="badge b-x">{role.users}</span>
              </div>
              <p>{role.access}</p>
            </div>
          ))}
        </div>

        <div className="access-matrix-wrap">
          <table className="tbl access-matrix">
            <thead>
              <tr>
                <th>Area</th>
                <th>Owner</th>
                <th>Admin</th>
                <th>Sender</th>
                <th>Viewer</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map(([area, owner, admin, sender, viewer]) => (
                <tr key={area}>
                  <td style={{ fontWeight: 600 }}>{area}</td>
                  {[owner, admin, sender, viewer].map((value, index) => (
                    <td key={`${area}-${index}`}>
                      <span className={`access-pill ${value === "None" ? "off" : ""}`}>{value}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type TabInfo = {
  name: string; gid: string; rowCount: number; contactCount: number;
  preview: { name: string; phone: string }[];
};
type TabStatus = { status: "idle" | "importing" | "done" | "error"; imported?: number; error?: string };

function SheetImporter({ campaignId, defaultUrl, onUrlChange, onImported, notify }: {
  campaignId: string | null;
  defaultUrl: string;
  onUrlChange: (url: string) => void;
  onImported: () => void;
  notify: (msg: string, err?: boolean) => void;
}) {
  const [url, setUrl] = useState(defaultUrl);
  const [detecting, setDetecting] = useState(false);
  const [tabs, setTabs] = useState<TabInfo[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, TabStatus>>({});
  const [importing, setImporting] = useState(false);

  function handleUrl(v: string) { setUrl(v); onUrlChange(v); }

  async function detect() {
    if (!campaignId) { notify("Select a campaign first.", true); return; }
    setDetecting(true); setTabs(null); setStatuses({});
    try {
      const r = await apiPost<{ sheetId: string; tabs: TabInfo[] }>(
        `/api/campaigns/${campaignId}/contacts/google-sheet/detect`, { url },
      );
      setTabs(r.tabs);
      setSelected(new Set(r.tabs.map((t) => t.name)));
    } catch (e) { notify(e instanceof Error ? e.message : "Detection failed.", true); }
    finally { setDetecting(false); }
  }

  async function doImport(selectedOnly: boolean) {
    if (!campaignId || !tabs) return;
    const toImport = selectedOnly ? tabs.filter((t) => selected.has(t.name)) : tabs;
    if (!toImport.length) return;
    setImporting(true);
    const next: Record<string, TabStatus> = {};
    toImport.forEach((t) => { next[t.name] = { status: "importing" }; });
    setStatuses(next);
    try {
      const r = await apiPost<{ imported: number; tabs: { name: string; imported: number; error?: string }[] }>(
        `/api/campaigns/${campaignId}/contacts/google-sheet`,
        { url, selectedTabs: toImport.map((t) => t.name) },
      );
      const final: Record<string, TabStatus> = {};
      r.tabs.forEach((t) => { final[t.name] = t.error ? { status: "error", error: t.error } : { status: "done", imported: t.imported }; });
      setStatuses(final);
      notify(`Imported ${r.imported} contacts.`);
      onImported();
    } catch (e) {
      const err: Record<string, TabStatus> = {};
      toImport.forEach((t) => { err[t.name] = { status: "error", error: "Import failed" }; });
      setStatuses(err);
      notify(e instanceof Error ? e.message : "Import failed.", true);
    } finally { setImporting(false); }
  }

  const totalSelected = tabs?.filter((t) => selected.has(t.name)).reduce((s, t) => s + t.contactCount, 0) ?? 0;
  const totalAll      = tabs?.reduce((s, t) => s + t.contactCount, 0) ?? 0;

  return (
    <div className="card">
      <div className="card-head"><span className="card-title">Google Sheets Import</span></div>
      <div className="card-body">
        <div className="sheet-detect-row">
          <input className="input" value={url} onChange={(e) => handleUrl(e.target.value)} placeholder="Google Sheets URL" />
          <button className="btn" onClick={detect} disabled={detecting} style={{ flexShrink: 0 }}>
            {detecting ? "Detecting…" : "Detect Tabs"}
          </button>
        </div>

        {tabs && (
          <div className="sheet-tabs-wrap">
            <div className="sheet-tabs-head">
              <span>{tabs.length} tab{tabs.length !== 1 ? "s" : ""} &nbsp;·&nbsp; {totalAll.toLocaleString()} contacts total</span>
              <button className="btn btn-sm" onClick={() => setSelected(selected.size === tabs.length ? new Set() : new Set(tabs.map((t) => t.name)))}>
                {selected.size === tabs.length ? "Deselect all" : "Select all"}
              </button>
            </div>

            {tabs.map((tab) => {
              const st = statuses[tab.name];
              const isOpen = expanded === tab.name;
              return (
                <div key={tab.name} className="tab-row">
                  <div className="tab-row-main">
                    <input
                      type="checkbox" className="tab-check"
                      checked={selected.has(tab.name)}
                      onChange={(e) => {
                        const s = new Set(selected);
                        if (e.target.checked) { s.add(tab.name); } else { s.delete(tab.name); }
                        setSelected(s);
                      }}
                    />
                    <span className="tab-name">{tab.name}</span>
                    <span className="tab-count">{tab.contactCount.toLocaleString()} contacts</span>
                    {st && (
                      st.status === "importing" ? <span className="badge b-a">Importing…</span>
                      : st.status === "done"      ? <span className="badge b-g">✓ {st.imported} imported</span>
                      : st.status === "error"     ? <span className="badge b-r" title={st.error}>Failed</span>
                      : null
                    )}
                    {tab.preview.length > 0 && (
                      <button className="btn btn-sm" style={{ marginLeft: "auto", flexShrink: 0 }} onClick={() => setExpanded(isOpen ? null : tab.name)}>
                        {isOpen ? "Hide ▴" : "Preview ▾"}
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="tab-preview-wrap">
                      <table className="tbl">
                        <thead><tr><th>Name</th><th>Phone</th></tr></thead>
                        <tbody>
                          {tab.preview.map((c, i) => <tr key={i}><td>{c.name}</td><td style={{ color: "var(--label-3)" }}>{c.phone}</td></tr>)}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="sheet-actions">
              <button className="btn" onClick={() => doImport(false)} disabled={importing}>
                Import All ({totalAll.toLocaleString()})
              </button>
              <button className="btn btn-p" onClick={() => doImport(true)} disabled={!selected.size || importing}>
                {importing ? "Importing…" : `Import Selected (${totalSelected.toLocaleString()})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── MessagesTable with sourceTab filter ─────────────────────── */
function MessagesTable({ campaign }: { campaign: CDetail | null }) {
  const [activeTab, setActiveTab] = useState<string>("all");

  const sourceTabs = useMemo(() => {
    if (!campaign?.messages) return [];
    const seen = new Set<string>();
    campaign.messages.forEach((m) => { if (m.contact.sourceTab) seen.add(m.contact.sourceTab); });
    return [...seen].sort();
  }, [campaign?.messages]);

  const filtered = useMemo(() => {
    if (!campaign?.messages) return [];
    if (activeTab === "all") return campaign.messages;
    return campaign.messages.filter((m) => m.contact.sourceTab === activeTab);
  }, [campaign?.messages, activeTab]);

  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">Messages</span>
        {campaign?.messages?.length
          ? <span style={{ fontSize: 13, color: "var(--label-3)", fontWeight: 400 }}>{filtered.length} of {campaign.messages.length}</span>
          : null}
      </div>

      {sourceTabs.length > 0 && (
        <div className="filter-bar">
          <span className="filter-bar-label">Filter by list</span>
          <button className={`filter-chip${activeTab === "all" ? " active" : ""}`} onClick={() => setActiveTab("all")}>
            All
          </button>
          {sourceTabs.map((tab) => (
            <button key={tab} className={`filter-chip${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th><th>Phone</th>{sourceTabs.length > 0 && <th>List</th>}<th>Status</th><th>RSVP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map((m) => (
              <tr key={m.id}>
                <td style={{ fontWeight: 500 }}>{m.contact.name}</td>
                <td style={{ color: "var(--label-3)", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{m.contact.phone}</td>
                {sourceTabs.length > 0 && (
                  <td>{m.contact.sourceTab ? <span className="badge b-x">{m.contact.sourceTab}</span> : <span style={{ color: "var(--label-3)" }}>—</span>}</td>
                )}
                <td><span className={msgBadge(m.status)}>{m.status}</span></td>
                <td>
                  {m.rsvpToken?.response
                    ? <span className={`badge ${m.rsvpToken.response === "YES" ? "b-g" : "b-r"}`}>{m.rsvpToken.response}</span>
                    : <span style={{ color: "var(--label-3)" }}>—</span>}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={sourceTabs.length > 0 ? 5 : 4} className="tbl-empty">
                  {campaign ? (activeTab !== "all" ? `No messages in list "${activeTab}".` : "No messages yet — use Prepare above.") : "Select a campaign to view messages."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Icons ──────────────────────────────────────────────────── */
const IconGrid     = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>;
const IconTemplate = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="14" height="10" rx="1.5"/><path d="M4 14h8M8 11v3" strokeLinecap="round"/></svg>;
const IconContacts = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="5" r="3"/><path d="M1 14c0-3 2-5 5-5s5 2 5 5" strokeLinecap="round"/><path d="M12 6l2 2M14 6l-2 2" strokeLinecap="round"/></svg>;
const IconWa       = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 9.5c.5 1 1.5 2 2.5 2 2.5 0 3.5-2 3.5-3.5S10 4 8 4 5 5.5 5 7.5c0 .7.2 1.3.5 1.8L4.5 12l1.5-.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IconAccess   = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1.5l5 2v3.8c0 3.2-2.1 5.9-5 7.2-2.9-1.3-5-4-5-7.2V3.5l5-2z" strokeLinejoin="round"/><path d="M6 8l1.4 1.4L10.5 6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
