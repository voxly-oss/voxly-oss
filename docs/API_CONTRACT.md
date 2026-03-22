# Voxly — API Contract Reference

> **Base URL:** `http://localhost:8000` (local) / `https://api.voxly.app` (production)  
> **API Version:** v1  
> **Auth:** Bearer JWT token in `Authorization: Bearer <token>` header (unless noted as Public)

---

## Authentication (`/api/v1/auth`)

### POST `/api/v1/auth/register` — Public
Register a new agency account.

**Request:**
```json
{
  "email": "agency@example.com",
  "password": "StrongPass123",
  "full_name": "Ravin Pandey",
  "agency_name": "Voxly Labs"
}
```
**Response `201`:**
```json
{
  "id": "uuid",
  "email": "agency@example.com",
  "full_name": "Ravin Pandey",
  "agency_name": "Voxly Labs",
  "is_active": true,
  "created_at": "2026-03-21T00:00:00Z"
}
```
**Errors:** `400` email already registered

---

### POST `/api/v1/auth/login` — Public
Login with email + password. Returns JWT.

**Request** (`application/x-www-form-urlencoded`):
```
username=agency@example.com&password=StrongPass123
```
**Response `200`:**
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "bearer"
}
```
**Errors:** `401` incorrect credentials

---

### GET `/api/v1/auth/me` — 🔒 Auth Required
Get current user profile.

**Response `200`:**
```json
{
  "id": "uuid",
  "email": "agency@example.com",
  "full_name": "Ravin Pandey",
  "agency_name": "Voxly Labs",
  "subscription_tier": "pro"
}
```

---

### POST `/api/v1/auth/password-reset/request` — Public · Rate: 3/min
Trigger a password reset email.

**Request:**
```json
{ "email": "agency@example.com" }
```
**Response `200`:**
```json
{ "message": "If that email exists, a reset link has been sent." }
```
> Always returns 200 (prevents email enumeration).

---

### POST `/api/v1/auth/password-reset/confirm` — Public
Submit new password with reset token.

**Request:**
```json
{
  "token": "reset-token-from-email",
  "new_password": "NewStrongPass456"
}
```
**Response `200`:** `{ "message": "Password reset successful." }`  
**Errors:** `400` invalid or expired token

---

### GET `/api/v1/auth/google` — Public
Redirect to Google OAuth. Browser navigate only.

### GET `/api/v1/auth/github` — Public
Redirect to GitHub OAuth. Browser navigate only.

### GET `/api/v1/auth/linkedin` — Public
Redirect to LinkedIn OAuth. Browser navigate only.

---

## Clients (`/api/v1/clients`) — 🔒 Auth Required

### GET `/api/v1/clients`
List all clients for the authenticated user.

**Query params:** `skip=0`, `limit=100`

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "name": "Acme Corp",
    "phone": "+919876543210",
    "email": "client@acme.com",
    "company": "Acme Corp",
    "is_active": true,
    "created_at": "..."
  }
]
```

---

### POST `/api/v1/clients`
Create a new client.

**Request:**
```json
{
  "name": "Acme Corp",
  "phone": "+919876543210",
  "email": "client@acme.com",
  "company": "Acme Corp"
}
```
**Response `201`:** Client object  
**Errors:** `400` phone already exists for this user

---

### GET `/api/v1/clients/{client_id}`
Get single client by ID.

**Response `200`:** Client object  
**Errors:** `404` not found or not yours

---

### PATCH `/api/v1/clients/{client_id}`
Update client fields (partial update allowed).

**Request:** Any subset of client fields  
**Response `200`:** Updated client object

---

### DELETE `/api/v1/clients/{client_id}`
Delete a client and all their data (cascade).

**Response `204`:** No content  
**Errors:** `404` not found or not yours

---

## Projects (`/api/v1/projects`) — 🔒 Auth Required

### GET `/api/v1/projects`
List all projects. Optional filter: `?client_id=uuid`

### POST `/api/v1/projects`
Create a new project.

**Request:**
```json
{
  "client_id": "uuid",
  "name": "Voxly App v2",
  "description": "AI-powered WhatsApp project manager",
  "github_repo": "ravin972/voxly",
  "status": "active",
  "start_date": "2026-01-01",
  "expected_end_date": "2026-06-30"
}
```

### GET `/api/v1/projects/{project_id}`
### PATCH `/api/v1/projects/{project_id}`
### DELETE `/api/v1/projects/{project_id}`

---

## Milestones (`/api/v1/milestones`) — 🔒 Auth Required

### GET `/api/v1/milestones?project_id=uuid`
### POST `/api/v1/milestones`

