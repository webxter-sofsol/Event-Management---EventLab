import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { extractApiError } from '../utils/apiError';
import type React from 'react';

interface EventInfo { id: number; name: string; capacity: number; available_seats: number; status: string; }
interface Guest { name: string; email: string; }
interface Ticket { id: number; guest: Guest; registered_at: string; }

export default function RegistrationPanel() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number } | null>(null);

  const fetchEvent = useCallback(async () => {
    const res = await axiosInstance.get(`/api/events/${id}/`);
    setEvent(res.data);
  }, [id]);

  const fetchTickets = useCallback(async () => {
    const res = await axiosInstance.get(`/api/events/${id}/registrations/`);
    const data = res.data;
    setTickets(Array.isArray(data) ? data : data.results ?? []);
  }, [id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { await Promise.all([fetchEvent(), fetchTickets()]); }
    catch { setError('Failed to load registration data.'); }
    finally { setLoading(false); }
  }, [fetchEvent, fetchTickets]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleRemove(ticketId: number) {
    try {
      await axiosInstance.delete(`/api/events/${id}/registrations/${ticketId}/`);
      await Promise.all([fetchEvent(), fetchTickets()]);
    } catch { setError('Failed to remove registration.'); }
  }

  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRegError(null);
    setRegSubmitting(true);
    try {
      await axiosInstance.post(`/api/events/${id}/registrations/`, { name: regName, email: regEmail });
      setRegName(''); setRegEmail('');
      await Promise.all([fetchEvent(), fetchTickets()]);
    } catch (err) {
      setRegError(extractApiError(err, 'Registration failed. Please try again.'));
    } finally { setRegSubmitting(false); }
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBulkError(null); setBulkResult(null); setBulkSubmitting(true);
    const emails = bulkEmails.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      const res = await axiosInstance.post(`/api/events/${id}/registrations/bulk/`, { emails });
      setBulkResult(res.data); setBulkEmails('');
      await Promise.all([fetchEvent(), fetchTickets()]);
    } catch (err) {
      setBulkError(extractApiError(err, 'Bulk registration failed.'));
    } finally { setBulkSubmitting(false); }
  }

  const isFull = event?.available_seats === 0;
  const confirmedCount = event ? event.capacity - event.available_seats : 0;
  const fillPct = event && event.capacity > 0 ? Math.round((confirmedCount / event.capacity) * 100) : 0;

  return (
    <div className="page" style={{ maxWidth: '960px' }}>
      <Link to="/events" className="back-link">← Back to Events</Link>

      {loading && <div className="loading-text">Loading…</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {!loading && event && (
        <>
          {/* Event header card */}
          <div style={s.headerCard}>
            <div style={s.headerTop}>
              <div>
                <h1 style={s.title}>{event.name}</h1>
                <p style={s.subtitle}>Guest Registration Management</p>
              </div>
              {isFull && <span className="badge badge-red" style={{ fontSize: '0.8rem', padding: '0.35rem 0.875rem' }}>Event Full</span>}
            </div>

            <div style={s.statsRow}>
              <div style={s.statItem}>
                <span style={s.statLabel}>Capacity</span>
                <span style={s.statVal}>{event.capacity}</span>
              </div>
              <div style={s.statDivider} />
              <div style={s.statItem}>
                <span style={s.statLabel}>Confirmed</span>
                <span style={s.statVal}>{confirmedCount}</span>
              </div>
              <div style={s.statDivider} />
              <div style={s.statItem}>
                <span style={s.statLabel}>Available</span>
                <span style={{ ...s.statVal, color: isFull ? 'var(--color-danger)' : 'var(--color-success)' }}>{event.available_seats}</span>
              </div>
            </div>

            <div style={s.progressWrap}>
              <div style={s.progressTrack}>
                <div style={{ ...s.progressFill, width: `${fillPct}%`, background: isFull ? '#dc2626' : fillPct > 80 ? '#d97706' : '#4f46e5' }} />
              </div>
              <span style={s.progressLabel}>{fillPct}% filled</span>
            </div>
          </div>

          {/* Register Guest */}
          <div style={s.section}>
            <h2 className="section-title">Register a Guest</h2>
            {isFull && <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>Event is at capacity — no new registrations can be added.</div>}
            <form onSubmit={handleSingleSubmit} style={s.regForm}>
              <div style={s.regRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="reg-name" className="form-label">Full Name</label>
                  <input id="reg-name" type="text" className="form-input" placeholder="Jane Smith"
                    value={regName} onChange={e => setRegName(e.target.value)} disabled={isFull || regSubmitting} required />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="reg-email" className="form-label">Email Address</label>
                  <input id="reg-email" type="email" className="form-input" placeholder="jane@example.com"
                    value={regEmail} onChange={e => setRegEmail(e.target.value)} disabled={isFull || regSubmitting} required />
                </div>
                <button type="submit" disabled={isFull || regSubmitting} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
                  {regSubmitting ? 'Registering…' : 'Register'}
                </button>
              </div>
              {regError && <div className="alert alert-error">{regError}</div>}
            </form>
          </div>

          {/* Guest list */}
          <div style={s.section}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 className="section-title" style={{ margin: 0 }}>Guest List</h2>
              <span className="badge badge-blue">{tickets.length} registered</span>
            </div>
            {tickets.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <p>No guests registered yet.</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Guest Name</th>
                      <th>Email</th>
                      <th>Registered At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map(ticket => (
                      <tr key={ticket.id}>
                        <td style={{ fontWeight: 600 }}>{ticket.guest.name}</td>
                        <td style={{ color: 'var(--color-text-secondary)' }}>{ticket.guest.email}</td>
                        <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(ticket.registered_at).toLocaleString()}
                        </td>
                        <td>
                          <button onClick={() => handleRemove(ticket.id)} className="btn btn-sm btn-danger"
                            aria-label={`Remove ${ticket.guest.name}`}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bulk registration */}
          <div style={s.section}>
            <h2 className="section-title">Bulk Registration</h2>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              Enter one email address per line. Guests will be registered up to available capacity.
            </p>
            {isFull && <div className="alert alert-warning" style={{ marginBottom: '0.75rem' }}>Event is full — bulk registration is disabled.</div>}
            <form onSubmit={handleBulkSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <textarea className="form-textarea" value={bulkEmails} onChange={e => setBulkEmails(e.target.value)}
                placeholder={'alice@example.com\nbob@example.com\ncharlie@example.com'}
                disabled={isFull || bulkSubmitting} rows={5}
                style={{ fontFamily: 'monospace', fontSize: '0.875rem', resize: 'vertical' }} />
              <div>
                <button type="submit" disabled={isFull || bulkSubmitting || bulkEmails.trim() === ''} className="btn btn-primary">
                  {bulkSubmitting ? 'Submitting…' : 'Submit Bulk Registration'}
                </button>
              </div>
              {bulkError && <div className="alert alert-error">{bulkError}</div>}
              {bulkResult && (
                <div className="alert alert-success">
                  ✓ Bulk complete: <strong>{bulkResult.succeeded}</strong> succeeded, <strong>{bulkResult.failed}</strong> failed.
                </div>
              )}
            </form>
          </div>
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  headerCard: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' },
  headerTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' },
  title: { margin: '0 0 0.2rem', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em' },
  subtitle: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  statsRow: { display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' },
  statItem: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  statLabel: { fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  statVal: { fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.02em' },
  statDivider: { width: '1px', height: '36px', background: 'var(--color-border)' },
  progressWrap: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  progressTrack: { flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '99px', transition: 'width 400ms ease' },
  progressLabel: { fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' },
  section: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.25rem', boxShadow: 'var(--shadow-sm)' },
  regForm: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  regRow: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' },
};
