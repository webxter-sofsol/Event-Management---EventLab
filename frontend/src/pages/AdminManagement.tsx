import { useState, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { extractApiError } from '../utils/apiError';
import type React from 'react';

interface Admin { id: string; email: string; role: string; is_active: boolean; date_joined: string; }

export default function AdminManagement() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  async function fetchAdmins() {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get('/api/auth/admins/');
      setAdmins(Array.isArray(res.data) ? res.data : res.data.results ?? []);
    } catch { setError('Failed to load admins.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchAdmins(); }, []);

  async function handleDeactivate(id: number) {
    try {
      await axiosInstance.patch(`/api/auth/admins/${id}/deactivate/`);
      await fetchAdmins();
    } catch { setError('Failed to deactivate admin.'); }
  }

  async function handleCreateAdmin(e: FormEvent) {
    e.preventDefault();
    setCreating(true); setCreateError(null); setCreateSuccess(null);
    try {
      await axiosInstance.post('/api/auth/register-admin/', { email });
      setCreateSuccess('Admin created. A setup email has been sent.');
      setEmail('');
      await fetchAdmins();
    } catch (err) {
      setCreateError(extractApiError(err, 'Failed to create admin.'));
    } finally { setCreating(false); }
  }

  return (
    <div className="page" style={{ maxWidth: '900px' }}>
      <Link to="/dashboard" className="back-link">← Dashboard</Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Management</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Manage admin accounts and access
          </p>
        </div>
      </div>

      {/* Create Admin */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <div style={s.iconWrap}>👤</div>
          <div>
            <h2 style={s.sectionTitle}>Create Admin Account</h2>
            <p style={s.sectionDesc}>A setup email will be sent to the new admin.</p>
          </div>
        </div>
        <form onSubmit={handleCreateAdmin} style={s.form} noValidate>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '1 1 260px' }}>
              <label htmlFor="admin-email" className="form-label">Email Address</label>
              <input id="admin-email" type="email" className="form-input" value={email}
                onChange={(e) => setEmail(e.target.value)} required placeholder="newadmin@example.com" />
            </div>
            <button type="submit" disabled={creating} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
              {creating ? 'Creating…' : 'Create Admin'}
            </button>
          </div>
          {createError && <div className="alert alert-error" aria-live="polite" role="alert">{createError}</div>}
          {createSuccess && <div className="alert alert-success" aria-live="polite">{createSuccess}</div>}
        </form>
      </div>

      {/* Admin list */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={s.sectionTitle}>Admin Accounts</h2>
          <span className="badge badge-blue">{admins.length} total</span>
        </div>

        {loading ? (
          <div className="loading-text">Loading…</div>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : admins.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}><p>No admins found.</p></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td style={{ fontWeight: 600 }}>{admin.email}</td>
                    <td><span className="badge badge-purple">{admin.role}</span></td>
                    <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(admin.date_joined).toLocaleDateString()}
                    </td>
                    <td>
                      <span className={admin.is_active ? 'badge badge-green' : 'badge badge-gray'}>
                        {admin.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {admin.is_active && (
                        <button onClick={() => handleDeactivate(admin.id)} className="btn btn-sm btn-danger"
                          aria-label={`Deactivate ${admin.email}`}>Deactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.25rem', boxShadow: 'var(--shadow-sm)' },
  cardHeader: { display: 'flex', alignItems: 'flex-start', gap: '0.875rem', marginBottom: '1.25rem' },
  iconWrap: { width: '40px', height: '40px', background: 'var(--color-primary-light)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 },
  sectionTitle: { margin: '0 0 0.15rem', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' },
  sectionDesc: { margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.875rem' },
};
