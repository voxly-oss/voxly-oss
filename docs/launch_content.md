# Voxly Launch Day Content — Feb 28, 2026

## 🟠 Show HN Post

**Title**: `Show HN: Voxly – AI that sends WhatsApp updates to clients from GitHub commits`

**Body**:
```
Hey HN,

I built Voxly — an open-source backend that connects GitHub to WhatsApp/Telegram,
letting an AI agent send intelligent project updates to your clients automatically.

The problem: As a dev agency, my clients kept asking "what's the status?" I was
spending 2+ hours/week just writing update messages. So I built an AI that reads
my GitHub commits, understands the context, and writes the update for me.

How it works:
1. GitHub webhook fires on push/PR/build failure
2. Voxly's ReAct agent analyzes the change
3. Agent crafts a human-readable update
4. Sends via WhatsApp (Twilio) or Telegram

Key features:
- BYOK (Bring Your Own Key) — use your own OpenAI/Claude/Gemini keys
- Multi-provider fallback (5 AI providers)
- Multimodal: clients can send bug screenshots via WhatsApp → auto-creates GitHub issues
- One-command setup: npx create-voxly@latest my-agency

Tech: FastAPI, SQLAlchemy, PostgreSQL, Redis, Celery, LangChain ReAct

GitHub: https://github.com/ravin972/voxly-backend
npm: https://www.npmjs.com/package/create-voxly

Would love feedback on the agent architecture and what integrations
you'd want to see next (Slack, Linear, Jira?).
```

---

## 🟣 Reddit Posts

### r/selfhosted
**Title**: `Voxly: Self-hosted AI that sends WhatsApp client updates from your GitHub activity`

**Body**: Same as Show HN but add:
```
Docker Compose setup — one command:
docker compose up -d

MIT licensed, fully self-hosted, BYOK — your keys never leave your server.
```

### r/SideProject
**Title**: `I built an AI that reads my GitHub commits and texts my clients on WhatsApp`

**Body**: Keep it personal — tell the story of why you built it.

### r/webdev
**Title**: `Open source: AI-powered client communication for dev agencies (FastAPI + Next.js)`

---

## 🐦 Twitter/X Thread

```
🚀 Launching Voxly — open source

I was spending 2+ hours/week writing "project status" messages to clients.

So I built an AI that:
→ Reads my GitHub commits
→ Understands the context
→ Writes the update
→ Sends it on WhatsApp

Here's how it works 🧵

---

1/ Your client asks "what's the status?"

Instead of you context-switching, Voxly's AI agent:
• Pulls latest commits from GitHub
• Analyzes what changed
• Writes a human-readable summary
• Sends via WhatsApp or Telegram

---

2/ It uses a ReAct (Reason + Act) loop:

Think → Tool call → Observe → Think again

The agent can use tools like:
- get_recent_commits
- get_open_prs
- search_issues

Not a simple prompt — it reasons.

---

3/ BYOK — Bring Your Own Key

Use your own API keys:
- OpenAI GPT-4o
- Anthropic Claude 3.5
- Google Gemini
- Groq (ultra fast)
- Ollama (self-hosted, $0)

Your keys, your costs, your control.

---

4/ The killer feature: Vision

Client sends a bug screenshot via WhatsApp?

Voxly sends it to GPT-4o Vision → auto-creates a GitHub Issue with:
- Bug description
- Platform detection
- Screenshot attached

One WhatsApp message → GitHub issue. Done.

---

5/ Try it in 30 seconds:

npx create-voxly@latest my-agency

Open source, MIT licensed.

⭐ https://github.com/ravin972/voxly-backend
📦 https://www.npmjs.com/package/create-voxly

#buildinpublic #opensource #ai
```

---

## 📋 Where to Post (Priority Order)

1. **Hacker News** — Show HN (morning US time, ~10am ET)
2. **Twitter/X** — Thread (same time)
3. **Reddit r/selfhosted** — highest relevant audience
4. **Reddit r/SideProject** — indie makers
5. **Reddit r/webdev** — developer audience
6. **ProductHunt** — schedule for Monday (not weekend)
7. **awesome-selfhosted** — submit PR after you have 10+ stars
