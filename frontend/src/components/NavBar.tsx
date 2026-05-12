import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AlertBell from './AlertBell';
import { IconDiamond, IconMenu, IconLogOut, IconBrain, IconX } from './Icons';
import type React from 'react';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/browse', label: 'Browse Events' },
  { to: '/events', label: 'Events' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/ai-insights', label: 'AI Insights', icon: true },
  { to: '/checkin', label: '🎟 Check-In' },
  { to: '/admins', label: 'Admins' },
];

export default function NavBar() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav style={s.nav} aria-label="Main navigation">
      {/* Logo */}
      <Link to="/dashboard" style={s.logo} onClick={() => setMenuOpen(false)}>
        <IconDiamond size={16} color="#fff" />
        EventHub
      </Link>

      {/* Desktop links */}
      <div style={s.desktopLinks}>
        {NAV_LINKS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({ ...s.link, ...(isActive ? s.linkActive : {}) })}
            onClick={() => setMenuOpen(false)}
          >
            {icon && <IconBrain size={13} color="currentColor" style={{ flexShrink: 0 }} />}
            {label}
          </NavLink>
        ))}
        <button onClick={handleLogout} style={s.logoutBtn} aria-label="Sign out">
          <IconLogOut size={13} />
          Sign Out
        </button>
        <AlertBell />
      </div>

      {/* Mobile hamburger */}
      <div style={s.mobileRight}>
        <AlertBell />
        <button
          style={s.hamburger}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(o => !o)}
        >
          {menuOpen ? <IconX size={20} color="#fff" /> : <IconMenu size={20} color="#fff" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={s.mobileMenu}>
          {NAV_LINKS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({ ...s.mobileLink, ...(isActive ? s.mobileLinkActive : {}) })}
              onClick={() => setMenuOpen(false)}
            >
              {icon && <IconBrain size={13} color="currentColor" style={{ flexShrink: 0 }} />}
              {label}
            </NavLink>
          ))}
          <button onClick={handleLogout} style={s.mobileLogout}>
            <IconLogOut size={13} />
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}

const s: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
    padding: '0 1.5rem',
    height: '60px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
    flexWrap: 'wrap',
    gap: 0,
  },
  logo: {
    color: '#fff',
    textDecoration: 'none',
    fontSize: '1rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    marginRight: '1.5rem',
  },
  desktopLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.1rem',
    flex: 1,
    // hidden on mobile via media query — handled by mobileRight
  },
  link: {
    color: 'rgba(255,255,255,0.82)',
    textDecoration: 'none',
    padding: '0.375rem 0.65rem',
    borderRadius: '6px',
    fontSize: '0.84rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    transition: 'background 150ms ease',
  },
  linkActive: {
    background: 'rgba(255,255,255,0.18)',
    color: '#fff',
  },
  logoutBtn: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.25)',
    color: '#fff',
    padding: '0.35rem 0.75rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    whiteSpace: 'nowrap',
    marginLeft: '0.5rem',
  },
  hamburger: {
    display: 'none',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '6px',
    padding: '0.3rem',
    cursor: 'pointer',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileRight: {
    display: 'none',
    alignItems: 'center',
    gap: '0.5rem',
    marginLeft: 'auto',
  },
  mobileMenu: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    paddingBottom: '0.75rem',
    borderTop: '1px solid rgba(255,255,255,0.15)',
    marginTop: '0.5rem',
    gap: '0.1rem',
  },
  mobileLink: {
    color: 'rgba(255,255,255,0.85)',
    textDecoration: 'none',
    padding: '0.5rem 0.5rem',
    borderRadius: '6px',
    fontSize: '0.875rem',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  mobileLinkActive: {
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
  },
  mobileLogout: {
    background: 'none',
    border: 'none',
    borderTop: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.85)',
    padding: '0.5rem 0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    marginTop: '0.25rem',
    width: '100%',
    textAlign: 'left',
  },
};
