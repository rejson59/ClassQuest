import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPatch, apiDelete } from '../api.js';
import { useCurrentTeacher } from '../hooks.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import Msg from '../components/Msg.jsx';
import { trybInfo } from '../game/tryby.js';

const fmtData = (s) => {
  if (!s) return '—';
  const d = new Date(String(s).includes('T') ? s : s + 'Z');
  return isNaN(d) ? s : d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
};
const fmtCzas = (s) => {
  s = Math.max(0, Math.round(s));
  const g = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
  return g > 0 ? `${g}h ${m}min` : m > 0 ? `${m}min ${sek}s` : `${sek}s`;
};

export default function Admin() {
  const navigate = useNavigate();
  const { teacher, loading } = useCurrentTeacher();
  const [msg, setMsg] = useState({ text: '', type: 'error' });
  const [odswietlanie, setOdswietlanie] = useState(false);
  const [podsumowanie, setPodsumowanie] = useState(null);
  const [nauczyciele, setNauczyciele] = useState([]);
  const [sesje, setSesje] = useState([]);
  const [wyniki, setWyniki] = useState(null);   // {sesja, wyniki} — modal historii
  const [ladowanie, setLadowanie] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!teacher) { navigate('/logowanie'); return; }
    if (teacher.rola !== 'admin') { setLadowanie(false); return; }
    odswiez();
  }, [loading, teacher]);

  async function odswiez() {
    setOdswietlanie(true);
    try {
      const [p, n, s] = await Promise.all([
        apiGet('/admin/podsumowanie'),
        apiGet('/admin/nauczyciele'),
        apiGet('/admin/sesje?limit=30')
      ]);
      setPodsumowanie(p);
      setNauczyciele(n.nauczyciele);
      setSesje(s.sesje);
      setMsg({ text: '', type: 'error' });
      return true;
    } catch (e) {
      setMsg({ text: e.message, type: 'error' });
      return false;
    } finally {
      setLadowanie(false);
      setOdswietlanie(false);
    }
  }

  async function zmienRole(t) {
    const nowa = t.rola === 'admin' ? 'nauczyciel' : 'admin';
    if (!confirm(`Zmienić rolę konta „${t.imie_nazwisko}" na ${nowa === 'admin' ? 'ADMINISTRATORA' : 'nauczyciela'}?`)) return;
    try {
      await apiPatch(`/admin/nauczyciele/${t.id}/rola`, { rola: nowa });
      const ok = await odswiez();
      if (ok) setMsg({ text: `✅ Konto „${t.imie_nazwisko}" ma teraz rolę: ${nowa === 'admin' ? 'administrator' : 'nauczyciel'}.`, type: 'ok' });
    } catch (e) { setMsg({ text: e.message, type: 'error' }); }
  }

  async function usunNauczyciela(t) {
    if (!confirm(`USUNĄĆ konto „${t.imie_nazwisko}" (${t.email})?\n\nRazem z nim znikną: ${t.klasy} klas/y, ${t.uczniowie} uczniów, ${t.zestawy} zestawów i ${t.sesje} sesji.\nTej operacji nie można cofnąć!`)) return;
    try {
      await apiDelete(`/admin/nauczyciele/${t.id}`);
      const ok = await odswiez();
      if (ok) setMsg({ text: `✅ Konto „${t.imie_nazwisko}" usunięte wraz ze wszystkimi danymi.`, type: 'ok' });
    } catch (e) { setMsg({ text: e.message, type: 'error' }); }
  }

  async function pokazWyniki(sesja) {
    try {
      const d = await apiGet(`/admin/sesje/${sesja.kod}/wyniki`);
      setWyniki(d);
    } catch (e) { setMsg({ text: e.message, type: 'error' }); }
  }

  async function pobierzKopie() {
    try {
      const d = await apiGet('/admin/eksport');
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `classquest-kopia-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ text: '✅ Kopia zapasowa pobrana (JSON).', type: 'ok' });
    } catch (e) { setMsg({ text: e.message, type: 'error' }); }
  }

  if (loading) return null;
  if (!teacher) return null;

  // brak uprawnień
  if (teacher.rola !== 'admin' && !ladowanie) {
    return (
      <div className="center-screen">
        <div className="neu-card auth-card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>🔒</div>
          <h1 style={{ fontWeight: 800, marginBottom: 6 }}>Panel administratora</h1>
          <p className="muted" style={{ fontWeight: 600, marginBottom: 18 }}>
            To konto nie ma uprawnień administratora.
          </p>
          <Link to="/nauczyciel" className="neu-btn neu-btn-blue" style={{ display: 'inline-block' }}>← Panel nauczyciela</Link>
        </div>
      </div>
    );
  }

  const L = podsumowanie?.liczby || {};
  const S = podsumowanie?.system || {};

  const karty = [
    { ikona: '👩‍🏫', etykieta: 'Nauczyciele', wartosc: L.nauczyciele, pod: `adminów: ${L.admini}` },
    { ikona: '🏫', etykieta: 'Klasy', wartosc: L.klasy, pod: null },
    { ikona: '🧑‍🎓', etykieta: 'Uczniowie', wartosc: L.uczniowie, pod: `⚡ ${L.sumaXp} XP łącznie` },
    { ikona: '📚', etykieta: 'Zestawy pytań', wartosc: L.zestawy, pod: `${L.pytania} pytań` },
    { ikona: '🎮', etykieta: 'Rozegrane gry', wartosc: L.gryZakonczone, pod: `sesji w bazie: ${L.sesje}` }
  ];

  return (
    <div className="page">
      <Msg type={msg.type} show={!!msg.text}>{msg.text}</Msg>

      {/* topbar */}
      <div className="neu-card neu-card-sm topbar" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: '1.6rem' }}>🛡️</span>
          <div>
            <div className="logo" style={{ fontWeight: 800, fontSize: '1.2rem' }}>ClassQuest — Panel administratora</div>
            <p className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Pełna kontrola nad całym systemem • {teacher.imie_nazwisko}
            </p>
          </div>
        </div>
        <div className="topbar-links">
          <Link to="/nauczyciel" className="link-btn">👥 Moje klasy</Link>
          <Link to="/nauczyciel/zestawy" className="link-btn">📚 Zestawy</Link>
          <button className="neu-btn neu-btn-sm" onClick={odswiez} disabled={odswietlanie}>
            {odswietlanie ? 'Odświeżanie…' : '🔄 Odśwież'}
          </button>
          <ThemeToggle />
        </div>
      </div>

      {ladowanie ? (
        <div className="empty-state" style={{ padding: 40 }}>⏳ Wczytywanie danych…</div>
      ) : (
        <>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
            {karty.map(k => (
              <div key={k.etykieta} className="neu-card neu-card-sm" style={{ textAlign: 'center', padding: '16px 10px' }}>
                <div style={{ fontSize: '1.7rem' }}>{k.ikona}</div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1.15 }}>{k.wartosc ?? '—'}</div>
                <div className="muted" style={{ fontWeight: 700, fontSize: '0.8rem' }}>{k.etykieta}</div>
                {k.pod && <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: 3 }}>{k.pod}</div>}
              </div>
            ))}
          </div>

          {/* System + aktywne pokoje */}
          <div className="grid-1-2" style={{ gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)' }}>
            <div>
              <div className="neu-card" style={{ marginBottom: 14 }}>
                <h2 className="section-title">🖥️ Stan systemu</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.92rem', fontWeight: 600 }}>
                  <div>⏱️ Praca serwera: <b>{fmtCzas(S.uptimeSek)}</b></div>
                  <div>💾 Pamięć zajęta: <b>{S.pamiecMB} MB</b></div>
                  <div>🗄️ Baza danych: <b>{S.rozmiarBazyB ? (S.rozmiarBazyB / 1024).toFixed(0) + ' KB' : '—'}</b></div>
                  <div>🕐 Czas serwera: <b>{fmtData(S.czas)}</b></div>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>Node {S.node}</div>
                </div>
              </div>

              <div className="neu-card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <h2 className="section-title" style={{ marginBottom: 0 }}>🎮 Aktywne pokoje</h2>
                  <span className="badge">{(podsumowanie?.pokoje || []).length} na żywo</span>
                </div>
                {podsumowanie?.pokoje?.length === 0 ? (
                  <p className="muted" style={{ fontWeight: 600, fontSize: '0.9rem' }}>Brak aktywnych gier. Rozpocznij lekcję z poziomu panelu nauczyciela.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {podsumowanie.pokoje.map(p => (
                      <div key={p.kod} className="neu-card-sm" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <b style={{ letterSpacing: '0.08em' }}>{p.kod}</b>
                          {' '}{trybInfo(p.tryb).ikona} {p.nazwaKlasy} — {p.nazwaZestawu}
                          <div className="muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                            👨‍🏫 {p.nauczyciel} • fazy: {p.faza} • {p.status} • auto: {p.auto ? 'tak' : 'nie'}
                          </div>
                        </div>
                        <span className="badge">{p.gracze} 👥</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="neu-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>👩‍🏫 Nauczyciele</h2>
                <button className="neu-btn neu-btn-sm neu-btn-blue" onClick={pobierzKopie} title="Pobierz pełną kopię bazy (JSON)">
                  💾 Kopia zapasowa
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {nauczyciele.map(t => {
                  const ja = t.id === teacher.id;
                  return (
                    <div key={t.id} className="neu-card-sm" style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>
                            {t.rola === 'admin' ? '👑 ' : '🎓 '}{t.imie_nazwisko}{ja && ' (Ty)'}
                            {t.rola === 'admin' && <span className="badge" style={{ marginLeft: 6 }}>admin</span>}
                          </div>
                          <div className="muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>{t.email} • od {fmtData(t.created_at)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {!ja && (
                            <>
                              <button className="neu-btn neu-btn-sm" onClick={() => zmienRole(t)} title={t.rola === 'admin' ? 'Zdegraduj do nauczyciela' : 'Nadaj uprawnienia administratora'}>
                                {t.rola === 'admin' ? '🎓 Zdegraduj' : '👑 Zrób adminem'}
                              </button>
                              <button className="neu-btn neu-btn-sm neu-btn-red" onClick={() => usunNauczyciela(t)}>🗑 Usuń</button>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                        <span>🏫 {t.klasy} klas</span>
                        <span>🧑‍🎓 {t.uczniowie} uczniów</span>
                        <span>📚 {t.zestawy} zestawów ({t.pytania} pytań)</span>
                        <span>🎮 {t.sesje} sesji</span>
                        <span>⚡ {t.suma_xp} XP</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="muted" style={{ fontSize: '0.78rem', fontWeight: 600, marginTop: 10 }}>
                Pierwsze konto w systemie jest automatycznie administratorem. Zmiany ról działają od razu.
              </p>
            </div>
          </div>

          {/* Historia gier */}
          <div className="neu-card" style={{ marginTop: 14 }}>
            <h2 className="section-title">📜 Historia rozegranych gier</h2>
            {sesje.length === 0 ? (
              <p className="muted" style={{ fontWeight: 600, fontSize: '0.9rem' }}>Brak rozegranych gier w bazie.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sesje.map(s => (
                  <button key={s.kod} className="row-item" style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }} onClick={() => pokazWyniki(s)}>
                    <div className="row-main">
                      <b style={{ letterSpacing: '0.08em' }}>{s.kod}</b>
                      <div>
                        <div className="row-title">{trybInfo(s.tryb).ikona} {s.klasa || '—'} • {s.zestaw || '—'}</div>
                        <div className="row-sub">👨‍🏫 {s.nauczyciel || '—'} • utworzona: {fmtData(s.utworzona_at)}</div>
                      </div>
                    </div>
                    <span className="badge">{s.status === 'finished' ? '🏁 zakończona' : s.status === 'playing' ? '▶️ w trakcie' : '🕐 lobby'}</span>
                    <span className="badge badge-amber">{s.wynikow} wyników</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* modal wyników sesji */}
      {wyniki && (
        <div className="modal-overlay" onClick={() => setWyniki(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-title">📜 Wyniki gry {wyniki.sesja.kod}</div>
            <p className="muted" style={{ fontWeight: 600, marginBottom: 10, fontSize: '0.9rem' }}>
              {trybInfo(wyniki.sesja.tryb).ikona} {trybInfo(wyniki.sesja.tryb).nazwa} • {wyniki.sesja.klasa || '—'} • {wyniki.sesja.zestaw || '—'}
              <br />👨‍🏫 {wyniki.sesja.nauczyciel || '—'} • {fmtData(wyniki.sesja.utworzona_at)}
            </p>
            {wyniki.wyniki.length === 0 ? (
              <p className="muted" style={{ fontWeight: 600 }}>Brak zapisanych wyników.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
                {wyniki.wyniki.map(w => (
                  <div key={w.pozycja} className="row-item" style={{ marginBottom: 0 }}>
                    <div className="row-main">
                      <span style={{ width: 30, textAlign: 'center', fontWeight: 800 }}>{['🥇', '🥈', '🥉'][w.pozycja - 1] || `${w.pozycja}.`}</span>
                      <div>
                        <div className="row-title">{w.imie_nazwisko || '—'}</div>
                        <div className="row-sub">nr {w.numer_dziennika} • ✅ {w.poprawne} • ❤️ {w.zycia_zostalo}</div>
                      </div>
                    </div>
                    <span className="badge badge-amber">⚡ +{w.xp_zdobyte} XP</span>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="neu-btn neu-btn-blue neu-btn-block" onClick={() => setWyniki(null)}>Zamknij</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
