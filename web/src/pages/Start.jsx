import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle.jsx';

function animateLetters(el) {
  if (!el) return;
  const text = el.innerText;
  el.innerHTML = '';
  [...text].forEach((char, i) => {
    const span = document.createElement('span');
    span.className = 'char';
    span.innerHTML = char === ' ' ? '&nbsp;' : char;
    span.style.animationDelay = `${0.2 + i * 0.035}s`;
    el.appendChild(span);
  });
}

export default function Start() {
  return (
    <div className="center-screen" style={{ minHeight: '100vh' }}>
      <div className="neu-card auth-card fade-in" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <ThemeToggle />
        </div>
        <h1 className="logo" style={{ fontSize: '2.3rem', fontWeight: 800, marginBottom: 6 }} ref={animateLetters}>ClassQuest</h1>
        <p className="muted" style={{ fontWeight: 600, marginBottom: 30 }}>Interaktywna platforma lekcyjna</p>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 22 }}>Kim jesteś?</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Link to="/logowanie" className="neu-btn neu-btn-block" style={{ padding: '18px 24px', fontSize: '1.05rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🎓</span> Nauczycielem
          </Link>
          <Link to="/uczen" className="neu-btn neu-btn-block" style={{ padding: '18px 24px', fontSize: '1.05rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🎮</span> Uczniem
          </Link>
        </div>

        <p className="muted" style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, marginTop: 26 }}>
          Wersja 2.0 — w budowie (etap: panele nauczyciela)
        </p>
      </div>
    </div>
  );
}
