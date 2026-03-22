## **PROMPT 2: FRONTEND DASHBOARD (Claude/v0/Cursor)**

```markdown
# Task: Create Next.js 15 Dashboard for Client AI Platform

## Context
Build a modern, professional dashboard where dev agency owners can:
1. Add clients (name, phone, email)
2. Add projects for each client (name, GitHub repo)
3. Manage milestones (title, progress %, due date)
4. View chat history between clients and AI

## Tech Stack
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui components
- React Query (TanStack Query)
- Axios for API calls

## Requirements

### 1. Project Structure
```
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Landing page
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page
.tsx
│   ├── dashboard/
│   │   ├── layout.tsx
│   │   └── page.tsx                # Main dashboard
│   ├── clients/
│   │   ├── page.tsx                # Client list
│   │   ├── new/page.tsx            # Add client
│   │   └── [id]/
│   │       ├── page.tsx            # Client detail
│   │       └── projects/
│   │           └── [projectId]/
│   │               ├── page.tsx    # Project detail
│   │               └── milestones/page.tsx
│   └── api/
│       └── [...proxy]/route.ts     # Proxy to backend
├── components/
│   ├── ui/                         # shadcn components
│   ├── ClientTable.tsx
│   ├── ProjectCard.tsx
│   ├── MilestoneList.tsx
│   └── DashboardLayout.tsx
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   └── utils.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useClients.ts
│   └── useProjects.ts
└── types/
    └── index.ts
```

### 2. Setup shadcn/ui
```bash
npx shadcn@latest init
npx shadcn@latest add button input label card table dialog form select textarea badge progress
```

### 3. Key Pages

**Landing Page (app/page.tsx):**
- Hero section: "AI-powered client updates for dev agencies"
- Features: Auto WhatsApp replies, GitHub integration, Real-time status
- CTA: "Start Free Trial" → /register
- Pricing section
- Footer

**Login Page (app/(auth)/login/page.tsx):**
- Email input
- Password input
- "Remember me" checkbox
- Submit button
- Link to /register
- Use shadcn Form component with react-hook-form

**Dashboard (app/dashboard/page.tsx):**
Display 4 stat cards:
1. Total Clients (count)
2. Active Projects (count)
3. Messages This Month (count from chat_history)
4. Avg Response Time (calculated)

Below stats:
- Recent clients table (last 5)
- Recent chat messages (last 10)

**Client List (app/clients/page.tsx):**
- Table with columns: Name, Phone, Company, Projects Count, Last Message, Actions
- Search bar (filter by name)
- "Add Client" button → /clients/new
- Click row → /clients/{id}

**Add Client (app/clients/new/page.tsx):**
Form with:
- Name (required)
- Phone (required, format: +91XXXXXXXXXX)
- Email (optional)
- Company (optional)
- Submit button

**Client Detail (app/clients/[id]/page.tsx):**
- Client info card (name, phone, email, company)
- Edit button
- Projects list (cards):
  - Project name
  - GitHub repo link
  - Status badge
  - Progress bar
  - "View Details" button
- "Add Project" button

**Project Detail with Milestones (app/clients/[id]/projects/[projectId]/milestones/page.tsx):**
- Project header (name, repo, status)
- GitHub stats card:
  - Commits (last 7 days): X
  - Open issues: X
  - Progress: X%
  - Last commit: message + date
- Milestones section:
  - List of milestones with:
    - Title
    - Progress slider (0-100%)
    - Due date
    - Status badge
    - Edit/Delete icons
- "Add Milestone" button
- Chat history tab (messages between client and AI)

### 4. API Integration (lib/api.ts)

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
});

// Add JWT token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API functions
export const authAPI = {
  login: (email: string, password: string) => 
    api.post('/api/v1/auth/login', { email, password }),
  register: (data: any) => 
    api.post('/api/v1/auth/register', data),
  me: () => 
    api.get('/api/v1/auth/me'),
};

export const clientsAPI = {
  list: () => api.get('/api/v1/clients'),
  create: (data: any) => api.post('/api/v1/clients', data),
  get: (id: string) => api.get(`/api/v1/clients/${id}`),
  update: (id: string, data: any) => api.put(`/api/v1/clients/${id}`, data),
  delete: (id: string) => api.delete(`/api/v1/clients/${id}`),
};

export const projectsAPI = {
  list: () => api.get('/api/v1/projects'),
  create: (data: any) => api.post('/api/v1/projects', data),
  get: (id: string) => api.get(`/api/v1/projects/${id}`),
  update: (id: string, data: any) => api.put(`/api/v1/projects/${id}`, data),
  delete: (id: string) => api.delete(`/api/v1/projects/${id}`),
};

export const milestonesAPI = {
  list: (projectId: string) => api.get(`/api/v1/milestones?project_id=${projectId}`),
  create: (data: any) => api.post('/api/v1/milestones', data),
  update: (id: string, data: any) => api.put(`/api/v1/milestones/${id}`, data),
  delete: (id: string) => api.delete(`/api/v1/milestones/${id}`),
};

export default api;
```

