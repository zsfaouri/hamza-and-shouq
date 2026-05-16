import { hydrateStore, persistStore, type Message } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

type RsvpResponse = "YES" | "NO";

function parseResponse(value: unknown): RsvpResponse | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw ?? "").trim().toUpperCase();
  if (normalized === "YES" || normalized === "ATTENDING") return "YES";
  if (normalized === "NO" || normalized === "NOT_ATTENDING" || normalized === "NOT ATTENDING") return "NO";
  return null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function findMessage(messages: Message[], token: string) {
  return messages.find((message) => message.rsvpToken?.token === token) ?? null;
}

async function findRsvpMessage(token: string) {
  const data = await hydrateStore();
  for (const campaign of data.campaigns) {
    const message = findMessage(campaign.messages, token);
    if (message) return { data, campaign, message };
  }
  return { data, campaign: null, message: null };
}

function confirmationPage(name: string, response: RsvpResponse) {
  const label = response === "YES" ? "attending" : "not attending";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RSVP Saved</title><style>body{font-family:Arial,sans-serif;background:#f6f8f5;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:white;padding:32px;border-radius:18px;border:1px solid #dfe7dc;max-width:520px}.status{font-weight:700}</style></head><body><main class="card"><h1>Thank you, ${escapeHtml(name)}.</h1><p>Your response has been recorded as <span class="status">${label}</span>.</p></main></body></html>`;
}

function formPage(name: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RSVP</title><style>body{font-family:Arial,sans-serif;background:#f6f8f5;color:#111;margin:0;display:grid;place-items:center;min-height:100vh}.card{max-width:520px;background:white;border:1px solid #dfe7dc;padding:32px;border-radius:18px;box-shadow:0 20px 70px #0001}.actions{display:flex;gap:12px;margin-top:24px}button{border:0;border-radius:999px;padding:14px 18px;font-weight:700;cursor:pointer}.yes{background:#25d366}.no{background:#eee}</style></head>
<body><main class="card"><p>Hamza and Shouq Wedding</p><h1>Hi ${escapeHtml(name)}, will you attend?</h1><form class="actions" method="post"><button class="yes" name="response" value="YES">Attending</button><button class="no" name="response" value="NO">Not attending</button></form></main></body></html>`;
}

async function record(token: string, response: RsvpResponse) {
  const { message } = await findRsvpMessage(token);
  if (!message?.rsvpToken) return null;
  message.rsvpToken.response = response;
  message.rsvpToken.clickedAt = new Date().toISOString();
  await persistStore();
  return message;
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const requestedResponse = parseResponse(new URL(request.url).searchParams.get("response"));
  if (requestedResponse) {
    const message = await record(token, requestedResponse);
    if (!message) return html("RSVP link not found", 404);
    return html(confirmationPage(message.contact.name, requestedResponse));
  }

  const { message } = await findRsvpMessage(token);
  if (!message) return html("RSVP link not found", 404);
  return html(formPage(message.contact.name));
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const form = await request.formData();
  const response = parseResponse(form.get("response"));
  if (!response) return html("Invalid RSVP response", 400);
  const message = await record(token, response);
  if (!message) return html("RSVP link not found", 404);
  return html(confirmationPage(message.contact.name, response));
}
