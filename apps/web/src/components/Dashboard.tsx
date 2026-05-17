"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import type { AppState, SheetTab, WhatsAppStatus } from "@/lib/types";

type PublicState = AppState;
type StorageStatus = {
  configured: boolean;
  selectOk: boolean;
  writeOk: boolean;
  error: string;
  keyKind?: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data as T;
}

export default function Dashboard() {
  const [state, setState] = useState<PublicState | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set());
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [sendConfirm, setSendConfirm] = useState("");
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatus | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);

  async function refresh() {
    const data = await api<PublicState>("/api/state");
    const active = data.templates.find((template) => template.id === data.activeTemplateId) || data.template;
    setState(data);
    setSheetUrl(data.campaign.sheetUrl || "");
    setTemplateName(active.name);
    setTemplateBody(active.body);
    setMediaUrl(active.mediaUrl || "");
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Load failed."));
  }, []);

  function show(message: string, isError = false) {
    setNotice(isError ? "" : message);
    setError(isError ? message : "");
  }

  async function detectTabs() {
    setBusy("detect");
    setTabs([]);
    setSelectedTabs(new Set());
    try {
      const result = await api<{ tabs: SheetTab[] }>("/api/sheets/detect", {
        method: "POST",
        body: JSON.stringify({ url: sheetUrl }),
      });
      setTabs(result.tabs);
      show(`Detected ${result.tabs.length} tab${result.tabs.length === 1 ? "" : "s"}.`);
    } catch (err) {
      show(err instanceof Error ? err.message : "Tab detection failed.", true);
    } finally {
      setBusy("");
    }
  }

  async function importTabs() {
    setBusy("import");
    try {
      const selected = [...selectedTabs];
      const result = await api<{ imported: number }>("/api/sheets/import", {
        method: "POST",
        body: JSON.stringify({ url: sheetUrl, selectedTabs: selected }),
      });
      await refresh();
      setSelectedMessages(new Set());
      show(`Imported ${result.imported} contacts from ${selected.length} checked tab${selected.length === 1 ? "" : "s"}.`);
    } catch (err) {
      show(err instanceof Error ? err.message : "Import failed.", true);
    } finally {
      setBusy("");
    }
  }

  async function saveTemplate() {
    setBusy("template");
    try {
      await api("/api/template", {
        method: "POST",
        body: JSON.stringify({ templateId: state?.activeTemplateId, name: templateName, body: templateBody, mediaUrl }),
      });
      await refresh();
      show("Template saved and message previews rebuilt.");
    } catch (err) {
      show(err instanceof Error ? err.message : "Template save failed.", true);
    } finally {
      setBusy("");
    }
  }

  async function createTemplate() {
    setBusy("template-create");
    try {
      const name = `Template ${((state?.templates.length || 0) + 1).toString().padStart(2, "0")}`;
      await api("/api/template", {
        method: "POST",
        body: JSON.stringify({ createNew: true, name, body: templateBody || "Hi {{name}}, you are invited.\n\nAttending: {{attending_link}}\nNot attending: {{not_attending_link}}", mediaUrl: "" }),
      });
      await refresh();
      show("Template created.");
    } catch (err) {
      show(err instanceof Error ? err.message : "Template create failed.", true);
    } finally {
      setBusy("");
    }
  }

  async function selectTemplate(templateId: string) {
    setBusy("template-select");
    try {
      await api("/api/template", {
        method: "POST",
        body: JSON.stringify({ templateId, activateOnly: true }),
      });
      await refresh();
      show("Template selected and message previews rebuilt.");
    } catch (err) {
      show(err instanceof Error ? err.message : "Template select failed.", true);
    } finally {
      setBusy("");
    }
  }

  async function uploadMedia(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingMedia(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/media/upload", { method: "POST", body: form });
      const data = await response.json().catch(() => ({})) as { mediaUrl?: string; previewUrl?: string; error?: string };
      if (!response.ok) throw new Error(data.error || `Upload failed: ${response.status}`);
      const nextMediaUrl = data.previewUrl || data.mediaUrl || "";
      await refresh().catch(() => {});
      if (nextMediaUrl) setMediaUrl(nextMediaUrl);
      show("Image uploaded and attached to the template.");
    } catch (err) {
      show(err instanceof Error ? err.message : "Image upload failed.", true);
    } finally {
      setUploadingMedia(false);
    }
  }

  async function checkStorage() {
    setBusy("storage");
    try {
      const result = await api<StorageStatus>("/api/storage/diagnostics");
      setStorageStatus(result);
      show(result.error || `Storage status: read ${result.selectOk ? "ok" : "failed"}, write ${result.writeOk ? "ok" : "failed"}`, !result.selectOk || !result.writeOk);
    } catch (err) {
      show(err instanceof Error ? err.message : "Storage diagnostics failed.", true);
    } finally {
      setBusy("");
    }
  }

  async function saveSettings(form: FormData) {
    setBusy("settings");
    try {
      await api("/api/settings", {
        method: "POST",
        body: JSON.stringify({
          graphVersion: form.get("graphVersion"),
          phoneNumberId: form.get("phoneNumberId"),
          accessToken: form.get("accessToken"),
          verifyToken: form.get("verifyToken"),
          senderPhone: form.get("senderPhone"),
          provider: form.get("provider"),
          personalBridgeUrl: form.get("personalBridgeUrl"),
          personalBridgeToken: form.get("personalBridgeToken"),
        }),
      });
      await refresh();
      show("WhatsApp settings saved.");
    } catch (err) {
      show(err instanceof Error ? err.message : "Settings save failed.", true);
    } finally {
      setBusy("");
    }
  }

  async function submitSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveSettings(new FormData(event.currentTarget));
  }

  async function sendSelected() {
    setBusy("send");
    try {
      const result = await api<{ sent: number; failed: number }>("/api/campaign/send", {
        method: "POST",
        body: JSON.stringify({ messageIds: [...selectedMessages], confirmText: sendConfirm }),
      });
      await refresh();
      setSelectedMessages(new Set());
      setSendConfirm("");
      show(`Send finished. Sent ${result.sent}. Failed ${result.failed}.`);
    } catch (err) {
      show(err instanceof Error ? err.message : "Send failed.", true);
    } finally {
      setBusy("");
    }
  }

  async function checkWhatsAppStatus() {
    setBusy("wa-status");
    try {
      const result = await api<WhatsAppStatus>("/api/whatsapp/status");
      setWhatsAppStatus(result);
      show(result.error || `WhatsApp status: ${result.state}`);
    } catch (err) {
      show(err instanceof Error ? err.message : "WhatsApp status failed.", true);
    } finally {
      setBusy("");
    }
  }

  async function startPersonalWhatsApp() {
    setBusy("wa-start");
    try {
      const result = await api<WhatsAppStatus>("/api/whatsapp/start", { method: "POST", body: JSON.stringify({}) });
      setWhatsAppStatus(result);
      show(result.qrDataUrl || result.qr ? "QR session started. Scan the code." : `WhatsApp status: ${result.state}`);
    } catch (err) {
      show(err instanceof Error ? err.message : "WhatsApp start failed.", true);
    } finally {
      setBusy("");
    }
  }

  const stats = useMemo(() => {
    const messages = state?.campaign.messages || [];
    const contacts = state?.campaign.contacts.length || 0;
    const yes = messages.filter((message) => message.rsvp === "YES").length;
    const no = messages.filter((message) => message.rsvp === "NO").length;
    return {
      contacts,
      ready: messages.filter((message) => message.status === "READY").length,
      sent: messages.filter((message) => message.status === "SENT").length,
      yes,
      no,
      pending: Math.max(contacts - yes - no, 0),
    };
  }, [state]);

  const templatePreview = useMemo(() => {
    const contact = state?.campaign.contacts[0] || {
      id: "preview-contact",
      name: "Guest name",
      phone: "962795941263",
      sourceTab: "Preview",
      fields: {},
    };
    const token = state?.campaign.messages.find((message) => message.contactId === contact.id)?.token || "preview";
    const base = typeof window === "undefined" ? "" : `${window.location.origin}/rsvp/${encodeURIComponent(token)}`;
    const values: Record<string, string> = {
      name: contact.name,
      phone: contact.phone,
      source_tab: contact.sourceTab,
      attending_link: `${base}?response=YES`,
      not_attending_link: `${base}?response=NO`,
      rsvp_link: base,
    };
    const rendered = templateBody.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
      return values[key] || contact.fields[key] || "";
    });
    if (/\{\{\s*(attending_link|not_attending_link|rsvp_link)\s*\}\}/i.test(templateBody)) return rendered;
    return `${rendered.trimEnd()}\n\nAttending: ${values.attending_link}\nNot attending: ${values.not_attending_link}`;
  }, [state?.campaign.contacts, state?.campaign.messages, templateBody]);

  if (!state) {
    return (
      <main className="login-page">
        <p className={`notice ${error ? "error" : ""}`}>{error || "Loading..."}</p>
      </main>
    );
  }
  const activeTemplateId = state.activeTemplateId || state.template.id;
  const responseRate = stats.contacts ? Math.round(((stats.yes + stats.no) / stats.contacts) * 100) : 0;
  const capacityTotal = Math.max(stats.contacts, 250);
  const capacityOffset = 263.8 - (Math.min(stats.contacts / capacityTotal, 1) * 263.8);
  const firstContact = state.campaign.contacts[0];
  const previewMedia = mediaUrl || state.templates.find((template) => template.id === activeTemplateId)?.mediaUrl || "";
  const storageReady = Boolean(storageStatus?.selectOk && storageStatus?.writeOk);
  const storageLabel = storageStatus
    ? storageReady
      ? storageStatus.keyKind === "local-file"
        ? "Local file ready"
        : "Persistent storage ready"
      : "Storage action required"
    : process.env.NODE_ENV === "development"
      ? "Run storage check"
      : "Verify persistence";
  const whatsappLabel = whatsAppStatus
    ? whatsAppStatus.error
      ? "Needs attention"
      : whatsAppStatus.state
    : state.whatsapp.provider === "personal" && !state.whatsapp.personalBridgeUrl
      ? "Local QR mode"
      : state.whatsapp.provider === "personal"
        ? "Bridge mode"
        : "Cloud API";

  return (
    <main className="app-shell elysian-shell">
      <header className="topbar">
        <div className="brand brand-row">
          <button className="icon-btn" type="button" aria-label="Open navigation">=</button>
          <h1>HAMZA & SHOUQ</h1>
        </div>
        <div className="topbar-actions">
          <span className="topbar-chip">{storageLabel}</span>
          <span className="topbar-chip">{whatsappLabel}</span>
          <img className="avatar" src="/logo.png" alt="Hamza and Shouq" />
          <button className="btn" onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.href = "/login"; })}>Logout</button>
        </div>
      </header>

      <div className="content">
        <section className="status-rail">
          <div className="dashboard-intro">
            <h2>RSVP Overview</h2>
            <p>Live operations for Hamza and Shouq</p>
          </div>
          <div className="stat primary-stat"><span>Confirmed</span><strong>{stats.yes}</strong><small>accepted</small></div>
          <div className="stat"><span>Pending</span><strong>{stats.pending}</strong><small>{stats.ready} ready</small></div>
          <div className="stat"><span>Declined</span><strong>{stats.no}</strong><small>not attending</small></div>
          <div className="stat accent-stat"><span>Response Rate</span><strong>{responseRate}%</strong><small>{stats.sent} sent</small></div>
          <div className="capacity-card">
            <p>Total Guest Capacity</p>
            <div className="capacity-ring">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle className="ring-bg" cx="50" cy="50" r="42" />
                <circle className="ring-fg" cx="50" cy="50" r="42" strokeDasharray="263.8" strokeDashoffset={capacityOffset} />
              </svg>
              <div>
                <strong>{stats.contacts}</strong>
                <span>/ {capacityTotal} Guests</span>
              </div>
            </div>
          </div>
          {(notice || error) ? <p className={`notice ${error ? "error" : "ok"}`}>{error || notice}</p> : null}
        </section>

        <section className="workspace">
          <div className="panel panel-sheets">
            <div className="section-heading">
              <div>
                <span className="step-line" />
                <h2>Import Guests</h2>
                <p>Select the spreadsheet containing your wedding guest list to begin syncing.</p>
              </div>
            </div>
            <div className="connected-account">
              <span className="sheet-icon">GS</span>
              <div>
                <small>Connected account</small>
                <strong>Google Sheets</strong>
              </div>
              <span className="checkmark">OK</span>
            </div>
            <div className="field">
              <label>Sheet URL</label>
              <input className="input" value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
            </div>
            <div className="row">
              <button className="btn primary" disabled={busy === "detect"} onClick={detectTabs}>{busy === "detect" ? "Detecting..." : "Detect Tabs"}</button>
              <button className="btn" disabled={!selectedTabs.size || busy === "import"} onClick={importTabs}>{busy === "import" ? "Importing..." : "Import Checked Tabs"}</button>
            </div>
            {tabs.length ? (
              <div className="tabs">
                {tabs.map((tab) => (
                  <label className="tab" key={tab.name}>
                    <input
                      type="checkbox"
                      checked={selectedTabs.has(tab.name)}
                      onChange={(event) => {
                        const next = new Set(selectedTabs);
                        if (event.target.checked) next.add(tab.name);
                        else next.delete(tab.name);
                        setSelectedTabs(next);
                      }}
                    />
                    <span>
                      <b>{tab.name}</b>
                      <small>{tab.rowCount} rows, {tab.contactCount} contacts</small>
                    </span>
                    <span className="pill">{tab.preview[0]?.name || "No preview"}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="import-examples" aria-label="Stitch guest import preview">
                <div className="sheet-card active">
                  <span className="doc-icon">SH</span>
                  <div><b>Hamza</b><small>142 contacts</small></div>
                  <span className="pill yes">Ready to sync</span>
                </div>
                <div className="sheet-card">
                  <span className="doc-icon">SH</span>
                  <div><b>Shouq</b><small>88 contacts</small></div>
                  <span className="pill">Archived</span>
                </div>
              </div>
            )}
          </div>

          <div className="panel panel-template">
            <div className="section-heading">
              <div>
                <h2>Template Builder</h2>
                <p>Compose the invitation and preview its WhatsApp appearance.</p>
              </div>
            </div>
            <div className="template-switcher">
              <div className="field">
                <label>Saved templates</label>
                <select className="input" value={activeTemplateId} disabled={busy === "template-select"} onChange={(event) => { void selectTemplate(event.target.value); }}>
                  {state.templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </div>
              <button className="btn" disabled={busy === "template-create"} onClick={createTemplate}>{busy === "template-create" ? "Creating..." : "New Template"}</button>
            </div>
            <div className="template-list">
              {state.templates.map((template) => (
                <button
                  key={template.id}
                  className={`template-chip ${template.id === activeTemplateId ? "active" : ""}`}
                  disabled={busy === "template-select"}
                  onClick={() => { void selectTemplate(template.id); }}
                >
                  <span>{template.name}</span>
                  {template.mediaUrl ? <small>image</small> : <small>text</small>}
                </button>
              ))}
            </div>
            <div className="field">
              <label>Template name</label>
              <input className="input" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Wedding invitation" />
            </div>
            <div className="field">
              <label>Body</label>
              <textarea className="textarea" value={templateBody} onChange={(event) => setTemplateBody(event.target.value)} />
            </div>
            <div className="variable-row" aria-label="Template variables">
              <button className="variable-pill" type="button" onClick={() => setTemplateBody(`${templateBody} {{name}}`)}>+ Guest Name</button>
              <button className="variable-pill" type="button" onClick={() => setTemplateBody(`${templateBody} {{attending_link}}`)}>+ RSVP</button>
              <button className="variable-pill" type="button" onClick={() => setTemplateBody(`${templateBody} {{source_tab}}`)}>+ Source</button>
            </div>
            <div className="field">
              <label>Image</label>
              <input className="input" type="file" accept="image/*" disabled={uploadingMedia} onChange={uploadMedia} />
              {uploadingMedia ? <small className="muted">Uploading image...</small> : null}
            </div>
            <div className="field">
              <label>Media URL</label>
              <input className="input" value={mediaUrl || ""} onChange={(event) => setMediaUrl(event.target.value)} placeholder="Optional public image URL" />
            </div>
            {mediaUrl ? (
              <div className="media-preview">
                <img src={mediaUrl} alt="Template media preview" />
              </div>
            ) : null}
            <div className="template-preview">
              <b>Live Appearance</b>
              <div className="phone-preview">
                <div className="phone-top"><span>HS</span><strong>Hamza and Shouq</strong></div>
                <div className="phone-body">
                  <div className="whatsapp-bubble">
                    {previewMedia ? <img src={previewMedia} alt="Template media preview" /> : null}
                    <p>{templatePreview}</p>
                    <small>{firstContact?.name || "Guest"} - WhatsApp preview</small>
                  </div>
                </div>
              </div>
            </div>
            <div className="row">
              <button className="btn primary" disabled={busy === "template"} onClick={saveTemplate}>{busy === "template" ? "Saving..." : "Save Template"}</button>
              <button className="btn" disabled={busy === "storage"} onClick={checkStorage}>{busy === "storage" ? "Checking..." : "Check Storage"}</button>
            </div>
            {storageStatus ? (
              <div className={`status-card ${storageReady ? "ok" : "error"}`}>
                <span className="status-mark">{storageReady ? "OK" : "!"}</span>
                <div>
                  <b>{storageLabel}</b>
                  <p>
                    {storageStatus.configured ? "Configured" : "Missing config"} - read {storageStatus.selectOk ? "ok" : "failed"} - write {storageStatus.writeOk ? "ok" : "failed"}
                    {storageStatus.error ? `\n${storageStatus.error}` : ""}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <form className="panel panel-whatsapp" onSubmit={submitSettings}>
            <div className="section-heading">
              <div>
                <h2>WhatsApp</h2>
                <p>Provider settings, bridge checks, and QR startup controls.</p>
              </div>
              <span className={`pill ${whatsAppStatus?.error ? "warn" : whatsAppStatus?.configured ? "yes" : ""}`}>{whatsappLabel}</span>
            </div>
            <div className="field">
              <label>Provider</label>
              <select className="input" name="provider" defaultValue={state.whatsapp.provider}>
                <option value="personal">Personal WhatsApp</option>
                <option value="meta">Meta WhatsApp Cloud API</option>
              </select>
            </div>
            <div className="field"><label>Sender phone</label><input className="input" name="senderPhone" defaultValue={state.whatsapp.senderPhone || ""} /></div>
            <div className="field"><label>Personal bridge URL</label><input className="input" name="personalBridgeUrl" defaultValue={state.whatsapp.personalBridgeUrl || ""} placeholder="Optional persistent bridge URL" /></div>
            <div className="field"><label>Personal bridge token</label><input className="input" name="personalBridgeToken" placeholder={state.whatsapp.personalBridgeToken === "SET" ? "Token is saved" : "Optional bridge token"} /></div>
            <div className="field"><label>Graph version</label><input className="input" name="graphVersion" defaultValue={state.whatsapp.graphVersion || "v23.0"} /></div>
            <div className="field"><label>Phone number ID</label><input className="input" name="phoneNumberId" defaultValue={state.whatsapp.phoneNumberId || ""} /></div>
            <div className="field"><label>Access token</label><input className="input" name="accessToken" placeholder={state.whatsapp.accessToken === "SET" ? "Token is saved" : "Paste Meta token"} /></div>
            <div className="field"><label>Webhook verify token</label><input className="input" name="verifyToken" defaultValue={state.whatsapp.verifyToken || ""} /></div>
            <div className="row">
              <button className="btn primary" disabled={busy === "settings"}>{busy === "settings" ? "Saving..." : "Save WhatsApp Settings"}</button>
              <button className="btn" type="button" disabled={busy === "wa-status"} onClick={checkWhatsAppStatus}>{busy === "wa-status" ? "Checking..." : "Check Status"}</button>
              <button className="btn" type="button" disabled={busy === "wa-start" || state.whatsapp.provider !== "personal"} onClick={startPersonalWhatsApp}>{busy === "wa-start" ? "Starting..." : "Start Personal QR"}</button>
            </div>
            {whatsAppStatus ? (
              <div className={`status-card ${whatsAppStatus.error ? "error" : "ok"}`} style={{ marginTop: 12 }}>
                <span className="status-mark">{whatsAppStatus.error ? "!" : "OK"}</span>
                <div>
                  <b>{whatsAppStatus.provider} - {whatsAppStatus.mode} - {whatsAppStatus.state}</b>
                  <p>{whatsAppStatus.accountPhone ? `+${whatsAppStatus.accountPhone}` : "No sender account detected."}{whatsAppStatus.error ? `\n${whatsAppStatus.error}` : ""}</p>
                  {whatsAppStatus.qrDataUrl ? <img src={whatsAppStatus.qrDataUrl} alt="WhatsApp QR" style={{ display: "block", width: 220, height: 220, marginTop: 12 }} /> : null}
                </div>
              </div>
            ) : null}
          </form>

          <div className="panel panel-budget">
            <div className="section-heading compact">
              <div>
                <h2>Budget Tracker</h2>
                <p>Premium planning summary from the Stitch budget screen.</p>
              </div>
              <span className="pill yes">71% spent</span>
            </div>
            <div className="budget-hero">
              <span>Total Budget</span>
              <strong>$85,000.00</strong>
              <small>Remaining $24,350.12</small>
              <div className="budget-progress"><span /></div>
            </div>
            <div className="budget-grid">
              <div className="donut" aria-label="Budget distribution">
                <span>Total<br /><b>32 Items</b></span>
              </div>
              <div className="legend">
                <p><i className="dot blue" />Venue (45%)</p>
                <p><i className="dot slate" />Catering (25%)</p>
                <p><i className="dot gray" />Florist (15%)</p>
              </div>
            </div>
          </div>

          <div className="panel panel-send">
            <div className="section-heading compact">
              <div>
                <h2>Send Control</h2>
                <p>Checked rows only. Confirmation stays explicit.</p>
              </div>
            </div>
            <p className="notice">Sending requires checked rows and exact confirmation text: SEND SELECTED</p>
            <div className="row">
              <input className="input" style={{ maxWidth: 260 }} value={sendConfirm} onChange={(event) => setSendConfirm(event.target.value)} placeholder="SEND SELECTED" />
              <button className="btn danger" disabled={!selectedMessages.size || sendConfirm !== "SEND SELECTED" || busy === "send"} onClick={sendSelected}>
                {busy === "send" ? "Sending..." : `Send ${selectedMessages.size} Selected`}
              </button>
            </div>
          </div>

          <div className="panel panel-messages">
            <div className="section-heading compact">
              <div>
                <h2>Messages</h2>
                <p>{state.campaign.messages.length} prepared rows in this campaign.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Tab</th>
                    <th>Status</th>
                    <th>RSVP</th>
                    <th>Message preview</th>
                  </tr>
                </thead>
                <tbody>
                  {state.campaign.messages.map((message) => {
                    const contact = state.campaign.contacts.find((item) => item.id === message.contactId);
                    return (
                      <tr key={message.id}>
                        <td>
                          <input
                            type="checkbox"
                            disabled={message.status === "SENT"}
                            checked={selectedMessages.has(message.id)}
                            onChange={(event) => {
                              const next = new Set(selectedMessages);
                              if (event.target.checked) next.add(message.id);
                              else next.delete(message.id);
                              setSelectedMessages(next);
                            }}
                          />
                        </td>
                        <td>{contact?.name || ""}</td>
                        <td>{contact?.phone || ""}</td>
                        <td>{contact?.sourceTab || ""}</td>
                        <td><span className={`pill ${message.status === "FAILED" ? "warn" : ""}`}>{message.status}</span></td>
                        <td><span className={`pill ${message.rsvp === "YES" ? "yes" : message.rsvp === "NO" ? "no" : ""}`}>{message.rsvp || "Pending"}</span></td>
                        <td>{message.body.slice(0, 180)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
