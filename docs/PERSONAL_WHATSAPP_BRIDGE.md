# Personal WhatsApp Bridge

Vercel cannot run a QR-based WhatsApp session. Personal WhatsApp needs a persistent Node process.

This repo includes that process:

```text
apps/bridge
```

## Local Run

```powershell
Copy-Item apps\bridge\.env.example apps\bridge\.env
pnpm.cmd install
pnpm.cmd dev:bridge
```

Bridge URL:

```text
http://localhost:4200
```

Dashboard settings:

```text
Provider: Personal WhatsApp
Personal bridge URL: http://localhost:4200
```

Click `Check Status`, then `Start Personal QR`.

## Production Run

Deploy `apps/bridge` to a persistent host. The included `render.yaml` uses a Docker web service on Render because the bridge needs Chromium, a long-running Node process, and a persistent disk.

The disk is mounted at:

```text
/var/data
```

Required bridge env:

```text
WEB_ORIGIN=https://web-zsfaouris-projects.vercel.app
APP_BASE_URL=https://web-zsfaouris-projects.vercel.app
WHATSAPP_SESSION_PATH=/var/data/wwebjs_auth
BRIDGE_TOKEN=<same secret as PERSONAL_WHATSAPP_TOKEN>
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
BRIDGE_AUTO_START=true
BRIDGE_RECONNECT_MS=15000
```

Required Vercel env:

```text
PERSONAL_WHATSAPP_API_URL=https://<bridge-host>
PERSONAL_WHATSAPP_TOKEN=<same secret as BRIDGE_TOKEN>
```

Then in the dashboard:

```text
Provider: Personal WhatsApp
Personal bridge URL: https://<bridge-host>
Personal bridge token: <same secret>
```

## Bridge Endpoints

```text
GET  /healthz
GET  /api/whatsapp/status
POST /api/whatsapp/start
POST /api/whatsapp/send
POST /api/whatsapp/test
```

`/api/whatsapp/send` is the send endpoint used by the dashboard. `/api/whatsapp/test` remains as a compatibility alias. Status checks never call either send endpoint.

Incoming personal WhatsApp replies are forwarded from the bridge to:

```text
POST https://web-zsfaouris-projects.vercel.app/api/rsvp/inbound
```

Accepted RSVP replies include:

```text
yes, attending, confirm, no, not attending, decline, نعم, حاضر, لا, معتذر
```

## Current Platform Facts

- Vercel Functions are request-scoped and have max durations. They are not the right host for a persistent WhatsApp Web browser session.
- `whatsapp-web.js` `LocalAuth` requires a persistent filesystem for session restore.
- Render persistent disks preserve only data written under the configured mount path, so `WHATSAPP_SESSION_PATH` must point under `/var/data`.
- Personal WhatsApp can send text/media and read back replies. Official native WhatsApp quick-reply buttons require the WhatsApp Business Cloud API and approved template/interactive message flow.
