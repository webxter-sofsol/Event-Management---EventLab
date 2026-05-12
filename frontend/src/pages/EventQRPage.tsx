import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import type React from 'react';

interface EventQRData {
  event_id: string;
  event_name: string;
  event_date: string;
  venue: string;
  checkin_url: string;
  qr_code: string;
}

export default function EventQRPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<EventQRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axiosInstance.get(`/api/events/${id}/qr/`)
      .then(res => setData(res.data))
      .catch(() => setError('Failed to load QR code.'))
      .finally(() => setLoading(false));
  }, [id]);

  function handleDownload() {
    if (!data) return;
    const a = document.createElement('a');
    a.href = data.qr_code;
    a.download = `${data.event_name.replace(/\s+/g, '_')}_checkin_qr.png`;
    a.click();
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="page" style={{ maxWidth: '600px' }}>
      <Link to="/events" className="back-link">← Back to Events</Link>

      {loading && <div className="loading-text">Generating QR code…</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {data && (
        <>
          <div style={s.header}>
            <h1 style={s.title}>Event Check-In QR</h1>
            <p style={s.subtitle}>Display this at the entrance — guests scan to check in</p>
          </div>

          {/* Print-friendly QR card */}
          <div style={s.card} id="qr-print-area">
            <div style={s.eventInfo}>
              <h2 style={s.eventName}>{data.event_name}</h2>
              <p style={s.eventMeta}>
                📅 {new Date(data.event_date).toLocaleString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric',
                  year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </p>
              <p style={s.eventMeta}>📍 {data.venue}</p>
            </div>

            <div style={s.qrWrap}>
              <img
                src={data.qr_code}
                alt={`Check-in QR for ${data.event_name}`}
                style={s.qrImage}
              />
            </div>

            <div style={s.scanInstructions}>
              <p style={s.scanTitle}>How to check in</p>
              <ol style={s.scanSteps}>
                <li>Open your phone camera</li>
                <li>Point at the QR code above</li>
                <li>Enter your email address</li>
                <li>You're checked in! ✓</li>
              </ol>
            </div>

            <div style={s.urlBox}>
              <span style={s.urlLabel}>Check-in URL</span>
              <span style={s.urlText}>{data.checkin_url}</span>
            </div>
          </div>

          {/* Actions */}
          <div style={s.actions}>
            <button onClick={handleDownload} className="btn btn-primary">
              ⬇ Download PNG
            </button>
            <button onClick={handlePrint} className="btn btn-secondary">
              🖨 Print
            </button>
            <Link to={`/events/${id}/registrations`} className="btn btn-ghost">
              View Guest List
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: { marginBottom: '1.5rem' },
  title: { margin: '0 0 0.25rem', fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' },
  subtitle: { margin: 0, fontSize: '0.875rem', color: '#64748b' },
  card: {
    background: '#fff',
    border: '2px solid #e2e8f0',
    borderRadius: '16px',
    padding: '2rem',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    marginBottom: '1.25rem',
  },
  eventInfo: { marginBottom: '1.5rem' },
  eventName: { margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' },
  eventMeta: { margin: '0.25rem 0 0', fontSize: '0.9rem', color: '#64748b' },
  qrWrap: {
    display: 'inline-block',
    padding: '1rem',
    background: '#fff',
    border: '3px solid #4f46e5',
    borderRadius: '12px',
    marginBottom: '1.5rem',
  },
  qrImage: { width: '260px', height: '260px', display: 'block' },
  scanInstructions: {
    background: '#f8fafc',
    borderRadius: '10px',
    padding: '1rem 1.5rem',
    marginBottom: '1rem',
    textAlign: 'left',
  },
  scanTitle: { margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.875rem', color: '#374151' },
  scanSteps: { margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.8 },
  urlBox: {
    background: '#f1f5f9',
    borderRadius: '8px',
    padding: '0.625rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  urlLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  urlText: { fontSize: '0.8rem', color: '#4f46e5', fontFamily: 'monospace', wordBreak: 'break-all' },
  actions: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
};
