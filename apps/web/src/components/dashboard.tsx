"use client";

/* eslint-disable @next/next/no-img-element */
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL, apiGet, apiPost, apiPut } from "@/lib/api";

/* ── Types ── */
type Template = { id: string; name: string; bodyEn: string; bodyAr?: string | null; mediaUrl?: string | null; mediaType?: string | null };
type Campaign  = { id: string; name: string; status: string; totalCount: number; sentCount: number; failedCount: number; template?: Template | null };
type Contact   = { id: string; name: string; phone: string };
type Message   = { id: string; body: string; status: string; error?: string | null; contact: Contact; rsvpToken?: { response?: "YES" | "NO" | null } | null };
type CampaignDetail = Campaign & { contacts: Contact[]; messages: Message[] };
type Stats     = { sent: number; failed: number; pending: number; yes: number; no: number };
type WaStatus  = { provider: "personal" | "meta"; personal: { state: string; qr: string | null; error?: string | null }; meta: { configured: boolean; phoneNumberId: string; graphVersion: string; sendMode: string; templateName: string } };
type WaSettings = { provider: "personal" | "meta"; personalBackendUrl: string };
type SheetResult = { imported: number; totalCount: number; headers?: string[]; contacts?: Contact[]; worksheets?: { title: string; contactCount: number }[]; message?: string };

const emptyStats: Stats = { sent: 0, failed: 0, pending: 0, yes: 0, no: 0 };

/* ── Helpers ── */
function waBadge(w: WaStatus)  { if (w.provider === "meta") return w.meta.configured ? "badge b-g" : "badge b-r"; const s = w.personal.state; if (s === "ready") return "badge b-g"; if (s === "disconnected" || s === "disabled") return "badge b-r"; return "badge b-a"; }
function waLabel(w: WaStatus)  { if (w.provider === "meta") return w.meta.configured ? "Meta ready" : "Meta not set"; return w.personal.state; }
function msgBadge(s: string)   { if (s === "SENT") return "badge b-g"; if (s === "FAILED") return "badge b-r"; return "badge b-a"; }
function cmpBadge(s: string)   { if (s === "SENT") return "b-g"; if (s === "SENDING") return "b-a"; if (s === "FAILED") return "b-r"; return "b-x"; }

function preserveQr(cur: WaStatus, next: WaStatus): WaStatus {
  if (next.provider === "personal" && cur.personal.qr && !next.personal.qr && next.personal.state !== "ready")
    return { ...next, personal: { ...next.personal, qr: cur.personal.qr } };
  return next;
}

