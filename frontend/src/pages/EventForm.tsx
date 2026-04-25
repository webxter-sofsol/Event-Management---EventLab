import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import type React from 'react';

const EVENT_TYPES = ['conference', 'workshop', 'social', 'webinar', 'other'] as const;
type EventType = typeof EVENT_TYPES[number];

interface EventFormData {
  name: string;
  date: string;
  venue: string;
  price: number;
  type: EventType;
  capacity: number;
}

interface AISuggestion {
  available: boolean;
  date_suggestion?: string;
  capacity_suggestion?: number;
  is_limited_data?: boolean;
  content?: object;
}

export default function EventForm() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EventFormData>();

  const [apiError, setApiError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditMode) return;
    axiosInstance
      .get(`/api/events/${id}/`)
      .then((res) => {
        const ev = res.data;
        const dateVal = ev.date ? ev.date.slice(0, 16) : '';
        reset({
          name: ev.name,
          date: dateVal,
          venue: ev.venue,
          price: ev.price,
          type: ev.type,
          capacity: ev.capacity,
        });
      })
      .catch(() => setApiError('Failed to load event data.'));
  }, [id, isEditMode, reset]);

  async function onSubmit(data: EventFormData) {
    setApiError(null);
    try {
      if (isEditMode) {
        await axiosInstance.patch(`/api/events/${id}/`, data);
      } else {
        await axiosInstance.post('/api/events/', data);
      }
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
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{isEditMode ? 'Edit Event' : 'New Event'}</h1>

        <form onSubmit={handleSubmit(onSubmit)} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="name" style={styles.label}>Name</label>
            <input
              id="name"
              type="text"
              style={styles.input}
              {...register('name', { required: 'Name is required' })}
            />
            {errors.name && <span style={styles.fieldError}>{errors.name.message}</span>}
          </div>

          <div style={styles.field}>
            <label htmlFor="date" style={styles.label}>Date &amp; Time</label>
            <input
              id="date"
              type="datetime-local"
              style={styles.input}
              {...register('date', {
                required: 'Date is required',
                validate: (val) =>
                  new Date(val) > new Date() || 'Date must be in the future',
              })}
            />
            {errors.date && <span style={styles.fieldError}>{errors.date.message}</span>}
          </div>

          <div style={styles.field}>
            <label htmlFor="venue" style={styles.label}>Venue</label>
            <input
              id="venue"
              type="text"
              style={styles.input}
              {...register('venue', { required: 'Venue is required' })}
            />
            {errors.venue && <span style={styles.fieldError}>{errors.venue.message}</span>}
          </div>

          <div style={styles.field}>
            <label htmlFor="price" style={styles.label}>Price</label>
            <input
              id="price"
              type="number"
              min={0}
              step="0.01"
              style={styles.input}
              {...register('price', {
                required: 'Price is required',
                min: { value: 0, message: 'Price must be 0 or more' },
                valueAsNumber: true,
              })}
            />
            {errors.price && <span style={styles.fieldError}>{errors.price.message}</span>}
          </div>

          <div style={styles.field}>
            <label htmlFor="type" style={styles.label}>Type</label>
            <select
              id="type"
              style={styles.input}
              {...register('type', {
                required: 'Type is required',
                validate: (val) =>
                  (EVENT_TYPES as readonly string[]).includes(val) || 'Invalid event type',
              })}
            >
              <option value="">Select a type</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            {errors.type && <span style={styles.fieldError}>{errors.type.message}</span>}
          </div>

          <div style={styles.field}>
            <label htmlFor="capacity" style={styles.label}>Capacity</label>
            <input
              id="capacity"
              type="number"
              min={1}
              style={styles.input}
              {...register('capacity', {
                required: 'Capacity is required',
                min: { value: 1, message: 'Capacity must be at least 1' },
                valueAsNumber: true,
              })}
            />
            {errors.capacity && <span style={styles.fieldError}>{errors.capacity.message}</span>}
          </div>

          {apiError && <div style={styles.error}>{apiError}</div>}

          <div style={styles.actions}>
            <button
              type="button"
              onClick={() => navigate('/events')}
              style={styles.cancelButton}
            >
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} style={styles.submitButton}>
              {isSubmitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </form>

        {isEditMode && (
          <div style={styles.aiPanel}>
            <button
              type="button"
              onClick={() => setAiOpen((o) => !o)}
              style={styles.aiToggle}
            >
              {aiOpen ? '\u25be' : '\u25b8'} AI Suggestions
            </button>

            {aiOpen && (
              <div style={styles.aiContent}>
                <button
                  type="button"
                  onClick={fetchAiSuggestions}
                  disabled={aiLoading}
                  style={styles.aiButton}
                >
                  {aiLoading ? 'Loading...' : 'Get Suggestions'}
                </button>

                {aiError && <div style={styles.error}>{aiError}</div>}

                {aiSuggestion && (
                  <div style={styles.aiResult}>
                    {!aiSuggestion.available ? (
                      <p style={styles.aiUnavailable}>AI suggestions unavailable</p>
                    ) : (
                      <>
                        {aiSuggestion.is_limited_data && (
                          <p style={styles.aiNote}>Based on limited historical data</p>
                        )}
                        {aiSuggestion.date_suggestion && (
                          <p>
                            <strong>Suggested date:</strong>{' '}
                            {new Date(aiSuggestion.date_suggestion).toLocaleString()}
                          </p>
                        )}
                        {aiSuggestion.capacity_suggestion != null && (
                          <p>
                            <strong>Suggested capacity:</strong>{' '}
                            {aiSuggestion.capacity_suggestion}
                          </p>
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    padding: '2rem 1rem',
  },
  card: {
    backgroundColor: '#fff',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '520px',
  },
  title: {
    margin: '0 0 1.5rem',
    fontSize: '1.5rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  input: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '1rem',
  },
  fieldError: {
    color: '#d32f2f',
    fontSize: '0.75rem',
  },
  error: {
    backgroundColor: '#fdecea',
    color: '#d32f2f',
    padding: '0.75rem',
    borderRadius: '4px',
    fontSize: '0.875rem',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
    marginTop: '0.5rem',
  },
  cancelButton: {
    padding: '0.6rem 1.25rem',
    backgroundColor: '#fff',
    color: '#333',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '0.95rem',
    cursor: 'pointer',
  },
  submitButton: {
    padding: '0.6rem 1.25rem',
    backgroundColor: '#1976d2',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.95rem',
    cursor: 'pointer',
  },
  aiPanel: {
    marginTop: '1.5rem',
    borderTop: '1px solid #eee',
    paddingTop: '1rem',
  },
  aiToggle: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#1976d2',
    padding: 0,
  },
  aiContent: {
    marginTop: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  aiButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#e3f2fd',
    color: '#1565c0',
    border: '1px solid #90caf9',
    borderRadius: '4px',
    fontSize: '0.875rem',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  aiResult: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
    padding: '0.75rem',
    fontSize: '0.875rem',
  },
  aiUnavailable: {
    color: '#888',
    margin: 0,
  },
  aiNote: {
    color: '#f57c00',
    fontSize: '0.8rem',
    margin: '0 0 0.5rem',
  },
};
