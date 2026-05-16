# WhatsApp Business Sender Setup

## Sender Number

Use the new sender:

```text
0795941263
+962795941263
```

## Provider Options

Use `Personal WhatsApp` for QR/session-based sending from the sender number.

Use `Meta WhatsApp Cloud API` for official WhatsApp Business API sending.

## Personal WhatsApp

Vercel cannot keep a personal QR session alive by itself. Use one of these:

- Local development: leave `PERSONAL_WHATSAPP_API_URL` empty and click `Start Personal QR`.
- Production: set `PERSONAL_WHATSAPP_API_URL` to a persistent bridge server that exposes `/api/whatsapp/status`, `/api/whatsapp/start`, and `/api/whatsapp/test`.

The bridge implementation is included in:

```text
apps/bridge
```

Optional bridge auth:

```text
PERSONAL_WHATSAPP_TOKEN=
```

## Meta WhatsApp Cloud API

1. Create or open the Meta app connected to the WhatsApp Business Account.
2. Add the phone number `+962795941263`.
3. Copy the Phone Number ID.
4. Create a permanent or long-lived access token with WhatsApp send permissions.
5. Add the webhook URL:

```text
https://web-zsfaouris-projects.vercel.app/api/whatsapp/webhook
```

6. Use the verify token saved in the dashboard or env:

```text
META_VERIFY_TOKEN=hamza-shouq-webhook
```

7. Subscribe webhook fields for messages.

## App Settings

Set these in Vercel or in the dashboard:

```text
META_GRAPH_VERSION=v23.0
META_PHONE_NUMBER_ID=
META_ACCESS_TOKEN=
META_VERIFY_TOKEN=hamza-shouq-webhook
WHATSAPP_SENDER_PHONE=962795941263
NEXT_PUBLIC_SITE_URL=https://web-zsfaouris-projects.vercel.app
```

## Send Safety

The app does not have an import-all action.

The app does not send after import.

The send route requires:

- checked message rows
- exact confirmation text `SEND SELECTED`
- configured Meta phone number ID and access token

## RSVP

Template variables:

```text
{{attending_link}}
{{not_attending_link}}
{{rsvp_link}}
```

Clicking a link updates the dashboard. Incoming WhatsApp replies like `yes`, `attending`, `no`, or `not attending` are parsed by the webhook and recorded against the matching phone number.