**Request:**
```json
{
  "project_id": "uuid",
  "title": "MVP Launch",
  "description": "First working version",
  "status": "in_progress",
  "progress": 65,
  "due_date": "2026-04-30"
}
```

### PATCH `/api/v1/milestones/{milestone_id}`
### DELETE `/api/v1/milestones/{milestone_id}`

---

## Chat (`/api/v1/chat`) — 🔒 Auth Required

### GET `/api/v1/chat/history/{client_id}`
Get chat history for a client.

**Query params:** `limit=50`

**Response `200`:**
```json
{
  "client_id": "uuid",
  "client_name": "Acme Corp",
  "count": 5,
  "messages": [
    {
      "id": "uuid",
      "message": "What's the project status?",
      "response": "Here's the latest update...",
      "tokens_used": 342,
      "model_used": "gpt-4o",
      "created_at": "..."
    }
  ]
}
```

---

### GET `/api/v1/chat/messages`
All messages across all clients (for Messages page).

**Query params:** `skip=0`, `limit=50`

---

### WebSocket `ws://localhost:8000/api/v1/chat/ws?token=<jwt>`
Real-time updates pushed to agency dashboard.

**Message types received:**
```json
{ "type": "new_message", "message": { ... } }
{ "type": "pong" }
```
**Send to keepalive:**
```json
{ "type": "ping" }
```

---

## WhatsApp (`/api/v1/whatsapp`) — Public (Twilio Signed)

### POST `/api/v1/whatsapp/webhook`
Twilio inbound webhook. Webhook validation via `X-Twilio-Signature` header.  
> Never call this yourself. Twilio calls it automatically.

---

## GitHub (`/api/v1/github`) — Public (GitHub HMAC Signed)

### POST `/api/v1/github/webhook`
GitHub webhook. Validated via `X-Hub-Signature-256`.  
Supports events: `push`, `workflow_run`

> On `push`: sends WhatsApp notification to project's client  
> On `workflow_run` failure: analyzes build logs and notifies

---

## AI Agent (`/api/v1/ai`) — 🔒 Auth Required · Rate: 20/min

### POST `/api/v1/ai/chat`
Agency owner talks to the Voxly AI (uses ReAct agent with GitHub tools).

**Request:**
```json
{
  "message": "What's the current status of the Acme project?",
  "context": "general"
}
```
**Response `200`:**
```json
{
  "response": "Here's the latest status...",
  "tools_used": ["github_search_issues"]
}
```

---

## AI Keys/BYOK (`/api/v1/ai-keys`) — 🔒 Auth Required

### GET `/api/v1/ai-keys`
List user's stored AI keys (keys are masked).

### POST `/api/v1/ai-keys`
**Request:**
```json
{
  "provider": "openai",
  "api_key": "sk-...",
  "label": "My OpenAI key"
}
```

### POST `/api/v1/ai-keys/{key_id}/validate`
Test if a stored key works.

### DELETE `/api/v1/ai-keys/{key_id}`

---

## Notifications (`/api/v1/notifications`) — 🔒 Auth Required · Rate: 10/min

### POST `/api/v1/notifications/send`
Send a custom follow-up WhatsApp to a client.

**Request:**
```json
{
  "client_id": "uuid",
  "message": "Hey! Just checking in on the project feedback."
}
```
**Response `200`:**
```json
{
  "success": true,
  "client_name": "Acme Corp",
  "message": "Hey! Just checking in..."
}
```

---

## Dashboard (`/api/v1/dashboard`) — 🔒 Auth Required

### GET `/api/v1/dashboard`
Aggregate stats for the dashboard home page.

**Response `200`:**
```json
{
  "total_clients": 5,
  "active_projects": 3,
  "messages_today": 12,
  "tokens_used_today": 4200
}
```

---

## Billing (`/api/v1/billing`) — 🔒 Auth Required

### POST `/api/v1/billing/checkout`
Create a Stripe/Razorpay checkout session.

**Request:**
```json
{
  "plan_slug": "pro",
  "interval": "monthly"
}
```
**Response:** `{ "checkout_url": "https://checkout.stripe.com/..." }`

### POST `/api/v1/billing/portal`
Create a billing portal session for subscription management.

### GET `/api/v1/billing/plans`
List all available plans (Public).

---

## Error Response Format

All errors follow this structure:
```json
{
  "detail": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request / validation error |
| `401` | Not authenticated |
| `403` | Forbidden (authenticated but not authorized) |
| `404` | Resource not found |
| `422` | Pydantic validation error |
| `429` | Rate limit exceeded |
| `500` | Internal server error (always generic message to client) |
