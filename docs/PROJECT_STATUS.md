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

Latest pushed commit at time of documentation:

```text
f0571a5 Initial WhatsApp campaign system
```

## Vercel

Production frontend:

```text
https://web-zsfaouris-projects.vercel.app
```

Latest verified deployment:

```text
https://web-7k311bb5y-zsfaouris-projects.vercel.app
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

## Verified

Local checks passed:

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
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
