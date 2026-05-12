import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import axiosInstance from '../api/axiosInstance';
import { useDashboardSocket, type EventStats } from '../hooks/useDashboardSocket';
import { extractApiError } from '../utils/apiError';
import { IconBrain, IconPlus, IconAlertTriangle, IconCalendar, IconMapPin } from '../components/Icons';
import type React from 'react';

interface Event {
  id: string;
  name: string;
  date: string;
  venue: string;
  capacity: number;
  confirmed: number;
  available_seats: number;
  status: string;
  alert_triggered: boolean;
}

interface AIBriefing {
  health_score: number | null;
  summary: string;
  mood: 'excellent' | 'good' | 'attention' | 'critical';
  recommendations: { event_name: string; action: string; priority: string }[];
}

const MOOD_COLORS: Record<string, string> = {
  excellent: '#16a34a', good: '#0891b2', attention: '#d97706', critical: '#dc2626',
};

const MOOD_BG: Record<string, string> = {
  excellent: '#f0fdf4', good: '#f0f9ff', attention: '#fffbeb', critical: '#fef2f2',
};

function mergeStats(events: Event[], update: EventStats): Event[] {
  return events.map((ev) =>
    ev.id === update.event_id
      ? { ...ev, name: update.name, capacity: update.capacity, confirmed: update.confirmed,
          available_seats: update.available_seats, status: update.status, alert_triggered: update.alert_triggered }
      : ev
  );
}

