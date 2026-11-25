import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export function ProtectedRoute({ children, roles }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <div className="loading-screen">Loading your workspace…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}
