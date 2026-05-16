"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode, type RefObject } from "react";
import { apiPost } from "@/lib/api";

type TemplateKind = "wedding_invitation" | "rsvp_reminder" | "location_reminder" | "thank_you" | "custom";
type LanguageMode = "english_only" | "arabic_only" | "bilingual";
type GuestNameMode = "auto" | "manual" | "none";
type AttendeesCountMode = "auto" | "manual" | "guest_rsvp" | "none";

export type TemplateDraft = {
  name: string;
  type: TemplateKind;
  languageMode: LanguageMode;
  bodyEn: string;
  bodyAr: string;
  guestNameMode: GuestNameMode;
  manualGuestName: string;
  attendeesCountMode: AttendeesCountMode;
  manualAttendeesCount: string;
  includeRsvpLink: boolean;
  includeLocationLink: boolean;
  includeMedia: boolean;
  locationLink: string;
  hostNames: string;
  weddingDate: string;
  venue: string;
  mediaUrl: string;
  mediaType: string;
  variablesUsed: string[];
};

type Template = Record<string, unknown> & { id?: string };
type Campaign = { template?: Template | null };
type CDetail = Campaign & { contacts: Array<{ name: string; phone: string }> };

type TemplateBuilderProps = {
  campaign: CDetail | null;
  templates: Template[];
  loading: string | null;
  onSave: (data: TemplateDraft) => Promise<void>;
  onUpdate: (data: TemplateDraft) => Promise<void>;
  notify: (msg: string, err?: boolean) => void;
};

const VARIABLES = [
  { label: "Guest Name", key: "guest_name" },
  { label: "Attendees", key: "attendees_count" },
  { label: "Date", key: "wedding_date" },
  { label: "Venue", key: "venue" },
  { label: "RSVP Link", key: "rsvp_link" },
  { label: "Attending Link", key: "rsvp_yes_link" },
  { label: "Not Attending Link", key: "rsvp_no_link" },
  { label: "Location", key: "location_link" },
  { label: "Host Names", key: "host_names" },
];

const typeOptions: Array<{ label: string; value: TemplateKind }> = [
  { label: "Wedding Invitation", value: "wedding_invitation" },
  { label: "RSVP Reminder", value: "rsvp_reminder" },
  { label: "Location Reminder", value: "location_reminder" },
  { label: "Thank You", value: "thank_you" },
  { label: "Custom", value: "custom" },
];

const emptyDraft: TemplateDraft = {
  name: "Wedding Invite EN",
  type: "wedding_invitation",
  languageMode: "english_only",
  bodyEn: "Hi {{guest_name}}, you're invited to Hamza and Shouq's wedding on {{wedding_date}} at {{venue}}.\n\nAttending: {{rsvp_yes_link}}\nNot attending: {{rsvp_no_link}}",
  bodyAr: "",
  guestNameMode: "auto",
  manualGuestName: "",
  attendeesCountMode: "none",
  manualAttendeesCount: "",
  includeRsvpLink: true,
  includeLocationLink: false,
  includeMedia: false,
  locationLink: "",
  hostNames: "Hamza & Shouq",
  weddingDate: "Saturday, 25 July 2026",
  venue: "Four Seasons Amman",
  mediaUrl: "",
  mediaType: "",
  variablesUsed: ["guest_name", "wedding_date", "venue", "rsvp_yes_link", "rsvp_no_link"],
};

function str(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function draftFromTemplate(template?: Template | null): TemplateDraft {
  if (!template) return emptyDraft;
  return {
    ...emptyDraft,
    name: str(template.name, emptyDraft.name),
    type: str(template.type, emptyDraft.type) as TemplateKind,
    languageMode: str(template.languageMode, emptyDraft.languageMode) as LanguageMode,
    bodyEn: str(template.bodyEn, emptyDraft.bodyEn),
    bodyAr: str(template.bodyAr),
    guestNameMode: str(template.guestNameMode, "auto") as GuestNameMode,
    manualGuestName: str(template.manualGuestName),
    attendeesCountMode: str(template.attendeesCountMode, "none") as AttendeesCountMode,
    manualAttendeesCount: str(template.manualAttendeesCount),
    includeRsvpLink: bool(template.includeRsvpLink, true),
    includeLocationLink: bool(template.includeLocationLink),
    includeMedia: bool(template.includeMedia, Boolean(template.mediaUrl)),
    locationLink: str(template.locationLink),
    hostNames: str(template.hostNames),
    weddingDate: str(template.weddingDate),
    venue: str(template.venue),
    mediaUrl: str(template.mediaUrl),
    mediaType: str(template.mediaType),
    variablesUsed: Array.isArray(template.variablesUsed) ? template.variablesUsed.map(String) : [],
  };
}

function insertVariable(
  fieldRef: RefObject<HTMLTextAreaElement | null>,
  setter: (fn: (prev: string) => string) => void,
  variable: string,
) {
  const el = fieldRef.current;
  if (!el) {
    setter((prev) => `${prev}{{${variable}}}`);
    return;
  }
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const token = `{{${variable}}}`;
  const next = el.value.slice(0, start) + token + el.value.slice(end);
  setter(() => next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + token.length, start + token.length);
  });
}

