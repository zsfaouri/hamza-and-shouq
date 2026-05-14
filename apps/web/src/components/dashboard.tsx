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

type Contact = {
  id: string;
  name: string;
  phone: string;
};

type Message = {
  id: string;
  body: string;
  status: string;
  error?: string | null;
  contact: Contact;
  rsvpToken?: { response?: "YES" | "NO" | null; clickedAt?: string | null } | null;
};

type CampaignDetail = Campaign & {
  contacts: Contact[];
  messages: Message[];
};

type Stats = {
  sent: number;
  failed: number;
  pending: number;
  yes: number;
  no: number;
};

type WaStatus = {
  state: string;
  qr: string | null;
};

const emptyStats: Stats = { sent: 0, failed: 0, pending: 0, yes: 0, no: 0 };

function waStatusClass(state: string): string {
  if (state === "ready") return "sent";
  if (state === "disconnected" || state === "disabled") return "failed";
  return "pending";
}

export function Dashboard() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [wa, setWa] = useState<WaStatus>({ state: "loading", qr: null });
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("campaign");

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
    } catch {
      // Polling failures are silent — avoid spamming the notice on transient network blips
    }
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
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadCampaign(selectedCampaignId);
  }, [selectedCampaignId]);

  // Scroll-spy: highlight the nav link whose section is in the viewport centre
  useEffect(() => {
    const ids = ["campaign", "template", "contacts", "whatsapp"];
    const observers = ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: "-20% 0px -70% 0px" },
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach((o) => o?.disconnect());
  }, []);

  const preview = useMemo(() => {
    const row = campaign?.contacts[0] ?? { name: "Ahmed", phone: "+962790000000" };
    return templateDraft.bodyEn
      .replaceAll("{{name}}", row.name)
      .replaceAll("{{phone}}", row.phone)
      .replaceAll("{{date}}", "Friday, 20 June")
      .replaceAll("{{venue}}", "Amman")
      .replaceAll("{{rsvp_link}}", `${API_URL}/rsvp/example-token`);
  }, [campaign?.contacts, templateDraft.bodyEn]);

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    setLoading("save-template");
    try {
      const saved = await apiPost<Template>("/api/templates", {
        ...templateDraft,
        bodyAr: templateDraft.bodyAr || null,
        mediaUrl: templateDraft.mediaUrl || null,
        mediaType: templateDraft.mediaType || null,
      });
      showNotice("Template saved.");
      setTemplates((current) => [saved, ...current]);
      setCampaignDraft((current) => ({ ...current, templateId: saved.id }));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to save template.", "error");
    } finally {
      setLoading(null);
    }
  }

  async function updateTemplate(event: FormEvent) {
    event.preventDefault();
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
      setTemplates((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      showNotice("Template updated.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to update template.", "error");
    } finally {
      setLoading(null);
    }
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    setLoading("create-campaign");
    try {
      const created = await apiPost<Campaign>("/api/campaigns", campaignDraft);
      showNotice("Campaign created.");
      setCampaigns((current) => [created, ...current]);
      setSelectedCampaignId(created.id);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to create campaign.", "error");
    } finally {
      setLoading(null);
    }
  }

  async function uploadContacts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!campaign) return;
    setLoading("upload-contacts");
    try {
      const file = new FormData(event.currentTarget);
      await apiPost(`/api/campaigns/${campaign.id}/contacts`, file);
      showNotice("Contacts imported.");
      await loadCampaign(campaign.id);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to import contacts.", "error");
    } finally {
      setLoading(null);
    }
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("upload-media");
    try {
      const data = new FormData(event.currentTarget);
      const media = await apiPost<{ url: string; type: string }>("/api/media", data);
      setTemplateDraft((current) => ({ ...current, mediaUrl: media.url, mediaType: media.type }));
      showNotice("Media uploaded.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to upload media.", "error");
    } finally {
      setLoading(null);
    }
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
    } finally {
      setLoading(null);
    }
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
    } finally {
      setLoading(null);
    }
  }

  async function startWhatsApp() {
    setLoading("whatsapp");
    try {
      const nextWa = await apiPost<WaStatus>("/api/whatsapp/start");
      setWa(nextWa);
      showNotice("WhatsApp session starting.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to start WhatsApp.", "error");
    } finally {
      setLoading(null);
    }
  }

  const isSaving = loading === "save-template" || loading === "update-template";

  return (
    <div className="shell">
      <div className="app-frame">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">HS</div>
            <strong>Hamza & Shouq</strong>
            <span className="muted">WhatsApp campaign system</span>
          </div>
          <nav className="nav" aria-label="Dashboard navigation">
            <a href="#campaign" className={activeSection === "campaign" ? "active" : ""}>Campaign</a>
            <a href="#template" className={activeSection === "template" ? "active" : ""}>Template</a>
            <a href="#contacts" className={activeSection === "contacts" ? "active" : ""}>Contacts</a>
            <a href="#whatsapp" className={activeSection === "whatsapp" ? "active" : ""}>WhatsApp</a>
          </nav>
          <div style={{ marginTop: 28 }}>
            <p className="muted">Backend</p>
            <strong>{API_URL}</strong>
          </div>
        </aside>

        <main className="main">
          <section className="hero">
            <h1>Personal WhatsApp invitations with RSVP tracking.</h1>
            <p>
              Upload contacts, personalize messages, attach media, scan a QR code, send carefully, and track responses
              from one focused dashboard.
            </p>
          </section>

          {/* Hidden live region announces notices to screen readers */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">{notice}</div>

          {notice ? (
            <div className={`notice${noticeType === "error" ? " error" : ""}`} role="status">
              {notice}
            </div>
          ) : null}

          <section className="grid stats" aria-label="Campaign stats">
            <Stat label="Sent" value={stats.sent} color="green" />
            <Stat label="Failed" value={stats.failed} color="red" />
            <Stat label="RSVP Yes" value={stats.yes} color="green" />
            <Stat label="RSVP No" value={stats.no} color="amber" />
            <Stat label="Pending" value={stats.pending} />
          </section>

          <section id="campaign" className="grid two-col">
            <div className="panel">
              <h2>Campaign</h2>
              <form className="grid" onSubmit={createCampaign}>
                <Field label="Campaign name" required>
                  <input
                    className="input"
                    value={campaignDraft.name}
                    required
                    onChange={(event) => setCampaignDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </Field>
                <Field label="Template" required>
                  <select
                    className="select"
                    value={campaignDraft.templateId}
                    required
                    onChange={(event) => setCampaignDraft((current) => ({ ...current, templateId: event.target.value }))}
                  >
                    <option value="">Select template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <button className="btn" type="submit" disabled={loading === "create-campaign"}>
                  {loading === "create-campaign" ? "Creating…" : "Create campaign"}
                </button>
              </form>
            </div>

            <div className="panel">
              <h2>Active campaign</h2>
              <Field label="Select">
                <select
                  className="select"
                  value={selectedCampaignId}
                  onChange={(event) => setSelectedCampaignId(event.target.value)}
                >
                  <option value="">No campaign</option>
                  {campaigns.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid" style={{ marginTop: 16 }}>
                <button
                  className="btn"
                  type="button"
                  onClick={prepareCampaign}
                  disabled={!campaign || loading === "prepare"}
                >
                  {loading === "prepare" ? "Preparing…" : "Prepare messages"}
                </button>
                <button
                  className="btn primary"
                  type="button"
                  onClick={sendCampaign}
                  disabled={!campaign || loading === "send"}
                >
                  {loading === "send" ? "Sending…" : "Start sending"}
                </button>
              </div>
            </div>
          </section>

          <section id="template" className="grid two-col">
            <form className="panel grid" onSubmit={campaign?.template ? updateTemplate : saveTemplate}>
              <h2>Template editor</h2>
              <Field label="Template name" required>
                <input
                  className="input"
                  value={templateDraft.name}
                  required
                  onChange={(event) => setTemplateDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </Field>
              <Field label="English body" required>
                <textarea
                  className="textarea"
                  value={templateDraft.bodyEn}
                  required
                  onChange={(event) => setTemplateDraft((current) => ({ ...current, bodyEn: event.target.value }))}
                />
              </Field>
              <Field label="Arabic body (optional)">
                <textarea
                  className="textarea"
                  dir="rtl"
                  placeholder="اكتب هنا..."
                  value={templateDraft.bodyAr}
                  onChange={(event) => setTemplateDraft((current) => ({ ...current, bodyAr: event.target.value }))}
                />
              </Field>
              <button className="btn primary" type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save template"}
              </button>
            </form>

            <div className="panel grid">
              <h2>Preview</h2>
              <p className="muted">Available placeholders: {"{{name}}"}, {"{{phone}}"}, spreadsheet columns, {"{{rsvp_link}}"}</p>
              <div className="card">{preview}</div>
              <form className="grid" onSubmit={uploadMedia}>
                <Field label="Media (image, video, PDF, audio)">
                  <input className="input" name="file" type="file" />
                </Field>
                <button className="btn" type="submit" disabled={loading === "upload-media"}>
                  {loading === "upload-media" ? "Uploading…" : "Upload media"}
                </button>
                {templateDraft.mediaUrl ? <span className="status sent">Media attached</span> : null}
              </form>
            </div>
          </section>

          <section id="contacts" className="panel">
            <h2>Contacts</h2>
            <form className="grid" onSubmit={uploadContacts}>
              <Field label="Spreadsheet (.xlsx or .csv)">
                <input className="input" name="file" type="file" accept=".xlsx,.csv" />
              </Field>
              <button
                className="btn primary"
                type="submit"
                disabled={!campaign || loading === "upload-contacts"}
              >
                {loading === "upload-contacts" ? "Importing…" : "Import contacts"}
              </button>
            </form>
          </section>

          <section id="whatsapp" className="grid two-col">
            <div className="panel">
              <h2>WhatsApp session</h2>
              <p className={`status ${waStatusClass(wa.state)}`}>{wa.state}</p>
              <button
                className="btn"
                type="button"
                onClick={startWhatsApp}
                disabled={loading === "whatsapp"}
              >
                {loading === "whatsapp" ? "Starting…" : "Start WhatsApp session"}
              </button>
              {wa.qr ? (
                <img className="qr" src={wa.qr} alt="WhatsApp login QR code" />
              ) : (
                <p className="muted">QR appears when the backend needs login.</p>
              )}
            </div>
            <div className="panel">
              <h2>Send rules</h2>
              <p className="muted">Use known contacts only. Keep daily sends low. The backend sends sequentially with a delay to reduce ban risk.</p>
            </div>
          </section>

          <section className="panel">
            <h2>Message table</h2>
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
                    campaign.messages.map((message) => (
                      <tr key={message.id}>
                        <td>{message.contact.name}</td>
                        <td>{message.contact.phone}</td>
                        <td>
                          <span className={`status ${message.status.toLowerCase()}`}>
                            {message.status}
                          </span>
                        </td>
                        <td>{message.rsvpToken?.response ?? "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="table-empty">
                        {campaign
                          ? "No messages yet — click Prepare messages above."
                          : "Select a campaign to view messages."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: "green" | "red" | "amber" }) {
  return (
    <div className={`card stat-card${color ? ` ${color}` : ""}`}>
      <span className="muted">{label}</span>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? (
          <span aria-hidden="true" style={{ color: "var(--red)", marginLeft: 3 }}>*</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