### 5. Auth Hook (hooks/useAuth.ts)

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setLoading(false);
        return;
      }
      const { data } = await authAPI.me();
      setUser(data);
    } catch (error) {
      localStorage.removeItem('access_token');
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const { data } = await authAPI.login(email, password);
    localStorage.setItem('access_token', data.access_token);
    setUser(data.user);
    router.push('/dashboard');
  }

  async function logout() {
    localStorage.removeItem('access_token');
    setUser(null);
    router.push('/login');
  }

  return { user, loading, login, logout };
}
```

### 6. Dashboard Layout (components/DashboardLayout.tsx)

Create a layout with:
- Sidebar (left):
  - Logo
  - Nav links: Dashboard, Clients, Projects, Settings
  - User profile at bottom (avatar, name, logout button)
- Header (top):
  - Page title
  - Search bar
  - Notifications icon
  - User dropdown
- Main content area (scrollable)

Use shadcn components: Button, Avatar, DropdownMenu

### 7. TypeScript Types (types/index.ts)

```typescript
export interface User {
  id: string;
  email: string;
  full_name: string;
  agency_name: string;
  subscription_tier: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  created_at: string;
}

export interface Project {
  id: string;
  client_id: string;
  name: string;
  description?: string;
  github_repo: string;
  status: 'active' | 'paused' | 'completed';
  start_date?: string;
  expected_end_date?: string;
  created_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  progress: number;
  due_date?: string;
  completed_at?: string;
}

export interface ChatMessage {
  id: string;
  client_id: string;
  message: string;
  response: string;
  created_at: string;
}
```

### 8. Design Guidelines

**Colors (Tailwind):**
- Primary: blue-600
- Success: green-600
- Warning: yellow-600
- Danger: red-600
- Background: gray-50
- Card: white

**Typography:**
- Headings: font-semibold
- Body: font-normal text-gray-700

**Spacing:**
- Consistent padding: p-6 for cards
- Gap between elements: space-y-4

**Components:**
- Use shadcn/ui for all form elements
- Add loading states (skeleton loaders)
- Add error states (alert messages)
- Add empty states (empty illustrations + text)

### 9. Deliverables

1. Complete Next.js app with all pages
2. Working authentication flow
3. Client CRUD interface
4. Project management UI
5. Milestone progress tracking
6. Responsive design (mobile-friendly)
7. Loading states
8. Error handling
9. TypeScript types for all data

## Important Notes
- Use 'use client' for components with hooks
- Implement proper error boundaries
- Add toast notifications for actions (success/error)
- Use React Query for data fetching (optional but recommended)
- Add proper form validation
- Use next/image for optimized images
- Add proper meta tags for SEO

Generate the complete frontend code now.
```