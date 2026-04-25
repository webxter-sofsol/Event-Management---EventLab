import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { extractApiError } from '../utils/apiError';
import { IconPlus, IconAlertTriangle } from '../components/Icons';
import type React from 'react';

interface Event {
  id: number;
  name: string;
  date: string;
  venue: string;
  price: number;
  type: string;
  capacity: number;
  status: string;
  available_seats: number;
  alert_triggered: boolean;
}

interface Filters {
  q: string;
  date_from: string;
  date_to: string;
  venue: string;
  type: string;
  status: string;
}

const PAGE_SIZE = 10;
const TYPE_LABELS: Record<string, string> = {
  conference: 'Conference', workshop: 'Workshop', social: 'Social', webinar: 'Webinar', other: 'Other',
};

export default function EventList() {
  const [filters, setFilters] = useState<Filters>({ q: '', date_from: '', date_to: '', venue: '', type: '', status: '' });
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchEvents = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (f.q) params['q'] = f.q;
      if (f.date_from) params['date_from'] = f.date_from;
      if (f.date_to) params['date_to'] = f.date_to;
      if (f.venue) params['venue'] = f.venue;
      if (f.type) params['type'] = f.type;
      if (f.status) params['status'] = f.status;
      const response = await axiosInstance.get('/api/search/events/', { params });
      setEvents(Array.isArray(response.data) ? response.data : response.data.results ?? []);
      setPage(1);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load events.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(filters); }, [filters, fetchEvents]);

  function handleFilterChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  }

  const totalPages = Math.ceil(events.length / PAGE_SIZE);
  const paginatedEvents = events.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Events</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            {events.length} event{events.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <Link to="/events/new" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <IconPlus size={15} /> New Event
        </Link>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input name="q" type="text" placeholder="Search by name…" value={filters.q}
          onChange={handleFilterChange} className="form-input" aria-label="Search events by name" />
        <input name="date_from" type="date" value={filters.date_from}
          onChange={handleFilterChange} className="form-input" aria-label="Date from" />
        <input name="date_to" type="date" value={filters.date_to}
          onChange={handleFilterChange} className="form-input" aria-label="Date to" />
        <input name="venue" type="text" placeholder="Venue…" value={filters.venue}
          onChange={handleFilterChange} className="form-input" aria-label="Filter by venue" />
        <select name="type" value={filters.type} onChange={handleFilterChange} className="form-select">
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="status" value={filters.status} onChange={handleFilterChange} className="form-select">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading && <div className="loading-text">Loading…</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {!loading && !error && events.length === 0 && (
        <div className="empty-state">
          <p>No events match your filters.</p>
          <Link to="/events/new" className="btn btn-primary">Create an event</Link>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Date</th>
                  <th>Venue</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Capacity</th>
                  <th>Available</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEvents.map(event => (
                  <tr key={event.id}>
                    <td style={{ fontWeight: 600 }}>
                      {event.name}
                      {event.alert_triggered && <IconAlertTriangle size={13} color="#d97706" style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }} />}
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{event.venue}</td>
                    <td><span className="badge badge-purple">{TYPE_LABELS[event.type] ?? event.type}</span></td>
                    <td>
                      <span className={event.status === 'cancelled' ? 'badge badge-red' : 'badge badge-green'}>
                        {event.status}
                      </span>
                    </td>
                    <td>{event.capacity}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: event.available_seats === 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        {event.available_seats}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <Link to={`/events/${event.id}/edit`} className="btn btn-sm btn-ghost">Edit</Link>
                        <Link to={`/events/${event.id}/registrations`} className="btn btn-sm btn-secondary">Guests</Link>
                        <Link to={`/events/${event.id}/report`} className="btn btn-sm btn-ghost">Report</Link>
                        <Link to={`/events/${event.id}/alerts`} className="btn btn-sm btn-ghost">Alerts</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="btn btn-ghost btn-sm" aria-label="Previous page">← Prev</button>
              <span className="page-info">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="btn btn-ghost btn-sm" aria-label="Next page">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
