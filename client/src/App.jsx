import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth';
import { DataProvider } from './components/data';
import { EditUserProvider, FieldLabel, UiProvider, useUi } from './components/ui';
import Login from './pages/Login';
import EmployeeHome from './pages/EmployeeHome';
import EmployeeProject from './pages/EmployeeProject';
import ManagerHome from './pages/ManagerHome';
import ManagerProject from './pages/ManagerProject';
import DeveloperHome from './pages/DeveloperHome';

function homeFor(role) {
  if (role === 'developer') return '/developer';
  if (role === 'manager') return '/manager';
  return '/employee';
}

function Shell({ children }) {
  const { user, logout } = useAuth();
  const { text } = useUi();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <FieldLabel k="brand" />
        </div>
        <nav>
          <span className="who">{user.full_name}</span>
          {user.role === 'developer' && <Link to="/developer">{text('developer_home')}</Link>}
          {(user.role === 'manager' || user.role === 'developer') && <Link to="/manager">{text('manager_home')}</Link>}
          {(user.role === 'employee' || user.role === 'developer') && <Link to="/employee">{text('employee_home')}</Link>}
          <button type="button" onClick={async () => { await logout(); navigate('/'); }}>{text('logout')}</button>
        </nav>
      </header>
      <main className="page">{children}</main>
      <ScrollTop label={text('back_to_top')} />
    </div>
  );
}

function ScrollTop({ label }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 280);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="to-top"
      aria-label={label || 'Back to top'}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <ChevronUp size={22} />
    </button>
  );
}

function Gate({ roles, page, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="boot" aria-busy="true" />;
  if (!user) return <Navigate to="/" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return (
    <UiProvider page={page}>
      <EditUserProvider user={user}>
        <DataProvider>
          <Shell>{children}</Shell>
        </DataProvider>
      </EditUserProvider>
    </UiProvider>
  );
}

function LoginRoute() {
  const { loading } = useAuth();
  if (loading) return <div className="boot" aria-busy="true" />;
  return (
    <UiProvider page="login">
      <Login />
    </UiProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LoginRoute />} />
        <Route path="/employee" element={<Gate roles={['employee', 'developer']} page="employee_home"><EmployeeHome /></Gate>} />
        <Route path="/employee/projects/:id" element={<Gate roles={['employee', 'developer']} page="employee_project"><EmployeeProject /></Gate>} />
        <Route path="/manager" element={<Gate roles={['manager', 'developer']} page="manager_home"><ManagerHome /></Gate>} />
        <Route path="/manager/projects/:id" element={<Gate roles={['manager', 'developer']} page="manager_project"><ManagerProject /></Gate>} />
        <Route path="/developer" element={<Gate roles={['developer']} page="developer_home"><DeveloperHome /></Gate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
