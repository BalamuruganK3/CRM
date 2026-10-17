import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ChevronUp } from 'lucide-react';
import { useAuth } from '../auth';
import { explain, FieldLabel, useUi } from '../components/ui';

function homeFor(role) {
  if (role === 'developer') return '/developer';
  if (role === 'manager') return '/manager';
  return '/employee';
}

export default function Login() {
  const { user, login } = useAuth();
  const { text } = useUi();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError(text('login_required'));
      return;
    }
    setBusy(true);
    try {
      const next = await login(username.trim(), password);
      navigate(homeFor(next.role));
    } catch (err) {
      setError(explain(err.code, text));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="brand-lockup login-brand"><FieldLabel k="brand" /></div>
      <form className="login-card" onSubmit={submit}>
        <h1><FieldLabel k="title" /></h1>
        <p className="lede"><FieldLabel k="subtitle" /></p>
        <label>
          <FieldLabel k="username_label" />
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          <FieldLabel k="password_label" />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? text('loading') : text('sign_in')}</button>
        <p className="hint"><FieldLabel k="demo_hint" /></p>
      </form>
      <LoginScrollTop label={text('back_to_top')} />
    </main>
  );
}

function LoginScrollTop({ label }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 280);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button type="button" className="to-top" aria-label={label || 'Back to top'} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      <ChevronUp size={22} />
    </button>
  );
}
