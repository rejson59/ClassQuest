import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiPatch, apiDelete, poziomZxp } from '../api.js';
import { useCurrentTeacher } from '../hooks.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import AvatarSvg from '../components/AvatarSvg.jsx';
import Msg from '../components/Msg.jsx';
import { TRYBY } from '../game/tryby.js';

function bezpiecznyAvatar(json) {
  try { return JSON.parse(json || '{}'); } catch { return {}; }
}

export default function Nauczyciel() {
  const navigate = useNavigate();
  const { teacher, loading } = useCurrentTeacher();

  const [klasy, setKlasy] = useState([]);
  const [wybrana, setWybrana] = useState(null);      // wybrana klasa (obiekt)
  const [uczniowie, setUczniowie] = useState([]);
  const [sortXp, setSortXp] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: 'error' });

  // modal dodawania klasy
  const [showKlasaModal, setShowKlasaModal] = useState(false);
  const [nazwaKlasa, setNazwaKlasa] = useState('');
  // formularze w klasie
  const [nowyUczen, setNowyUczen] = useState({ numer: '', imie: '' });
  const [xpForm, setXpForm] = useState({ id: null, kwota: 50, opis: '' });
  // modal „Nowa gra"
  const [showGraModal, setShowGraModal] = useState(false);
  const [graZestawy, setGraZestawy] = useState([]);
  const [graForm, setGraForm] = useState({ klasaId: '', zestawId: '', auto: false, tryb: '4pola', liczbaEkip: 3 });

  async function loadKlasy() {
    try {
      const d = await apiGet('/klasy');
      setKlasy(d.klasy);
    } catch (e) {
      setMsg({ text: e.message, type: 'error' });
    }
  }

  useEffect(() => {
    if (!loading && !teacher) navigate('/logowanie');
    if (teacher) loadKlasy();
  }, [loading, teacher]);

  async function dodajKlase(e) {
    e.preventDefault();
    if (!nazwaKlasa.trim()) return;
    try {
      await apiPost('/klasy', { nazwa: nazwaKlasa });
      setNazwaKlasa('');
      setShowKlasaModal(false);
      loadKlasy();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  }

  async function otworzModalGry() {
    try {
      const d = await apiGet('/zestawy');
      setGraZestawy(d.zestawy);
      setGraForm({ klasaId: wybrana?.id ? String(wybrana.id) : '', zestawId: '', auto: false, tryb: graForm.tryb || '4pola', liczbaEkip: graForm.liczbaEkip || 3 });
      setShowGraModal(true);
    } catch (e) { setMsg({ text: e.message, type: 'error' }); }
  }

  async function utworzGre(e) {
    e.preventDefault();
    if (!graForm.klasaId || !graForm.zestawId) {
      setMsg({ text: 'Wybierz klasę i zestaw pytań.', type: 'error' });
      return;
    }
    try {
      const d = await apiPost('/pokoje', {
        klasaId: Number(graForm.klasaId),
        zestawId: Number(graForm.zestawId),
        auto: graForm.auto,
        tryb: graForm.tryb,
        liczbaEkip: Number(graForm.liczbaEkip) || 3
      });
      setShowGraModal(false);
      navigate(`/nauczyciel/gra/${d.kod}`);
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  }

  async function usunKlase(k) {
    if (!confirm(`Usunąć klasę „${k.nazwa}" wraz z uczniami?`)) return;
    try {
      await apiDelete(`/klasy/${k.id}`);
      if (wybrana?.id === k.id) { setWybrana(null); setUczniowie([]); }
      loadKlasy();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  }

  async function otworzKlase(k) {
    try {
      const d = await apiGet(`/klasy/${k.id}/uczniowie`);
      setWybrana(d.klasa);
      setUczniowie(d.uczniowie);
      setSortXp(false);
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  }

  async function dodajUcznia(e) {
    e.preventDefault();
    try {
      await apiPost(`/klasy/${wybrana.id}/uczniowie`, {
        numerDziennika: nowyUczen.numer,
        imieNazwisko: nowyUczen.imie
      });
      setNowyUczen({ numer: '', imie: '' });
      otworzKlase(wybrana);
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  }

  async function usunUcznia(u) {
    if (!confirm(`Usunąć ucznia ${u.numer_dziennika}. ${u.imie_nazwisko}? (XP i historia zostaną usunięte)`)) return;
    try {
      await apiDelete(`/uczniowie/${u.id}`);
      otworzKlase(wybrana);
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  }

  async function przyznajXp(e) {
    e.preventDefault();
    if (!xpForm.id) return;
    try {
      await apiPost(`/uczniowie/${xpForm.id}/xp`, { kwota: xpForm.kwota, opis: xpForm.opis });
      setXpForm({ id: null, kwota: 50, opis: '' });
      otworzKlase(wybrana);
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  }

  async function wyloguj() {
    try { await apiPost('/auth/wyloguj'); } catch { /* ignoruj */ }
    navigate('/');
  }

  if (loading || !teacher) return null;

  const lista = sortXp
    ? [...uczniowie].sort((a, b) => (b.xp || 0) - (a.xp || 0))
    : [...uczniowie].sort((a, b) => a.numer_dziennika - b.numer_dziennika);

  return (
    <div className="page">
      <Msg type={msg.type} show={!!msg.text}>{msg.text}</Msg>

      {/* topbar */}
      <div className="neu-card neu-card-sm topbar" style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: '1.6rem' }}>🎓</span>
          <div>
            <div className="logo" style={{ fontWeight: 800, fontSize: '1.2rem' }}>ClassQuest</div>
            <p className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Witaj, {teacher.imie_nazwisko}</p>
          </div>
        </div>
        <div className="topbar-links">
          <Link to="/nauczyciel" className="link-btn active">👥 Klasy</Link>
          <Link to="/nauczyciel/zestawy" className="link-btn">📚 Zestawy pytań</Link>
          {teacher.rola === 'admin' && <Link to="/admin" className="link-btn">🛡️ Admin</Link>}
          <button className="neu-btn neu-btn-sm neu-btn-blue" onClick={otworzModalGry}>🎮 Nowa gra</button>
          <ThemeToggle />
          <button className="neu-btn neu-btn-sm neu-btn-red" onClick={wyloguj}>Wyloguj 🚪</button>
        </div>
      </div>

      <div className="grid-1-2">
        {/* lewa kolumna: lista klas */}
        <div>
          <div className="neu-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>👥 Twoje klasy</h2>
              <button className="neu-btn neu-btn-sm neu-btn-blue" onClick={() => setShowKlasaModal(true)}>+ Dodaj klasę</button>
            </div>
            {klasy.length === 0 && <div className="empty-state">Brak klas. Dodaj pierwszą klasę, aby wpisać uczniów.</div>}
            {klasy.map(k => (
              <div key={k.id} className={`row-item ${wybrana?.id === k.id ? '' : ''}`}
                style={{ cursor: 'pointer', border: wybrana?.id === k.id ? '1px solid var(--blue-main)' : '1px solid transparent' }}
                onClick={() => otworzKlase(k)}>
                <div className="row-main">
                  <span style={{ fontSize: '1.4rem' }}>🏫</span>
                  <div>
                    <div className="row-title">{k.nazwa}</div>
                    <div className="row-sub">{k.liczba_uczniow} uczniów</div>
                  </div>
                </div>
                <div className="row-actions" onClick={e => e.stopPropagation()}>
                  <button className="neu-btn neu-btn-sm" onClick={() => { setWybrana(k); }}>Otwórz</button>
                  <button className="neu-btn neu-btn-sm neu-btn-red" onClick={() => usunKlase(k)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* prawa kolumna: klasa szczegóły */}
        <div>
          {!wybrana ? (
            <div className="neu-card empty-state">Wybierz klasę z listy, aby zobaczyć uczniów, ranking i przyznawać XP.</div>
          ) : (
            <div className="neu-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>🏫 Klasa {wybrana.nazwa}</h2>
                <button className="neu-btn neu-btn-sm" onClick={() => setSortXp(!sortXp)}>
                  {sortXp ? '📋 Wg dziennika' : '🏆 Wg XP'}
                </button>
              </div>
              <p className="muted" style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 16 }}>
                {uczniowie.length} uczniów • Poziom = co 100 XP
              </p>

              {/* formularz dodawania ucznia */}
              <form onSubmit={dodajUcznia} style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
                <input className="neu-input" style={{ width: 90 }} placeholder="Nr" value={nowyUczen.numer}
                  onChange={e => setNowyUczen({ ...nowyUczen, numer: e.target.value.replace(/\D/g, '') })} />
                <input className="neu-input" style={{ flex: 1, minWidth: 150 }} placeholder="Imię i nazwisko ucznia" value={nowyUczen.imie}
                  onChange={e => setNowyUczen({ ...nowyUczen, imie: e.target.value })} />
                <button className="neu-btn neu-btn-sm neu-btn-blue">+ Dodaj</button>
              </form>

              {/* ranking / lista */}
              {lista.length === 0 && <div className="empty-state">Brak uczniów. Dodaj uczniów z dziennika.</div>}
              {lista.map((u, idx) => (
                <div key={u.id} className="row-item">
                  <div className="row-main">
                    {sortXp && <span className="badge" style={{ minWidth: 34, textAlign: 'center' }}>#{idx + 1}</span>}
                    <AvatarSvg avatar={bezpiecznyAvatar(u.avatar_json)} size={44} />
                    <div>
                      <div className="row-title">{u.numer_dziennika}. {u.imie_nazwisko}</div>
                      <div className="row-sub">Poziom {poziomZxp(u.xp)}</div>
                    </div>
                  </div>
                  <div className="row-actions" style={{ alignItems: 'center' }}>
                    <span className="badge badge-amber" title="XP">⚡ {u.xp} XP</span>
                    <button className="neu-btn neu-btn-sm neu-btn-green" onClick={() => { setXpForm({ id: u.id, kwota: 50, opis: '' }); }}>
                      + XP
                    </button>
                    <button className="neu-btn neu-btn-sm neu-btn-red" onClick={() => usunUcznia(u)} title="Usuń ucznia">🗑</button>
                  </div>
                </div>
              ))}

              {/* formularz XP */}
              {xpForm.id && (
                <form onSubmit={przyznajXp} className="neu-card-sm" style={{ boxShadow: 'inset 3px 3px 8px var(--shadow-dark), inset -3px -3px 8px var(--shadow-light)', marginTop: 6 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ width: 100 }}>
                      <label className="neu-label">Ilość XP</label>
                      <input className="neu-input" type="number" min="1" value={xpForm.kwota}
                        onChange={e => setXpForm({ ...xpForm, kwota: e.target.value })} />
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <label className="neu-label">Powód / zadanie</label>
                      <input className="neu-input" placeholder="np. Aktywność na lekcji" value={xpForm.opis}
                        onChange={e => setXpForm({ ...xpForm, opis: e.target.value })} />
                    </div>
                    <button className="neu-btn neu-btn-green">Dodaj ✨</button>
                    <button type="button" className="neu-btn" onClick={() => setXpForm({ id: null, kwota: 50, opis: '' })}>Anuluj</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* modal dodawania klasy */}
      {showKlasaModal && (
        <div className="modal-overlay" onClick={() => setShowKlasaModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Nowa klasa</div>
            <form onSubmit={dodajKlase}>
              <div className="field">
                <label className="neu-label">Nazwa klasy</label>
                <input className="neu-input" autoFocus placeholder="np. 8B" value={nazwaKlasa}
                  onChange={e => setNazwaKlasa(e.target.value)} />
              </div>
              <div className="modal-actions">
                <button type="button" className="neu-btn" onClick={() => setShowKlasaModal(false)}>Anuluj</button>
                <button className="neu-btn neu-btn-blue">Utwórz klasę</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* modal nowej gry */}
      {showGraModal && (
        <div className="modal-overlay" onClick={() => setShowGraModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🎮 Nowa gra (pokój)</div>
            <form onSubmit={utworzGre}>
              <div className="field">
                <label className="neu-label">Klasa</label>
                {klasy.length === 0 ? (
                  <p className="muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Najpierw utwórz klasę i dodaj uczniów.</p>
                ) : (
                  <select className="neu-select" value={graForm.klasaId}
                    onChange={e => setGraForm({ ...graForm, klasaId: e.target.value })}>
                    <option value="">-- Wybierz klasę --</option>
                    {klasy.map(k => (
                      <option key={k.id} value={k.id}>{k.nazwa} ({k.liczba_uczniow} uczniów)</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="field">
                <label className="neu-label">Zestaw pytań</label>
                {graZestawy.length === 0 ? (
                  <p className="muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    Brak zestawów — dodaj je w zakładce <b>Zestawy pytań</b>.
                  </p>
                ) : (
                  <select className="neu-select" value={graForm.zestawId}
                    onChange={e => setGraForm({ ...graForm, zestawId: e.target.value })}>
                    <option value="">-- Wybierz zestaw --</option>
                    {graZestawy.map(z => (
                      <option key={z.id} value={z.id}>{z.nazwa} ({z.liczba_pytan} pytań)</option>
                    ))}
                  </select>
                )}
              </div>
              {graForm.tryb === 'budowlanci' && (
                <div className="field">
                  <label className="neu-label">Liczba ekip budowlanych</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setGraForm({ ...graForm, liczbaEkip: n })}
                        className="neu-btn neu-btn-sm"
                        style={graForm.liczbaEkip === n
                          ? { color: 'var(--blue-main)', boxShadow: 'inset 3px 3px 6px var(--shadow-dark), inset -3px -3px 6px var(--shadow-light)' }
                          : {}}
                      >
                        {n} ekipy
                      </button>
                    ))}
                  </div>
                  <p className="muted" style={{ fontSize: '0.78rem', fontWeight: 600, marginTop: 6 }}>
                    Gracze zostaną przydzieleni losowo i wyrównanie co grę.
                  </p>
                </div>
              )}
              <div className="field">
                <label className="neu-label">Tryb gry</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {Object.values(TRYBY).map(t => {
                    const aktyw = graForm.tryb === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setGraForm({ ...graForm, tryb: t.id })}
                        className="neu-btn"
                        style={{
                          flex: 1, minWidth: 180, textAlign: 'left', alignItems: 'flex-start', flexDirection: 'column', gap: 2,
                          padding: '12px 16px',
                          color: aktyw ? 'var(--blue-main)' : 'var(--text-main)',
                          boxShadow: aktyw
                            ? 'inset 4px 4px 8px var(--shadow-dark), inset -4px -4px 8px var(--shadow-light)'
                            : undefined
                        }}
                      >
                        <span style={{ fontWeight: 800, fontSize: '0.98rem' }}>{t.ikona} {t.nazwa}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t.opis}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="autoRundy" className="neu-checkbox"
                  checked={graForm.auto}
                  onChange={e => setGraForm({ ...graForm, auto: e.target.checked })} />
                <label htmlFor="autoRundy" className="neu-label" style={{ margin: 0, cursor: 'pointer' }}>
                  Tryb automatyczny — rundy przełączają się same
                </label>
              </div>
              <p className="muted" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 10 }}>
                Uczniowie wejdą po kodzie PIN i wybiorą siebie z listy klasy.
              </p>
              <div className="modal-actions">
                <button type="button" className="neu-btn" onClick={() => setShowGraModal(false)}>Anuluj</button>
                <button className="neu-btn neu-btn-blue" disabled={klasy.length === 0 || graZestawy.length === 0}>
                  Utwórz pokój i pokaż PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
