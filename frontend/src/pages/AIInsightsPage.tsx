import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import {
  IconBrain, IconRefresh, IconAlertTriangle, IconCheckCircle,
  IconTrendingUp, IconZap, IconInfo, IconBarChart, IconDollarSign, IconCheck,
} from '../components/Icons';
import type React from 'react';

interface Recommendation { event_name: string; action: string; priority: 'high' | 'medium' | 'low'; }

interface DashboardInsights {
  available: boolean;
  health_score: number | null;
  summary: string;
  recommendations: Recommendation[];
  risk_events: string[];
  opportunity_events: string[];
  mood: 'excellent' | 'good' | 'attention' | 'critical';
}

interface WeeklySummary {
  new_registrations: number;
  active_events: number;
  revenue: string;
  peak_day: string | null;
  narrative: string | null;
  revenue_forecast: number | null;
  key_insight: string | null;
  action_items: string[];
}

const MOOD_CONFIG = {
  excellent: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Excellent' },
  good:      { color: '#0891b2', bg: '#f0f9ff', border: '#7dd3fc', label: 'Good' },
  attention: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', label: 'Needs Attention' },
  critical:  { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: 'Critical' },
};

const PRIORITY_CONFIG = {
  high:   { color: '#dc2626', bg: '#fef2f2', label: 'High' },
  medium: { color: '#d97706', bg: '#fffbeb', label: 'Medium' },
  low:    { color: '#16a34a', bg: '#f0fdf4', label: 'Low' },
};

function MoodIcon({ mood }: { mood: string }) {
  if (mood === 'excellent') return <IconTrendingUp size={28} color="#16a34a" />;
  if (mood === 'critical')  return <IconAlertTriangle size={28} color="#dc2626" />;
  if (mood === 'attention') return <IconAlertTriangle size={28} color="#d97706" />;
  return <IconCheckCircle size={28} color="#0891b2" />;
}