function buildPreviewMessage(draft: TemplateDraft) {
  const sampleVars: Record<string, string> = {
    guest_name: draft.guestNameMode === "manual" ? (draft.manualGuestName || "Ahmad") : draft.guestNameMode === "none" ? "" : "Ahmad",
    attendees_count: draft.attendeesCountMode === "manual" ? (draft.manualAttendeesCount || "2") : "2",
    wedding_date: draft.weddingDate || "Saturday, 25 July 2026",
    venue: draft.venue || "Four Seasons Amman",
    rsvp_link: draft.includeRsvpLink ? "rsvp.example.com/a1b2" : "",
    rsvp_yes_link: draft.includeRsvpLink ? "rsvp.example.com/a1b2?response=YES" : "",
    rsvp_no_link: draft.includeRsvpLink ? "rsvp.example.com/a1b2?response=NO" : "",
    attending_link: draft.includeRsvpLink ? "rsvp.example.com/a1b2?response=YES" : "",
    not_attending_link: draft.includeRsvpLink ? "rsvp.example.com/a1b2?response=NO" : "",
    location_link: draft.includeLocationLink ? (draft.locationLink || "maps.google.com/...") : "",
    host_names: draft.hostNames || "Hamza & Shouq",
    name: draft.guestNameMode === "none" ? "" : "Ahmad",
    date: draft.weddingDate || "Saturday, 25 July 2026",
  };
  const replace = (body: string) => body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => sampleVars[key] ?? `{{${key}}}`);
  return { en: replace(draft.bodyEn), ar: replace(draft.bodyAr) };
}

function usedVariables(draft: TemplateDraft) {
  const matches = `${draft.bodyEn} ${draft.bodyAr}`.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g);
  return [...new Set([...matches].map((match) => match[1]))];
}

