import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import type React from 'react';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

interface CheckInResult {
  valid: boolean;
  already_checked_in?: boolean;
  detail: string;
  guest_name?: string;
  event_name?: string;
  venue?: string;
  ticket_type?: string;
  checked_in_at?: string;
}

interface EventInfo {
  name: string;
  date: string;
  venue: string;
}

export default function GuestCheckInPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);

  useEffect(() => {
    // Fetch basic event info (public)
    axios.get(`${BASE_URL}/api/events/${eventId}/`)
      .then(res => setEventInfo({ name: res.data.name, date: res.data.date, venue: res.data.venue }))
      .catch(() => {});
  }, [eventId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await axios.post(`${BASE_URL}/api/checkin/event/${eventId}/`, { email });
      setResult(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: CheckInResult } };
      const data = e?.response?.data;
      setResult(data || { valid: false, detail: 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  const isSuccess = result?.valid === true;
  const isAlreadyUsed = result?.already_checked_in === true;

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.logo}>🎟 EventHub</div>
          <h1 style={s.title}>Event Check-In</h1>
          {eventInfo && (
            <div style={s.eventBox}>
              <p style={s.eventName}>{eventInfo.name}</p>
              <p style={s.eventMeta}>
                📅 {new Date(eventInfo.date).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </p>
              <p style={s.eventMeta}>📍 {eventInfo.venue}</p>
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div style={{
            ...s.resultBox,
            background: isSuccess ? '#f0fdf4' : isAlreadyUsed ? '#fef3c7' : '#fef2f2',
            border: `2px solid ${isSuccess ? '#86efac' : isAlreadyUsed ? '#fcd34d' : '#fca5a5'}`,
          }}>
            <div style={s.resultIcon}>
              {isSuccess ? '✅' : isAlreadyUsed ? '⚠️' : '❌'}
            </div>
            <p style={s.resultTitle}>
              {isSuccess ? 'Welcome!' : isAlreadyUsed ? 'Already Checked In' : 'Not Found'}
            </p>
            <p style={s.resultDetail}>{result.detail}</p>
            {(isSuccess || isAlreadyUsed) && (
              <div style={s.resultInfo}>
                {result.guest_name && <p style={s.infoRow}><strong>Name:</strong> {result.guest_name}</p>}
                {result.event_name && <p style={s.infoRow}><strong>Event:</strong> {result.event_name}</p>}
                {result.ticket_type && (
                  <p style={s.infoRow}>
                    <strong>Ticket:</strong>{' '}
                    <span style={{ textTransform: 'capitalize' }}>{result.ticket_type}</span>
                  </p>
                )}
                {result.checked_in_at && (
                  <p style={s.infoRow}>
                    <strong>{isAlreadyUsed ? 'Checked in at:' : 'Time:'}</strong>{' '}
                    {new Date(result.checked_in_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Form — hide after successful check-in */}
        {!isSuccess && (
          <form onSubmit={handleSubmit} style={s.form}>
            <label htmlFor="email" style={s.label}>Enter your email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={submitting}
              style={s.input}
            />
            <button type="submit" disabled={submitting || !email.trim()} style={s.btn}>
              {submitting ? 'Checking in…' : 'Check In'}
            </button>
          </form>
        )}

        {isSuccess && (
          <p style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600, marginTop: '1rem' }}>
            Enjoy the event! 🎉
          </p>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
  card: {
    background: '#fff',
    borderRadius: '20px',
    padding: '2rem',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  header: { textAlign: 'center', marginBottom: '1.5rem' },
  logo: { fontSize: '1.5rem', fontWeight: 800, color: '#4f46e5', marginBottom: '0.5rem' },
  title: { margin: '0 0 1rem', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' },
  eventBox: {
    background: '#f8fafc',
    borderRadius: '10px',
    padding: '0.875rem',
    border: '1px solid #e2e8f0',
  },
  eventName: { margin: '0 0 0.35rem', fontWeight: 700, fontSize: '1rem', color: '#0f172a' },
  eventMeta: { margin: '0.2rem 0 0', fontSize: '0.8125rem', color: '#64748b' },
  resultBox: {
    borderRadius: '12px',
    padding: '1.25rem',
    marginBottom: '1.25rem',
    textAlign: 'center',
  },
  resultIcon: { fontSize: '2.5rem', marginBottom: '0.5rem' },
  resultTitle: { margin: '0 0 0.25rem', fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' },
  resultDetail: { margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#64748b' },
  resultInfo: { textAlign: 'left', background: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '0.75rem' },
  infoRow: { margin: '0.25rem 0', fontSize: '0.875rem', color: '#374151' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.875rem' },
  label: { fontSize: '0.875rem', fontWeight: 600, color: '#374151' },
  input: {
    padding: '0.75rem 1rem',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 150ms',
    width: '100%',
    boxSizing: 'border-box',
  },
  btn: {
    padding: '0.875rem',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background 150ms',
  },
};
