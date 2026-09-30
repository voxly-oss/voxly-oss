import axios from 'axios';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    headers: {
        'Content-Type': 'application/json',
    },
    // Security: enforce reasonable timeouts
    timeout: 30_000,
});

// Add JWT token to requests
api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

// Public pages that make credential requests. A 401 there is a wrong
// password / expired link the page itself reports — hard-redirecting to
// /login reloaded the page and wiped the error toast before it was seen.
const PUBLIC_AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/auth/'];

// Handle 401 errors — redirect to login (except for super admin routes which handle it themselves)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            if (typeof window !== 'undefined') {
                const { pathname } = window.location;
                // Don't auto-redirect from super admin — the page handles its own auth flow
                const isSuperAdminRoute = pathname.startsWith('/voxly-admin');
                const isPublicAuthRoute = PUBLIC_AUTH_PATHS.some((p) => pathname.startsWith(p));
                if (!isSuperAdminRoute && !isPublicAuthRoute) {
                    localStorage.removeItem('access_token');
                    window.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    }
);

/**
 * A human-readable message from an API error, safe to render.
 *
 * FastAPI returns `detail` as a string for HTTPException but as an ARRAY of
 * `{loc, msg, type}` objects for 422 validation errors. Passing that array
 * straight into a toast throws "Objects are not valid as a React child" and
 * takes down the whole app (the Toaster lives in the root layout).
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
    const response = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
    if (response?.status === 429) return 'Too many requests — please wait a moment and try again.';
    const detail = response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { loc?: unknown[]; msg?: string };
        if (typeof first?.msg === 'string') {
            // "Value error, '+1234' is not a valid phone number" → drop the pydantic prefix.
            const msg = first.msg.replace(/^Value error,\s*/i, '');
            const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : undefined;
            return typeof field === 'string' && field !== 'body'
                ? `${field.replace(/_/g, ' ')}: ${msg}`
                : msg;
        }
    }
    if ((err as { code?: string })?.code === 'ECONNABORTED') return 'The server took too long to respond. Try again.';
    if (!response && (err as { message?: string })?.message === 'Network Error') return 'Can’t reach the server. Check your connection and try again.';
    return fallback;
}

