import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import axiosInstance from '../api/axiosInstance';
import { extractApiError } from '../utils/apiError';
import type React from 'react';

type Period = 'week' | 'month' | 'year';

interface AnalyticsSummary {
  total_events: number;
  total_registrations: number;
  avg_attendance_rate: number;
  revenue: number;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'year', label: 'Last year' },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axiosInstance.get<AnalyticsSummary>('/api/analytics/summary/', { params: { period } })
      .then((res) => setSummary(res.data))
      .catch((err) => setError(extractApiError(err, 'Failed to load analytics data.')))
      .finally(() => setLoading(false));
  }, [period]);

  const barData = summary ? [
    { name: 'Events', value: summary.total_events },
    { name: 'Registrations', value: summary.total_registrations },
  ] : [];

  const lineData = summary ? [{ name: period, revenue: parseFloat(String(summary.revenue)) }] : [];
  const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

  return (
    <div className="page">
      <Link to="/dashboard" className="back-link">← Dashboard</Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Performance overview across your events
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.375rem', background: '#f1f5f9', borderRadius: '8px', padding: '0.25rem' }}>
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              style={{ padding: '0.375rem 0.875rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
                background: period === p.value ? '#fff' : 'transparent',
                color: period === p.value ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                boxShadow: period === p.value ? 'var(--shadow-sm)' : 'none',
                transition: 'all 150ms ease' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="loading-text">Loading analytics…</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {summary && !loading && (
        <>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1.75rem' }}>
            <StatCard label="Total Events" value={String(summary.total_events)} accent="#4f46e5" />
            <StatCard label="Total Registrations" value={String(summary.total_registrations)} accent="#0891b2" />
            <StatCard label="Avg Attendance Rate" value={`${summary.avg_attendance_rate.toFixed(1)}%`} accent="#16a34a" />
            <StatCard label="Revenue" value={fmt(parseFloat(String(summary.revenue)))} accent="#d97706" />
          </div>

          <div className="charts-row">
            <div style={s.chartCard}>
              <h2 style={s.chartTitle}>Events &amp; Registrations</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={barData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem' }} />
                  <Bar dataKey="value" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={s.chartCard}>
              <h2 style={s.chartTitle}>Revenue</h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={lineData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => typeof v === 'number' ? fmt(v) : v}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem' }} />
                  <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 5, fill: '#16a34a' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${accent}` }}>
      <p className="stat-label">{label}</p>
      <p className="stat-value" style={{ color: accent, fontSize: '1.5rem' }}>{value}</p>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  chartCard: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' },
  chartTitle: { margin: '0 0 1.25rem', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text)' },
};
