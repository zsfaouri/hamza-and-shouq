"use client";

/* eslint-disable @next/next/no-img-element */
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
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
  provider: "personal" | "meta";
  personal: {
    state: string;
    qr: string | null;
  };
  meta: {
    configured: boolean;
    phoneNumberId: string;
    graphVersion: string;
    sendMode: "text" | "template";
    templateName: string;
  };
};

type AppSettings = {
  provider: "personal" | "meta";
  defaultCountryCode: string;
  meta: {
    graphVersion: string;
    phoneNumberId: string;
    accessToken: string;
    appSecret: string;
    verifyToken: string;
    sendMode: "text" | "template";
    templateName: string;
    templateLanguage: string;
  };
};

const emptyStats: Stats = { sent: 0, failed: 0, pending: 0, yes: 0, no: 0 };
const currentSheetUrl = "https://docs.google.com/spreadsheets/d/1021Z6KyT-dF97FVJAG3c4Nr6thASDpuhPu-hFC_fTA0/edit?usp=sharing";

export function Dashboard() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [wa, setWa] = useState<WaStatus>({
    provider: "personal",
    personal: { state: "loading", qr: null },
    meta: { configured: false, phoneNumberId: "", graphVersion: "v23.0", sendMode: "text", templateName: "" },
  });
  const [settings, setSettings] = useState<AppSettings>({
    provider: "personal",
    defaultCountryCode: "962",
    meta: {
      graphVersion: "v23.0",
      phoneNumberId: "",
      accessToken: "",
      appSecret: "",
      verifyToken: "hamza-shouq-webhook",
      sendMode: "text",
      templateName: "",
      templateLanguage: "en_US",
    },
  });
  const [notice, setNotice] = useState("");

  const [templateDraft, setTemplateDraft] = useState({
    name: "Wedding Invite EN",
    bodyEn: "Hi {{name}}, you're invited to Hamza and Shouq's wedding on {{date}} at {{venue}}. Please RSVP here: {{rsvp_link}}",
    bodyAr: "",
    mediaUrl: "",
    mediaType: "",
  });
  const [campaignDraft, setCampaignDraft] = useState({ name: "Wedding Invitations", templateId: "" });
  const [sheetUrl, setSheetUrl] = useState(currentSheetUrl);

  async function refresh() {
    const [nextTemplates, nextCampaigns, nextWa, nextSettings] = await Promise.all([
      apiGet<Template[]>("/api/templates"),
      apiGet<Campaign[]>("/api/campaigns"),
      apiGet<WaStatus>("/api/whatsapp/status"),
      apiGet<AppSettings>("/api/settings"),
    ]);
    setTemplates(nextTemplates);
    setCampaigns(nextCampaigns);
    setWa(nextWa);
    setSettings(nextSettings);

    const firstCampaign = selectedCampaignId || nextCampaigns[0]?.id || "";
    if (firstCampaign) setSelectedCampaignId(firstCampaign);
    if (!campaignDraft.templateId && nextTemplates[0]) setCampaignDraft((current) => ({ ...current, templateId: nextTemplates[0].id }));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadCampaign(selectedCampaignId);
  }, [selectedCampaignId]);

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
    const saved = await apiPost<Template>("/api/templates", {
      ...templateDraft,
      bodyAr: templateDraft.bodyAr || null,
      mediaUrl: templateDraft.mediaUrl || null,
      mediaType: templateDraft.mediaType || null,
    });
    setNotice("Template saved.");
    setTemplates((current) => [saved, ...current]);
    setCampaignDraft((current) => ({ ...current, templateId: saved.id }));
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    const created = await apiPost<Campaign>("/api/campaigns", campaignDraft);
    setNotice("Campaign created.");
    setCampaigns((current) => [created, ...current]);
    setSelectedCampaignId(created.id);
  }

  async function uploadContacts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!campaign) return;
    const file = new FormData(event.currentTarget);
    await apiPost(`/api/campaigns/${campaign.id}/contacts`, file);
    setNotice("Contacts imported.");
    await loadCampaign(campaign.id);
  }

  async function importGoogleSheet(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    await apiPost(`/api/campaigns/${campaign.id}/contacts/google-sheet`, { url: sheetUrl });
    setNotice("Google Sheet contacts imported.");
    await loadCampaign(campaign.id);
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const media = await apiPost<{ url: string; type: string }>("/api/media", data);
    setTemplateDraft((current) => ({ ...current, mediaUrl: media.url, mediaType: media.type }));
    setNotice("Media uploaded.");
  }

  async function prepareCampaign() {
    if (!campaign) return;
    await apiPost(`/api/campaigns/${campaign.id}/prepare`);
    setNotice("Messages prepared.");
    await loadCampaign(campaign.id);
  }

  async function sendCampaign() {
    if (!campaign) return;
    await apiPost(`/api/campaigns/${campaign.id}/send`);
    setNotice("Sending started.");
    await loadCampaign(campaign.id);
  }

  async function startWhatsApp() {
    const nextWa = await apiPost<WaStatus>("/api/whatsapp/start");
    setWa(nextWa);
    setNotice("WhatsApp session starting.");
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    const saved = await apiPut<AppSettings>("/api/settings", settings);
    setSettings(saved);
    setNotice("Settings saved.");
    setWa(await apiGet<WaStatus>("/api/whatsapp/status"));
  }

  async function updateTemplate(event: FormEvent) {
    event.preventDefault();
    if (!campaign?.template) return;
    const updated = await apiPut<Template>(`/api/templates/${campaign.template.id}`, {
      name: templateDraft.name,
      bodyEn: templateDraft.bodyEn,
      bodyAr: templateDraft.bodyAr || null,
      mediaUrl: templateDraft.mediaUrl || null,
      mediaType: templateDraft.mediaType || null,
    });
    setTemplates((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setNotice("Template updated.");
  }

  return (
    <div className="shell">
      <div className="app-frame">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">HS</div>
            <div>
              <strong>Hamza & Shouq</strong>
              <span className="muted">Invitation operations</span>
            </div>
          </div>
          <nav className="nav" aria-label="Dashboard navigation">
            <a href="#campaign">Campaign</a>
            <a href="#template">Template</a>
            <a href="#contacts">Contacts</a>
            <a href="#whatsapp">WhatsApp</a>
            <a href="#settings">Settings</a>
          </nav>
          <div className="sidebar-status">
            <span className="eyebrow">Backend</span>
            <strong>{API_URL}</strong>
            <span className="status-dot">Online</span>
          </div>
        </aside>

        <main className="main">
          <section className="command-bar" aria-label="System status">
            <div>
              <span className="eyebrow">Active campaign</span>
              <strong>{campaign?.name ?? "No campaign selected"}</strong>
            </div>
            <div>
              <span className="eyebrow">Provider</span>
              <strong>{settings.provider === "personal" ? "Personal QR" : "Meta Business API"}</strong>
            </div>
            <div>
              <span className="eyebrow">Session</span>
              <strong>{wa.provider === "personal" ? wa.personal.state : wa.meta.configured ? "Configured" : "Missing settings"}</strong>
            </div>
            <div>
              <span className="eyebrow">Contacts</span>
              <strong>{campaign?.contacts.length ?? 0}</strong>
            </div>
          </section>

          <section className="hero">
            <span className="eyebrow">Wedding RSVP control room</span>
            <h1>Prepare, send, and track invitations from one focused workspace.</h1>
            <p>
              Import guests from the live sheet, personalize the template, choose the sending provider, then monitor
              delivery and RSVP movement without leaving the dashboard.
            </p>
          </section>

          {notice ? <div className="notice" role="status">{notice}</div> : null}

          <section className="grid stats" aria-label="Campaign stats">
            <Stat label="Sent" value={stats.sent} tone="green" />
            <Stat label="Failed" value={stats.failed} tone="red" />
            <Stat label="RSVP Yes" value={stats.yes} tone="green" />
            <Stat label="RSVP No" value={stats.no} tone="neutral" />
            <Stat label="Pending" value={stats.pending} tone="amber" />
          </section>

          <section id="campaign" className="grid two-col">
            <div className="panel">
              <h2>Campaign</h2>
              <form className="grid" onSubmit={createCampaign}>
                <Field label="Campaign name">
                  <input className="input" value={campaignDraft.name} onChange={(event) => setCampaignDraft((current) => ({ ...current, name: event.target.value }))} />
                </Field>
                <Field label="Template">
                  <select className="select" value={campaignDraft.templateId} onChange={(event) => setCampaignDraft((current) => ({ ...current, templateId: event.target.value }))}>
                    <option value="">Select template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <button className="btn primary" type="submit">Create campaign</button>
              </form>
            </div>

            <div className="panel">
              <h2>Active campaign</h2>
              <Field label="Select">
                <select className="select" value={selectedCampaignId} onChange={(event) => setSelectedCampaignId(event.target.value)}>
                  <option value="">No campaign</option>
                  {campaigns.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid" style={{ marginTop: 16 }}>
                <button className="btn" type="button" onClick={prepareCampaign} disabled={!campaign}>Prepare messages</button>
                <button className="btn primary" type="button" onClick={sendCampaign} disabled={!campaign}>Start sending</button>
              </div>
            </div>
          </section>

          <section id="template" className="grid two-col">
            <form className="panel grid" onSubmit={campaign?.template ? updateTemplate : saveTemplate}>
              <h2>Template editor</h2>
              <Field label="Template name">
                <input className="input" value={templateDraft.name} onChange={(event) => setTemplateDraft((current) => ({ ...current, name: event.target.value }))} />
              </Field>
              <Field label="English body">
                <textarea className="textarea" value={templateDraft.bodyEn} onChange={(event) => setTemplateDraft((current) => ({ ...current, bodyEn: event.target.value }))} />
              </Field>
              <Field label="Arabic body optional">
                <textarea className="textarea" dir="rtl" value={templateDraft.bodyAr} onChange={(event) => setTemplateDraft((current) => ({ ...current, bodyAr: event.target.value }))} />
              </Field>
              <button className="btn primary" type="submit">Save template</button>
            </form>

            <div className="panel grid">
              <h2>Preview</h2>
              <p className="muted">Available placeholders: {"{{name}}"}, {"{{phone}}"}, spreadsheet columns, {"{{rsvp_link}}"}</p>
              <div className="card">{preview}</div>
              <form className="grid" onSubmit={uploadMedia}>
                <Field label="Media upload image video PDF audio">
                  <input className="input" name="file" type="file" />
                </Field>
                <button className="btn" type="submit">Upload media</button>
                {templateDraft.mediaUrl ? <span className="status">Media attached</span> : null}
              </form>
            </div>
          </section>

          <section id="contacts" className="panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Guest source</span>
                <h2>Contacts</h2>
              </div>
              <span className="status">{campaign?.contacts.length ?? 0} loaded</span>
            </div>
            <div className="grid two-col contact-imports">
              <form className="import-box" onSubmit={importGoogleSheet}>
                <span className="import-icon">GS</span>
                <Field label="Google Sheet URL">
                  <input className="input" value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} />
                </Field>
                <button className="btn primary" type="submit" disabled={!campaign}>Import from Google Sheet</button>
              </form>
              <form className="import-box" onSubmit={uploadContacts}>
                <span className="import-icon">CSV</span>
                <Field label="Spreadsheet .xlsx or .csv">
                  <input className="input" name="file" type="file" accept=".xlsx,.csv" />
                </Field>
                <button className="btn" type="submit" disabled={!campaign}>Upload file</button>
              </form>
            </div>
          </section>

          <section id="whatsapp" className="grid two-col">
            <div className="panel">
              <h2>WhatsApp session</h2>
              <p className="status">{wa.provider === "personal" ? wa.personal.state : wa.meta.configured ? "meta configured" : "meta missing settings"}</p>
              <button className="btn" type="button" onClick={startWhatsApp} disabled={settings.provider !== "personal"}>
                Start WhatsApp session
              </button>
              {settings.provider === "personal" && wa.personal.qr ? (
                <img className="qr" src={wa.personal.qr} alt="WhatsApp login QR code" />
              ) : (
                <p className="muted">
                  {settings.provider === "personal"
                    ? "QR appears when the backend needs login."
                    : "Meta mode uses access token, phone number ID, and approved templates. No QR scan."}
                </p>
              )}
            </div>
            <div className="panel">
              <h2>Send rules</h2>
              <p className="muted">
                Personal mode uses WhatsApp Web and should stay low-volume. Meta mode is official, but outbound campaign
                sends usually require approved message templates.
              </p>
            </div>
          </section>

          <section id="settings" className="panel">
            <h2>App settings</h2>
            <form className="grid" onSubmit={saveSettings}>
              <div className="provider-switch">
                <button
                  className={`choice ${settings.provider === "personal" ? "active" : ""}`}
                  type="button"
                  onClick={() => setSettings((current) => ({ ...current, provider: "personal" }))}
                >
                  <strong>Personal number</strong>
                  <span>QR scan, whatsapp-web.js, local or persistent backend.</span>
                </button>
                <button
                  className={`choice ${settings.provider === "meta" ? "active" : ""}`}
                  type="button"
                  onClick={() => setSettings((current) => ({ ...current, provider: "meta" }))}
                >
                  <strong>Meta Business API</strong>
                  <span>Official Cloud API, webhook-ready, requires Meta credentials.</span>
                </button>
              </div>

              <div className="grid two-col">
                <Field label="Default country code">
                  <input className="input" value={settings.defaultCountryCode} onChange={(event) => setSettings((current) => ({ ...current, defaultCountryCode: event.target.value }))} />
                </Field>
                <Field label="Meta graph version">
                  <input className="input" value={settings.meta.graphVersion} onChange={(event) => setSettings((current) => ({ ...current, meta: { ...current.meta, graphVersion: event.target.value } }))} />
                </Field>
              </div>

              <div className="grid two-col">
                <Field label="Meta phone number ID">
                  <input className="input" value={settings.meta.phoneNumberId} onChange={(event) => setSettings((current) => ({ ...current, meta: { ...current.meta, phoneNumberId: event.target.value } }))} />
                </Field>
                <Field label="Meta verify token">
                  <input className="input" value={settings.meta.verifyToken} onChange={(event) => setSettings((current) => ({ ...current, meta: { ...current.meta, verifyToken: event.target.value } }))} />
                </Field>
              </div>

              <div className="grid two-col">
                <Field label="Meta access token">
                  <input className="input" type="password" value={settings.meta.accessToken} onChange={(event) => setSettings((current) => ({ ...current, meta: { ...current.meta, accessToken: event.target.value } }))} />
                </Field>
                <Field label="Meta app secret">
                  <input className="input" type="password" value={settings.meta.appSecret} onChange={(event) => setSettings((current) => ({ ...current, meta: { ...current.meta, appSecret: event.target.value } }))} />
                </Field>
              </div>

              <div className="grid two-col">
                <Field label="Meta send mode">
                  <select className="select" value={settings.meta.sendMode} onChange={(event) => setSettings((current) => ({ ...current, meta: { ...current.meta, sendMode: event.target.value as "text" | "template" } }))}>
                    <option value="text">Text</option>
                    <option value="template">Approved template</option>
                  </select>
                </Field>
                <Field label="Template language">
                  <input className="input" value={settings.meta.templateLanguage} onChange={(event) => setSettings((current) => ({ ...current, meta: { ...current.meta, templateLanguage: event.target.value } }))} />
                </Field>
              </div>

              <Field label="Meta template name">
                <input className="input" value={settings.meta.templateName} onChange={(event) => setSettings((current) => ({ ...current, meta: { ...current.meta, templateName: event.target.value } }))} />
              </Field>

              <button className="btn primary" type="submit">Save app settings</button>
            </form>
          </section>

          <section className="panel">
            <h2>Message table</h2>
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
                {(campaign?.messages ?? []).map((message) => (
                  <tr key={message.id}>
                    <td>{message.contact.name}</td>
                    <td>{message.contact.phone}</td>
                    <td><span className="status">{message.status}</span></td>
                    <td>{message.rsvpToken?.response ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "green" | "red" | "amber" | "neutral" }) {
  return (
    <div className={`card stat-card ${tone}`}>
      <span className="muted">{label}</span>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
