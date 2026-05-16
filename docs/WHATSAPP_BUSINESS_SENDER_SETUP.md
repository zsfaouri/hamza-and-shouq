# WhatsApp Business Sender Setup

## Required sender

- Local number: `0795941263`
- International format: `+962795941263`
- The app blocks sends unless the linked WhatsApp account matches `+962795941263`.

## Phone setup

1. Put the SIM for `0795941263` in a phone that can receive SMS or calls.
2. Install WhatsApp Business.
3. Register `0795941263`.
4. Set the business name to `Hamza & Shouq Wedding`.
5. Set the category to `Event Planner` or the closest available category.
6. Add a profile photo or invitation image if available.
7. Do not scan the dashboard QR from any other WhatsApp account.

## App linking

1. Open the dashboard WhatsApp section.
2. Confirm Required sender number is `0795941263`.
3. Click Start Session.
4. In WhatsApp Business, open Linked Devices.
5. Scan the QR shown by the dashboard.
6. Confirm the dashboard shows Sending from `+962795941263`.

## Send rule

Never send a campaign while the dashboard shows any other sender number. The API will reject it, but the sender must still be checked before preparing a real campaign.

## Media

Template media uploads now use the API upload endpoint and return local URLs like `http://localhost:4100/uploads/...` for local testing. Do not use `attached://...` values in saved templates.
