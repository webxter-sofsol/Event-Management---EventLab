import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import NavBar from './components/NavBar';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import EventList from './pages/EventList';
import EventForm from './pages/EventForm';
import RegistrationPanel from './pages/RegistrationPanel';
import AlertSettings from './pages/AlertSettings';
import ReportPage from './pages/ReportPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminManagement from './pages/AdminManagement';
import AIInsightsPage from './pages/AIInsightsPage';
import CheckInPage from './pages/CheckInPage';
import UserDashboard from './pages/UserDashboard';
import EventQRPage from './pages/EventQRPage';
import GuestCheckInPage from './pages/GuestCheckInPage';
import './styles/app.css';

function ProtectedLayout() {
  return (
    <div className="app-layout">
      <NavBar />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/events" element={<EventList />} />
              <Route path="/events/new" element={<EventForm />} />
              <Route path="/events/:id/edit" element={<EventForm />} />
              <Route path="/events/:id/registrations" element={<RegistrationPanel />} />
              <Route path="/events/:id/alerts" element={<AlertSettings />} />
              <Route path="/events/:id/report" element={<ReportPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/admins" element={<AdminManagement />} />
              <Route path="/ai-insights" element={<AIInsightsPage />} />
              <Route path="/checkin" element={<CheckInPage />} />
              <Route path="/browse" element={<UserDashboard />} />
              <Route path="/events/:id/qr" element={<EventQRPage />} />
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          {/* Public guest check-in — no auth required */}
          <Route path="/checkin/event/:eventId" element={<GuestCheckInPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