export default function Dashboard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiBriefing, setAiBriefing] = useState<AIBriefing | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const listRes = await axiosInstance.get<{ results: Event[] } | Event[]>('/api/events/', {
        params: { status: 'active' },
      });
      const rawEvents: Event[] = Array.isArray(listRes.data) ? listRes.data : listRes.data.results;
      const enriched = await Promise.all(
        rawEvents.map(async (ev) => {
          try {
            const statsRes = await axiosInstance.get<{ capacity: number; confirmed: number; available_seats: number }>(
              `/api/events/${ev.id}/stats/`
            );
            return { ...ev, ...statsRes.data };
          } catch { return ev; }
        })
      );
      setEvents(enriched);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load dashboard data. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    axiosInstance.get('/api/ai/dashboard-insights/')
      .then(res => setAiBriefing(res.data))
      .catch(() => {});
  }, []);

  useDashboardSocket((update) => { setEvents((prev) => mergeStats(prev, update)); });

  const totalEvents = events.length;
  const totalConfirmed = events.reduce((s, e) => s + (e.confirmed ?? 0), 0);
  const alertCount = events.filter((e) => e.alert_triggered).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Live overview of all active events
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <Link to="/ai-insights" className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <IconBrain size={15} /> AI Insights
          </Link>
          <Link to="/events/new" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <IconPlus size={15} /> New Event
          </Link>
        </div>
      </div>

      {!loading && !error && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: '1.75rem' }}>
          <SummaryCard label="Active Events" value={totalEvents} color="var(--color-primary)" />
          <SummaryCard label="Total Registrations" value={totalConfirmed} color="#0891b2" />
          <SummaryCard label="Alerts Triggered" value={alertCount} color={alertCount > 0 ? 'var(--color-warning)' : 'var(--color-success)'} />
        </div>
      )}

      {loading && <div className="loading-text">Loading events…</div>}
      {error && <div className="alert alert-error" role="alert" aria-live="polite">{error}</div>}

      {aiBriefing && (
        <div style={{
          background: MOOD_BG[aiBriefing.mood] ?? '#f0f9ff',
          border: `1px solid ${MOOD_COLORS[aiBriefing.mood] ?? '#7dd3fc'}`,
          borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
            <IconBrain size={22} color={MOOD_COLORS[aiBriefing.mood]} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ margin: '0 0 0.15rem', fontSize: '0.75rem', fontWeight: 700, color: MOOD_COLORS[aiBriefing.mood], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                AI Briefing{aiBriefing.health_score !== null ? ` · Health ${aiBriefing.health_score}/100` : ''}
              </p>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151' }}>{aiBriefing.summary}</p>
            </div>
          </div>
          <Link to="/ai-insights" className="btn btn-sm btn-secondary" style={{ flexShrink: 0 }}>
            Full Insights
          </Link>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="empty-state">
          <p>No active events yet.</p>
          <Link to="/events/new" className="btn btn-primary">Create your first event</Link>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div style={s.grid}>
          {events.map((ev) => <EventCard key={ev.id} event={ev} />)}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <p className="stat-label">{label}</p>
      <p className="stat-value" style={{ color }}>{value}</p>
    </div>
  );
}

function EventCard({ event }: { event: Event }) {
  const isFull = event.available_seats === 0;
  const fillPct = event.capacity > 0 ? Math.round(((event.confirmed ?? 0) / event.capacity) * 100) : 0;
  const chartData = [
    { name: 'Confirmed', value: event.confirmed ?? 0 },
    { name: 'Available', value: event.available_seats ?? 0 },
  ];

  return (
    <div style={{
      ...s.card,
      border: event.alert_triggered ? '2px solid #f59e0b' : '1px solid #e2e8f0',
      boxShadow: event.alert_triggered ? '0 0 0 3px rgba(245,158,11,0.15), 0 2px 8px rgba(0,0,0,0.05)' : '0 2px 8px rgba(0,0,0,0.05)',
      background: event.alert_triggered ? '#fffdf5' : '#fff',
    }}>
      <div style={s.cardTop}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.cardTitleRow}>
            <span style={s.cardTitle}>{event.name}</span>
            <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
              {event.alert_triggered && <span className="badge badge-orange">⚠ Alert</span>}
              {isFull && <span className="badge badge-red">Full</span>}
            </div>
          </div>
          <p style={s.cardMeta}>
            <IconCalendar size={11} color="#94a3b8" style={{ marginRight: '3px', verticalAlign: 'middle' }} />
            {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {event.venue && (
              <><span style={{ margin: '0 4px', color: '#cbd5e1' }}>·</span>
              <IconMapPin size={11} color="#94a3b8" style={{ marginRight: '3px', verticalAlign: 'middle' }} />
              {event.venue}</>
            )}
          </p>
        </div>
      </div>

      {event.alert_triggered && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.775rem', color: '#92400e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <IconAlertTriangle size={14} color="#d97706" style={{ flexShrink: 0 }} />
          Low ticket alert — only <strong style={{ margin: '0 2px' }}>{event.available_seats}</strong> seat{event.available_seats !== 1 ? 's' : ''} remaining
        </div>
      )}

      <div style={s.capacityWrap}>
        <div style={s.capacityRow}>
          <span style={s.capacityLabel}>Capacity</span>
          <span style={s.capacityPct}>{fillPct}% filled</span>
        </div>
        <div style={s.progressTrack}>
          <div style={{ ...s.progressFill, width: `${fillPct}%`, background: isFull ? '#dc2626' : fillPct > 80 ? '#d97706' : '#4f46e5' }} />
        </div>
      </div>

      <div style={s.statsRow}>
        <StatPill label="Capacity" value={event.capacity} />
        <StatPill label="Confirmed" value={event.confirmed ?? 0} />
        <StatPill label="Available" value={event.available_seats ?? 0} highlight={isFull ? 'red' : 'green'} />
      </div>

      <div style={s.chartWrap}>
        <ResponsiveContainer width="100%" height={90}>
          <BarChart data={chartData} margin={{ top: 0, right: 4, left: -28, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}
              fill="#4f46e5"
              label={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={s.actions}>
        <Link to={`/events/${event.id}/registrations`} className="btn btn-sm btn-secondary">Registrations</Link>
        <Link to={`/events/${event.id}/edit`} className="btn btn-sm btn-ghost">Edit</Link>
        <Link to={`/events/${event.id}/report`} className="btn btn-sm btn-ghost">Report</Link>
        <Link to={`/events/${event.id}/alerts`} className="btn btn-sm btn-ghost">Alerts</Link>
        <Link to={`/events/${event.id}/qr`} className="btn btn-sm btn-ghost">🔲 QR</Link>
      </div>
    </div>
  );
}

function StatPill({ label, value, highlight }: { label: string; value: number; highlight?: 'red' | 'green' }) {
  const color = highlight === 'red' ? '#dc2626' : highlight === 'green' ? '#16a34a' : 'var(--color-text)';
  return (
    <div style={s.pill}>
      <span style={s.pillLabel}>{label}</span>
      <span style={{ ...s.pillValue, color }}>{value}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' },
  card: { borderRadius: '14px', padding: '1.375rem', display: 'flex', flexDirection: 'column', gap: '1rem', transition: 'box-shadow 150ms ease' },
  cardTop: { display: 'flex', gap: '0.75rem' },
  cardTitleRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' },
  cardTitle: { fontWeight: 700, fontSize: '1rem', color: '#0f172a', lineHeight: 1.3 },
  cardMeta: { margin: 0, fontSize: '0.775rem', color: '#64748b' },
  capacityWrap: { display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  capacityRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  capacityLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' },
  capacityPct: { fontSize: '0.75rem', fontWeight: 600, color: '#64748b' },
  progressTrack: { height: '6px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '99px', transition: 'width 400ms ease' },
  statsRow: { display: 'flex', gap: '0.5rem' },
  pill: { flex: 1, background: '#f8fafc', borderRadius: '8px', padding: '0.5rem 0.625rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' },
  pillLabel: { fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  pillValue: { fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' },
  chartWrap: { margin: '0 -0.25rem' },
  actions: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' },
};
