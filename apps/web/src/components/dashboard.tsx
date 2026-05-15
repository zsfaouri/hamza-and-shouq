"use client";

/* eslint-disable @next/next/no-img-element */
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL, apiGet, apiPost, apiPut } from "@/lib/api";

type Template = {
  id: string;
  name: string;
  bodyEn: string;
  bodyAr?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  template?: Template | null;
};

type Contact = { id: string; name: string; phone: string };

type Message = {
  id: string;
  body: string;
  status: string;
  error?: string | null;
  contact: Contact;
  rsvpToken?: { response?: "YES" | "NO" | null; clickedAt?: string | null } | null;
};

type CampaignDetail = Campaign & { contacts: Contact[]; messages: Message[] };

type Stats = { sent: number; failed: number; pending: number; yes: number; no: number };

type WaStatus = {
  provider: "personal" | "meta";
  personal: { state: string; qr: string | null; error?: string | null };
  meta: { configured: boolean; phoneNumberId: string; graphVersion: string; sendMode: string; templateName: string };
};

const emptyStats: Stats = { sent: 0, failed: 0, pending: 0, yes: 0, no: 0 };

function waBadgeClass(status: WaStatus): string {
  if (status.provider === "meta") return status.meta.configured ? "badge badge-green" : "badge badge-red";
  const s = status.personal.state;
  if (s === "ready") return "badge badge-green";
  if (s === "disconnected" || s === "disabled") return "badge badge-red";
  return "badge badge-amber";
}

function waLabel(status: WaStatus): string {
  if (status.provider === "meta") return status.meta.configured ? "Meta configured" : "Meta not configured";
  return status.personal.state;
}

function msgBadgeClass(s: string): string {
  if (s === "SENT") return "badge badge-green";
  if (s === "FAILED") return "badge badge-red";
  return "badge badge-amber";
}

