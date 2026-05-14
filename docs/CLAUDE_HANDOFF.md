# Claude Review Handoff

## Project

```text
C:\Users\zaids\Desktop\hamza-and-shouq
```

This is not the LORA website. It is a new WhatsApp invitation and RSVP campaign tool for Hamza and Shouq.

## What To Review

Review the current implementation for:

- WhatsApp provider switching between personal QR mode and Meta WhatsApp Business API mode.
- Google Sheet contact import.
- Spreadsheet parsing and phone normalization.
- Campaign prepare/send state transitions.
- RSVP token flow.
- Dashboard UX and operational clarity.
- Deployment split: Vercel frontend, persistent Node backend.

## Current Local URLs

```text
Web: http://localhost:3000
API: http://localhost:4100
```

## Main Files

```text
apps/api/src/server.ts
apps/api/src/google-sheet.ts
apps/api/src/spreadsheet.ts
apps/api/src/template.ts
apps/api/src/whatsapp.ts
apps/api/src/meta-whatsapp.ts
apps/api/src/settings.ts
apps/api/prisma/schema.prisma
apps/web/src/components/dashboard.tsx
apps/web/src/app/globals.css
```

## Recent Design Changes

- Reworked the dashboard into a compact command-center layout.
- Added a top status rail for active campaign, provider, session, and contact count.
- Reduced hero weight so the first screen behaves like an app, not a landing page.
- Split contact import into Google Sheet and file upload cards.
- Added stronger stat-card visual hierarchy.
- Improved responsive layout and focus states.

## Google Sheet Import

The app imports contacts from this sheet:

```text
https://docs.google.com/spreadsheets/d/1021Z6KyT-dF97FVJAG3c4Nr6thASDpuhPu-hFC_fTA0/edit?usp=sharing
```

Current accepted headers:

```text
Name,Number
```

Also accepted:

```text
name,phone
name,whatsapp
guest,mobile
```

Known current state: the sheet is readable, but it only has headers and no contact rows.

## Validation Commands

Run:

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
```

Known local warning:

```text
apps/web wants Node 22.x, current shell may be Node 24.x
```

## Known Security And Production Risks

These should be reviewed before production:

- API endpoints are unauthenticated.
- Send loop is in-process and not resumable.
- Concurrent send requests can duplicate sends.
- RSVP HTML should escape contact names.
- Media URL sending needs stricter validation.
- Re-importing contacts can create duplicates.
- Campaign prepare currently regenerates messages and RSVP tokens.
- Personal WhatsApp mode is not suitable for high-volume bulk sending.
