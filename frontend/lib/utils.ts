import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/*
 * Form → API payload helpers. An untouched <input> reports "" — but the API
 * types optional fields strictly (Optional[date], Optional[EmailStr]) and
 * rejects "" with a 422. Create payloads omit blanks; update payloads send
 * null so a cleared field is actually cleared (update endpoints use
 * exclude_unset, so omitting it would silently keep the old value).
 */
export function undefinedIfBlank(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

export function nullIfBlank(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

/** True when an ISO timestamp falls in the viewer's current calendar month. */
export function isThisMonth(iso: string, now: Date = new Date()): boolean {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/**
 * Month-over-month note from raw counts. Use this instead of the API's
 * messages_delta_pct, which is a sentinel 100.0 whenever last month was 0 —
 * rendering it gave every workspace's first active month a fake "+100%".
 */
export function describeMonthOverMonth(thisMonth: number, lastMonth: number): { text: string; tone: 'muted' | 'good' | 'warn' } {
    if (lastMonth === 0) return { text: thisMonth === 0 ? 'No messages yet' : 'None last month', tone: 'muted' };
    const pct = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
    if (pct === 0) return { text: 'Same as last month', tone: 'muted' };
    return { text: `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}% vs last month`, tone: pct > 0 ? 'good' : 'warn' };
}

/** "owner/repo" from either that form or a pasted github.com URL. */
export function normalizeGithubRepo(value: string | null | undefined): string {
    return (value ?? '')
        .trim()
        .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace(/\/+$/, '');
}

export function formatDate(date: string | null): string {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function formatDateTime(date: string | null): string {
    if (!date) return "—";
    return new Date(date).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function formatPhone(phone: string): string {
    // Format phone number for display
    if (phone.startsWith("+91")) {
        return `+91 ${phone.slice(3, 8)} ${phone.slice(8)}`;
    }
    return phone;
}

export function getInitials(name: string): string {
    return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
}

export function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
        active: "bg-green-100 text-green-800",
        paused: "bg-yellow-100 text-yellow-800",
        completed: "bg-blue-100 text-blue-800",
        cancelled: "bg-red-100 text-red-800",
        pending: "bg-gray-100 text-gray-800",
        in_progress: "bg-blue-100 text-blue-800",
        blocked: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
}
