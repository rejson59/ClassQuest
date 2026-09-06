import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { apiDelete } from '../api.js';
import { useCurrentTeacher } from '../hooks.jsx';
import Plansza from '../components/Plansza.jsx';
import Wiezowiec from '../components/Wiezowiec.jsx';
import Msg from '../components/Msg.jsx';
import { trybInfo } from '../game/tryby.js';

const OPCJE = [
  { lit: 'A', kolor: '#3b82f6' },
  { lit: 'B', kolor: '#10b981' },
  { lit: 'C', kolor: '#f59e0b' },
  { lit: 'D', kolor: '#ec4899' }
];

export default function NauczycielGra() {
  const { kod } = useParams();
  const navigate = useNavigate();
  const { teacher, loading } = useCurrentTeacher();
  const [pokoj, setPokoj] = useState(null);
  const [stan, setStan] = useState(null);
  const [koniec, setKoniec] = useState(null);
  const [blad, setBlad] = useState('');
  const [skopiowano, setSkopiowano] = useState(false);
  const [pokazImiona, setPokazImiona] = useState(true);
  const [zamykanie, setZamykanie] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (loading || !teacher) return;

    const socket = io({ autoConnect: false });
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('nauczyciel:pokoj', { kod }));
    socket.on('nauczyciel:stan', (d) => {
      setPokoj(d.pokoj);
      if (d.uczniowie?.length > 20) setPokazImiona(false);
    });
    socket.on('gra:stan', (s) => setStan(s));
    socket.on('gra:koniec', (d) => setKoniec(d));
    socket.on('pokoj:zamkniety', () => navigate('/nauczyciel'));
    socket.on('pokoj:blad', () => setBlad('Nie masz dostępu do tego pokoju lub został zamknięty.'));
    socket.connect();

    return () => socket.disconnect();
  }, [loading, teacher, kod]);

  function wyslij(ev) { socketRef.current?.emit(ev, { kod }); }

  async function zamknijPokoj() {
    const potwierdzenie = koniec
      ? 'Wrócić do panelu?'
      : 'Zamknąć pokój? Uczniowie zostaną rozłączeni, a gra nie zostanie zapisana.';
    if (!confirm(potwierdzenie)) return;
    setZamykanie(true);
    try {
      await apiDelete(`/pokoje/${kod}`);
      socketRef.current?.disconnect();
      navigate('/nauczyciel');
    } catch (e) {
      setBlad(e.message);
      setZamykanie(false);
    }
  }

  function zakonczGre() {
    if (confirm('Zakończyć grę i zapisać wyniki?')) wyslij('nauczyciel:zakoncz');
  }

  function kopiujPin() {
    navigator.clipboard?.writeText(kod).then(() => {
      setSkopiowano(true);
      setTimeout(() => setSkopiowano(false), 1600);
    }).catch(() => {});
  }

  if (loading || !teacher) return null;

  const faza = stan?.faza || 'lobby';
  const gracze = stan?.gracze || [];
  const pytanie = stan?.pytanie || null;
  const graTrwa = faza !== 'lobby' && faza !== 'koniec';
  const tryb = pokoj?.tryb || stan?.tryb || '4pola';
  const tb = trybInfo(tryb);
  const budowla = tryb === 'budowlanci';
  const ekipy = stan?.ekipy || [];

  return (
    <div style={{ minHeight: '100vh', padding: '14px 16px 40px', maxWidth: 1500, margin: '0 auto' }}>
      <Msg type="error" show={!!blad}>{blad}</Msg>

      {/* nagłówek */}
      <div className="neu-card neu-card-sm topbar" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.3rem' }}>🎮</span>
          <div>
            <div style={{ fontWeight: 800 }}>ClassQuest — {pokoj?.nazwaKlasy || 'pokój'}</div>
            <div className="muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>
              {pokoj?.nazwaZestawu} • {tb.ikona} {tb.nazwa} • {pokoj?.auto ? 'automatyczny' : 'ręczny (nauczyciel)'}
            </div>
          </div>
        </div>
        <div className="topbar-links">
          {!koniec && graTrwa && !budowla && (
            <button className="neu-btn neu-btn-sm" onClick={() => setPokazImiona(!pokazImiona)} title="Pokaż/ukryj imiona">
              {pokazImiona ? '👤 Imiona: ON' : '👤 Imiona: OFF'}
            </button>
          )}
          {!koniec && gracze.length > 0 && !pokoj?.auto && faza !== 'koniec' && (
            <button className="neu-btn neu-btn-sm neu-btn-red" onClick={zakonczGre} title="Zakończ grę i zapisz wyniki">🏁 Zakończ</button>
          )}
          <button className="neu-btn neu-btn-sm neu-btn-red" onClick={zamknijPokoj} disabled={zamykanie}>
            {zamykanie ? '…' : koniec ? 'Wróć do panelu 🚪' : 'Zamknij pokój 🚪'}
          </button>
        </div>
      </div>

      {/* karta pytania (gdy gra) */}
      {faza !== 'lobby' && faza !== 'koniec' && (
        <div className="neu-card" style={{ marginBottom: 14, padding: '16px 20px', textAlign: 'center' }}>
          {faza === 'odliczanie' && (
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--blue-main)' }}>
              🚦 Przygotujcie się! Gra zaczyna się za… <span style={{ fontSize: '2rem' }}>{stan.fazaCzas}</span>
            </div>
          )}

          {pytanie && (faza === 'pytanie' || faza === 'wynik' || faza === 'przerwa') && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <span className="badge">Pytanie {pytanie.nr} / {pytanie.liczba}</span>
                {budowla && faza === 'pytanie' && (
                  <span className="badge badge-green">odpowiedziało: {gracze.filter(g => g.odpowiedzial).length}/{gracze.length}</span>
                )}
                <span className="badge badge-amber" style={{ fontSize: '0.95rem' }}>
                  ⏱ {faza === 'wynik' ? 'Wyniki…' : faza === 'przerwa' ? 'Przerwa (karty!)' : `${stan.fazaCzas}s`}
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 12 }}>{pytanie.tresc}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                {OPCJE.map(o => {
                  const tekst = pytanie[o.lit.toLowerCase()];
                  const ok = faza === 'wynik' && stan.poprawna === o.lit;
                  const zle = faza === 'wynik' && stan.poprawna !== o.lit;
                  return (
                    <div key={o.lit} style={{
                      padding: '10px 16px', borderRadius: 16, fontWeight: 800, minWidth: 170,
                      background: ok ? 'rgba(16,185,129,0.3)' : zle ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0.05)',
                      border: `3px solid ${ok ? '#10b981' : zle ? 'rgba(239,68,68,0.4)' : o.kolor}`,
                      color: 'var(--text-main)'
                    }}>
                      <span style={{ display: 'inline-block', background: o.kolor, color: '#fff', borderRadius: 10, padding: '2px 10px', marginRight: 8 }}>
                        {o.lit}
                      </span>
                      {tekst}
                      {ok && ' ✅'}
                    </div>
                  );
                })}
              </div>
              {faza === 'wynik' && (
                <div style={{ marginTop: 10, fontWeight: 800, color: 'var(--green-main)' }}>
                  {budowla
                    ? `Poprawna odpowiedź: ${stan.poprawna} — cegły trafiają do wież!`
                    : `Poprawna odpowiedź: ${stan.poprawna} — ci na właściwym polu przeżyli!`}
                </div>
              )}
              {stan?.ogloszenie && (
                <div style={{ marginTop: 10, fontWeight: 800, fontSize: '0.95rem', color: 'var(--red-main)', animation: 'skok 0.5s' }}>
                  {stan.ogloszenie}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* tryb budowlańcy: plac budowy (wieże) */}
      {budowla && ekipy.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          {ekipy.map(e => (
            <Wiezowiec key={e.index} ekipa={e} szerokosc={200} />
          ))}
        </div>
      )}

      {/* plansza (tylko 4pola) */}
      {!budowla && (
        <div className="neu-card" style={{ padding: 10, marginBottom: 14 }}>
          <Plansza gracze={gracze} faza={faza} poprawna={stan?.poprawna || null} pokazImiona={pokazImiona} />
        </div>
      )}

      {/* pasek sterowania */}
      <div className="neu-card neu-card-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="muted" style={{ fontWeight: 700, fontSize: '0.85rem' }}>PIN:</span>
          <span style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--blue-main)', fontVariantNumeric: 'tabular-nums' }}>
            {kod}
          </span>
          <button className="neu-btn neu-btn-sm" onClick={kopiujPin}>{skopiowano ? '✓' : '📋'}</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="badge">{gracze.length} 👥 w pokoju</span>

          {faza === 'lobby' && (
            <button
              className="neu-btn neu-btn-blue"
              style={{ padding: '14px 26px', fontSize: '1.05rem' }}
              disabled={gracze.length === 0}
              onClick={() => wyslij('nauczyciel:start')}
              title={gracze.length === 0 ? 'Poczekaj na uczniów' : 'Rozpocznij rundy pytań'}
            >
              ▶ Rozpocznij grę
            </button>
          )}

          {faza === 'pytanie' && !pokoj?.auto && (
            <button className="neu-btn neu-btn-red" style={{ padding: '14px 24px' }} onClick={() => wyslij('nauczyciel:koniecRundy')}>
              ⏹ Zakończ rundę wcześniej
            </button>
          )}

          {faza === 'przerwa' && !pokoj?.auto && (
            <button className="neu-btn neu-btn-blue" style={{ padding: '14px 24px' }} onClick={() => wyslij('nauczyciel:nastepne')}>
              ➡️ Następne pytanie
            </button>
          )}

          {faza === 'odliczanie' && <span className="badge badge-amber">Odliczanie…</span>}
        </div>
      </div>

      {/* lobby: lista uczniów */}
      {faza === 'lobby' && (
        <div className="neu-card" style={{ marginTop: 14 }}>
          <h2 className="section-title">🎉 Uczniowie w pokoju ({gracze.length})</h2>
          {gracze.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>📡</div>
              Czekamy na uczniów…<br />
              <span style={{ fontSize: '0.85rem' }}>Niech wpiszą PIN <b>{kod}</b> na telefonach i wybiorą siebie z listy.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {gracze.map(g => (
                <span key={g.id} className="badge" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                  {g.numer}. {g.imie} ✓
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* koniec gry — podium */}
      {koniec && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <div style={{ textAlign: 'center', fontSize: '2rem', marginBottom: 6 }}>🏁</div>
            <h2 style={{ textAlign: 'center', fontWeight: 800, marginBottom: 4 }}>Koniec gry!</h2>
            <p className="muted" style={{ textAlign: 'center', fontWeight: 600, marginBottom: 14 }}>{koniec.nazwaZestawu}</p>

            {koniec.tryb === 'budowlanci' && koniec.ekipy && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 10 }}>
                  {koniec.ekipy.map((e, i) => (
                    <div key={e.index} className="neu-card neu-card-sm" style={{
                      flex: '1 1 150px', textAlign: 'center', padding: '12px',
                      border: i === 0 ? `3px solid ${e.kolor}` : '1px solid transparent'
                    }}>
                      <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {e.nazwa}</div>
                      <div className="muted" style={{ fontWeight: 700, fontSize: '0.85rem' }}>🏢 {e.pietra} pięter • 🧱 {e.cegly}</div>
                    </div>
                  ))}
                </div>
                <div className="muted" style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                  Wygrywa ekipa, która zbudowała najwyższy wieżowiec!
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {koniec.finalne.map((f, i) => (
                <div key={f.id} className="row-item" style={{ marginBottom: 0, background: f.wygrana ? 'rgba(245,158,11,0.12)' : undefined }}>
                  <div className="row-main">
                    <span style={{ fontSize: '1.2rem', width: 34, textAlign: 'center' }}>{['🥇', '🥈', '🥉'][i] || `${f.pozycja}.`}</span>
                    {koniec.tryb === 'budowlanci' && f.ekipa !== null && (
                      <span style={{
                        width: 14, height: 14, borderRadius: 4, background: koniec.ekipy?.find(e => e.index === f.ekipa)?.kolor || '#999',
                        display: 'inline-block', flexShrink: 0
                      }} />
                    )}
                    <div>
                        <div className="row-title">{f.imie}</div>
                        <div className="row-sub">
                          ✅ {f.poprawne} poprawnych
                          {koniec.tryb === '4pola' ? ` • ❤️ ${f.zycia}` : ''}
                        </div>
                      </div>
                  </div>
                  <span className="badge badge-amber" style={{ fontSize: '1rem' }}>⚡ +{f.xp} XP</span>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="neu-btn neu-btn-blue neu-btn-block" style={{ marginTop: 8 }} onClick={zamknijPokoj} disabled={zamykanie}>
                {zamykanie ? 'Zamykanie…' : 'Wróć do panelu nauczyciela'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 10 }}>
        <button className="link-btn muted" style={{ fontSize: '0.8rem' }} onClick={() => navigate('/nauczyciel')}>
          ← Wróć do panelu bez zamykania pokoju
        </button>
      </div>
    </div>
  );
}