/* ── Component ── */
export function Dashboard() {
  const [templates, setTemplates]   = useState<Template[]>([]);
  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [selId, setSelId]           = useState("");
  const [campaign, setCampaign]     = useState<CampaignDetail | null>(null);
  const [stats, setStats]           = useState<Stats>(emptyStats);
  const [wa, setWa]                 = useState<WaStatus>({ provider: "personal", personal: { state: "loading", qr: null }, meta: { configured: false, phoneNumberId: "", graphVersion: "", sendMode: "text", templateName: "" } });
  const [waSettings, setWaSettings] = useState<WaSettings>({ provider: "personal", personalBackendUrl: "" });
  const [notice, setNotice]         = useState("");
  const [noticeErr, setNoticeErr]   = useState(false);
  const [loading, setLoading]       = useState<string | null>(null);
  const [active, setActive]         = useState("campaign");
  const [sheetUrl, setSheetUrl]     = useState("https://docs.google.com/spreadsheets/d/1021Z6KyT-dF97FVJAG3c4Nr6thASDpuhPu-hFC_fTA0/edit?usp=sharing");
  const [sheetResult, setSheetResult] = useState<SheetResult | null>(null);

  const [tmpl, setTmpl] = useState({ name: "Wedding Invite EN", bodyEn: "Hi {{name}}, you're invited to Hamza and Shouq's wedding on {{date}} at {{venue}}. Please RSVP here: {{rsvp_link}}", bodyAr: "", mediaUrl: "", mediaType: "" });
  const [cmpDraft, setCmpDraft] = useState({ name: "Wedding Invitations", templateId: "" });

  const initialized = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function notify(msg: string, err = false) {
    if (timer.current) clearTimeout(timer.current);
    setNotice(msg); setNoticeErr(err);
    timer.current = setTimeout(() => setNotice(""), 4000);
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
      setWaSettings(nextS);
      if (!initialized.current) {
        initialized.current = true;
        if (nextC[0]) setSelId(nextC[0].id);
        if (nextT[0]) setCmpDraft((c) => c.templateId ? c : { ...c, templateId: nextT[0].id });
      }
    } catch { /* silent */ }
  }

  async function loadCampaign(id: string) {
    if (!id) return;
    const [d, s] = await Promise.all([apiGet<CampaignDetail>(`/api/campaigns/${id}`), apiGet<Stats>(`/api/campaigns/${id}/stats`)]);
    setCampaign(d); setStats(s);
  }

  useEffect(() => { void refresh(); const t = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(t); }, []); // eslint-disable-line
  useEffect(() => { void loadCampaign(selId); }, [selId]);
  useEffect(() => {
    const ids = ["campaign", "template", "contacts", "whatsapp"];
    const obs = ids.map((id) => { const el = document.getElementById(id); if (!el) return null; const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setActive(id); }, { rootMargin: "-20% 0px -70% 0px" }); o.observe(el); return o; });
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

  const saveTmpl = (e: FormEvent) => { e.preventDefault(); return run("save-tmpl", async () => { const s = await apiPost<Template>("/api/templates", { ...tmpl, bodyAr: tmpl.bodyAr || null, mediaUrl: tmpl.mediaUrl || null, mediaType: tmpl.mediaType || null }); notify("Template saved."); setTemplates((c) => [s, ...c]); setCmpDraft((c) => ({ ...c, templateId: s.id })); }); };
  const updTmpl  = (e: FormEvent) => { e.preventDefault(); if (!campaign?.template) return; return run("save-tmpl", async () => { const u = await apiPut<Template>(`/api/templates/${campaign.template!.id}`, { name: tmpl.name, bodyEn: tmpl.bodyEn, bodyAr: tmpl.bodyAr || null, mediaUrl: tmpl.mediaUrl || null, mediaType: tmpl.mediaType || null }); setTemplates((c) => c.map((t) => t.id === u.id ? u : t)); notify("Template updated."); }); };
  const createCmp = (e: FormEvent) => { e.preventDefault(); return run("create-cmp", async () => { const c = await apiPost<Campaign>("/api/campaigns", cmpDraft); notify("Campaign created."); setCampaigns((p) => [c, ...p]); setSelId(c.id); }); };
  const uploadContacts = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!campaign) return; return run("contacts", async () => { await apiPost(`/api/campaigns/${campaign.id}/contacts`, new FormData(e.currentTarget)); notify("Contacts imported."); await loadCampaign(campaign.id); }); };
  const importSheet = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!campaign) return; return run("sheet", async () => { const r = await apiPost<SheetResult>(`/api/campaigns/${campaign.id}/contacts/google-sheet`, { url: sheetUrl }); setSheetResult(r); notify(`Imported ${r.imported} contacts.`); await loadCampaign(campaign.id); }); };
  const uploadMedia = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); return run("media", async () => { const m = await apiPost<{ url: string; type: string }>("/api/media", new FormData(e.currentTarget)); setTmpl((c) => ({ ...c, mediaUrl: m.url, mediaType: m.type })); notify("Media uploaded."); }); };
  const prepare = () => { if (!campaign) return; return run("prepare", async () => { await apiPost(`/api/campaigns/${campaign.id}/prepare`); notify("Messages prepared."); await loadCampaign(campaign.id); }); };
  const send    = () => { if (!campaign) return; const n = campaign.contacts.length; if (!window.confirm(`Send to ${n} contact${n !== 1 ? "s" : ""}? This cannot be undone.`)) return; return run("send", async () => { await apiPost(`/api/campaigns/${campaign.id}/send`); notify("Sending started."); await loadCampaign(campaign.id); }); };
  const startWa = () => run("start-wa", async () => { const w = await apiPost<WaStatus>("/api/whatsapp/start"); setWa(w); notify("WhatsApp session starting."); });
  const saveWaSettings = (e: FormEvent) => { e.preventDefault(); return run("wa-settings", async () => { await apiPost("/api/settings", waSettings); const w = await apiGet<WaStatus>("/api/whatsapp/status"); setWa(w); notify("Settings saved."); }); };

  const isSaving = loading === "save-tmpl";

  return (
    <div className="app">

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="s-brand">
          <div className="s-mark">HS</div>
          <div>
            <div className="s-brand-name">Hamza &amp; Shouq</div>
            <div className="s-brand-sub">Campaign dashboard</div>
          </div>
        </div>

        <nav className="s-nav" aria-label="Navigation">
          <span className="s-nav-label">Menu</span>
          <SLink href="#campaign" active={active === "campaign"} icon={<GridIcon />}>Campaign</SLink>
          <SLink href="#template" active={active === "template"} icon={<TemplateIcon />}>Template</SLink>
          <SLink href="#contacts" active={active === "contacts"} icon={<ContactsIcon />}>Contacts</SLink>
          <SLink href="#whatsapp" active={active === "whatsapp"} icon={<WaIcon />}>WhatsApp</SLink>
        </nav>

        <div className="s-footer">
          <div className="s-footer-label">API</div>
          <div className="s-footer-val">{API_URL || "Vercel same-origin"}</div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">

        {/* Topbar */}
        <div className="topbar">
          <div>
            <span className="topbar-title">Invitations</span>
            <span className="topbar-sub">Hamza &amp; Shouq · WhatsApp &amp; RSVP</span>
          </div>
          <span className={waBadge(wa)}>{waLabel(wa)}</span>
        </div>

        <div className="content">

          {/* Notice */}
          <div aria-live="polite" className="sr-only">{notice}</div>
          {notice && <div className={`notice${noticeErr ? " err" : ""}`} role="status">{noticeErr ? "⚠ " : "✓ "}{notice}</div>}

          {/* Stats */}
          <section className="stats" aria-label="Campaign stats">
            <Stat label="Sent"     val={stats.sent}    c="g" />
            <Stat label="Failed"   val={stats.failed}  c="r" />
            <Stat label="RSVP Yes" val={stats.yes}     c="g" />
            <Stat label="RSVP No"  val={stats.no}      c="a" />
            <Stat label="Pending"  val={stats.pending} />
          </section>

          {/* Campaign */}
          <section id="campaign" className="two">
            <div className="card">
              <div className="card-head">New Campaign</div>
              <div className="card-body">
                <form style={{ display: "flex", flexDirection: "column", gap: 10 }} onSubmit={createCmp}>
                  <F label="Campaign name" req><input className="input" value={cmpDraft.name} required onChange={(e) => setCmpDraft((c) => ({ ...c, name: e.target.value }))} /></F>
                  <F label="Template" req>
                    <select className="select" value={cmpDraft.templateId} required onChange={(e) => setCmpDraft((c) => ({ ...c, templateId: e.target.value }))}>
                      <option value="">Select a template</option>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </F>
                  <button className="btn btn-w" type="submit" disabled={loading === "create-cmp"}>{loading === "create-cmp" ? "Creating…" : "Create campaign"}</button>
                </form>
              </div>
            </div>

            <div className="card">
              <div className="card-head">Active Campaign</div>
              <div className="card-body">
                <F label="Campaign">
                  <select className="select" value={selId} onChange={(e) => setSelId(e.target.value)}>
                    <option value="">No campaign selected</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </F>
                {campaign && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className={`badge ${cmpBadge(campaign.status)}`}>{campaign.status}</span>
                    <span style={{ fontSize: 11.5, color: "var(--subtle)" }}>{campaign.totalCount} contacts</span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" style={{ flex: 1 }} onClick={prepare} disabled={!campaign || loading === "prepare"}>{loading === "prepare" ? "Preparing…" : "Prepare"}</button>
                  <button className="btn btn-p" style={{ flex: 1 }} onClick={send} disabled={!campaign || loading === "send"}>{loading === "send" ? "Sending…" : "Send"}</button>
                </div>
              </div>
            </div>
          </section>

          {/* Template */}
          <section id="template" className="two">
            <form className="card" onSubmit={campaign?.template ? updTmpl : saveTmpl}>
              <div className="card-head">Template Editor</div>
              <div className="card-body">
                <F label="Name" req><input className="input" value={tmpl.name} required onChange={(e) => setTmpl((c) => ({ ...c, name: e.target.value }))} /></F>
                <F label="English body" req><textarea className="textarea" value={tmpl.bodyEn} required onChange={(e) => setTmpl((c) => ({ ...c, bodyEn: e.target.value }))} /></F>
                <F label="Arabic body (optional)"><textarea className="textarea" dir="rtl" placeholder="اكتب هنا..." value={tmpl.bodyAr} onChange={(e) => setTmpl((c) => ({ ...c, bodyAr: e.target.value }))} /></F>
                <button className="btn btn-p btn-w" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : (campaign?.template ? "Update template" : "Save template")}</button>
              </div>
            </form>

            <div className="card">
              <div className="card-head">
                Preview
                <span style={{ fontSize: 11, color: "var(--subtle)", fontWeight: 400 }}>{"{{name}}"} {"{{date}}"} {"{{venue}}"} {"{{rsvp_link}}"}</span>
              </div>
              <div className="card-body">
                <div className="preview">{preview}</div>
                <form style={{ display: "flex", flexDirection: "column", gap: 10 }} onSubmit={uploadMedia}>
                  <F label="Attach media">
                    <input className="input" name="file" type="file" />
                  </F>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btn" type="submit" disabled={loading === "media"}>{loading === "media" ? "Uploading…" : "Upload"}</button>
                    {tmpl.mediaUrl && <span className="badge b-g">Attached</span>}
                  </div>
                </form>
              </div>
            </div>
          </section>

          {/* Contacts */}
          <section id="contacts" className="two">
            <div className="card">
              <div className="card-head">Spreadsheet Import</div>
              <div className="card-body">
                <form style={{ display: "flex", flexDirection: "column", gap: 10 }} onSubmit={uploadContacts}>
                  <F label=".xlsx or .csv"><input className="input" name="file" type="file" accept=".xlsx,.csv" /></F>
                  <button className="btn btn-p btn-w" type="submit" disabled={!campaign || loading === "contacts"}>{loading === "contacts" ? "Importing…" : "Import contacts"}</button>
                </form>
              </div>
            </div>

            <div className="card">
              <div className="card-head">Google Sheets Import</div>
              <div className="card-body">
                <form style={{ display: "flex", flexDirection: "column", gap: 10 }} onSubmit={importSheet}>
                  <F label="Sheet URL"><input className="input" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} /></F>
                  <button className="btn btn-w" type="submit" disabled={!campaign || loading === "sheet"}>{loading === "sheet" ? "Importing…" : "Import Google Sheet"}</button>
                </form>
                {sheetResult && (
                  <div className="preview" style={{ marginTop: 4 }}>
                    {sheetResult.message ?? `${sheetResult.imported} contacts imported.`}
                    {sheetResult.headers?.length ? <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--muted)" }}>Columns: {sheetResult.headers.join(", ")}</div> : null}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* WhatsApp */}
          <section id="whatsapp" className="two">
            <div className="card">
              <div className="card-head">
                WhatsApp Session
                <span className={waBadge(wa)}>{waLabel(wa)}</span>
              </div>
              <div className="card-body">
                <button className="btn btn-w" onClick={startWa} disabled={loading === "start-wa"}>{loading === "start-wa" ? "Starting…" : "Start session"}</button>
                {wa.personal.qr ? (
                  <div className="qr-box">
                    <img src={wa.personal.qr} alt="Scan in WhatsApp to log in" />
                    <p className="qr-hint">WhatsApp → Linked Devices → Link a Device</p>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--subtle)" }}>{wa.personal.error ?? "QR code appears here when login is needed."}</p>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head">Settings</div>
              <div className="card-body">
                <form style={{ display: "flex", flexDirection: "column", gap: 10 }} onSubmit={saveWaSettings}>
                  <F label="Provider">
                    <select className="select" value={waSettings.provider} onChange={(e) => setWaSettings((c) => ({ ...c, provider: e.target.value as "personal" | "meta" }))}>
                      <option value="personal">Personal WhatsApp (QR)</option>
                      <option value="meta">Meta WhatsApp Business API</option>
                    </select>
                  </F>
                  <F label="Personal backend URL">
                    <input className="input" value={waSettings.personalBackendUrl} placeholder="https://api.yourhost.com" onChange={(e) => setWaSettings((c) => ({ ...c, personalBackendUrl: e.target.value }))} />
                  </F>
                  <button className="btn btn-p btn-w" type="submit" disabled={loading === "wa-settings"}>{loading === "wa-settings" ? "Saving…" : "Save settings"}</button>
                </form>
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {[["🕐", "4s delay between messages"], ["👥", "Known contacts only — no cold outreach"], ["📊", "Keep under 100 sends per day"], ["✅", "Prepare first, review, then send"]].map(([icon, text]) => (
                    <div key={text} className="rule-row"><span className="rule-icon">{icon}</span><span className="rule-text">{text}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Messages */}
          <section className="card">
            <div className="card-head">
              Messages
              {campaign?.messages?.length ? <span style={{ fontSize: 11.5, color: "var(--subtle)", fontWeight: 400 }}>{campaign.messages.length} total</span> : null}
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>RSVP</th></tr></thead>
                <tbody>
                  {campaign?.messages?.length ? campaign.messages.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 500 }}>{m.contact.name}</td>
                      <td style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{m.contact.phone}</td>
                      <td><span className={msgBadge(m.status)}>{m.status}</span></td>
                      <td>{m.rsvpToken?.response ? <span className={`badge ${m.rsvpToken.response === "YES" ? "b-g" : "b-r"}`}>{m.rsvpToken.response}</span> : <span style={{ color: "var(--subtle)" }}>—</span>}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="tbl-empty">{campaign ? "No messages yet — Prepare first." : "Select a campaign to see messages."}</td></tr>
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

/* ── Mini components ── */
function SLink({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return <a href={href} className={`s-link${active ? " active" : ""}`}>{icon}{children}</a>;
}

function Stat({ label, val, c }: { label: string; val: number; c?: "g" | "r" | "a" }) {
  return <div className={`stat${c ? ` ${c}` : ""}`}><div className="stat-lbl">{label}</div><div className="stat-val">{val}</div></div>;
}

function F({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label">{label}{req && <span className="req" aria-hidden="true">*</span>}</label>
      {children}
    </div>
  );
}

/* ── Icons ── */
const GridIcon     = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>;
const TemplateIcon = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="14" height="10" rx="1.5"/><path d="M4 14h8M8 11v3" strokeLinecap="round"/></svg>;
const ContactsIcon = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="5" r="3"/><path d="M1 14c0-3 2-5 5-5s5 2 5 5" strokeLinecap="round"/><path d="M12 6l2 2M14 6l-2 2" strokeLinecap="round"/></svg>;
const WaIcon       = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 9.5c.5 1 1.5 2 2.5 2 2.5 0 3.5-2 3.5-3.5S10 4 8 4 5 5.5 5 7.5c0 .7.2 1.3.5 1.8L4.5 12l1.5-.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
