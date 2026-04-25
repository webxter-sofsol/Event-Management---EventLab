import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';
import { IconDiamond } from '../components/Icons';

interface LoginFormData {
  email: string;
  password: string;
}

export default function AuthPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormData>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(data: LoginFormData) {
    setErrorMessage(null);
    try {
      const response = await axiosInstance.post('/api/auth/login/', {
        email: data.email,
        password: data.password,
      });
      login(response.data.access, response.data.refresh);
      navigate('/dashboard');
    } catch {
      setErrorMessage('Invalid email or password. Please try again.');
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Logo mark */}
        <div style={s.logoWrap}>
          <div style={s.logoIcon}>
            <IconDiamond size={20} color="#fff" />
          </div>
          <span style={s.logoText}>EventHub</span>
        </div>

        <h1 style={s.title}>Welcome back</h1>
        <p style={s.subtitle}>Sign in to your admin account</p>

        <form onSubmit={handleSubmit(onSubmit)} style={s.form} noValidate>
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email address</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              autoComplete="email"
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && <span className="form-error">{errors.email.message}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              autoComplete="current-password"
              {...register('password', { required: 'Password is required' })}
            />
            {errors.password && <span className="form-error">{errors.password.message}</span>}
          </div>

          {errorMessage && (
            <div className="alert alert-error" aria-live="polite" role="alert">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '0.25rem' }}
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #eef2ff 0%, #f8fafc 60%, #f0fdf4 100%)',
    padding: '1rem',
  },
  card: {
    background: '#fff',
    padding: '2.5rem',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(79,70,229,0.12), 0 2px 8px rgba(0,0,0,0.06)',
    width: '100%',
    maxWidth: '420px',
    border: '1px solid #e0e7ff',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    marginBottom: '1.75rem',
  },
  logoIcon: {
    width: '40px',
    height: '40px',
    background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '1.1rem',
  },
  logoText: {
    fontSize: '1.25rem',
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: '-0.02em',
  },
  title: {
    margin: '0 0 0.25rem',
    fontSize: '1.5rem',
    fontWeight: '700',
    textAlign: 'center',
    color: '#0f172a',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '0 0 1.75rem',
    fontSize: '0.9rem',
    textAlign: 'center',
    color: '#64748b',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.125rem',
  },
};