export default function AIInsightsPage() {
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

  async function fetchInsights() {
    setLoadingInsights(true);
    setInsightsError(null);
    try {
      const res = await axiosInstance.get('/api/ai/dashboard-insights/');
      setInsights(res.data);
    } catch {
      setInsightsError('Failed to load AI insights.');
    } finally {
      setLoadingInsights(false);
    }
  }

  async function fetchWeekly() {
    setLoadingWeekly(true);
    setWeeklyError(null);
    try {
      const res = await axiosInstance.get('/api/ai/weekly-summary/');
      setWeekly(res.data.content ?? res.data);
    } catch {
      setWeeklyError('Failed to load weekly summary.');
    } finally {
      setLoadingWeekly(false);
    }
  }

  useEffect(() => {
    fetchInsights();
    fetchWeekly();
  }, []);

  const mood = insights?.mood ?? 'good';
  const moodCfg = MOOD_CONFIG[mood] ?? MOOD_CONFIG.good;

  return (
    <div className="page">
      <Link to="/dashboard" className="back-link">
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>Back to Dashboard</span>
      </Link>

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', background: 'var(--color-primary-light)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconBrain size={22} color="var(--color-primary)" />
          </div>
          <div>
            <h1 className="page-title">AI Insights</h1>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              Smart analysis and recommendations powered by AI
            </p>
          </div>
        </div>
        <button onClick={fetchInsights} disabled={loadingInsights} className="btn btn-secondary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <IconRefresh size={14} />
          {loadingInsights ? 'Refreshing…' : 'Refresh Insights'}
        </button>
      </div>

      {/* Health Score + Mood */}
      {insights && (
        <div style={{ ...s.moodCard, background: moodCfg.bg, border: `1px solid ${moodCfg.border}` }}>
          <div style={s.moodLeft}>
            <MoodIcon mood={mood} />
            <div>
              <p style={{ ...s.moodLabel, color: moodCfg.color }}>Portfolio Status: {moodCfg.label}</p>
              <p style={s.moodSummary}>{insights.summary}</p>
            </div>
          </div>
          {insights.health_score !== null && (
            <div style={s.scoreWrap}>
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                <circle cx="40" cy="40" r="34" fill="none" stroke={moodCfg.color} strokeWidth="8"
                  strokeDasharray={`${(insights.health_score / 100) * 213.6} 213.6`}
                  strokeLinecap="round" transform="rotate(-90 40 40)" />
              </svg>
              <div style={s.scoreText}>
                <span style={{ ...s.scoreNum, color: moodCfg.color }}>{insights.health_score}</span>
                <span style={s.scoreLabel}>/ 100</span>
              </div>
            </div>
          )}
        </div>
      )}

      {insightsError && <div className="alert alert-error">{insightsError}</div>}
      {loadingInsights && !insights && <div className="loading-text">Analysing your events with AI…</div>}

      <div style={s.twoCol}>
        {/* Recommendations */}
        {insights && insights.recommendations.length > 0 && (
          <div style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <IconZap size={18} color="var(--color-primary)" />
              <h2 style={{ ...s.cardTitle, margin: 0 }}>Recommendations</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {insights.recommendations.map((rec, i) => {
                const cfg = PRIORITY_CONFIG[rec.priority] ?? PRIORITY_CONFIG.medium;
                return (
                  <div key={i} style={{ ...s.recItem, background: cfg.bg }}>
                    <div style={s.recTop}>
                      <span style={s.recEvent}>{rec.event_name}</span>
                      <span style={{ ...s.recPriority, color: cfg.color }}>{cfg.label}</span>
                    </div>
                    <p style={s.recAction}>{rec.action}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Risk & Opportunity */}
        {insights && (insights.risk_events.length > 0 || insights.opportunity_events.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {insights.risk_events.length > 0 && (
              <div style={{ ...s.card, borderLeft: '4px solid #dc2626' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <IconAlertTriangle size={16} color="#dc2626" />
                  <h2 style={{ ...s.cardTitle, color: '#dc2626', margin: 0 }}>Needs Attention</h2>
                </div>
                <ul style={s.eventList}>
                  {insights.risk_events.map((name, i) => (
                    <li key={i} style={s.eventListItem}>
                      <span style={{ ...s.dot, background: '#dc2626' }} />
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {insights.opportunity_events.length > 0 && (
              <div style={{ ...s.card, borderLeft: '4px solid #16a34a' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <IconTrendingUp size={16} color="#16a34a" />
                  <h2 style={{ ...s.cardTitle, color: '#16a34a', margin: 0 }}>Strong Momentum</h2>
                </div>
                <ul style={s.eventList}>
                  {insights.opportunity_events.map((name, i) => (
                    <li key={i} style={s.eventListItem}>
                      <span style={{ ...s.dot, background: '#16a34a' }} />
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Weekly Summary */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <IconBarChart size={18} color="var(--color-primary)" />
            <h2 style={{ ...s.cardTitle, margin: 0 }}>Weekly Summary</h2>
          </div>
          <button onClick={fetchWeekly} disabled={loadingWeekly} className="btn btn-ghost btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <IconRefresh size={13} />
            {loadingWeekly ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {weeklyError && <div className="alert alert-error">{weeklyError}</div>}
        {loadingWeekly && !weekly && <div className="loading-text">Generating weekly summary…</div>}

        {weekly && (
          <>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: '1.25rem' }}>
              <MiniStat label="New Registrations" value={String(weekly.new_registrations)} accent="#4f46e5" />
              <MiniStat label="Active Events" value={String(weekly.active_events)} accent="#0891b2" />
              <MiniStat label="Revenue" value={`$${parseFloat(weekly.revenue || '0').toFixed(2)}`} accent="#16a34a" />
              {weekly.revenue_forecast != null && (
                <MiniStat label="Forecast (next week)" value={`$${Number(weekly.revenue_forecast).toFixed(2)}`} accent="#d97706" />
              )}
            </div>

            {weekly.peak_day && (
              <p style={s.peakDay}>Peak registration day: <strong>{weekly.peak_day}</strong></p>
            )}

            {weekly.key_insight && (
              <div style={s.insightBox}>
                <IconInfo size={16} color="#0c4a6e" style={{ flexShrink: 0, marginTop: '1px' }} />
                <p style={s.insightText}>{weekly.key_insight}</p>
              </div>
            )}

            {weekly.narrative && (
              <div style={s.narrativeBox}>
                <p style={s.narrativeText}>{weekly.narrative}</p>
              </div>
            )}

            {weekly.action_items && weekly.action_items.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <p style={s.actionTitle}>Suggested Actions</p>
                <ul style={s.actionList}>
                  {weekly.action_items.map((item, i) => (
                    <li key={i} style={s.actionItem}>
                      <IconCheck size={14} color="#16a34a" style={{ flexShrink: 0, marginTop: '1px' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${accent}` }}>
      <p className="stat-label">{label}</p>
      <p className="stat-value" style={{ color: accent, fontSize: '1.375rem' }}>{value}</p>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  moodCard: { borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' },
  moodLeft: { display: 'flex', alignItems: 'flex-start', gap: '1rem', flex: 1 },
  moodLabel: { margin: '0 0 0.35rem', fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  moodSummary: { margin: 0, fontSize: '0.9375rem', color: '#374151', lineHeight: 1.5 },
  scoreWrap: { position: 'relative', width: '80px', height: '80px', flexShrink: 0 },
  scoreText: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontSize: '1.25rem', fontWeight: 800, lineHeight: 1 },
  scoreLabel: { fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' },
  card: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' },
  cardTitle: { margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' },
  recItem: { borderRadius: '8px', padding: '0.75rem 1rem' },
  recTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' },
  recEvent: { fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a' },
  recPriority: { fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  recAction: { margin: 0, fontSize: '0.8125rem', color: '#374151', lineHeight: 1.4 },
  eventList: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  eventListItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#374151' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  peakDay: { margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  insightBox: { display: 'flex', gap: '0.75rem', background: '#f0f9ff', border: '1px solid #7dd3fc', borderRadius: '8px', padding: '0.875rem 1rem', marginBottom: '0.75rem' },
  insightText: { margin: 0, fontSize: '0.875rem', color: '#0c4a6e', fontWeight: 500, lineHeight: 1.5 },
  narrativeBox: { background: '#f8fafc', borderRadius: '8px', padding: '0.875rem 1rem', borderLeft: '3px solid #4f46e5' },
  narrativeText: { margin: 0, fontSize: '0.875rem', color: '#374151', lineHeight: 1.6, fontStyle: 'italic' },
  actionTitle: { margin: '0 0 0.5rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  actionList: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  actionItem: { display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.875rem', color: '#374151' },
};
