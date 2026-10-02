# Client chat API — handoff for a client mode in the mobile app

The native **Voxly chat link** lets an agency's *client* (not the agency) chat
with the agency without WhatsApp or Telegram. The web version lives at
`/c/<link>` → `/c` on the frontend. This document is everything a mobile app
needs to offer the same chat. Backend: `backend/app/api/v1/portal.py`.

Base URL: the API host (production: the Render URL in the app's
`EXPO_PUBLIC_API_URL`). Allow a **60 s** timeout on the first request — a
sleeping free-tier backend takes ~50 s to wake.

## 1. Getting in: the personal chat link

The agency creates a link per client (client page → "Voxly chat link") and
sends it, e.g. on WhatsApp:

```
https://voxly-oss.vercel.app/c/<LINK_TOKEN>
```

`<LINK_TOKEN>` is opaque (two base64url parts joined by `.`). Treat it as a
password: don't log it, don't send it anywhere but the session call. Handle
the URL as a deep/universal link and extract the last path segment.

Exchange it for a session:

```http
POST /api/v1/portal/session
Content-Type: application/json

{ "token": "<LINK_TOKEN>" }
```

`200`:

```json
{
  "access_token": "<SESSION_JWT>",
  "token_type": "bearer",
  "expires_in": 2592000,
  "profile": { "client_id": "uuid", "client_name": "Acme Corp", "agency_name": "Northwind Studio" }
}
```

- Store `access_token` securely (expo-secure-store), with `expires_in`
  (30 days). Don't keep the link token after the exchange.
- `404` → the link was revoked or regenerated: show "This chat link isn't
  active anymore — ask {agency} for a new link".
- `422` → malformed token. `429` → rate limited (10/min per IP).

The session token is **only** valid on `/api/v1/portal/*`. It is rejected by
every agency endpoint, and agency logins are rejected here.

## 2. Authenticated calls

Send `Authorization: Bearer <SESSION_JWT>`.

**Any `401` means the session is over** — the agency turned the link off,
regenerated it, deleted the client, or it expired. Delete the stored session
and show the "isn't active anymore" screen. Don't retry.

### Who the chat is with

```http
GET /api/v1/portal/me
```

→ `{ "client_id", "client_name", "agency_name" }`

### The thread

```http
GET /api/v1/portal/messages?limit=50
GET /api/v1/portal/messages?before=<message_id>&limit=50   # older page
```

→

```json
{
  "messages": [
    { "id": "uuid", "direction": "inbound", "author_type": "client", "channel": "voxly",
      "body": "When do we launch?", "status": "received", "created_at": "2026-10-02T10:00:00.123456Z" }
  ],
  "has_more": true
}
```

- Each page is **oldest → newest**; the first call returns the newest page.
  To load older, pass `before` = the id of the oldest message you have.
- `direction: "inbound"` = written **by the client** (show on the right).
  `outbound` = from the agency: `author_type` `"ai"` (label it as the agency's
  AI assistant) or `"agent"` (a person at the agency).
- `channel` is where the message travelled: `voxly`, `whatsapp` or
  `telegram` — the thread includes the client's conversation on every
  channel. Show "via WhatsApp" etc. when it isn't `voxly`.
- Only delivered messages are returned; you never see an agency reply that
  failed to send. `created_at` is UTC ISO-8601 with `Z`.

### Sending

```http
POST /api/v1/portal/messages
Content-Type: application/json

{ "text": "Can we add a blog page?" }
```

→ `201` with the saved message (`status: "received"`). `text` is 1–4096
characters (trimmed). Rate limit 20/min. The reply comes **asynchronously**
over the socket (the AI usually answers in seconds; it stays quiet while a
person at the agency has taken over the conversation).

Show the message optimistically, replace it with the `201` body, and offer
"tap to retry" if the request fails (not on `401` — see above).

## 3. Live updates

```
wss://<api host>/api/v1/portal/ws?token=<SESSION_JWT>
```

- Send `{"type":"ping"}` every 30 s; the server answers `{"type":"pong"}`
  and closes sockets that are silent for 90 s.
- Events (same envelope as the agency socket):

```json
{ "event": "message.created", "timestamp": "...", "conversation_id": "<client_id>",
  "organization_id": null, "payload": { "message": { /* same shape as above */ } } }
```

  `message.created` and `message.updated` — upsert by `message.id`.
  Your own sent message also arrives here; dedupe by id.
- An invalid/revoked session is refused at connect (HTTP 403 / close 1008),
  and revoking a link closes open sockets. Reconnect with backoff (1 s → 30 s);
  while disconnected, poll `GET /messages` every ~15 s — a `401` there is
  your signal the session ended.

## 4. Notifications

The **web** chat gets notifications through standard Web Push: a push goes
out when the agency replies on Voxly chat (a teammate or the AI), not for
WhatsApp/Telegram replies, which those apps notify about already.

```http
GET  /api/v1/portal/push                  → { "enabled": true, "public_key": "<base64url VAPID key>" }
POST /api/v1/portal/push/subscriptions    body: PushSubscription.toJSON()   → 204
POST /api/v1/portal/push/unsubscribe      body: { "endpoint": "..." }       → 204
```

- `enabled: false` means the server has no push key configured; offer nothing.
- Only browser push services are accepted (FCM, Mozilla, Apple, Windows);
  anything else is a `422`. Re-sending the same subscription is fine (the web
  chat does it on every open).
- Turning the link off or regenerating it drops every subscribed device.

**A native app can't use these** — Expo/FCM/APNs device tokens aren't Web
Push subscriptions. A client mode in the mobile app needs a device-token
endpoint and an Expo push sender on the backend; ask for one when you get
there. Until then the app sees new messages when it's opened.

## 5. Not available yet

- Native (Expo) push notifications — see above.
- Typing indicators, read receipts, attachments/media.
- Per-agency branding beyond `agency_name`.