export function Dashboard() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [wa, setWa] = useState<WaStatus>({
    provider: "personal",
    personal: { state: "loading", qr: null, error: null },
    meta: { configured: false, phoneNumberId: "", graphVersion: "", sendMode: "text", templateName: "" },
  });
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("campaign");
  const [sheetUrl, setSheetUrl] = useState(
    "https://docs.google.com/spreadsheets/d/1021Z6KyT-dF97FVJAG3c4Nr6thASDpuhPu-hFC_fTA0/edit?usp=sharing",
  );

  const initialized = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [templateDraft, setTemplateDraft] = useState({
    name: "Wedding Invite EN",
    bodyEn: "Hi {{name}}, you're invited to Hamza and Shouq's wedding on {{date}} at {{venue}}. Please RSVP here: {{rsvp_link}}",
    bodyAr: "",
    mediaUrl: "",
    mediaType: "",
  });
  const [campaignDraft, setCampaignDraft] = useState({ name: "Wedding Invitations", templateId: "" });

  function showNotice(msg: string, type: "success" | "error" = "success") {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(msg);
    setNoticeType(type);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }

  async function refresh() {
    try {
      const [nextTemplates, nextCampaigns, nextWa] = await Promise.all([
        apiGet<Template[]>("/api/templates"),
        apiGet<Campaign[]>("/api/campaigns"),
        apiGet<WaStatus>("/api/whatsapp/status"),
      ]);
      setTemplates(nextTemplates);
      setCampaigns(nextCampaigns);
      setWa(nextWa);
      if (!initialized.current) {
        initialized.current = true;
        const firstId = nextCampaigns[0]?.id ?? "";
        if (firstId) setSelectedCampaignId(firstId);
        if (nextTemplates[0]) {
          setCampaignDraft((c) => (c.templateId ? c : { ...c, templateId: nextTemplates[0].id }));
        }
      }
    } catch { /* silent */ }
  }

  async function loadCampaign(id: string) {
    if (!id) return;
    const [detail, nextStats] = await Promise.all([
      apiGet<CampaignDetail>(`/api/campaigns/${id}`),
      apiGet<Stats>(`/api/campaigns/${id}/stats`),
    ]);
    setCampaign(detail);
    setStats(nextStats);
  }

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => { void loadCampaign(selectedCampaignId); }, [selectedCampaignId]);

  useEffect(() => {
    const ids = ["campaign", "template", "contacts", "whatsapp"];
    const obs = ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const o = new IntersectionObserver(
        ([e]) => { if (e.isIntersecting) setActiveSection(id); },
        { rootMargin: "-20% 0px -70% 0px" },
      );
      o.observe(el);
      return o;
    });
    return () => obs.forEach((o) => o?.disconnect());
  }, []);

  const preview = useMemo(() => {
    const row = campaign?.contacts[0] ?? { name: "Ahmed", phone: "+962790000000" };
    const publicBase = API_URL || (typeof window === "undefined" ? "" : window.location.origin);
    return templateDraft.bodyEn
      .replaceAll("{{name}}", row.name)
      .replaceAll("{{phone}}", row.phone)
      .replaceAll("{{date}}", "Friday, 20 June")
      .replaceAll("{{venue}}", "Amman")
      .replaceAll("{{rsvp_link}}", `${publicBase}/rsvp/example-token`);
  }, [campaign?.contacts, templateDraft.bodyEn]);

  async function saveTemplate(e: FormEvent) {
    e.preventDefault();
    setLoading("save-template");
    try {
      const saved = await apiPost<Template>("/api/templates", {
        ...templateDraft,
        bodyAr: templateDraft.bodyAr || null,
        mediaUrl: templateDraft.mediaUrl || null,
        mediaType: templateDraft.mediaType || null,
      });
      showNotice("Template saved.");
      setTemplates((c) => [saved, ...c]);
      setCampaignDraft((c) => ({ ...c, templateId: saved.id }));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to save template.", "error");
    } finally { setLoading(null); }
  }

  async function updateTemplate(e: FormEvent) {
    e.preventDefault();
    if (!campaign?.template) return;
    setLoading("update-template");
    try {
      const updated = await apiPut<Template>(`/api/templates/${campaign.template.id}`, {
        name: templateDraft.name,
        bodyEn: templateDraft.bodyEn,
        bodyAr: templateDraft.bodyAr || null,
        mediaUrl: templateDraft.mediaUrl || null,
        mediaType: templateDraft.mediaType || null,
      });
      setTemplates((c) => c.map((t) => (t.id === updated.id ? updated : t)));
      showNotice("Template updated.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to update template.", "error");
    } finally { setLoading(null); }
  }

  async function createCampaign(e: FormEvent) {
    e.preventDefault();
    setLoading("create-campaign");
    try {
      const created = await apiPost<Campaign>("/api/campaigns", campaignDraft);
      showNotice("Campaign created.");
      setCampaigns((c) => [created, ...c]);
      setSelectedCampaignId(created.id);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to create campaign.", "error");
    } finally { setLoading(null); }
  }

  async function uploadContacts(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!campaign) return;
    setLoading("upload-contacts");
    try {
      await apiPost(`/api/campaigns/${campaign.id}/contacts`, new FormData(e.currentTarget));
      showNotice("Contacts imported.");
      await loadCampaign(campaign.id);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to import contacts.", "error");
    } finally { setLoading(null); }
  }

  async function importGoogleSheet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!campaign) return;
    setLoading("google-sheet");
    try {
      const result = await apiPost<{ imported: number }>(`/api/campaigns/${campaign.id}/contacts/google-sheet`, { url: sheetUrl });
      showNotice(`Imported ${result.imported} contacts from Google Sheets.`);
      await loadCampaign(campaign.id);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to import Google Sheet.", "error");
    } finally { setLoading(null); }
  }

  async function uploadMedia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading("upload-media");
    try {
      const media = await apiPost<{ url: string; type: string }>("/api/media", new FormData(e.currentTarget));
      setTemplateDraft((c) => ({ ...c, mediaUrl: media.url, mediaType: media.type }));
      showNotice("Media uploaded.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to upload media.", "error");
    } finally { setLoading(null); }
  }

  async function prepareCampaign() {
    if (!campaign) return;
    setLoading("prepare");
    try {
      await apiPost(`/api/campaigns/${campaign.id}/prepare`);
      showNotice("Messages prepared.");
      await loadCampaign(campaign.id);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to prepare messages.", "error");
    } finally { setLoading(null); }
  }

  async function sendCampaign() {
    if (!campaign) return;
    const n = campaign.contacts.length;
    if (!window.confirm(`Send to ${n} contact${n !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setLoading("send");
    try {
      await apiPost(`/api/campaigns/${campaign.id}/send`);
      showNotice("Sending started.");
      await loadCampaign(campaign.id);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to start sending.", "error");
    } finally { setLoading(null); }
  }

  async function startWhatsApp() {
    setLoading("whatsapp");
    try {
      const nextWa = await apiPost<WaStatus>("/api/whatsapp/start");
      setWa(nextWa);
      showNotice("WhatsApp session starting.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to start WhatsApp.", "error");
    } finally { setLoading(null); }
  }

  const isSaving = loading === "save-template" || loading === "update-template";

  return (
    <div className="shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">HS</div>
          <div className="sidebar-brand-text">
            <strong>Hamza & Shouq</strong>
            <span>Campaign dashboard</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          <span className="nav-label">Menu</span>

          <NavLink href="#campaign" active={activeSection === "campaign"} icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
              <rect x="1" y="1" width="6" height="6" rx="1.5" /><rect x="9" y="1" width="6" height="6" rx="1.5" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" /><rect x="9" y="9" width="6" height="6" rx="1.5" />
            </svg>
          }>Campaign</NavLink>

          <NavLink href="#template" active={activeSection === "template"} icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
              <rect x="1" y="1" width="14" height="10" rx="1.5" />
              <path d="M4 14h8M8 11v3" strokeLinecap="round" />
            </svg>
          }>Template</NavLink>

          <NavLink href="#contacts" active={activeSection === "contacts"} icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
              <circle cx="6" cy="5" r="3" /><path d="M1 14c0-3 2-5 5-5s5 2 5 5" strokeLinecap="round" />
              <path d="M11 7l3 3M14 7l-3 3" strokeLinecap="round" />
            </svg>
          }>Contacts</NavLink>

          <NavLink href="#whatsapp" active={activeSection === "whatsapp"} icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M5.5 9.5c.5 1 1.5 2 2.5 2 2.5 0 3.5-2 3.5-3.5S10 4 8 4 5 5.5 5 7.5c0 .7.2 1.3.5 1.8L4.5 12l1.5-.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }>WhatsApp</NavLink>
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-footer-label">API</span>
          <span className="sidebar-footer-value">{API_URL || "Same-origin Vercel API"}</span>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        <div className="page-header">
          <div>
            <h1 className="page-title">Invitations</h1>
            <p className="page-sub">WhatsApp campaign &amp; RSVP tracking for Hamza &amp; Shouq</p>
          </div>
          <span className={waBadgeClass(wa)}>{waLabel(wa)}</span>
        </div>

        <div className="content">
          {/* Notice */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">{notice}</div>
          {notice && (
            <div className={`notice${noticeType === "error" ? " error" : ""}`} role="status">
              {noticeType === "error" ? "⚠ " : "✓ "}{notice}
            </div>
          )}

          {/* Stats */}
          <section className="stats-row" aria-label="Campaign stats">
            <StatCard label="Sent"     value={stats.sent}    color="green" />
            <StatCard label="Failed"   value={stats.failed}  color="red" />
            <StatCard label="RSVP Yes" value={stats.yes}     color="green" />
            <StatCard label="RSVP No"  value={stats.no}      color="amber" />
            <StatCard label="Pending"  value={stats.pending} />
          </section>

          {/* Campaign */}
          <section id="campaign" className="two-col">
            <div className="card">
              <p className="card-title">New Campaign</p>
              <form className="form-stack" onSubmit={createCampaign}>
                <Field label="Campaign name" required>
                  <input className="input" value={campaignDraft.name} required
                    onChange={(e) => setCampaignDraft((c) => ({ ...c, name: e.target.value }))} />
                </Field>
                <Field label="Template" required>
                  <select className="select" value={campaignDraft.templateId} required
                    onChange={(e) => setCampaignDraft((c) => ({ ...c, templateId: e.target.value }))}>
                    <option value="">Select a template</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
                <button className="btn btn-full" type="submit" disabled={loading === "create-campaign"}>
                  {loading === "create-campaign" ? "Creating…" : "Create campaign"}
                </button>
              </form>
            </div>

            <div className="card">
              <p className="card-title">Active Campaign</p>
              <div className="form-stack">
                <Field label="Select campaign">
                  <select className="select" value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}>
                    <option value="">No campaign selected</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                {campaign && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={`badge ${campaignStatusBadge(campaign.status)}`}>{campaign.status}</span>
                    <span className="text-subtle">{campaign.totalCount} contacts</span>
                  </div>
                )}
                <hr className="card-divider" style={{ margin: "4px -24px" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" style={{ flex: 1 }} type="button"
                    onClick={prepareCampaign} disabled={!campaign || loading === "prepare"}>
                    {loading === "prepare" ? "Preparing…" : "Prepare"}
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1 }} type="button"
                    onClick={sendCampaign} disabled={!campaign || loading === "send"}>
                    {loading === "send" ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Template */}
          <section id="template" className="two-col">
            <form className="card form-stack" onSubmit={campaign?.template ? updateTemplate : saveTemplate}>
              <p className="card-title">Template Editor</p>
              <Field label="Template name" required>
                <input className="input" value={templateDraft.name} required
                  onChange={(e) => setTemplateDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="English body" required>
                <textarea className="textarea" value={templateDraft.bodyEn} required
                  onChange={(e) => setTemplateDraft((c) => ({ ...c, bodyEn: e.target.value }))} />
              </Field>
              <Field label="Arabic body (optional)">
                <textarea className="textarea" dir="rtl" placeholder="اكتب هنا..." value={templateDraft.bodyAr}
                  onChange={(e) => setTemplateDraft((c) => ({ ...c, bodyAr: e.target.value }))} />
              </Field>
              <button className="btn btn-primary btn-full" type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : (campaign?.template ? "Update template" : "Save template")}
              </button>
            </form>

            <div className="card form-stack">
              <p className="card-title">Preview</p>
              <p className="text-subtle" style={{ marginTop: -8 }}>
                Placeholders: <code>{"{{name}}"}</code> <code>{"{{date}}"}</code> <code>{"{{venue}}"}</code> <code>{"{{rsvp_link}}"}</code>
              </p>
              <div className="preview-box">{preview}</div>
              <hr className="card-divider" />
              <form className="form-stack" onSubmit={uploadMedia}>
                <Field label="Attach media (image, video, PDF)">
                  <input className="input" name="file" type="file" />
                </Field>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button className="btn" type="submit" disabled={loading === "upload-media"}>
                    {loading === "upload-media" ? "Uploading…" : "Upload media"}
                  </button>
                  {templateDraft.mediaUrl && <span className="badge badge-green">Media attached</span>}
                </div>
              </form>
            </div>
          </section>

          {/* Contacts */}
          <section id="contacts" className="two-col">
            <div className="card form-stack">
              <p className="card-title">Import from Spreadsheet</p>
              <form className="form-stack" onSubmit={uploadContacts}>
                <Field label="Upload .xlsx or .csv">
                  <input className="input" name="file" type="file" accept=".xlsx,.csv" />
                </Field>
                <button className="btn btn-primary btn-full" type="submit"
                  disabled={!campaign || loading === "upload-contacts"}>
                  {loading === "upload-contacts" ? "Importing…" : "Import contacts"}
                </button>
              </form>
            </div>

            <div className="card form-stack">
              <p className="card-title">Import from Google Sheets</p>
              <form className="form-stack" onSubmit={importGoogleSheet}>
                <Field label="Google Sheet URL">
                  <input className="input" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
                </Field>
                <button className="btn btn-full" type="submit"
                  disabled={!campaign || loading === "google-sheet"}>
                  {loading === "google-sheet" ? "Importing…" : "Import Google Sheet"}
                </button>
              </form>
            </div>
          </section>

          {/* WhatsApp */}
          <section id="whatsapp" className="two-col">
            <div className="card form-stack">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p className="card-title" style={{ marginBottom: 0 }}>WhatsApp Session</p>
                <span className={waBadgeClass(wa)}>{waLabel(wa)}</span>
              </div>
              <button className="btn btn-full" type="button"
                onClick={startWhatsApp} disabled={loading === "whatsapp"}>
                {loading === "whatsapp" ? "Starting…" : "Start session"}
              </button>
              {wa.personal.qr ? (
                <div className="qr-wrap">
                  <img className="qr" src={wa.personal.qr} alt="Scan this QR code in WhatsApp to log in" />
                  <p className="qr-hint">Open WhatsApp → Linked Devices → Link a Device, then scan this code.</p>
                </div>
              ) : (
                <p className="text-subtle">QR code appears here when WhatsApp needs login.</p>
              )}
            </div>

            <div className="card">
              <p className="card-title">Send Rules</p>
              <div className="form-stack">
                <Rule icon="🕐" text="Sequential sending with 4s delay between messages" />
                <Rule icon="👥" text="Send only to contacts who know you — avoid cold outreach" />
                <Rule icon="📊" text="Keep daily volume under 100 to reduce ban risk" />
                <Rule icon="✅" text="Prepare messages first, then review before sending" />
              </div>
            </div>
          </section>

          {/* Message table */}
          <section className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <p className="card-title" style={{ marginBottom: 0 }}>Messages</p>
              {campaign?.messages?.length ? (
                <span className="text-subtle">{campaign.messages.length} messages</span>
              ) : null}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>RSVP</th>
                  </tr>
                </thead>
                <tbody>
                  {campaign?.messages?.length ? (
                    campaign.messages.map((msg) => (
                      <tr key={msg.id}>
                        <td style={{ fontWeight: 500 }}>{msg.contact.name}</td>
                        <td className="text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{msg.contact.phone}</td>
                        <td><span className={msgBadgeClass(msg.status)}>{msg.status}</span></td>
                        <td>
                          {msg.rsvpToken?.response
                            ? <span className={`badge ${msg.rsvpToken.response === "YES" ? "badge-green" : "badge-red"}`}>{msg.rsvpToken.response}</span>
                            : <span className="text-subtle">—</span>}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="table-empty">
                        {campaign ? "No messages yet — click Prepare above." : "Select a campaign to view messages."}
                      </td>
                    </tr>
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

/* ── Sub-components ── */

function NavLink({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <a href={href} className={`nav-link${active ? " active" : ""}`}>
      {icon}
      {children}
    </a>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: "green" | "red" | "amber" }) {
  return (
    <div className={`stat-card${color ? ` ${color}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field-label">
        {label}{required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {children}
    </div>
  );
}

function Rule({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ fontSize: 14, lineHeight: 1.6, flexShrink: 0 }}>{icon}</span>
      <span className="text-subtle" style={{ lineHeight: 1.6 }}>{text}</span>
    </div>
  );
}

function campaignStatusBadge(status: string): string {
  if (status === "SENT") return "badge-green";
  if (status === "SENDING") return "badge-amber";
  if (status === "FAILED") return "badge-red";
  return "badge-gray";
}
