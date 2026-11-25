import { useState } from 'react';
import { ArrowRight, Factory, Leaf } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Feedback } from '../components/Feedback.jsx';

const demos = [
  ['Factory Admin', 'admin@udyamflow.demo'],
  ['Salesman A', 'sales.a@udyamflow.demo'],
  ['Production', 'production@udyamflow.demo'],
  ['Accountant', 'accountant@udyamflow.demo'],
  ['Owner', 'owner@udyamflow.demo'],
];

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('admin@udyamflow.demo');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="login-page">
      <section className="login-story">
        <div className="login-brand"><span className="brand-mark">U</span><strong>udyamflow</strong></div>
        <div className="story-content">
          <span className="eyebrow"><Leaf size={14} /> BUILT FOR THE FACTORY FLOOR</span>
          <h1>From raw<br />materials to<br /><em>ready shelves.</em></h1>
          <p>One connected view of orders, production, stock and accounts. Every number has a source.</p>
        </div>
        <div className="story-footer"><Factory size={16} /> Tamil Nadu · India <span>•</span> Operations workspace</div>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p className="form-subtitle">Use a demo role below or enter your credentials.</p>
          <Feedback error={error} />
          <label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="button button-primary login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} /></button>
          <div className="demo-divider"><span>DEMO ACCOUNTS</span></div>
          <div className="demo-users">
            {demos.map(([name, value]) => <button key={value} type="button" onClick={() => { setEmail(value); setPassword('demo1234'); }}>{name}</button>)}
          </div>
          <p className="demo-password">Password for all demo accounts: <strong>demo1234</strong></p>
        </form>
      </section>
    </div>
  );
}
