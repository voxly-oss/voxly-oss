# WhatsApp via WAHA (open source) and LLM via Groq

Voxly's WhatsApp transport is switchable. `WHATSAPP_PROVIDER=twilio` (default) is the official API. `WHATSAPP_PROVIDER=waha` sends and receives through a self-hosted [WAHA](https://github.com/devlikeapro/waha) gateway.

> **Status: code and unit tests are done. Nothing here has been run against a live WAHA or a live Groq key yet.** Follow "First live test" before trusting it.

## Read this before using WAHA with real customers

- WAHA drives a normal WhatsApp account through WhatsApp Web. That is **not an official WhatsApp API and is against WhatsApp's terms**. The number can be banned, and bans are more likely with unsolicited or bulk messages and new numbers.
- Use a **dedicated number** you can afford to lose, never a personal one. Only message clients who wrote to you first or expect to hear from you.
- The gateway needs an **always-on host** with a persistent disk. Render free cannot run it (it sleeps and has no disk). Options: an Oracle Cloud Always Free VM, or a spare machine at home with a Cloudflare Tunnel.
- The paired session lives in the `waha_sessions` volume. Back it up. Losing it means re-scanning the QR code.

## 1. Run the gateway

```
cd deploy/waha
cp .env.example .env        # fill both values
docker compose up -d
```

The port binds to `127.0.0.1` only. Expose it to Render through a tunnel or reverse proxy with HTTPS, never as plain open HTTP. Pin the image to a tested version tag first.

## 2. Pair the number

Open the WAHA dashboard (through the tunnel), start the `default` session, and scan the QR code from the dedicated phone (WhatsApp, Linked devices).

## 3. Point WAHA at Voxly

Configure the session's webhook (dashboard, or the session config API) with:

- URL: `https://voxly-backend-9x1f.onrender.com/api/v1/whatsapp/waha-webhook`
- Events: `message` only
- Custom header: `X-Voxly-Webhook-Token: <WAHA_WEBHOOK_SECRET>`

Check the header field name against the WAHA version you pulled; it is set per session.

## 4. Set these env vars on Render

| Key | Value |
|---|---|
| `WHATSAPP_PROVIDER` | `waha` |
| `WAHA_URL` | the HTTPS URL of your gateway |
| `WAHA_API_KEY` | same as `WAHA_API_KEY` in `deploy/waha/.env` |
| `WAHA_SESSION` | `default` |
| `WAHA_WEBHOOK_SECRET` | a new random secret (also put in the WAHA header) |

## 5. Groq for the LLM

Create a key at console.groq.com (free tier, rate limited) and set `GROQ_API_KEY` on Render. Optionally `GROQ_MODEL` (default `llama-3.3-70b-versatile`). Groq is tried first when its key is set. For an open-weights-only setup, **remove** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `GEMINI_API_KEY` from Render so nothing falls back to a paid or closed provider.

Groq hosts the models; the service itself is not open source. If you later want fully self-hosted, any OpenAI-compatible server (vLLM, Ollama) fits the same provider class.

## Limits of the WAHA path today

- Text only inbound: media messages are ignored.
- Only plain phone ids (`<digits>@c.us`) are matched to clients. Groups, status broadcasts and newer `@lid` ids are ignored.
- Replies are not rate-paced. A burst of outbound messages from one number raises ban risk.

## First live test (do this before onboarding anyone)

1. Create one client in Voxly with your own second phone's number.
2. From that phone, message the dedicated number: "hi".
3. Expect an AI reply on WhatsApp and the thread in the dashboard and mobile app.
4. Stop the gateway, send a message: Voxly should log a send failure and not crash.
5. Restart the gateway: the session should reconnect without a new QR scan.
