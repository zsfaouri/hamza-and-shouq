# Claude Review

## Verdict

- Local demo: yes, for a controlled happy-path demo.
- Production deployment: no.

## Critical Findings

1. Send loop is fire-and-forget.
   - `apps/api/src/server.ts`
   - A crash or restart leaves remaining messages stuck as `PENDING` and campaign status stuck.

2. Campaign status is marked `SENT` even when sends fail.
   - `apps/api/src/server.ts`
   - Failed campaigns can still display as sent.

3. Concurrent send calls can duplicate messages.
   - `apps/api/src/server.ts`
   - No lock prevents two `/send` requests from sending the same pending rows.

4. RSVP pages interpolate contact names without HTML escaping.
   - `apps/api/src/server.ts`
   - Spreadsheet-provided names can create stored XSS on public RSVP pages.

5. Spreadsheet parsing trusts filename extension.
   - `apps/api/src/spreadsheet.ts`
   - Bad files can crash parsing and are not validated by MIME/type.

## High Findings

1. No authentication exists on API endpoints.
   - Anyone who can reach the backend can create campaigns, import contacts, start WhatsApp, and send messages.

2. Media URL sending can become SSRF.
   - `apps/api/src/whatsapp.ts`
   - `MessageMedia.fromUrl(mediaUrl, { unsafeMime: true })` fetches arbitrary URLs.

3. Uploads are publicly served without access control.
   - `apps/api/src/server.ts`

4. WhatsApp client state is in-memory only.
   - `apps/api/src/whatsapp.ts`
   - Hot reloads, restarts, and multi-instance deployments can break session state.

5. Reconnect flow is incomplete.
   - `initWhatsApp()` returns early if a client exists, even when disconnected.

6. Phone normalization does not enforce country code.
   - `apps/api/src/template.ts`
   - Local Jordanian numbers like `079...` are not converted to `96279...`.

7. Re-importing or re-preparing a campaign can wipe sent message history and RSVP tokens.
   - `apps/api/src/server.ts`

## Medium Findings

1. `customFields` is stored as JSON text instead of a queryable JSON field.
2. `DAILY_SEND_LIMIT` limits only one send call, not a real daily quota.
3. `sentCount` and `failedCount` can drift from actual message counts.
4. RSVP POST defaults to `YES` unless value is exactly `NO`.
5. Frontend lacks user-facing error handling around failed API calls.
6. Polling can become heavy with larger campaigns.
7. No tests exist.
8. `xlsx@0.18.x` is old and risky for untrusted spreadsheet parsing.

## Required Fixes Before Production

1. Add API authentication.
2. Escape RSVP HTML output.
3. Add a campaign send lock.
4. Replace fire-and-forget send loop with a resumable queue.
5. Fix campaign status transitions.
6. Add strict media URL validation or only allow uploaded media.
7. Add reconnect/reset controls for WhatsApp.
8. Normalize phone numbers with a default country code.
9. Prevent prepare from deleting sent messages and active RSVP links.
10. Add tests for templates, phone normalization, spreadsheet parsing, RSVP, and send state transitions.
