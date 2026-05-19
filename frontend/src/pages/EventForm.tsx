import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { IconBrain, IconChevronDown, IconChevronUp, IconRefresh } from '../components/Icons';
import type React from 'react';

const EVENT_TYPES = ['conference', 'workshop', 'social', 'webinar', 'other'] as const;
type EventType = typeof EVENT_TYPES[number];

interface EventFormData {
  name: string;
  date: string;
  end_date?: string;
  venue: string;
  price: number;
  type: EventType;
  capacity: number;
  ticket_types: Record<string, number>;
  is_premium: boolean;
}

interface AISuggestion {
  available: boolean;
  date_suggestion?: string;
  capacity_suggestion?: number;
  is_limited_data?: boolean;
}

export default function EventForm() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<EventFormData>({
    defaultValues: {
      ticket_types: { normal: 0, silver: 0, platinum: 0 },
      is_premium: false
    }
  });
  const [apiError, setApiError] = useState<string | null>(null);
  const [otherType, setOtherType] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const ticketTypes = watch('ticket_types') || { normal: 0, silver: 0, platinum: 0 };
  const selectedType = watch('type');

  // Convert local datetime-local strings to UTC ISO strings before sending
  const toUTC = (localStr: string | undefined) => {
    if (!localStr) return undefined;
    return new Date(localStr).toISOString();
  };

  useEffect(() => {
    if (!isEditMode) return;
    axiosInstance.get(`/api/events/${id}/`)
      .then((res) => {
        const ev = res.data;
        // Convert UTC ISO strings from API to local datetime-local format for the input
        const toLocalInput = (iso: string) => {
          if (!iso) return '';
          const d = new Date(iso);
          // Format as YYYY-MM-DDTHH:mm in local time
          const pad = (n: number) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        const knownTypes = ['conference', 'workshop', 'social', 'webinar', 'other'];
        const isKnownType = knownTypes.includes(ev.type);
        reset({ 
          name: ev.name, 
          date: toLocalInput(ev.date),
          end_date: toLocalInput(ev.end_date),
          venue: ev.venue, 
          price: ev.price, 
          type: isKnownType ? ev.type : 'other',
          capacity: ev.capacity,
          ticket_types: ev.ticket_types || { normal: ev.price || 0, silver: 0, platinum: 0 },
          is_premium: ev.is_premium || false
        });
        if (!isKnownType) setOtherType(ev.type);
      })
      .catch(() => setApiError('Failed to load event data.'));
  }, [id, isEditMode, reset]);

  async function onSubmit(data: EventFormData) {
    setApiError(null);
    try {
      // If type is "other" and a custom label was entered, use that as the type
      const payload = {
        ...data,
        date: toUTC(data.date)!,
        end_date: toUTC(data.end_date) || null,
        type: data.type === 'other' && otherType.trim() ? otherType.trim() : data.type,
      };
      if (isEditMode) await axiosInstance.patch(`/api/events/${id}/`, payload);
      else await axiosInstance.post('/api/events/', payload);
      navigate('/events');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string; errors?: unknown } } };
      const detail = e?.response?.data?.detail;
      const errs = e?.response?.data?.errors;
      if (detail) setApiError(detail);
      else if (errs) setApiError(JSON.stringify(errs));
      else setApiError('An error occurred. Please try again.');
    }
  }

  async function fetchAiSuggestions() {
    setAiLoading(true);
    setAiError(null);
    setAiSuggestion(null);
    try {
      const res = await axiosInstance.get(`/api/events/${id}/ai/suggestions/`);
      setAiSuggestion(res.data);
    } catch {
      setAiError('Failed to fetch AI suggestions.');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        <a onClick={() => navigate('/events')} style={s.backLink} role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/events')}>← Back to Events</a>

        <div style={s.card}>
          <div style={s.cardHeader}>
            <div style={s.headerIcon}>{isEditMode ? '✏️' : '✨'}</div>
            <div>
              <h1 style={s.title}>{isEditMode ? 'Edit Event' : 'Create New Event'}</h1>
              <p style={s.subtitle}>{isEditMode ? 'Update event details below' : 'Fill in the details to create your event'}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} style={s.form} noValidate>
            <div style={s.formGrid}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="name" className="form-label">Event Name</label>
                <input id="name" type="text" className="form-input" placeholder="e.g. Annual Tech Conference 2025"
                  {...register('name', { required: 'Name is required' })} />
                {errors.name && <span className="form-error">{errors.name.message}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="date" className="form-label">Start Date &amp; Time</label>
                <input id="date" type="datetime-local" className="form-input"
                  {...register('date', { required: 'Start date is required' })} />
                {errors.date && <span className="form-error">{errors.date.message}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="end_date" className="form-label">End Date &amp; Time (Optional)</label>
                <input id="end_date" type="datetime-local" className="form-input"
                  {...register('end_date', {
                    validate: (v) => {
                      if (!v) return true; // Optional field
                      const startDate = watch('date');
                      if (startDate && new Date(v) <= new Date(startDate)) {
                        return 'End date must be after start date';
                      }
                      return true;
                    }
                  })} />
                {errors.end_date && <span className="form-error">{errors.end_date.message}</span>}
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Event will automatically end at this time
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="venue" className="form-label">Venue</label>
                <input id="venue" type="text" className="form-input" placeholder="e.g. Convention Center, Hall A"
                  {...register('venue', { required: 'Venue is required' })} />
                {errors.venue && <span className="form-error">{errors.venue.message}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="type" className="form-label">Event Type</label>
                <select id="type" className="form-select"
                  {...register('type', { required: 'Type is required' })}>
                  <option value="">Select a type…</option>
                  {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
                {errors.type && <span className="form-error">{errors.type.message}</span>}
                {selectedType === 'other' && (
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Specify event type…"
                    value={otherType}
                    onChange={(e) => setOtherType(e.target.value)}
                    required
                    style={{ marginTop: '0.5rem' }}
                    aria-label="Custom event type"
                  />
                )}
              </div>

              <div className="form-group">
                <label htmlFor="price" className="form-label">Ticket Price ($)</label>
                <input id="price" type="number" min={0} step="0.01" className="form-input" placeholder="0.00"
                  {...register('price', { required: 'Price is required', min: { value: 0, message: 'Must be ≥ 0' }, valueAsNumber: true })} />
                {errors.price && <span className="form-error">{errors.price.message}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="capacity" className="form-label">Seat Capacity</label>
                <input id="capacity" type="number" min={1} className="form-input" placeholder="100"
                  {...register('capacity', { required: 'Capacity is required', min: { value: 1, message: 'Must be ≥ 1' }, valueAsNumber: true })} />
                {errors.capacity && <span className="form-error">{errors.capacity.message}</span>}
              </div>
            </div>

            {/* Ticket Types Pricing */}
            <div style={{ marginTop: '0.5rem' }}>
              <label className="form-label" style={{ marginBottom: '0.75rem', display: 'block' }}>Ticket Types & Pricing</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="ticket-normal" className="form-label" style={{ fontSize: '0.8125rem' }}>Normal ($)</label>
                  <input id="ticket-normal" type="number" min={0} step="0.01" className="form-input"
                    value={ticketTypes.normal || 0}
                    onChange={(e) => setValue('ticket_types', { ...ticketTypes, normal: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="ticket-silver" className="form-label" style={{ fontSize: '0.8125rem' }}>Silver ($)</label>
                  <input id="ticket-silver" type="number" min={0} step="0.01" className="form-input"
                    value={ticketTypes.silver || 0}
                    onChange={(e) => setValue('ticket_types', { ...ticketTypes, silver: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="ticket-platinum" className="form-label" style={{ fontSize: '0.8125rem' }}>Platinum ($)</label>
                  <input id="ticket-platinum" type="number" min={0} step="0.01" className="form-input"
                    value={ticketTypes.platinum || 0}
                    onChange={(e) => setValue('ticket_types', { ...ticketTypes, platinum: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Set price to 0 to disable a ticket type. At least one type should have a price &gt; 0.
              </p>
            </div>

            {/* Premium Event Checkbox */}
            <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                <input type="checkbox" {...register('is_premium')} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                <div>
                  <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' }}>⭐ Premium Event</span>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Premium events get special visibility and featured placement
                  </p>
                </div>
              </label>
            </div>

            {apiError && <div className="alert alert-error">{apiError}</div>}

            <div style={s.formActions}>
              <button type="button" onClick={() => navigate('/events')} className="btn btn-ghost">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                {isSubmitting ? 'Saving…' : isEditMode ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>

        {/* AI Suggestions panel */}
        {isEditMode && (
          <div style={s.aiCard}>
            <button type="button" onClick={() => setAiOpen((o) => !o)} style={s.aiToggle} aria-expanded={aiOpen}>
              <span style={s.aiIcon}>🤖</span>
              <span>AI Suggestions</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{aiOpen ? '▲' : '▼'}</span>
            </button>

            {aiOpen && (
              <div style={s.aiBody}>
                <p style={s.aiDesc}>Get AI-powered recommendations based on historical event data.</p>
                <button type="button" onClick={fetchAiSuggestions} disabled={aiLoading} className="btn btn-secondary btn-sm">
                  {aiLoading ? 'Fetching…' : '✨ Get Suggestions'}
                </button>

                {aiError && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{aiError}</div>}

                {aiSuggestion && (
                  <div style={s.aiResult}>
                    {!aiSuggestion.available ? (
                      <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>AI suggestions unavailable right now.</p>
                    ) : (
                      <>
                        {aiSuggestion.is_limited_data && (
                          <div className="alert alert-warning" style={{ marginBottom: '0.75rem' }}>
                            Based on limited historical data — suggestions may be less accurate.
                          </div>
                        )}
                        {aiSuggestion.date_suggestion && (
                          <div style={s.aiRow}>
                            <span style={s.aiRowLabel}>📅 Suggested date</span>
                            <span style={s.aiRowValue}>{new Date(aiSuggestion.date_suggestion).toLocaleString()}</span>
                          </div>
                        )}
                        {aiSuggestion.capacity_suggestion != null && (
                          <div style={s.aiRow}>
                            <span style={s.aiRowLabel}>👥 Suggested capacity</span>
                            <span style={s.aiRowValue}>{aiSuggestion.capacity_suggestion}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { background: 'var(--color-bg)', minHeight: '100vh', padding: '2rem 1rem' },
  container: { maxWidth: '640px', margin: '0 auto' },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '1.25rem', cursor: 'pointer' },
  card: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '2rem', boxShadow: 'var(--shadow-md)', marginBottom: '1rem' },
  cardHeader: { display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.75rem' },
  headerIcon: { width: '44px', height: '44px', background: 'var(--color-primary-light)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 },
  title: { margin: '0 0 0.2rem', fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em' },
  subtitle: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  form: { display: 'flex', flexDirection: 'column', gap: '1.125rem' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  formActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' },
  aiCard: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  aiToggle: { width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' },
  aiIcon: { fontSize: '1.1rem' },
  aiBody: { padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--color-border)' },
  aiDesc: { margin: '0.75rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  aiResult: { background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' },
  aiRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' },
  aiRowLabel: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  aiRowValue: { fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' },
};
