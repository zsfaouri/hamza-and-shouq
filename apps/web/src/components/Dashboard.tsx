"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppState, SheetTab } from "@/lib/types";

type PublicState = AppState;

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
  const [templateBody, setTemplateBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [sendConfirm, setSendConfirm] = useState("");
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());

  async function refresh() {
    const data = await api<PublicState>("/api/state");
    setState(data);
    setSheetUrl(data.campaign.sheetUrl);
    setTemplateBody(data.template.body);
    setMediaUrl(data.template.mediaUrl);
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
        body: JSON.stringify({ body: templateBody, mediaUrl }),
      });
      await refresh();
      show("Template saved and message previews rebuilt.");
    } catch (err) {
      show(err instanceof Error ? err.message : "Template save failed.", true);
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

  const stats = useMemo(() => {
    const messages = state?.campaign.messages || [];
    return {
      contacts: state?.campaign.contacts.length || 0,
      ready: messages.filter((message) => message.status === "READY").length,
      sent: messages.filter((message) => message.status === "SENT").length,
      yes: messages.filter((message) => message.rsvp === "YES").length,
      no: messages.filter((message) => message.rsvp === "NO").length,
    };
  }, [state]);

  if (!state) return <main className="login-page"><p className="notice">Loading...</p></main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Hamza and Shouq</h1>
          <span>Google Sheets to WhatsApp RSVP system</span>
        </div>
        <button className="btn" onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.href = "/login"; })}>Logout</button>
      </header>

      <div className="content">
        <section className="stack">
          <div className="panel">
            <h2>Google Sheets</h2>
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
            ) : null}
          </div>

          <div className="panel">
            <h2>Message Template</h2>
            <div className="field">
              <label>Body</label>
              <textarea className="textarea" value={templateBody} onChange={(event) => setTemplateBody(event.target.value)} />
            </div>
            <div className="field">
              <label>Media URL</label>
              <input className="input" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="Optional public image URL" />
            </div>
            <button className="btn primary" disabled={busy === "template"} onClick={saveTemplate}>{busy === "template" ? "Saving..." : "Save Template"}</button>
          </div>

          <form className="panel" onSubmit={submitSettings}>
            <h2>WhatsApp Business</h2>
            <div className="field"><label>Sender phone</label><input className="input" name="senderPhone" defaultValue={state.whatsapp.senderPhone} /></div>
            <div className="field"><label>Graph version</label><input className="input" name="graphVersion" defaultValue={state.whatsapp.graphVersion} /></div>
            <div className="field"><label>Phone number ID</label><input className="input" name="phoneNumberId" defaultValue={state.whatsapp.phoneNumberId} /></div>
            <div className="field"><label>Access token</label><input className="input" name="accessToken" placeholder={state.whatsapp.accessToken === "SET" ? "Token is saved" : "Paste Meta token"} /></div>
            <div className="field"><label>Webhook verify token</label><input className="input" name="verifyToken" defaultValue={state.whatsapp.verifyToken} /></div>
            <button className="btn primary" disabled={busy === "settings"}>{busy === "settings" ? "Saving..." : "Save WhatsApp Settings"}</button>
          </form>
        </section>

        <section className="stack">
          {(notice || error) ? <p className={`notice ${error ? "error" : "ok"}`}>{error || notice}</p> : null}

          <div className="stats">
            <div className="stat"><span>Contacts</span><strong>{stats.contacts}</strong></div>
            <div className="stat"><span>Ready</span><strong>{stats.ready}</strong></div>
            <div className="stat"><span>Sent</span><strong>{stats.sent}</strong></div>
            <div className="stat"><span>RSVP yes/no</span><strong>{stats.yes}/{stats.no}</strong></div>
          </div>

          <div className="panel">
            <h2>Send Control</h2>
            <p className="notice">Sending requires checked rows and exact confirmation text: SEND SELECTED</p>
            <div className="row">
              <input className="input" style={{ maxWidth: 260 }} value={sendConfirm} onChange={(event) => setSendConfirm(event.target.value)} placeholder="SEND SELECTED" />
              <button className="btn danger" disabled={!selectedMessages.size || sendConfirm !== "SEND SELECTED" || busy === "send"} onClick={sendSelected}>
                {busy === "send" ? "Sending..." : `Send ${selectedMessages.size} Selected`}
              </button>
            </div>
          </div>

          <div className="panel">
            <h2>Messages</h2>
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
