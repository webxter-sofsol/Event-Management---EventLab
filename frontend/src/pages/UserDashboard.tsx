import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { extractApiError } from '../utils/apiError';
import { IconCalendar, IconMapPin, IconUsers } from '../components/Icons';
import type React from 'react';

type TicketType = 'normal' | 'silver' | 'platinum';

interface Event {
  id: string;
  name: string;
  date: string;
  venue: string;
  type: string;
  capacity: number;
  available_seats: number;
  ticket_types: Record<string, number>;
  status: string;
}

const TICKET_TYPE_COLORS: Record<TicketType, string> = {
  normal: '#64748b',
  silver: '#94a3b8',
  platinum: '#8b5cf6',
};

export default function UserDashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [selectedTicketType, setSelectedTicketType] = useState<TicketType>('normal');

  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get('/api/events/', { params: { status: 'active' } });
      const rawEvents = Array.isArray(res.data) ? res.data : res.data.results || [];
      // Filter only future events
      const futureEvents = rawEvents.filter((e: Event) => new Date(e.date) > new Date());
      setEvents(futureEvents);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load events.'));
    } finally {
      setLoading(false);
    }
  }

  function openPurchaseModal(event: Event) {
    setSelectedEvent(event);
    setShowPurchaseModal(true);
    setPurchaseError(null);
    setPurchaseSuccess(false);
    setGuestName('');
    setGuestEmail('');
    const availableTypes = getAvailableTicketTypes(event);
    if (availableTypes.length > 0) {
      setSelectedTicketType(availableTypes[0]);
    }
  }

  function closePurchaseModal() {
    setShowPurchaseModal(false);
    setSelectedEvent(null);
    setPurchaseError(null);
    setPurchaseSuccess(false);
  }

  function getAvailableTicketTypes(event: Event): TicketType[] {
    if (!event.ticket_types || Object.keys(event.ticket_types).length === 0) {
      return ['normal'];
    }
    return Object.entries(event.ticket_types)
      .filter(([_, price]) => price > 0)
      .map(([type]) => type as TicketType);
  }

  async function handlePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEvent) return;

    setPurchaseLoading(true);
    setPurchaseError(null);

    try {
      await axiosInstance.post(`/api/events/${selectedEvent.id}/purchase/`, {
        name: guestName,
        email: guestEmail,
        ticket_type: selectedTicketType,
      });
      setPurchaseSuccess(true);
      setTimeout(() => {
        closePurchaseModal();
        fetchEvents(); // Refresh to update available seats
      }, 2000);
    } catch (err) {
      setPurchaseError(extractApiError(err, 'Purchase failed. Please try again.'));
    } finally {
      setPurchaseLoading(false);
    }
  }

  const isFull = (event: Event) => event.available_seats === 0;
  const fillPct = (event: Event) => event.capacity > 0 ? Math.round(((event.capacity - event.available_seats) / event.capacity) * 100) : 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Browse Events</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Discover and purchase tickets for upcoming events
          </p>
        </div>
      </div>

      {loading && <div className="loading-text">Loading events…</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {!loading && !error && events.length === 0 && (
        <div className="empty-state">
          <p>No upcoming events available at the moment.</p>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div style={s.grid}>
          {events.map((event) => (
            <EventCard key={event.id} event={event} onPurchase={() => openPurchaseModal(event)} />
          ))}
        </div>
      )}

      {/* Purchase Modal */}
      {showPurchaseModal && selectedEvent && (
        <div style={s.modalOverlay} onClick={closePurchaseModal}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Purchase Ticket</h2>
              <button onClick={closePurchaseModal} style={s.closeBtn} aria-label="Close">×</button>
            </div>

            {purchaseSuccess ? (
              <div className="alert alert-success" style={{ margin: '1rem 0' }}>
                ✓ Ticket purchased successfully! Check your email for confirmation.
              </div>
            ) : (
              <form onSubmit={handlePurchase} style={s.modalBody}>
                <div style={s.eventInfo}>
                  <h3 style={s.eventName}>{selectedEvent.name}</h3>
                  <p style={s.eventMeta}>
                    <IconCalendar size={14} color="#64748b" />
                    {new Date(selectedEvent.date).toLocaleString('en-US', { 
                      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                    })}
                  </p>
                  <p style={s.eventMeta}>
                    <IconMapPin size={14} color="#64748b" />
                    {selectedEvent.venue}
                  </p>
                </div>

                <div className="form-group">
                  <label htmlFor="guest-name" className="form-label">Full Name</label>
                  <input
                    id="guest-name"
                    type="text"
                    className="form-input"
                    placeholder="John Doe"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    required
                    disabled={purchaseLoading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="guest-email" className="form-label">Email Address</label>
                  <input
                    id="guest-email"
                    type="email"
                    className="form-input"
                    placeholder="john@example.com"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    required
                    disabled={purchaseLoading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="ticket-type" className="form-label">Ticket Type</label>
                  <select
                    id="ticket-type"
                    className="form-input"
                    value={selectedTicketType}
                    onChange={(e) => setSelectedTicketType(e.target.value as TicketType)}
                    disabled={purchaseLoading}
                  >
                    {getAvailableTicketTypes(selectedEvent).map((type) => (
                      <option key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)} - $
                        {selectedEvent.ticket_types?.[type] || 0}
                      </option>
                    ))}
                  </select>
                </div>

                {purchaseError && <div className="alert alert-error">{purchaseError}</div>}

                <div style={s.modalActions}>
                  <button type="button" onClick={closePurchaseModal} className="btn btn-ghost" disabled={purchaseLoading}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={purchaseLoading || isFull(selectedEvent)}>
                    {purchaseLoading ? 'Processing…' : `Purchase - $${selectedEvent.ticket_types?.[selectedTicketType] || 0}`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EventCard({ event, onPurchase }: { event: Event; onPurchase: () => void }) {
  const full = event.available_seats === 0;
  const fillPct = event.capacity > 0 ? Math.round(((event.capacity - event.available_seats) / event.capacity) * 100) : 0;
  const availableTypes = event.ticket_types && Object.keys(event.ticket_types).length > 0
    ? Object.entries(event.ticket_types).filter(([_, price]) => price > 0)
    : [['normal', 0]];

  const minPrice = Math.min(...availableTypes.map(([_, price]) => price));

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h3 style={s.cardTitle}>{event.name}</h3>
        {full && <span className="badge badge-red">Sold Out</span>}
      </div>

      <div style={s.cardMeta}>
        <div style={s.metaRow}>
          <IconCalendar size={14} color="#64748b" />
          <span>{new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <div style={s.metaRow}>
          <IconMapPin size={14} color="#64748b" />
          <span>{event.venue}</span>
        </div>
        <div style={s.metaRow}>
          <IconUsers size={14} color="#64748b" />
          <span>{event.available_seats} / {event.capacity} available</span>
        </div>
      </div>

      <div style={s.progressWrap}>
        <div style={s.progressTrack}>
          <div style={{ ...s.progressFill, width: `${fillPct}%`, background: full ? '#dc2626' : fillPct > 80 ? '#d97706' : '#4f46e5' }} />
        </div>
      </div>

      <div style={s.ticketTypes}>
        {availableTypes.map(([type, price]) => (
          <div key={type} style={s.ticketBadge}>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>${price}</span>
          </div>
        ))}
      </div>

      <button onClick={onPurchase} disabled={full} className="btn btn-primary" style={{ width: '100%' }}>
        {full ? 'Sold Out' : `Buy Ticket - From $${minPrice}`}
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' },
  card: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: 'var(--shadow-sm)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' },
  cardTitle: { margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 },
  cardMeta: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  metaRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: '#64748b' },
  progressWrap: { marginTop: '0.25rem' },
  progressTrack: { height: '6px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '99px', transition: 'width 400ms ease' },
  ticketTypes: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  ticketBadge: { flex: 1, minWidth: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: '#fff', borderRadius: '14px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderBottom: '1px solid var(--color-border)' },
  modalTitle: { margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.75rem', color: '#94a3b8', cursor: 'pointer', lineHeight: 1, padding: 0, width: '32px', height: '32px' },
  modalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  eventInfo: { background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '1rem' },
  eventName: { margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' },
  eventMeta: { margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' },
  modalActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' },
};
