# Personal WhatsApp Bridge

Vercel cannot run a QR-based WhatsApp session. Personal WhatsApp needs a persistent Node process.

This repo now includes that process:

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

Deploy `apps/bridge` to a persistent Node host. The included `render.yaml` is configured for Render with a persistent disk mounted at:

```text
/var/data
```

Required bridge env:

```text
WEB_ORIGIN=https://web-zsfaouris-projects.vercel.app
APP_BASE_URL=https://web-zsfaouris-projects.vercel.app
WHATSAPP_SESSION_PATH=/var/data/wwebjs_auth
BRIDGE_TOKEN=<same secret as PERSONAL_WHATSAPP_TOKEN>
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
POST /api/whatsapp/test
```

`/api/whatsapp/test` is the send endpoint used by the dashboard. It is not called by status checks.

Incoming personal WhatsApp replies are forwarded from the bridge to:

```text
POST https://web-zsfaouris-projects.vercel.app/api/rsvp/inbound
```

Accepted RSVP replies include:

```text
yes, attending, confirm, no, not attending, decline, نعم, حاضر, لا, معتذر
```
