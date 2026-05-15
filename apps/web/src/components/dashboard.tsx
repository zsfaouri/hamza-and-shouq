"use client";

/* eslint-disable @next/next/no-img-element */
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL, apiGet, apiPost, apiPut } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────── */
type Template    = { id: string; name: string; bodyEn: string; bodyAr?: string | null; mediaUrl?: string | null; mediaType?: string | null };
type Campaign    = { id: string; name: string; status: string; totalCount: number; sentCount: number; failedCount: number; template?: Template | null };
type Contact     = { id: string; name: string; phone: string };
type Message     = { id: string; status: string; contact: Contact; rsvpToken?: { response?: "YES" | "NO" | null } | null };
type CDetail     = Campaign & { contacts: Contact[]; messages: Message[] };
type Stats       = { sent: number; failed: number; pending: number; yes: number; no: number };
type WaStatus    = { provider: "personal" | "meta"; personal: { state: string; qr: string | null; error?: string | null }; meta: { configured: boolean; phoneNumberId: string; graphVersion: string; sendMode: string; templateName: string } };
type WaSettings  = { provider: "personal" | "meta"; personalBackendUrl: string };
type SheetResult = {
  imported: number;
  totalCount?: number;
  headers?: string[];
  contacts?: Contact[];
  worksheets?: Array<{ title: string; gid: string; rowCount: number; contactCount: number }>;
  message?: string;
};

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
  const [sheetResult, setSheet]   = useState<SheetResult | null>(null);

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
    const ids = ["campaign", "template", "contacts", "whatsapp"];
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
  const onSheet       = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!campaign) return; run("sheet", async () => { const r = await apiPost<SheetResult>(`/api/campaigns/${campaign.id}/contacts/google-sheet`, { url: sheetUrl }); setSheet(r); notify(r.message ?? `Imported ${r.imported} contacts.`); await loadCampaign(campaign.id); }); };
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

            <div className="card">
              <div className="card-head"><span className="card-title">Google Sheets Import</span></div>
              <div className="card-body">
                <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={onSheet}>
                  <Field label="Sheet URL">
                    <input className="input" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
                  </Field>
                  <button className="btn btn-w" type="submit" disabled={!campaign || loading === "sheet"}>
                    {loading === "sheet" ? "Importing…" : "Import from Google Sheets"}
                  </button>
                </form>
                {sheetResult && (
                  <div className="preview" style={{ marginTop: 4 }}>
                    {sheetResult.message ?? `${sheetResult.imported} contacts imported.`}
                    {sheetResult.headers?.length
                      ? <div style={{ marginTop: 6, fontSize: 12, color: "var(--label-3)" }}>Columns: {sheetResult.headers.join(", ")}</div>
                      : null}
                    {sheetResult.worksheets?.length
                      ? <div style={{ marginTop: 6, fontSize: 12, color: "var(--label-3)" }}>
                          Worksheets: {sheetResult.worksheets.map((sheet) => `${sheet.title} ${sheet.contactCount}/${sheet.rowCount}`).join(", ")}
                        </div>
                      : null}
                  </div>
                )}
              </div>
            </div>
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

          {/* ── Messages table ── */}
          <section className="card">
            <div className="card-head">
              <span className="card-title">Messages</span>
              {campaign?.messages?.length
                ? <span style={{ fontSize: 13, color: "var(--label-3)", fontWeight: 400 }}>{campaign.messages.length} total</span>
                : null}
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th><th>Phone</th><th>Status</th><th>RSVP</th>
                  </tr>
                </thead>
                <tbody>
                  {campaign?.messages?.length ? campaign.messages.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 500 }}>{m.contact.name}</td>
                      <td style={{ color: "var(--label-3)", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{m.contact.phone}</td>
                      <td><span className={msgBadge(m.status)}>{m.status}</span></td>
                      <td>
                        {m.rsvpToken?.response
                          ? <span className={`badge ${m.rsvpToken.response === "YES" ? "b-g" : "b-r"}`}>{m.rsvpToken.response}</span>
                          : <span style={{ color: "var(--label-3)" }}>—</span>}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="tbl-empty">{campaign ? "No messages yet — use Prepare above." : "Select a campaign to view messages."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

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

/* ── Icons ──────────────────────────────────────────────────── */
const IconGrid     = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>;
const IconTemplate = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="14" height="10" rx="1.5"/><path d="M4 14h8M8 11v3" strokeLinecap="round"/></svg>;
const IconContacts = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="5" r="3"/><path d="M1 14c0-3 2-5 5-5s5 2 5 5" strokeLinecap="round"/><path d="M12 6l2 2M14 6l-2 2" strokeLinecap="round"/></svg>;
const IconWa       = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 9.5c.5 1 1.5 2 2.5 2 2.5 0 3.5-2 3.5-3.5S10 4 8 4 5 5.5 5 7.5c0 .7.2 1.3.5 1.8L4.5 12l1.5-.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
