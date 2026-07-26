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

export interface DashboardStats {
    totalClients: number;
    activeProjects: number;
    messagesThisMonth: number;
    avgResponseTime: string;
}
