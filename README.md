# Hamza and Shouq WhatsApp Bulk Messaging System

Local-first campaign tool for spreadsheet-driven WhatsApp invitations, personalized templates, media attachments, RSVP links, and a clean English-primary dashboard.

## Architecture

```text
apps/web  -> Next.js dashboard, deployable to Vercel
apps/api  -> Express API, Prisma SQLite, whatsapp-web.js engine, deployable to Railway/Render
```

The backend must run on a persistent Node host because `whatsapp-web.js` needs a live browser session and QR-based authentication. Vercel is only for the frontend.

## Setup

```powershell
pnpm.cmd install
Copy-Item apps\api\.env.example apps\api\.env
Copy-Item apps\web\.env.example apps\web\.env.local
pnpm.cmd prisma:generate
pnpm.cmd db:push
pnpm.cmd db:seed
pnpm.cmd dev
```

Default URLs:

```text
Web: http://localhost:3000
API: http://localhost:4100
```

## Core Flow

1. Upload `.xlsx` or `.csv` contacts, or import contacts directly from a Google Sheet URL.
2. Create an English-primary template with placeholders like `{{name}}`, `{{date}}`, `{{venue}}`, `{{rsvp_link}}`.
3. Upload optional media.
4. Create a campaign.
5. Choose a sending provider in App Settings.
6. Personal mode: start the WhatsApp session and scan the QR code.
7. Meta mode: enter Meta phone number ID, access token, app secret, verify token, and template settings.
8. Preview and send sequentially with rate limiting.
9. Recipients click RSVP links.
10. Dashboard tracks sent, failed, yes, no, and pending.

## Google Sheet Contacts

The Contacts panel accepts a Google Sheet edit/share URL and imports the first tab as CSV.

Required columns:

```text
Name,Number
```

Also accepted:

```text
name,phone
name,whatsapp
guest,mobile
```

Extra columns are stored as custom fields and can be used as template placeholders.

## Sending Providers

Personal number mode:

- Uses `whatsapp-web.js`
- Requires QR scan
- Works with a personal WhatsApp number
- Needs a persistent backend process
- Higher ban risk for bulk sending

Meta WhatsApp Business API mode:

- Uses the official Graph API
- Requires a Meta app and WhatsApp Business Account
- Requires `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_APP_SECRET`, and webhook `META_VERIFY_TOKEN`
- No QR scan
- Outbound campaign sends usually need approved WhatsApp message templates

## Validation

```powershell
pnpm.cmd typecheck
pnpm.cmd build
```

## Documentation

Full build and deployment notes:

```text
docs/PROJECT_PLAN.md
```