// ─── Auth API ───
export const authAPI = {
    login: (email: string, password: string) => {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        return api.post('/api/v1/auth/login', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
    },
    register: (data: {
        email: string;
        password: string;
        full_name?: string;
        agency_name?: string;
        phone?: string;
    }) => api.post('/api/v1/auth/register', data),
    // NOTE: me() uses the shared intercepted instance — do NOT call from /voxly-admin.
    // Use checkAdminSession() instead which uses the isolated adminApi.
    me: () => api.get('/api/v1/auth/me'),
    refresh: () => api.post('/api/v1/auth/refresh'),
    updateProfile: (data: {
        full_name?: string;
        agency_name?: string;
        phone?: string;
    }) => api.put('/api/v1/auth/profile', data),
    changePassword: (data: {
        current_password: string;
        new_password: string;
    }) => api.post('/api/v1/auth/change-password', data),
    googleLogin: (token: string) =>
        api.post('/api/v1/auth/google', { token }),
    githubRedirect: () =>
        `${api.defaults.baseURL}/api/v1/auth/github`,
    githubCallback: (code: string, state: string) =>
        api.post(
            `/api/v1/auth/github/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
            undefined,
            { withCredentials: true }
        ),
    requestPasswordReset: (email: string) =>
        api.post('/api/v1/auth/password-reset/request', { email }),
    confirmPasswordReset: (data: { token: string; new_password: string }) =>
        api.post('/api/v1/auth/password-reset/confirm', data),
    exportData: () => api.get('/api/v1/auth/me/export'),
    deleteAccount: () => api.delete('/api/v1/auth/me'),
};

// ─── Clients API ───
export const clientsAPI = {
    list: (params?: { skip?: number; limit?: number }) =>
        api.get('/api/v1/clients', { params }),
    create: (data: {
        name: string;
        phone: string;
        email?: string;
        company?: string;
        telegram_chat_id?: string;
    }) => api.post('/api/v1/clients', data),
    get: (id: string) => api.get(`/api/v1/clients/${id}`),
    update: (
        id: string,
        // null clears a field (backend updates use exclude_unset); omit to keep it.
        data: {
            name?: string;
            phone?: string;
            email?: string | null;
            company?: string | null;
            telegram_chat_id?: string | null;
            is_active?: boolean;
        }
    ) => api.put(`/api/v1/clients/${id}`, data),
    delete: (id: string) => api.delete(`/api/v1/clients/${id}`),
};

// ─── Projects API ───
export const projectsAPI = {
    list: (params?: { client_id?: string; skip?: number; limit?: number }) =>
        api.get('/api/v1/projects', { params }),
    create: (data: {
        client_id: string;
        name: string;
        description?: string;
        github_repo?: string;
        github_sync_enabled?: boolean;
        status?: string;
        start_date?: string;
        expected_end_date?: string;
    }) => api.post('/api/v1/projects', data),
    get: (id: string) => api.get(`/api/v1/projects/${id}`),
    update: (
        id: string,
        data: {
            name?: string;
            description?: string | null;
            github_repo?: string | null;
            github_sync_enabled?: boolean;
            status?: string;
            start_date?: string | null;
            expected_end_date?: string | null;
        }
    ) => api.put(`/api/v1/projects/${id}`, data),
    delete: (id: string) => api.delete(`/api/v1/projects/${id}`),
};

// ─── Milestones API ───
export const milestonesAPI = {
    list: (params?: { project_id?: string; skip?: number; limit?: number }) =>
        api.get('/api/v1/milestones', { params }),
    create: (data: {
        project_id: string;
        title: string;
        description?: string;
        status?: string;
        progress?: number;
        due_date?: string;
    }) => api.post('/api/v1/milestones', data),
    get: (id: string) => api.get(`/api/v1/milestones/${id}`),
    update: (
        id: string,
        data: {
            title?: string;
            description?: string | null;
            status?: string;
            progress?: number;
            due_date?: string | null;
        }
    ) => api.put(`/api/v1/milestones/${id}`, data),
    delete: (id: string) => api.delete(`/api/v1/milestones/${id}`),
};

// ─── Chat / Conversations API ───
// A "conversation" is a client's thread — `clientId` IS the conversation id,
// matching the backend model and the WebSocket `conversation_id` field.
// `GET /api/v1/chat/messages` (message-level feed) intentionally has no client
// here: the Conversation Center now uses `conversations()`, which groups
// server-side so a client's older messages can't fall off the page and take
// the whole conversation with them. The endpoint still exists for API
// consumers; add a wrapper back if a UI ever needs a flat message feed.
export const chatAPI = {
    /** Conversation-level list: one row per client, real server-side search,
     *  status filtering, and pagination over conversations (not messages). */
    conversations: (params?: {
        search?: string;
        status?: string;
        skip?: number;
        limit?: number;
    }) => api.get('/api/v1/chat/conversations', { params }),
    /** Full message thread for one conversation, plus its real backend status
     *  and the linked project's synced GitHub stats. */
    clientHistory: (clientId: string, limit?: number) =>
        api.get(`/api/v1/chat/history/${clientId}`, { params: { limit: limit ?? 50 } }),
    /** Current backend-computed state. 404s when no message has ever been
     *  processed for this client — that's "no state yet", not an error. */
    conversationStatus: (clientId: string) =>
        api.get(`/api/v1/chat/conversations/${clientId}/status`),
    /** Manual state transition (human takeover, approval, escalation).
     *  Broadcasts conversation.state_changed to every connected dashboard. */
    setConversationStatus: (clientId: string, status: string) =>
        api.patch(`/api/v1/chat/conversations/${clientId}/status`, { status }),
};

// ─── AI assistant (agency owner ↔ Voxly) ───
// context: "general" or "project:<uuid>" — the backend loads that project's
// status + synced GitHub stats into the system prompt.
export const aiAPI = {
    chat: (data: { message: string; context?: string }) =>
        // Tool-using replies (GitHub lookups + LLM) routinely outlast the 30s default.
        api.post<{ response: string; tools_used: string[] }>('/api/v1/ai/chat', data, { timeout: 90_000 }),
};

// ─── Channels API ───
// Read-only aggregate over chat_history. Returns one row per (client, channel)
// that has at least one real message — so a client with a phone number but no
// conversation yet correctly does not appear. Only "whatsapp" and "telegram"
// are ever returned; email is a one-way notification channel with no persisted
// conversation history to aggregate.
export const channelsAPI = {
    list: () => api.get('/api/v1/channels'),
};

// ─── Dashboard API ───
export const dashboardAPI = {
    stats: () => api.get('/api/v1/dashboard/stats'),
};

// ─── API Keys API ───
export const apiKeysAPI = {
    list: () => api.get('/api/v1/api-keys'),
    create: (data: { label: string; scopes?: string[]; expires_at?: string }) =>
        api.post('/api/v1/api-keys', data),
    get: (id: string) => api.get(`/api/v1/api-keys/${id}`),
    update: (id: string, data: { label?: string; scopes?: string[] }) =>
        api.patch(`/api/v1/api-keys/${id}`, data),
    revoke: (id: string) => api.delete(`/api/v1/api-keys/${id}`),
    rotate: (id: string) => api.post(`/api/v1/api-keys/${id}/rotate`),
};

// ─── Billing API ───
export const billingAPI = {
    getPlans: () => api.get('/api/v1/billing/plans'),
    getSubscription: () => api.get('/api/v1/billing/subscription'),
    createCheckout: (data: {
        plan_id: string;
        payment_gateway: 'stripe' | 'razorpay';
        billing_cycle?: 'monthly' | 'yearly';
    }) => api.post('/api/v1/billing/checkout', data),
    getUsage: () => api.get('/api/v1/billing/usage'),
    createPortal: () => api.post('/api/v1/billing/portal'),
};

// ─── Notifications API ───
export const notificationsAPI = {
    send: (data: { client_id: string; message: string }) =>
        api.post('/api/v1/notifications/send', data),
};

// ─── AI Keys (BYOK) API ───
export const aiKeysAPI = {
    providers: () => api.get('/api/v1/ai-keys/providers'),
    list: () => api.get('/api/v1/ai-keys'),
    add: (data: { provider: string; api_key: string; label?: string }) =>
        api.post('/api/v1/ai-keys', data),
    delete: (id: string) => api.delete(`/api/v1/ai-keys/${id}`),
    validate: (id: string) => api.post(`/api/v1/ai-keys/${id}/validate`),
};

// ─── Super Admin API — uses its own axios instance (NO 401 redirect interceptor) ───
// This is intentional: the super admin page manages its own session expiry UI.
// Never use the shared `api` instance here or the global interceptor will redirect to /login.
const adminApi = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
});

// Still attach the JWT token — but NO response interceptor
adminApi.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('access_token');
        if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const superAdminAPI = {
    getTenants: (adminSecret: string) =>
        adminApi.get('/voxly-admin/tenants', { headers: { 'X-Admin-Secret': adminSecret } }),
    getStats: (adminSecret: string) =>
        adminApi.get('/voxly-admin/stats', { headers: { 'X-Admin-Secret': adminSecret } }),
    overridePlan: (userId: string, tier: string, adminSecret: string) =>
        adminApi.patch(`/voxly-admin/users/${userId}/plan`,
            { subscription_tier: tier },
            { headers: { 'X-Admin-Secret': adminSecret } }
        ),
    toggleDisable: (userId: string, adminSecret: string) =>
        adminApi.patch(`/voxly-admin/users/${userId}/disable`, {}, { headers: { 'X-Admin-Secret': adminSecret } }),
    impersonate: (userId: string, adminSecret: string) =>
        adminApi.post(`/voxly-admin/impersonate/${userId}`, {}, { headers: { 'X-Admin-Secret': adminSecret } }),
    getTenantDetail: (userId: string, adminSecret: string) =>
        adminApi.get(`/voxly-admin/tenants/${userId}`, { headers: { 'X-Admin-Secret': adminSecret } }),
    getActivity: (adminSecret: string, limit = 50) =>
        adminApi.get(`/voxly-admin/activity?limit=${limit}`, { headers: { 'X-Admin-Secret': adminSecret } }),
};


// ─── Admin Session Check (NO 401 redirect — safe for /voxly-admin) ───────────
// Always use this on the /voxly-admin page instead of authAPI.me()
// authAPI.me() goes through the shared interceptor which WILL redirect to /login
export const checkAdminSession = () => adminApi.get('/api/v1/auth/me');

export default api;
