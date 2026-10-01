export interface User {
    id: string;
    email: string;
    full_name: string | null;
    agency_name: string | null;
    phone: string | null;
    subscription_tier: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface Client {
    id: string;
    user_id: string;
    name: string;
    phone: string;
    email: string | null;
    company: string | null;
    telegram_chat_id: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface Project {
    id: string;
    client_id: string;
    name: string;
    description: string | null;
    github_repo: string | null;
    github_sync_enabled: boolean;
    status: 'active' | 'paused' | 'completed' | 'cancelled';
    start_date: string | null;
    expected_end_date: string | null;
    created_at: string;
    updated_at: string;
    /** Real synced GitHub stats from the github_cache table. Null when the
     *  project has no repo or has never synced. */
    github_stats?: GitHubStats | null;
}

export interface Milestone {
    id: string;
    project_id: string;
    title: string;
    description: string | null;
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
    progress: number;
    due_date: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

// ─── Conversations ───
// These mirror backend/app/schemas/conversation.py exactly. A "conversation"
// is a client's thread — this system has no separate conversation entity, so
// `client_id` is the conversation id everywhere, including on WebSocket events.

export type ConversationStatus = 'awaiting_human' | 'ai_handling' | 'resolved' | 'escalated';

export interface GitHubStats {
    commits_count: number;
    commits_last_7_days: number;
    open_issues: number;
    closed_issues: number;
    pull_requests: number;
    last_commit_message: string | null;
    last_commit_date: string | null;
    progress_percent: number;
    synced_at: string | null;
}

/** One `chat_history` row. Shape is shared by GET /chat/history/{id},
 *  GET /chat/messages, and the conversation.message_completed WS payload. */
export interface ChatMessage {
    id: string;
    client_id: string;
    client_name: string;
    project_id: string | null;
    message: string;
    /** Kept for backward compatibility; `ai_response` is the alias to prefer. */
    response: string;
    ai_response: string;
    tokens_used: number;
    model_used: string | null;
    channel: string;
    confidence: number | null;
    sentiment: string | null;
    language: string | null;
    ai_response_time_ms: number | null;
    created_at: string;
}

/** GET /api/v1/chat/conversations — one row per client, grouped server-side. */
export interface ConversationSummary {
    client_id: string;
    client_name: string;
    channel: string;
    last_message: string;
    last_response: string | null;
    last_message_at: string;
    message_count: number;
    status: ConversationStatus | null;
    status_updated_at: string | null;
    confidence: number | null;
    sentiment: string | null;
    github_stats: GitHubStats | null;
}

export interface ConversationsListResponse {
    total: number;
    count: number;
    conversations: ConversationSummary[];
}

/* ─── Inbox (per-message store) — backend/app/api/v1/messages.py ─── */

export type MessageChannel = 'whatsapp' | 'telegram';
export type MessageStatus = 'received' | 'queued' | 'sent' | 'failed';

/** One message in a thread. `author_type` is who wrote it: the client, the AI, or a teammate. */
export interface ThreadMessage {
    id: string;
    client_id: string;
    project_id: string | null;
    channel: MessageChannel | string;
    direction: 'inbound' | 'outbound';
    author_type: 'client' | 'ai' | 'agent';
    author_user_id: string | null;
    body: string;
    status: MessageStatus;
    error: string | null;
    reply_to_id: string | null;
    model_used: string | null;
    created_at: string | null;
}

/** GET /api/v1/conversations/{client_id}/messages — oldest → newest within the page. */
export interface MessagePage {
    messages: ThreadMessage[];
    has_more: boolean;
}

export interface InboxConversation {
    client_id: string;
    client_name: string;
    channel: string;
    last_message: ThreadMessage;
    message_count: number;
    status: ConversationStatus | null;
    /** The client wrote last and nobody has answered yet. */
    awaiting_reply: boolean;
}

export interface InboxPage {
    total: number;
    conversations: InboxConversation[];
}

/* ─── Voxly chat link (the native channel) — backend/app/api/v1/portal.py ─── */

/** GET/POST /api/v1/clients/{id}/chat-link — the agency's view of the link. */
export interface ChatLink {
    active: boolean;
    url: string | null;
    created_at: string | null;
    last_opened_at: string | null;
    /** Coarse, e.g. "Chrome on Android" — no IP or raw user agent is kept. */
    last_opened_device: string | null;
}

export interface PortalProfile {
    client_id: string;
    client_name: string;
    agency_name: string;
}

export interface PortalSession {
    access_token: string;
    token_type: string;
    expires_in: number;
    profile: PortalProfile;
}

/** A message as the client sees it: no teammate ids, models or errors. */
export interface PortalMessage {
    id: string;
    /** inbound = written by the client */
    direction: 'inbound' | 'outbound';
    author_type: 'client' | 'ai' | 'agent';
    channel: string;
    body: string;
    status: MessageStatus;
    created_at: string | null;
}

export interface PortalMessagePage {
    messages: PortalMessage[];
    has_more: boolean;
}

/** GET /api/v1/conversations/{client_id} */
export interface ConversationDetail {
    client_id: string;
    client_name: string;
    status: ConversationStatus | null;
    status_updated_at: string | null;
    /** A teammate owns the conversation, so the AI won't auto-reply. */
    ai_paused: boolean;
    channels: string[];
    default_channel: string | null;
    github_stats: GitHubStats | null;
}

/** GET /api/v1/chat/history/{client_id} */
export interface ChatHistoryResponse {
    client_id: string;
    client_name: string;
    status: ConversationStatus | null;
    status_updated_at: string | null;
    count: number;
    messages: ChatMessage[];
    github_stats: GitHubStats | null;
}

/** GET /api/v1/channels — real per-client, per-channel activity aggregated
 *  from chat_history. `channel` is only ever "whatsapp" or "telegram". */
export interface ChannelActivity {
    client_id: string;
    channel: string;
    volume_today: number;
    last_activity: string | null;
}

/** GET / PATCH /api/v1/chat/conversations/{client_id}/status */
export interface ConversationState {
    client_id: string;
    status: ConversationStatus;
    updated_at: string | null;
    updated_by_user_id: string | null;
}

// Form types
export interface LoginForm {
    email: string;
    password: string;
}

export interface RegisterForm {
    email: string;
    password: string;
    full_name?: string;
    agency_name?: string;
    phone?: string;
}

export interface ClientForm {
    name: string;
    phone: string;
    email?: string;
    company?: string;
    telegram_chat_id?: string;
}

export interface ProjectForm {
    client_id: string;
    name: string;
    description?: string;
    github_repo?: string;
    github_sync_enabled?: boolean;
    status?: string;
    start_date?: string;
    expected_end_date?: string;
}

export interface MilestoneForm {
    project_id: string;
    title: string;
    description?: string;
    status?: string;
    progress?: number;
    due_date?: string;
}

// API Response types
export interface TokenResponse {
    access_token: string;
    token_type: string;
}

/** GET /api/v1/dashboard/stats — mirrors DashboardStatsResponse in
 *  backend/app/api/v1/dashboard.py. (The camelCase shape that used to be
 *  here matched nothing the API returns.) */
export interface DashboardStats {
    total_clients: number;
    active_clients: number;
    total_projects: number;
    active_projects: number;
    completed_projects: number;
    total_messages: number;
    messages_this_month: number;
    messages_last_month: number;
    /** New clients this month MINUS new clients last month — not a count. */
    clients_delta: number;
    projects_delta: number;
    /** Month-over-month %. Sentinel 100.0 when last month had no messages. */
    messages_delta_pct: number;
    /** Last 7 UTC days, oldest first. */
    messages_by_day: { date: string; count: number }[];
    recent_activity: { type: string; title: string; timestamp: string }[];
    recent_ai_messages: { client_name: string; provider: string; response_length: number; timestamp: string }[];
    integrations: { whatsapp: boolean; telegram: boolean; github: boolean; ai_provider: string };
    /** % of messages NOT answered without project context (model_used != "no_project"). */
    ai_accuracy: number;
}
