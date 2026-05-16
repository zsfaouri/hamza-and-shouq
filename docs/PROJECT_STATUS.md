# Project Status

## Current Build

The app was rebuilt as a single Next.js full-stack app under `apps/web`.

Removed:

- `apps/api`
- Express server
- Prisma schema and migrations
- SQLite database flow
- QR-based WhatsApp personal sender from the Vercel app
- old budget/reminder/access side features

Kept as core product:

- Google Sheets tab detection
- explicit checked-tab import
- template save and message preview rebuild
- WhatsApp Business Cloud API settings
- Personal WhatsApp provider settings
- Personal bridge/local QR status and start routes
- Persistent `apps/bridge` service for Personal WhatsApp
- guarded selected-row sending
- RSVP links
- WhatsApp webhook RSVP readback

## Verified Google Sheet

Known sheet:

```text
https://docs.google.com/spreadsheets/d/1021Z6KyT-dF97FVJAG3c4Nr6thASDpuhPu-hFC_fTA0/edit?usp=sharing
```

Detected tabs:

```text
Hamza: 0 contacts
Shouq: 35 contacts
Maha: 0 contacts
Zein: 24 contacts
Yazan: 13 contacts
test: 2 contacts
```

Local route verification imported only `test`, producing 2 contacts and 2 RSVP-enabled messages. No WhatsApp send route was called.

## Verification Commands

```powershell
pnpm.cmd test
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
```

All passed locally.

## WhatsApp Personal Option

Personal WhatsApp has been restored as a provider option.

Production on Vercel requires:

```text
WHATSAPP_PROVIDER=personal
PERSONAL_WHATSAPP_API_URL=<persistent bridge url>
PERSONAL_WHATSAPP_TOKEN=<optional bridge token>
```

Without a bridge URL, Vercel returns `bridge-required` for personal status. Local development can start an in-process QR session through `/api/whatsapp/start`.

The persistent bridge lives at:

```text
apps/bridge
```

Deployment instructions:

```text
docs/PERSONAL_WHATSAPP_BRIDGE.md
```
