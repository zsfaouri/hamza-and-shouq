# Project Plan

## Product

Hamza and Shouq is a WhatsApp invitation and RSVP tool for personal-number campaigns.

It supports:

- Spreadsheet contact import
- English-first templates with optional Arabic body
- Placeholder replacement
- Media attachments through Cloudinary or local fallback
- Personal WhatsApp sending through `whatsapp-web.js`
- Official Meta WhatsApp Business API sending through Graph API
- Runtime provider switching from App Settings
- RSVP links with yes/no tracking
- Dashboard stats and per-contact status

## Deployment Model

Frontend:

- Next.js on Vercel
- Reads API base URL from `NEXT_PUBLIC_API_URL`

Backend:

- Express on Railway or Render
- Must be persistent
- Stores SQLite database and WhatsApp auth session
- Serves RSVP pages
- Stores runtime app settings in `apps/api/app-settings.json`

## Risk

Personal WhatsApp bulk sending can trigger bans. Keep campaigns small, send only to known contacts, use a 3-5 second delay, and avoid spam-like content.

## Data Model

- `Contact`: name, phone, custom JSON fields
- `Template`: English body, optional Arabic body, optional media
- `Campaign`: template, status, counts
- `Message`: contact message queue and send status
- `RsvpToken`: unique URL token and response

## API Surface

- `GET /health`: backend health check
- `GET /api/templates`: list templates
- `POST /api/templates`: create a template
- `PUT /api/templates/:id`: update a template
- `GET /api/campaigns`: list campaigns
- `POST /api/campaigns`: create a campaign
- `POST /api/campaigns/:id/contacts`: upload `.xlsx` or `.csv` contacts
- `GET /api/campaigns/:id`: load campaign detail
- `POST /api/campaigns/:id/prepare`: generate message rows and RSVP tokens
- `POST /api/campaigns/:id/send`: send pending messages sequentially
- `GET /api/campaigns/:id/stats`: dashboard counters
- `POST /api/media`: upload media to Cloudinary or local fallback
- `GET /rsvp/:token`: RSVP page
- `POST /rsvp/:token`: save yes/no RSVP

## WhatsApp

The backend exposes:

- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/whatsapp/status`
- `POST /api/whatsapp/start`
- `GET /webhook`
- `POST /webhook`
- `POST /api/campaigns/:id/send`

The API supports two provider modes:

- `personal`: starts `whatsapp-web.js` only after the dashboard calls `POST /api/whatsapp/start`.
- `meta`: sends through Meta Graph API using the configured phone number ID and access token.

For Meta webhook setup, use:

```text
GET/POST https://api-host/webhook
```

## Environment Variables

Backend:

- `API_PORT`: local API port, default `4100`
- `API_PUBLIC_URL`: public backend URL used inside RSVP links
- `WEB_ORIGIN`: allowed frontend origin
- `DATABASE_URL`: SQLite URL
- `WHATSAPP_SESSION_PATH`: persistent auth folder for `whatsapp-web.js`
- `SEND_DELAY_MS`: delay between sends
- `DAILY_SEND_LIMIT`: max messages queued per send run
- `WHATSAPP_PROVIDER`: `personal` or `meta`
- `DEFAULT_COUNTRY_CODE`: used to normalize local phone numbers
- `META_GRAPH_VERSION`: Graph API version
- `META_PHONE_NUMBER_ID`: WhatsApp Business phone number ID
- `META_ACCESS_TOKEN`: Meta access token
- `META_APP_SECRET`: Meta app secret for webhook signature verification
- `META_VERIFY_TOKEN`: webhook verify token
- `META_SEND_MODE`: `text` or `template`
- `META_TEMPLATE_NAME`: approved template name for template mode
- `META_TEMPLATE_LANGUAGE`: template language code, for example `en_US`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: optional media hosting

Frontend:

- `NEXT_PUBLIC_API_URL`: backend URL consumed by the dashboard

## Deployment Notes

Deploy `apps/web` to Vercel. Set `NEXT_PUBLIC_API_URL` to the Railway or Render backend URL.

Deploy `apps/api` to a persistent Node host. The backend needs a writable filesystem for SQLite and the WhatsApp session folder. For real use, mount persistent storage for `dev.db` and `.wwebjs_auth`.

Before first production use:

```powershell
pnpm.cmd prisma:generate
pnpm.cmd db:push
pnpm.cmd db:seed
pnpm.cmd build
```

Keep the personal number campaign volume low. The app sends sequentially, but WhatsApp can still restrict or ban personal accounts for bulk behavior.

## RSVP

Each message receives a token and an RSVP URL:

```text
https://api-host/rsvp/:token
```

The RSVP page has two actions:

- Attending
- Not attending

The response is stored on `RsvpToken`.