export function TemplateBuilder({ campaign, templates, loading, onSave, onUpdate, notify }: TemplateBuilderProps) {
  const [draft, setDraft] = useState<TemplateDraft>(() => draftFromTemplate(campaign?.template ?? templates[0]));
  const enRef = useRef<HTMLTextAreaElement | null>(null);
  const arRef = useRef<HTMLTextAreaElement | null>(null);
  const preview = useMemo(() => buildPreviewMessage(draft), [draft]);
  const editing = Boolean(campaign?.template);

  const templateKey = campaign?.template?.id ?? templates[0]?.id ?? "new";
  useEffect(() => {
    setDraft(draftFromTemplate(campaign?.template ?? templates[0]));
    // Reset draft only when the selected template changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey]);

  function update<K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setBody(field: "bodyEn" | "bodyAr", fn: (prev: string) => string) {
    setDraft((current) => ({ ...current, [field]: fn(current[field]) }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = { ...draft, variablesUsed: usedVariables(draft), bodyAr: draft.bodyAr || "" };
    try {
      if (editing) await onUpdate(payload);
      else await onSave(payload);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Template save failed.", true);
    }
  }

  async function onMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const media = await apiPost<{ url: string; type: string }>("/api/media", form);
      update("includeMedia", true);
      update("mediaUrl", media.url);
      update("mediaType", media.type || file.type || "file");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Media upload failed.", true);
    }
  }

  return (
    <div className="two tb-layout">
      <form className="card tb-editor" onSubmit={submit}>
        <div className="card-head">
          <span className="card-title">Template Builder</span>
          <span className="badge b-x">{editing ? "Editing" : "New"}</span>
        </div>
        <div className="card-body">
          <Section label="Template Info">
            <Field label="Template name"><input className="input" value={draft.name} required onChange={(e) => update("name", e.target.value)} /></Field>
            <ToggleGroup options={typeOptions} value={draft.type} onChange={(value) => update("type", value as TemplateKind)} />
            <ToggleGroup options={[{ label: "English only", value: "english_only" }, { label: "Arabic only", value: "arabic_only" }, { label: "English + Arabic", value: "bilingual" }]} value={draft.languageMode} onChange={(value) => update("languageMode", value as LanguageMode)} />
          </Section>

          <Section label="Personalization">
            <Field label="Guest name">
              <ToggleGroup options={[{ label: "From contact list", value: "auto" }, { label: "Type manually", value: "manual" }, { label: "No name", value: "none" }]} value={draft.guestNameMode} onChange={(value) => update("guestNameMode", value as GuestNameMode)} />
            </Field>
            {draft.guestNameMode === "manual" && <Field label="Guest name"><input className="input" value={draft.manualGuestName} onChange={(e) => update("manualGuestName", e.target.value)} /></Field>}
            <Field label="Number of attendees">
              <ToggleGroup options={[{ label: "From contact list", value: "auto" }, { label: "Enter manually", value: "manual" }, { label: "Guest enters at RSVP", value: "guest_rsvp" }, { label: "Not included", value: "none" }]} value={draft.attendeesCountMode} onChange={(value) => update("attendeesCountMode", value as AttendeesCountMode)} />
            </Field>
            {draft.attendeesCountMode === "manual" && <Field label="Attendees count"><input className="input" type="number" value={draft.manualAttendeesCount} onChange={(e) => update("manualAttendeesCount", e.target.value)} /></Field>}
            <Field label="Wedding date"><input className="input" value={draft.weddingDate} onChange={(e) => update("weddingDate", e.target.value)} /></Field>
            <Field label="Venue name"><input className="input" value={draft.venue} onChange={(e) => update("venue", e.target.value)} /></Field>
            <Field label="Host names"><input className="input" value={draft.hostNames} onChange={(e) => update("hostNames", e.target.value)} /></Field>
            {draft.includeLocationLink && <Field label="Location link"><input className="input" value={draft.locationLink} onChange={(e) => update("locationLink", e.target.value)} /></Field>}
          </Section>

          {draft.languageMode !== "arabic_only" && (
            <Section label="English Message">
              <VariableChips onInsert={(key) => insertVariable(enRef, (fn) => setBody("bodyEn", fn), key)} />
              <textarea ref={enRef} className="tb-body" value={draft.bodyEn} onChange={(e) => update("bodyEn", e.target.value)} />
              <p className="tb-helper">Variables will be replaced with real values before sending.</p>
            </Section>
          )}

          {draft.languageMode !== "english_only" && (
            <Section label="Arabic Message">
              <VariableChips onInsert={(key) => insertVariable(arRef, (fn) => setBody("bodyAr", fn), key)} />
              <textarea ref={arRef} dir="rtl" className="tb-body rtl" placeholder="اكتب رسالتك هنا..." value={draft.bodyAr} onChange={(e) => update("bodyAr", e.target.value)} />
            </Section>
          )}

          <Section label="Options">
            <SwitchRow label="Include RSVP link" sub="Adds the RSVP URL variable when messages are prepared." checked={draft.includeRsvpLink} onChange={(checked) => update("includeRsvpLink", checked)} />
            <SwitchRow label="Include location link" sub="Enables a map link variable." checked={draft.includeLocationLink} onChange={(checked) => update("includeLocationLink", checked)} />
            <SwitchRow label="Attach media" sub="Image, video, or PDF attachment." checked={draft.includeMedia} onChange={(checked) => update("includeMedia", checked)} />
            {draft.includeMedia && (
              <Field label="Media file">
                <input className="input" type="file" accept="image/*,video/*,.pdf" onChange={onMedia} />
                {draft.mediaUrl && <span className="badge b-g">Media attached</span>}
              </Field>
            )}
          </Section>

          <button className="btn btn-p btn-w" type="submit" disabled={loading === "tmpl"}>{loading === "tmpl" ? "Saving..." : editing ? "Update Template" : "Save Template"}</button>
        </div>
      </form>

      <aside className="card tb-preview-card">
        <div className="card-head">
          <div>
            <span className="card-title">Live Preview</span>
            <div className="card-hint">Updates as you type</div>
          </div>
        </div>
        <div className="card-body">
          <div className="wa-phone">
            <div className="wa-screen">
              <div className="wa-header"><div className="wa-header-avatar">HS</div><div><div className="wa-header-name">Hamza &amp; Shouq</div><div className="wa-header-status">online</div></div></div>
              <div className="wa-body">
                {draft.languageMode !== "arabic_only" && <Bubble text={preview.en} />}
                {draft.languageMode !== "english_only" && <Bubble text={preview.ar || "اكتب رسالتك هنا..."} ar />}
              </div>
              <div className="wa-footer"><div className="wa-footer-input">Message</div></div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return <section className="tb-section"><div className="tb-section-label">{label}</div>{children}</section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span className="lbl">{label}</span>{children}</label>;
}

function ToggleGroup({ options, value, onChange }: { options: Array<{ label: string; value: string }>; value: string; onChange: (value: string) => void }) {
  return <div className="tb-toggle-group">{options.map((option) => <button key={option.value} type="button" className={`tb-toggle${value === option.value ? " active" : ""}`} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

function VariableChips({ onInsert }: { onInsert: (key: string) => void }) {
  return <div className="tb-chips">{VARIABLES.map((item) => <button key={item.key} type="button" className="tb-chip" onClick={() => onInsert(item.key)}>+ {item.label}</button>)}</div>;
}

function SwitchRow({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="tb-switch-row"><div><div className="tb-switch-label">{label}</div><div className="tb-switch-sub">{sub}</div></div><input className="tb-switch" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /></div>;
}

function Bubble({ text, ar }: { text: string; ar?: boolean }) {
  const parts = text.split(/(\{\{[\w.]+\}\})/g);
  return <div className={`wa-bubble${ar ? " wa-bubble-ar" : ""}`}><div className="wa-bubble-text">{parts.map((part, i) => part.startsWith("{{") ? <span key={i} className="wa-token">{part}</span> : <span key={i}>{part}</span>)}</div><div className="wa-bubble-time">12:00</div></div>;
}
