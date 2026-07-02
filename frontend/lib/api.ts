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

/** Structured payload emitted when the backend returns a 402 plan_limit_reached. */
export type PlanLimitDetail = {
    error: 'plan_limit_reached';
    resource: string;
    limit: number;
    plan: string;
    message: string;
};

/** Custom event name the global UpgradeModal listens for. */
export const PLAN_LIMIT_EVENT = 'voxly:plan-limit';

// ─── Silent refresh-token rotation ───
// On a 401, transparently exchange the stored refresh token for a new access
// token and retry the original request once, so short-lived access tokens don't
// log the user out mid-session. A single-flight promise coalesces concurrent 401s.
let refreshInFlight: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    const refresh_token = localStorage.getItem('refresh_token');
    if (!refresh_token) return null;

    if (!refreshInFlight) {
        refreshInFlight = axios
            .post(`${api.defaults.baseURL}/api/v1/auth/token/refresh`, { refresh_token })
            .then((res) => {
                const { access_token, refresh_token: rotated } = res.data;
                localStorage.setItem('access_token', access_token);
                if (rotated) localStorage.setItem('refresh_token', rotated);
                return access_token as string;
            })
            .catch(() => null)
            .finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
}

function forceLogout() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
}

// Handle 401 (auth, with silent refresh) and 402 (plan limit) responses globally.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error.response?.status;
        const original = error.config || {};

        if (status === 401 && typeof window !== 'undefined') {
            const isSuperAdminRoute = window.location.pathname.startsWith('/voxly-admin');
            const isRefreshCall = (original.url || '').includes('/auth/token/refresh');

            // Attempt one silent refresh + retry before giving up.
            if (!isSuperAdminRoute && !isRefreshCall && !original._retry) {
                const newToken = await tryRefreshToken();
                if (newToken) {
                    original._retry = true;
                    original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
                    return api(original);
                }
                forceLogout();
            } else if (!isSuperAdminRoute && !isRefreshCall) {
                forceLogout();
            }
        }

        // Plan limit reached → surface an upgrade prompt instead of a raw error.
        if (status === 402 && typeof window !== 'undefined') {
            const detail = error.response?.data?.detail;
            if (detail?.error === 'plan_limit_reached') {
                window.dispatchEvent(new CustomEvent<PlanLimitDetail>(PLAN_LIMIT_EVENT, { detail }));
            }
        }

        return Promise.reject(error);
    }
);

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
    me: () => api.get('/api/v1/auth/me'),
    refresh: () => api.post('/api/v1/auth/refresh'),
    refreshToken: (refresh_token: string) =>
        api.post('/api/v1/auth/token/refresh', { refresh_token }),
    logout: (refresh_token: string) =>
        api.post('/api/v1/auth/logout', { refresh_token }),
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
        data: {
            name?: string;
            phone?: string;
            email?: string;
            company?: string;
            telegram_chat_id?: string;
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
            description?: string;
            github_repo?: string;
            github_sync_enabled?: boolean;
            status?: string;
            start_date?: string;
            expected_end_date?: string;
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
            description?: string;
            status?: string;
            progress?: number;
            due_date?: string;
        }
    ) => api.put(`/api/v1/milestones/${id}`, data),
    delete: (id: string) => api.delete(`/api/v1/milestones/${id}`),
};

// ─── Chat API ───
export const chatAPI = {
    /** Get paginated messages across all user clients */
    allMessages: (params?: { skip?: number; limit?: number }) =>
        api.get('/api/v1/chat/messages', { params }),
    /** Get chat history for a specific client */
    clientHistory: (clientId: string, limit?: number) =>
        api.get(`/api/v1/chat/history/${clientId}`, { params: { limit: limit ?? 50 } }),
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

export default api;
