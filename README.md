# Hamza and Shouq RSVP System

Next.js dashboard plus persistent WhatsApp bridge for importing invitation lists from Google Sheets, saving one WhatsApp message template, uploading a template image, sending selected WhatsApp messages, and recording RSVP replies.

## Links

```text
GitHub: https://github.com/zsfaouri/hamza-and-shouq.git
Vercel: https://web-zsfaouris-projects.vercel.app
Local:  http://localhost:3000
```

## Architecture

```text
apps/web
  Next.js dashboard
  Next.js API routes
  Google Sheets XLSX reader
  WhatsApp provider switch
  Meta WhatsApp Cloud API sender
  Personal WhatsApp bridge/local QR sender
  RSVP link and webhook handlers

apps/bridge
  Persistent personal WhatsApp bridge for QR-based sending
```

There is no old Express API, Prisma database, or SQLite campaign store in the rebuilt app. Personal WhatsApp is restored as a provider option. On Vercel it requires a persistent bridge URL; in local development it can start a QR session from the Next server.

## Setup

```powershell
pnpm.cmd install
pnpm.cmd dev
```

Default login:

```text
username: admin
password: admin123
```

Override with:

```text
APP_USERNAME
APP_PASSWORD
AUTH_SECRET
```

## Google Sheets

Paste any public Google Sheets share/edit URL and click `Detect Tabs`.

The app reads XLSX export first, so it detects all worksheet tabs by their real names. It accepts English and Arabic name/phone headers, including:

```text
Name, Number, Phone, Mobile, WhatsApp, Guest Name
الاسم, رقم الهاتف, الموبايل, الجوال, واتساب
```

No tab is imported by default. You must check the exact tabs and click `Import Checked Tabs`.

## WhatsApp Providers

The dashboard supports two providers.

Personal WhatsApp:

```text
WHATSAPP_PROVIDER=personal
PERSONAL_WHATSAPP_API_URL=
PERSONAL_WHATSAPP_TOKEN=
```

If `PERSONAL_WHATSAPP_API_URL` is empty, local development uses an in-process QR session. Vercel cannot run that session durably, so production personal sending needs a persistent bridge URL. The included `render.yaml` deploys `apps/bridge` as a Docker service with Chromium and a persistent `/var/data` session disk.

Bridge documentation:

```text
docs/PERSONAL_WHATSAPP_BRIDGE.md
```

Meta WhatsApp Cloud API:

Required environment or dashboard settings:

```text
META_GRAPH_VERSION=v23.0
META_PHONE_NUMBER_ID=
META_ACCESS_TOKEN=
META_VERIFY_TOKEN=hamza-shouq-webhook
WHATSAPP_SENDER_PHONE=962795941263
NEXT_PUBLIC_SITE_URL=https://web-zsfaouris-projects.vercel.app
```

Campaign sending is blocked unless rows are checked and the confirmation text is exactly:

```text
SEND SELECTED
```

## RSVP

Every prepared message includes:

```text
{{attending_link}}
{{not_attending_link}}
```

Clicks update the dashboard through `/rsvp/[token]`. WhatsApp inbound text/button replies can also update RSVP through:

```text
/api/whatsapp/webhook
```

## Persistence

Local development writes to:

```text
apps/web/.data/app-state.json
```

For Vercel persistence, create `public.hs_app_state` using:

```text
docs/SUPABASE_SCHEMA.sql
```

Then set:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

The app also supports Supabase publishable keys when the SQL policy in `docs/SUPABASE_SCHEMA.sql` is installed. Template saves now fail visibly on Vercel if persistent storage cannot write, instead of pretending a memory-only save is durable.

Uploaded template images are stored in the same persisted app state and served from:

```text
/api/media/template
```

## Validation

```powershell
pnpm.cmd test
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
```
