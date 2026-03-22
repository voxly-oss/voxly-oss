# Voxly Frontend

Next.js 15 dashboard for dev agencies to manage clients, projects, and milestones with AI-powered WhatsApp interactions.

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui** components
- **React Query** (TanStack Query)
- **Axios** for API calls
- **React Hook Form** + Zod validation

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local

# Edit .env.local:
# NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                # Landing page
│   ├── (auth)/
│   │   ├── login/page.tsx      # Login page
│   │   └── register/page.tsx   # Register page
│   ├── dashboard/
│   │   ├── layout.tsx          # Dashboard layout (protected)
│   │   └── page.tsx            # Dashboard overview
│   ├── clients/
│   │   ├── layout.tsx          # Clients layout
│   │   ├── page.tsx            # Client list
│   │   ├── new/page.tsx        # Add client form
│   │   └── [id]/
│   │       ├── page.tsx        # Client detail
│   │       └── projects/
│   │           └── [projectId]/
│   │               └── milestones/page.tsx
│   └── projects/
│       ├── layout.tsx
│       └── page.tsx            # All projects
├── components/
│   ├── ui/                     # shadcn components
│   ├── DashboardLayout.tsx     # Sidebar & header
│   └── QueryProvider.tsx       # React Query provider
├── hooks/
│   ├── useAuth.tsx             # Auth context & hook
│   └── use-toast.ts            # Toast notifications
├── lib/
│   ├── api.ts                  # Axios API client
│   └── utils.ts                # Utility functions
└── types/
    └── index.ts                # TypeScript interfaces
```

## Features

- ✅ **Authentication** - Login, register, JWT protected routes
- ✅ **Dashboard** - Stats cards, recent clients & projects
- ✅ **Client Management** - List, create, edit, delete clients
- ✅ **Project Management** - Projects per client with GitHub links
- ✅ **Milestone Tracking** - Progress tracking per project
- ✅ **Responsive Design** - Mobile-friendly sidebar
- ✅ **Toast Notifications** - Success/error feedback
- ✅ **Loading States** - Skeleton loaders throughout

## API Integration

The frontend expects the backend API at `NEXT_PUBLIC_API_URL`. All protected routes include JWT token in Authorization header.

## Deployment

```bash
npm run build
npm start
```

For Vercel:
```bash
vercel deploy
```

## License

MIT
