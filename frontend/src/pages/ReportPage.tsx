import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { extractApiError } from '../utils/apiError';
import type React from 'react';

interface Guest { name: string; email: string; registered_at: string; }
interface ReportData { total_registrations: number; available_seats: number; revenue: number; guests: Guest[]; }
interface EventData { id: number; name: string; price: number; capacity: number; }

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportData | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [reportRes, eventRes] = await Promise.all([
          axiosInstance.get(`/api/events/${id}/report/`),
          axiosInstance.get(`/api/events/${id}/`),
        ]);
        setReport(reportRes.data);
        setEvent(eventRes.data);
      } catch (err) {
        setError(extractApiError(err, 'Failed to load report.'));
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  async function handleExportCSV() {
    setExporting(true);
    try {
      const res = await axiosInstance.get(`/api/events/${id}/report/export/`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `event-${id}-report.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(extractApiError(err, 'Failed to export CSV.'));
    } finally {
      setExporting(false);
    }
  }

  const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

  if (loading) return <div className="page"><div className="loading-text">Loading report…</div></div>;
  if (error) return (
    <div className="page">
      <div className="alert alert-error">{error}</div>
      <Link to="/events" className="back-link" style={{ marginTop: '1rem' }}>← Back to Events</Link>
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: '960px' }}>
      <Link to="/events" className="back-link">← Back to Events</Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">{event?.name ?? 'Event Report'}</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Financial &amp; attendance summary
          </p>
        </div>
        <button onClick={handleExportCSV} disabled={exporting} className="btn btn-primary">
          {exporting ? 'Exporting…' : '⬇ Export CSV'}
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid-3" style={{ marginBottom: '1.5rem' }}>
        <StatBox label="Total Registrations" value={String(report?.total_registrations ?? 0)} accent="#4f46e5" />
        <StatBox label="Available Seats" value={String(report?.available_seats ?? 0)} accent="#0891b2" />
        <StatBox label="Revenue" value={fmt(report?.revenue ?? 0)} accent="#16a34a" />
      </div>

      {/* Guest list */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={s.sectionTitle}>Guest List</h2>
          <span className="badge badge-blue">{report?.guests?.length ?? 0} guests</span>
        </div>

        {report?.guests && report.guests.length > 0 ? (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Guest Name</th>
                  <th>Email</th>
                  <th>Registered At</th>
                </tr>
              </thead>
              <tbody>
                {report.guests.map((guest, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{guest.name}</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{guest.email}</td>
                    <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(guest.registered_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <p>No guests registered yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${accent}` }}>
      <p className="stat-label">{label}</p>
      <p className="stat-value" style={{ color: accent, fontSize: '1.5rem' }}>{value}</p>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' },
  sectionTitle: { margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' },
};
