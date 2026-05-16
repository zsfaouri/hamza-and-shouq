# Project Status

## Correct Project

```text
C:\Users\zaids\Desktop\hamza-and-shouq
```

This repository is the Hamza and Shouq WhatsApp invitation and RSVP campaign system.

## GitHub

```text
https://github.com/zsfaouri/hamza-and-shouq.git
```

Branch:

```text
main
```

Latest pushed commit:

```text
Check `git log -1 --oneline` after deployment.
```

## Vercel

Production frontend:

```text
https://web-zsfaouris-projects.vercel.app
```

Production deployment status:

```text
Verified through `vercel inspect https://web-zsfaouris-projects.vercel.app`.
```

Vercel project:

```text
zsfaouris-projects/web
```

## Backend

Current local API:

```text
http://localhost:4100
```

Health check:

```text
http://localhost:4100/health
```

The Vercel frontend is currently built with:

```text
NEXT_PUBLIC_API_URL=http://localhost:4100
```

This means the public Vercel UI is deployed, but full production use requires deploying `apps/api` to a persistent HTTPS backend and updating `NEXT_PUBLIC_API_URL`.

## Google Sheet

Contacts source:

```text
https://docs.google.com/spreadsheets/d/1021Z6KyT-dF97FVJAG3c4Nr6thASDpuhPu-hFC_fTA0/edit?usp=sharing
```

Expected headers:

```text
Name,Number
```

Current importer behavior:

```text
Detect Tabs reads and previews Google Sheets without importing.
No tab is selected by default.
There is no Import All action.
Only checked tabs can be imported.
An import replaces the selected campaign contacts instead of appending to stale contacts.
If selected tabs contain no readable contacts, existing campaign contacts are left unchanged.
XLSX export is tried first for more reliable multi-tab reads; CSV/gid fallback remains.
```

## Verified

Local checks passed:

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
```

Current backend hardening:

```text
Campaign send requests now lock per campaign while active.
Campaign sent/failed totals are synced from actual message rows.
Prepare preserves sent message history and existing RSVP links.
RSVP contact names are HTML-escaped and invalid form values are rejected.
Personal WhatsApp media sends are restricted to API uploads or Cloudinary URLs.
Personal WhatsApp sender is pinned to 962795941263.
RSVP messages include attending/not-attending links and inbound WhatsApp replies update dashboard RSVP status.
```

## Budget Tracker And Supabase Migration

Implemented locally:

```text
Prisma datasource switched to PostgreSQL in apps/api/prisma/schema.prisma.
Budget, category, vendor, expense, payment, permission, and audit models added.
Contact.customFields is now Json in Prisma.
Budget Express routes are mounted at /api/budget.
Budget seed data is added to apps/api/prisma/seed.ts.
Generated SQL migration is stored at apps/api/prisma/migrations/20260515_supabase_init/migration.sql.
RLS SQL backstop is stored at docs/SUPABASE_BUDGET_RLS.sql.
Next.js /budget route, middleware gate, sidebar gate, charts, modals, permissions, audit log, and CSV export UI are implemented.
```

Migration blocker:

```text
apps/api/.env does not currently contain DIRECT_URL.
apps/api/.env DATABASE_URL is not a PostgreSQL URL in the current local file.
Live npx prisma migrate dev --name supabase_init cannot complete until those Supabase PostgreSQL values are present.
```

Live Vercel checks passed:

```text
Deployment status: Ready
HTTP status: 200 OK
Dashboard text present: Wedding RSVP control room
Google Sheet import UI present
```

WhatsApp local test message passed:

```text
Campaign ID: cmp61fp760001i8lky9glltow
Sent: 1
Failed: 0
WhatsApp message ID: 3EB012BBE34169228E60C7
```

## Not Committed Or Stored In Git

The following are intentionally ignored:

```text
node_modules
apps/api/.wwebjs_auth
apps/api/.wwebjs_cache
apps/api/prisma/dev.db
apps/api/app-settings.json
*.log
.env
.env.local
.vercel
test-contact*.csv
```
