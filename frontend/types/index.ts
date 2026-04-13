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

export interface ChatMessage {
    id: string;
    client_id: string;
    project_id: string | null;
    message: string;
    response: string;
    tokens_used: number;
    model_used: string | null;
    created_at: string;
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
