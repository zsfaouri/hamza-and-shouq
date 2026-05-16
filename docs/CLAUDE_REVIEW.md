# Claude Review

## Verdict

- Local demo: yes, for a controlled happy-path demo.
- Production deployment: no.

## Critical Findings

### Fixed In Current Upgrade Pass

1. Duplicate send requests are blocked per campaign while a send is active.
2. Campaign counts are synced from message rows instead of incremented blindly.
3. Campaign status now ends as `SENT`, `FAILED`, or `READY` based on actual message outcomes.
4. Preparing a campaign no longer deletes sent messages or existing RSVP links.
5. RSVP names are HTML-escaped and invalid RSVP form values are rejected.
6. Personal WhatsApp media sends only accept API uploads or Cloudinary URLs.

## Remaining Production Findings

1. Send loop still runs inside the API process.
   - `apps/api/src/server.ts`
   - A crash or restart can still leave a send incomplete. A durable queue is still required for production.

2. Spreadsheet parsing trusts filename extension.
   - `apps/api/src/spreadsheet.ts`
   - Bad files can crash parsing and are not validated by MIME/type.

## High Findings

1. No authentication exists on API endpoints.
   - Anyone who can reach the backend can create campaigns, import contacts, start WhatsApp, and send messages.

2. Uploads are publicly served without access control.
   - `apps/api/src/server.ts`

3. WhatsApp client state is in-memory only.
   - `apps/api/src/whatsapp.ts`
   - Hot reloads, restarts, and multi-instance deployments can break session state.

4. Reconnect flow is incomplete.
   - `initWhatsApp()` returns early if a client exists, even when disconnected.

## Medium Findings

1. `customFields` is stored as JSON text instead of a queryable JSON field.
2. `DAILY_SEND_LIMIT` limits only one send call, not a real daily quota.
3. Frontend lacks user-facing error handling around failed API calls.
4. Polling can become heavy with larger campaigns.
5. No tests exist.
6. `xlsx@0.18.x` is old and risky for untrusted spreadsheet parsing.

## Required Fixes Before Production

1. Add API authentication.
2. Replace fire-and-forget send loop with a resumable queue.
3. Add reconnect/reset controls for WhatsApp.
4. Validate spreadsheet MIME/type before parsing.
5. Add tests for templates, phone normalization, spreadsheet parsing, RSVP, and send state transitions.
