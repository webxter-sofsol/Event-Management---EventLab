import { useState, useEffect, useCallback } from 'react';
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
  is_premium: boolean;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string };
  theme: { color: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-script')) { resolve(true); return; }
    const script = document.createElement('script');
    script.id = 'razorpay-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function UserDashboard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState(false);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [selectedTicketType, setSelectedTicketType] = useState<TicketType>('normal');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get('/api/events/', { params: { status: 'active' } });
      const raw = Array.isArray(res.data) ? res.data : res.data.results || [];
      setEvents(raw.filter((e: Event) => new Date(e.date) > new Date()));
    } catch (err) {
      setError(extractApiError(err, 'Failed to load events.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  function getAvailableTypes(event: Event): TicketType[] {
    if (!event.ticket_types || Object.keys(event.ticket_types).length === 0) return ['normal'];
    return Object.entries(event.ticket_types)
      .filter(([_, p]) => p > 0)
      .map(([t]) => t as TicketType);
  }

  function openModal(event: Event) {
    setSelectedEvent(event);
    setShowModal(true);
    setPayError(null);
    setPaySuccess(false);
    setGuestName('');
    setGuestEmail('');
    const types = getAvailableTypes(event);
    setSelectedTicketType(types[0] ?? 'normal');
  }

  function closeModal() {
    setShowModal(false);
    setSelectedEvent(null);
    setPayError(null);
    setPaySuccess(false);
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEvent) return;

    setPayLoading(true);
    setPayError(null);

    try {
      // Step 1 — load Razorpay SDK
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Failed to load payment gateway. Check your connection.');

      // Step 2 — create order on backend
      const orderRes = await axiosInstance.post(
        `/api/events/${selectedEvent.id}/payment/create-order/`,
        { name: guestName, email: guestEmail, ticket_type: selectedTicketType }
      );
      const { order_id, amount, currency, key, event_name, price } = orderRes.data;

      // Step 3 — open Razorpay checkout
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key,
          amount,
          currency,
          name: 'EventHub',
          description: `${event_name} — ${selectedTicketType} ticket`,
          order_id,
          prefill: { name: guestName, email: guestEmail },
          theme: { color: '#4f46e5' },
          handler: async (response: RazorpayResponse) => {
            // Step 4 — verify payment on backend and create ticket
            try {
              await axiosInstance.post(
                `/api/events/${selectedEvent.id}/payment/verify/`,
                {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  name: guestName,
                  email: guestEmail,
                  ticket_type: selectedTicketType,
                }
              );
              resolve();
            } catch (err) {
              reject(new Error(extractApiError(err, 'Payment verified but ticket creation failed.')));
            }
          },
          modal: {
            ondismiss: () => reject(new Error('DISMISSED')),
          },
        });
        rzp.open();
      });

      setPaySuccess(true);
      setTimeout(() => { closeModal(); fetchEvents(); }, 2500);

    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message  // already extracted (from inner reject) or 'DISMISSED'
        : extractApiError(err, 'Purchase failed. Please try again.');
      if (msg !== 'DISMISSED') setPayError(msg);
    } finally {
      setPayLoading(false);
    }
  }

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
        <div className="empty-state"><p>No upcoming events available at the moment.</p></div>
      )}

      {!loading && !error && events.length > 0 && (
        <div style={s.grid}>
          {events.map((ev) => (
            <EventCard key={ev.id} event={ev} onPurchase={() => openModal(ev)} />
          ))}
        </div>
      )}

      {/* Purchase Modal */}
      {showModal && selectedEvent && (
        <div style={s.overlay} onClick={closeModal}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHead}>
              <h2 style={s.modalTitle}>Purchase Ticket</h2>
              <button onClick={closeModal} style={s.closeBtn} aria-label="Close">×</button>
            </div>

            {paySuccess ? (
              <div style={{ padding: '1.5rem' }}>
                <div className="alert alert-success">
                  ✓ Payment successful! Your ticket is confirmed. Check your email.
                </div>
              </div>
            ) : (
              <form onSubmit={handlePay} style={s.modalBody}>
                {/* Event summary */}
                <div style={s.eventInfo}>
                  <p style={s.eventName}>
                    {selectedEvent.is_premium && '⭐ '}
                    {selectedEvent.name}
                  </p>
                  <p style={s.eventMeta}>
                    <IconCalendar size={13} color="#64748b" />
                    {new Date(selectedEvent.date).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                  <p style={s.eventMeta}>
                    <IconMapPin size={13} color="#64748b" />
                    {selectedEvent.venue}
                  </p>
                </div>

                <div className="form-group">
                  <label htmlFor="g-name" className="form-label">Full Name</label>
                  <input id="g-name" type="text" className="form-input" placeholder="John Doe"
                    value={guestName} onChange={(e) => setGuestName(e.target.value)}
                    required disabled={payLoading} />
                </div>

                <div className="form-group">
                  <label htmlFor="g-email" className="form-label">Email Address</label>
                  <input id="g-email" type="email" className="form-input" placeholder="john@example.com"
                    value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)}
                    required disabled={payLoading} />
                </div>

                <div className="form-group">
                  <label htmlFor="g-type" className="form-label">Ticket Type</label>
                  <select id="g-type" className="form-input" value={selectedTicketType}
                    onChange={(e) => setSelectedTicketType(e.target.value as TicketType)}
                    disabled={payLoading}>
                    {getAvailableTypes(selectedEvent).map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)} — ₹{selectedEvent.ticket_types?.[t] ?? 0}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Price summary */}
                <div style={s.priceSummary}>
                  <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Total</span>
                  <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#0f172a' }}>
                    ₹{selectedEvent.ticket_types?.[selectedTicketType] ?? 0}
                  </span>
                </div>

                {payError && <div className="alert alert-error">{payError}</div>}

                <div style={s.modalActions}>
                  <button type="button" onClick={closeModal} className="btn btn-ghost" disabled={payLoading}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary"
                    disabled={payLoading || selectedEvent.available_seats === 0}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {payLoading ? 'Opening payment…' : (
                      <>
                        <span>Pay ₹{selectedEvent.ticket_types?.[selectedTicketType] ?? 0}</span>
                        <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>via Razorpay</span>
                      </>
                    )}
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
  const fillPct = event.capacity > 0
    ? Math.round(((event.capacity - event.available_seats) / event.capacity) * 100)
    : 0;
  const availableTypes = event.ticket_types && Object.keys(event.ticket_types).length > 0
    ? Object.entries(event.ticket_types).filter(([_, p]) => p > 0)
    : [['normal', 0]];
  const minPrice = Math.min(...availableTypes.map(([_, p]) => Number(p)));

  return (
    <div style={{
      ...s.card,
      ...(event.is_premium ? {
        border: '2px solid #fbbf24',
        background: 'linear-gradient(135deg, #fffbeb 0%, #fff 100%)',
        boxShadow: '0 4px 12px rgba(251,191,36,0.15)',
      } : {}),
    }}>
      <div style={s.cardHead}>
        <h3 style={s.cardTitle}>
          {event.is_premium && <span style={{ marginRight: '0.375rem' }}>⭐</span>}
          {event.name}
        </h3>
        <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
          {event.is_premium && (
            <span className="badge" style={{ background: '#fbbf24', color: '#78350f', fontSize: '0.6875rem' }}>
              PREMIUM
            </span>
          )}
          {full && <span className="badge badge-red">Sold Out</span>}
        </div>
      </div>

      <div style={s.cardMeta}>
        <div style={s.metaRow}><IconCalendar size={13} color="#64748b" />
          <span>{new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <div style={s.metaRow}><IconMapPin size={13} color="#64748b" /><span>{event.venue}</span></div>
        <div style={s.metaRow}><IconUsers size={13} color="#64748b" />
          <span>{event.available_seats} / {event.capacity} seats left</span>
        </div>
      </div>

      <div style={s.progressTrack}>
        <div style={{
          ...s.progressFill,
          width: `${fillPct}%`,
          background: full ? '#dc2626' : fillPct > 80 ? '#d97706' : event.is_premium ? '#fbbf24' : '#4f46e5',
        }} />
      </div>

      <div style={s.ticketTypes}>
        {availableTypes.map(([type, price]) => (
          <div key={type} style={s.ticketBadge}>
            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
              {String(type).charAt(0).toUpperCase() + String(type).slice(1)}
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>₹{price}</span>
          </div>
        ))}
      </div>

      <button onClick={onPurchase} disabled={full} className="btn btn-primary" style={{
        width: '100%',
        ...(event.is_premium && !full
          ? { background: 'linear-gradient(135deg,#fbbf24 0%,#f59e0b 100%)', border: 'none' }
          : {}),
      }}>
        {full ? 'Sold Out' : `Buy Ticket — From ₹${minPrice}`}
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' },
  card: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: 'var(--shadow-sm)' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' },
  cardTitle: { margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 },
  cardMeta: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  metaRow: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', color: '#64748b' },
  progressTrack: { height: '6px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '99px', transition: 'width 400ms ease' },
  ticketTypes: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  ticketBadge: { flex: 1, minWidth: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: '#fff', borderRadius: '14px', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)' },
  modalTitle: { margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.75rem', color: '#94a3b8', cursor: 'pointer', lineHeight: 1, padding: 0 },
  modalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  eventInfo: { background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '1rem' },
  eventName: { margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' },
  eventMeta: { margin: '0.2rem 0 0', fontSize: '0.8125rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' },
  priceSummary: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.875rem 1rem' },
  modalActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.25rem' },
};
