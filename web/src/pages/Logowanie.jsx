import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiPost } from '../api.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import Msg from '../components/Msg.jsx';

export default function Logowanie() {
  const navigate = useNavigate();
  const [rejestracja, setRejestracja] = useState(false);
  const [imieNazwisko, setImieNazwisko] = useState('');
  const [email, setEmail] = useState('');
  const [haslo, setHaslo] = useState('');
  const [msg, setMsg] = useState({ text: '', type: 'error' });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const url = rejestracja ? '/auth/rejestracja' : '/auth/logowanie';
      await apiPost(url, { imieNazwisko, email, haslo });
      navigate('/nauczyciel');
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
      setBusy(false);
    }
  }

  async function demoLogin() {
    setBusy(true);
    try {
      await apiPost('/auth/logowanie', { email: 'nauczyciel@demo.pl', haslo: 'demo1234' });
      navigate('/nauczyciel');
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
      setBusy(false);
    }
  }

  const subtitle = rejestracja ? 'Nowe konto nauczyciela' : 'Panel nauczyciela';

  return (
    <div className="center-screen">
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div className="neu-card auth-card fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 26 }}>
            <div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>ClassQuest</div>
              <p className="muted" style={{ fontWeight: 600, fontSize: '0.92rem' }}>{subtitle}</p>
            </div>
            <ThemeToggle />
          </div>

          <Msg type={msg.type} show={!!msg.text}>{msg.text}</Msg>

          <form onSubmit={submit}>
            {rejestracja && (
              <div className="field">
                <label className="neu-label">Imię i nazwisko</label>
                <input className="neu-input" value={imieNazwisko} onChange={e => setImieNazwisko(e.target.value)} placeholder="np. Jan Kowalski" />
              </div>
            )}
            <div className="field">
              <label className="neu-label">E-mail</label>
              <input className="neu-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="np. jan@szkola.pl" autoComplete="username" />
            </div>
            <div className="field">
              <label className="neu-label">Hasło {rejestracja && '(min. 6 znaków)'}</label>
              <input className="neu-input" type="password" value={haslo} onChange={e => setHaslo(e.target.value)} placeholder="••••••••" autoComplete={rejestracja ? 'new-password' : 'current-password'} />
            </div>
            <button className="neu-btn neu-btn-block" disabled={busy} style={{ marginTop: 8 }}>
              {busy ? 'Proszę czekać...' : rejestracja ? 'Zarejestruj się' : 'Zaloguj się'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 18, fontWeight: 600, fontSize: '0.9rem' }} className="muted">
            {rejestracja ? 'Masz już konto?' : 'Nie masz jeszcze konta?'}
            <button type="button" className="link-btn" style={{ color: 'var(--blue-main)' }}
              onClick={() => { setRejestracja(!rejestracja); setMsg({ text: '', type: 'error' }); }}>
              {rejestracja ? 'Zaloguj się' : 'Zarejestruj się'}
            </button>
          </div>

          <hr className="sep" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
              Konto demo: <b>nauczyciel@demo.pl</b> / <b>demo1234</b>
            </span>
            <button className="neu-btn neu-btn-sm neu-btn-blue" onClick={demoLogin} disabled={busy}>Użyj demo ✨</button>
          </div>

          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <Link to="/" className="link-btn muted">← Wróć na start</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
