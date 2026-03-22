# Voxly Dogfooding Setup Guide

> Goal: Get Voxly running with real services so you can use it on your own agency work.
> Estimated time: 30–45 minutes.

---

## Step 1 — Supabase (Database) ~5 min

1. Go to **https://supabase.com** → Sign up / Log in
2. Click **New Project**
   - Name: `voxly-dogfood`
   - Database password: generate a strong one and save it
   - Region: pick closest to you (Asia South for India)
3. Wait ~2 min for provisioning
4. Go to **Settings → Database**
5. Under **Connection string → URI**, copy the string:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres
   ```
6. Paste into your `.env` as `DATABASE_URL`

> ⚠️ Use the **direct** connection string (not the pooler) for Alembic migrations.
> Use the **pooler (Session mode)** connection for the running app if you see too-many-connections errors.

---

## Step 2 — Run Migrations ~2 min

```bash
cd backend
alembic upgrade head
```

Expected output: series of `Running upgrade ... -> ...` lines, ending with no error.

Verify in Supabase: **Table Editor** should now show all your tables (users, clients, projects, etc.)

---

## Step 3 — Twilio WhatsApp Sandbox ~5 min

1. Go to **https://console.twilio.com** → Sign up / Log in
2. Left menu: **Messaging → Try it out → Send a WhatsApp message**
3. You'll see a sandbox number (usually `+1 415 523 8886`) and a code like `join <word>-<word>`
4. From **your phone**, WhatsApp the sandbox number with that code
5. You're now connected to the sandbox
6. Copy your creds from **Account → API keys & tokens**:
   - `TWILIO_ACCOUNT_SID` = starts with `AC`
   - `TWILIO_AUTH_TOKEN` = 32-char hex
   - `TWILIO_WHATSAPP_NUMBER` = `whatsapp:+14155238886`

---

## Step 4 — ngrok (Public URL for Webhooks) ~3 min

Twilio needs a public HTTPS URL to send WhatsApp messages to your backend.

```bash
# Install once
winget install ngrok

# Run (in a separate terminal, keep it open)
ngrok http 8000
```

Copy the `https://xxxx.ngrok-free.app` URL — you'll use it in Step 5 and Step 6.

> Free ngrok changes URL on restart. For convenience, sign up at ngrok.com for a stable URL.

---

## Step 5 — AI Key (Pick One) ~2 min

Pick the cheapest/fastest for dogfooding:

| Provider | Free Tier | Recommended For |
|----------|-----------|-----------------|
| **Gemini 1.5 Flash** | Yes (generous) | Zero cost dogfooding |
| **Groq** | Yes (rate limited) | Fast responses |
| **Claude Haiku** | No ($0.25/M tokens) | Best quality/cost |

Get key → paste into `.env` (`GEMINI_API_KEY`, `GROQ_API_KEY`, or `ANTHROPIC_API_KEY`)

---

## Step 6 — Fill Your .env

Create `backend/.env` from the example:

```bash
cp backend/.env.example backend/.env
```

Then fill in:

```env
# --- REQUIRED FOR DOGFOODING ---
DATABASE_URL=postgresql://postgres:YOUR_PASS@db.xxxx.supabase.co:5432/postgres

SECRET_KEY=run-this-to-generate: python -c "import secrets; print(secrets.token_hex(32))"
DEBUG=true
FRONTEND_URL=http://localhost:3000

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# One AI key (pick one)
GEMINI_API_KEY=AIzaSy-xxx
# ANTHROPIC_API_KEY=sk-ant-xxx
# OPENAI_API_KEY=sk-proj-xxx

# GitHub (for webhook analysis)
GITHUB_TOKEN=ghp_xxx
GITHUB_WEBHOOK_SECRET=generate-a-random-string-here

# Redis (Upstash — already configured from before)
REDIS_URL=redis://default:xxx@fly.upstash.io:6379
```

---

## Step 7 — Start the Backend ~1 min

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Verify: open http://localhost:8000/health — should return `{"status": "ok"}`

---

## Step 8 — Configure Twilio Webhook

1. In Twilio Console: **Messaging → Sandbox Settings**
2. Set "When a message comes in" to:
   ```
   https://YOUR-NGROK-URL.ngrok-free.app/api/v1/ai/chat/whatsapp
   ```
3. Save

---

## Step 9 — Configure GitHub Webhook

1. Go to any GitHub repo you want to monitor
2. **Settings → Webhooks → Add webhook**
   - Payload URL: `https://YOUR-NGROK-URL.ngrok-free.app/api/v1/github/webhook`
   - Content type: `application/json`
   - Secret: same value as `GITHUB_WEBHOOK_SECRET` in your `.env`
   - Events: select **Workflow runs** + **Push** + **Pull requests**
3. Save

---

## Step 10 — Smoke Test 🎉

1. **WhatsApp test**: Send "Hello, how is my project going?" to the Twilio sandbox number
2. **GitHub test**: Push a commit to your connected repo → wait 30s → check WhatsApp
3. **Build failure test**: Intentionally break a GitHub Actions workflow → check WhatsApp for AI analysis

---

## Checklist

- [ ] Supabase project created + `DATABASE_URL` in `.env`
- [ ] `alembic upgrade head` ran with no errors
- [ ] Tables visible in Supabase Table Editor
- [ ] Twilio sandbox joined from your phone
- [ ] Twilio creds in `.env`
- [ ] ngrok running, URL copied
- [ ] One AI key in `.env`
- [ ] `SECRET_KEY` generated (not the placeholder)
- [ ] `REDIS_URL` confirmed working
- [ ] Backend running at port 8000 — `/health` returns 200
- [ ] Twilio webhook URL configured
- [ ] GitHub webhook configured on your repo
- [ ] WhatsApp message test passes
- [ ] GitHub push triggers notification
