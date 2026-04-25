import { useState, useEffect, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { extractApiError } from '../utils/apiError';
import type React from 'react';

export default function AlertSettings() {
  const { id } = useParams<{ id: string }>();
  const [eventName, setEventName] = useState('');
  const [currentThreshold, setCurrentThreshold] = useState<number | null>(null);
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [inputValue, setInputValue] = useState<number>(10);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [eventRes, thresholdRes] = await Promise.all([
          axiosInstance.get(`/api/events/${id}/`),
          axiosInstance.get(`/api/events/${id}/alert-threshold/`),
        ]);
        setEventName(eventRes.data.name);
        setCurrentThreshold(thresholdRes.data.alert_threshold);
        setAlertTriggered(thresholdRes.data.alert_triggered);
        setInputValue(thresholdRes.data.alert_threshold);
      } catch {
        setErrorMessage('Failed to load alert settings.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const res = await axiosInstance.put(`/api/events/${id}/alert-threshold/`, { alert_threshold: inputValue });
      setCurrentThreshold(res.data.alert_threshold);
      setAlertTriggered(res.data.alert_triggered);
      setSuccessMessage('Alert threshold updated successfully.');
    } catch (err) {
      setErrorMessage(extractApiError(err, 'Failed to update threshold.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        <Link to="/events" className="back-link">← Back to Events</Link>

        {loading ? (
          <div className="loading-text">Loading…</div>
        ) : (
          <div style={s.card}>
            <div style={s.cardHeader}>
              <div style={s.iconWrap}>🔔</div>
              <div>
                <h1 style={s.title}>{eventName}</h1>
                <p style={s.subtitle}>Alert Settings</p>
              </div>
            </div>

            {/* Status indicator */}
            <div style={s.statusRow}>
              <div style={s.statusItem}>
                <span style={s.statusLabel}>Current Threshold</span>
                <span style={s.statusValue}>{currentThreshold ?? '—'} seats</span>
              </div>
              <div style={s.statusItem}>
                <span style={s.statusLabel}>Alert Status</span>
                <span className={alertTriggered ? 'badge badge-orange' : 'badge badge-green'}>
                  {alertTriggered ? '⚠ Triggered' : '✓ Normal'}
                </span>
              </div>
            </div>

            <hr className="divider" />

            <form onSubmit={handleSubmit} style={s.form} noValidate>
              <div className="form-group">
                <label htmlFor="threshold" className="form-label">New Alert Threshold</label>
                <p style={s.hint}>Send an alert when available seats drop below this number.</p>
                <input id="threshold" type="number" min={1} className="form-input"
                  value={inputValue} onChange={(e) => setInputValue(Number(e.target.value))} required
                  style={{ maxWidth: '200px' }} />
              </div>

              {successMessage && <div className="alert alert-success" aria-live="polite">{successMessage}</div>}
              {errorMessage && <div className="alert alert-error" aria-live="polite" role="alert">{errorMessage}</div>}

              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? 'Saving…' : 'Update Threshold'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { background: 'var(--color-bg)', minHeight: '100vh', padding: '2rem 1rem' },
  container: { maxWidth: '560px', margin: '0 auto' },
  card: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '2rem', boxShadow: 'var(--shadow-md)' },
  cardHeader: { display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' },
  iconWrap: { width: '44px', height: '44px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 },
  title: { margin: '0 0 0.2rem', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em' },
  subtitle: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  statusRow: { display: 'flex', gap: '2rem', flexWrap: 'wrap' },
  statusItem: { display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  statusLabel: { fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  statusValue: { fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)' },
  form: { display: 'flex', flexDirection: 'column', gap: '1.125rem' },
  hint: { margin: '0.2rem 0 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' },
};
