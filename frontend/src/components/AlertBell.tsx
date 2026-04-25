import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { IconBell, IconAlertTriangle, IconCheckCircle, IconX } from './Icons';
import type React from 'react';

interface AlertItem {
  id: string;
  event_id: string;
  event_name: string;
  message: string;
  created_at: string;
  is_read: boolean;
}

export default function AlertBell() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await axiosInstance.get('/api/alerts/');
      setAlerts(res.data.alerts ?? []);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function dismiss(id: string) {
    try {
      await axiosInstance.patch(`/api/alerts/${id}/dismiss/`);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ }
  }

  async function dismissAll() {
    try {
      await axiosInstance.patch('/api/alerts/dismiss-all/');
      setAlerts([]);
    } catch { /* ignore */ }
  }

  function goToEvent(eventId: string) {
    setOpen(false);
    navigate(`/events/${eventId}/registrations`);
  }

  const count = alerts.length;

  return (
    <div ref={dropdownRef} style={s.wrap}>
      <button
        onClick={() => setOpen(o => !o)}
        style={s.bell}
        aria-label={`Alerts${count > 0 ? ` — ${count} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <IconBell size={18} color="#fff" />
        {count > 0 && (
          <span style={s.badge} aria-hidden="true">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div style={s.dropdown} role="dialog" aria-label="Notifications">
          <div style={s.header}>
            <span style={s.headerTitle}>Alerts</span>
            {count > 0 && (
              <button onClick={dismissAll} style={s.clearBtn}>Clear all</button>
            )}
          </div>

          {count === 0 ? (
            <div style={s.empty}>
              <IconCheckCircle size={28} color="#16a34a" />
              <p style={s.emptyText}>No active alerts</p>
            </div>
          ) : (
            <ul style={s.list} role="list">
              {alerts.map(alert => (
                <li key={alert.id} style={s.item}>
                  <div style={s.itemTop}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                      <IconAlertTriangle size={14} color="#d97706" style={{ flexShrink: 0 }} />
                      <button onClick={() => goToEvent(alert.event_id)} style={s.eventName}>
                        {alert.event_name}
                      </button>
                    </div>
                    <button onClick={() => dismiss(alert.id)} style={s.dismissBtn} aria-label="Dismiss alert">
                      <IconX size={12} color="#94a3b8" />
                    </button>
                  </div>
                  <p style={s.message}>{alert.message}</p>
                  <p style={s.time}>{new Date(alert.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { position: 'relative' },
  bell: {
    position: 'relative',
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '8px',
    width: '38px',
    height: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 150ms ease',
    marginRight: '0.25rem',
  },
  badge: {
    position: 'absolute',
    top: '-5px',
    right: '-5px',
    background: '#ef4444',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: 800,
    borderRadius: '99px',
    minWidth: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    border: '2px solid #4f46e5',
    lineHeight: 1,
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    width: '340px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
    zIndex: 200,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.875rem 1rem',
    borderBottom: '1px solid #f1f5f9',
    background: '#fafafa',
  },
  headerTitle: { fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.75rem',
    color: '#4f46e5',
    fontWeight: 600,
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '2rem 1rem',
    gap: '0.5rem',
  },
  emptyText: { margin: 0, fontSize: '0.875rem', color: '#64748b' },
  list: { margin: 0, padding: 0, listStyle: 'none', maxHeight: '360px', overflowY: 'auto' },
  item: { padding: '0.875rem 1rem', borderBottom: '1px solid #f8fafc', background: '#fffbeb' },
  itemTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.3rem' },
  eventName: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '0.8125rem', fontWeight: 700, color: '#d97706', padding: 0, textAlign: 'left', flex: 1,
  },
  dismissBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '0.1rem', flexShrink: 0, display: 'flex', alignItems: 'center',
  },
  message: { margin: '0 0 0.25rem', fontSize: '0.775rem', color: '#374151', lineHeight: 1.4 },
  time: { margin: 0, fontSize: '0.7rem', color: '#94a3b8' },
};
