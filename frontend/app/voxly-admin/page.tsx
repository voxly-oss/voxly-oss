'use client';

import { useState, useCallback } from 'react';
import { superAdminAPI } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemStats {
  total_tenants: number;
  active_tenants: number;
  total_clients: number;
  total_projects: number;
  total_messages: number;
  total_tokens_used: number;
}

interface Tenant {
  id: string;
  email: string;
  full_name: string | null;
  agency_name: string | null;
  is_active: boolean;
  subscription_tier: string;
  plan_name: string | null;
  client_count: number;
  project_count: number;
  message_count: number;
  created_at: string;
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────

function SecretGate({ onUnlock }: { onUnlock: (s: string) => void }) {
  const [secret, setSecret] = useState('');
  return (
    <div style={styles.gate}>
      <div style={styles.gateBox}>
        <div style={styles.shield}>🛡️</div>
        <h1 style={styles.gateTitle}>Voxly Command Center</h1>
        <p style={styles.gateSubtitle}>Owner access only. Enter your admin secret.</p>
        <input
          type="password"
          placeholder="X-Admin-Secret"
          value={secret}
          onChange={e => setSecret(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && secret && onUnlock(secret)}
          style={styles.secretInput}
          autoFocus
        />
        <button
          onClick={() => secret && onUnlock(secret)}
          style={styles.unlockBtn}
        >
          Unlock →
        </button>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ ...styles.statCard, borderTop: `3px solid ${accent ?? '#6366f1'}` }}>
      <div style={styles.statValue}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

// ─── Plan Badge ───────────────────────────────────────────────────────────────

function PlanBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    free: '#6b7280',
    pro: '#6366f1',
    enterprise: '#f59e0b',
  };
  return (
    <span style={{
      ...styles.badge,
      background: colors[tier] ?? '#374151',
    }}>
      {tier.toUpperCase()}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [adminSecret, setAdminSecret] = useState<string | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadData = useCallback(async (secret: string) => {
    setLoading(true);
    setError('');
    try {
      const [statsRes, tenantsRes] = await Promise.all([
        superAdminAPI.getStats(secret),
        superAdminAPI.getTenants(secret),
      ]);
      setStats(statsRes.data);
      setTenants(tenantsRes.data);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number } };
      if (err?.response?.status === 403) {
        setError('❌ Access denied. Check your admin credentials.');
        setAdminSecret(null);
      } else {
        setError('Failed to load data. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUnlock = (secret: string) => {
    setAdminSecret(secret);
    loadData(secret);
  };

  const handleToggleDisable = async (tenant: Tenant) => {
    if (!adminSecret) return;
    setActionLoading(tenant.id + '_disable');
    try {
      await superAdminAPI.toggleDisable(tenant.id, adminSecret);
      showToast(`${tenant.email} ${tenant.is_active ? 'disabled' : 'enabled'}`);
      loadData(adminSecret);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOverridePlan = async (tenant: Tenant, newTier: string) => {
    if (!adminSecret) return;
    setActionLoading(tenant.id + '_plan');
    try {
      await superAdminAPI.overridePlan(tenant.id, newTier, adminSecret);
      showToast(`${tenant.email} plan → ${newTier}`);
      loadData(adminSecret);
    } finally {
      setActionLoading(null);
    }
  };

  const handleImpersonate = async (tenant: Tenant) => {
    if (!adminSecret) return;
    if (!confirm(`⚠️ Impersonate ${tenant.email}? You'll get a 15-min session token.`)) return;
    setActionLoading(tenant.id + '_impersonate');
    try {
      const res = await superAdminAPI.impersonate(tenant.id, adminSecret);
      const { access_token } = res.data;
      navigator.clipboard.writeText(access_token);
      showToast(`Token copied! Expires in 15 min. Use as Bearer token.`);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = tenants.filter(t =>
    search === '' ||
    t.email.includes(search) ||
    (t.agency_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (!adminSecret) return <SecretGate onUnlock={handleUnlock} />;

  return (
    <div style={styles.page}>
      {/* Toast */}
      {toast && <div style={styles.toast}>{toast}</div>}

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🛡️ Voxly Command Center</h1>
          <p style={styles.subtitle}>Super Admin · Owner view</p>
        </div>
        <button onClick={() => loadData(adminSecret)} style={styles.refreshBtn}>
          ↻ Refresh
        </button>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {/* Stats */}
      {stats && (
        <div style={styles.statsGrid}>
          <StatCard label="Total Tenants" value={stats.total_tenants} accent="#6366f1" />
          <StatCard label="Active Tenants" value={stats.active_tenants} accent="#10b981" />
          <StatCard label="Total Clients" value={stats.total_clients} accent="#3b82f6" />
          <StatCard label="Total Projects" value={stats.total_projects} accent="#f59e0b" />
          <StatCard label="AI Messages" value={stats.total_messages} accent="#8b5cf6" />
          <StatCard label="Tokens Used" value={stats.total_tokens_used.toLocaleString()} accent="#ef4444" />
        </div>
      )}

      {/* Tenant Table */}
      <div style={styles.tableCard}>
        <div style={styles.tableHeader}>
          <h2 style={styles.tableTitle}>All Tenants ({filtered.length})</h2>
          <input
            placeholder="Search by email or agency..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {loading ? (
          <div style={styles.loading}>Loading tenants...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Agency', 'Email', 'Plan', 'Clients', 'Projects', 'Messages', 'Status', 'Actions'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(tenant => (
                  <tr key={tenant.id} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={styles.agencyName}>{tenant.agency_name ?? '—'}</div>
                      <div style={styles.joinedDate}>
                        Joined {new Date(tenant.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td style={styles.td}>{tenant.email}</td>
                    <td style={styles.td}>
                      <PlanBadge tier={tenant.subscription_tier} />
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>{tenant.client_count}</td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>{tenant.project_count}</td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>{tenant.message_count}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusDot,
                        background: tenant.is_active ? '#10b981' : '#ef4444'
                      }}>
                        {tenant.is_active ? '● Active' : '● Disabled'}
                      </span>
                    </td>
                    <td style={{ ...styles.td, minWidth: '260px' }}>
                      <div style={styles.actions}>
                        {/* Plan override */}
                        <select
                          defaultValue={tenant.subscription_tier}
                          onChange={e => handleOverridePlan(tenant, e.target.value)}
                          style={styles.planSelect}
                          disabled={actionLoading === tenant.id + '_plan'}
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="enterprise">Enterprise</option>
                        </select>

                        {/* Kill switch */}
                        <button
                          onClick={() => handleToggleDisable(tenant)}
                          disabled={actionLoading === tenant.id + '_disable'}
                          style={{
                            ...styles.actionBtn,
                            background: tenant.is_active ? '#7f1d1d' : '#14532d',
                          }}
                        >
                          {tenant.is_active ? '🔴 Disable' : '🟢 Enable'}
                        </button>

                        {/* Impersonate */}
                        <button
                          onClick={() => handleImpersonate(tenant)}
                          disabled={actionLoading === tenant.id + '_impersonate'}
                          style={{ ...styles.actionBtn, background: '#1e3a5f' }}
                        >
                          🎭 Login As
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0a0a0f',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '24px',
  },
  gate: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0f',
  },
  gateBox: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    maxWidth: '400px',
    width: '100%',
  },
  shield: { fontSize: '48px', marginBottom: '16px' },
  gateTitle: { fontSize: '24px', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px' },
  gateSubtitle: { color: '#6b7280', marginBottom: '24px', fontSize: '14px' },
  secretInput: {
    width: '100%',
    padding: '12px 16px',
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '16px',
    marginBottom: '12px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  unlockBtn: {
    width: '100%',
    padding: '12px',
    background: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  title: { fontSize: '28px', fontWeight: 800, color: '#f1f5f9', margin: 0 },
  subtitle: { color: '#6b7280', margin: '4px 0 0', fontSize: '14px' },
  refreshBtn: {
    padding: '8px 20px',
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '8px',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: '14px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '32px',
  },
  statCard: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '12px',
    padding: '20px',
  },
  statValue: { fontSize: '28px', fontWeight: 800, color: '#f1f5f9', marginBottom: '4px' },
  statLabel: { fontSize: '13px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tableCard: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #1f2937',
  },
  tableTitle: { fontSize: '18px', fontWeight: 700, margin: 0, color: '#f1f5f9' },
  searchInput: {
    padding: '8px 14px',
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '14px',
    outline: 'none',
    width: '260px',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    color: '#6b7280',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    background: '#0f172a',
    borderBottom: '1px solid #1f2937',
  },
  tr: { borderBottom: '1px solid #1f2937', transition: 'background 0.1s' },
  td: { padding: '14px 16px', fontSize: '14px', verticalAlign: 'middle' },
  agencyName: { fontWeight: 600, color: '#f1f5f9', marginBottom: '2px' },
  joinedDate: { fontSize: '12px', color: '#6b7280' },
  badge: {
    padding: '2px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: 'white',
  },
  statusDot: {
    fontSize: '12px',
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: '20px',
    color: 'white',
  },
  actions: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  planSelect: {
    padding: '6px 10px',
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '13px',
    cursor: 'pointer',
  },
  actionBtn: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  loading: { padding: '40px', textAlign: 'center', color: '#6b7280' },
  errorBanner: {
    background: '#7f1d1d',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '24px',
    color: '#fca5a5',
  },
  toast: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    background: '#10b981',
    color: 'white',
    padding: '12px 20px',
    borderRadius: '8px',
    fontWeight: 600,
    zIndex: 9999,
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  },
};
