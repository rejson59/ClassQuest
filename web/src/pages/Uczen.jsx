import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Link } from 'react-router-dom';
import { apiGet, apiPatch } from '../api.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import AvatarSvg, { DOMYSLNY_AVATAR } from '../components/AvatarSvg.jsx';
import AvatarEditor from '../components/AvatarEditor.jsx';
import Plansza from '../components/Plansza.jsx';
import Joystick from '../components/Joystick.jsx';
import Wiezowiec from '../components/Wiezowiec.jsx';
import Msg from '../components/Msg.jsx';
import { KARTY_INFO } from '../game/tryby.js';

const KROKI = { PIN: 1, WYBOR: 2, AWATAR: 3, GRA: 4 };
const OPCJE = [
  { lit: 'A', kolor: '#3b82f6' },
  { lit: 'B', kolor: '#10b981' },
  { lit: 'C', kolor: '#f59e0b' },
  { lit: 'D', kolor: '#ec4899' }
];

const czujnikDotykowy = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export default function Uczen() {
  const [krok, setKrok] = useState(KROKI.PIN);
  const [pin, setPin] = useState('');
  const [info, setInfo] = useState(null);
  const [wybrany, setWybrany] = useState(null);
  const [avatar, setAvatar] = useState(DOMYSLNY_AVATAR);
  const [msg, setMsg] = useState({ text: '', type: 'error' });
  const [busy, setBusy] = useState(false);

  // stan gry (snapshoty z serwera)
  const [stan, setStan] = useState(null);
  const [koniec, setKoniec] = useState(null);
  const [jaPryw, setJaPryw] = useState(null);     // prywatne: ekipa, karty, odpowiedź
  const [flash, setFlash] = useState(null);        // natychmiastowe info o odpowiedzi
  const [trybKamery, setTrybKamery] = useState('podazaj'); // podazaj | pelny (4pola)
  const [celBomby, setCelBomby] = useState(false);

  const socketRef = useRef(null);
  const joinedRef = useRef(false);
  const koniecRef = useRef(false);
  const kierunekRef = useRef({ dx: 0, dy: 0 });
  const wyslanyRef = useRef('0,0');

  const krokRef = useRef(krok);
  useEffect(() => { krokRef.current = krok; }, [krok]);
  const wybranyRef = useRef(wybrany);
  useEffect(() => { wybranyRef.current = wybrany; }, [wybrany]);
  useEffect(() => { koniecRef.current = !!koniec; }, [koniec]);

  function showMsg(text, type = 'error') { setMsg({ text, type }); }
  function czystyPin() { return pin.replace(/\s+/g, ''); }

  function ustawKierunek(n) {
    kierunekRef.current = n;
    const k = `${Math.round(n.dx * 100)},${Math.round(n.dy * 100)}`;
    if (k !== wyslanyRef.current) {
      wyslanyRef.current = k;
      if (joinedRef.current) socketRef.current?.emit('steruj', n);
    }
  }

  // klawiatura (WASD / strzałki) — tylko tryb 4pola
  useEffect(() => {
    if (krok !== KROKI.GRA || stan?.tryb !== '4pola') return;
    const klawisze = new Set();
    const zKlawiszy = () => {
      let dx = 0, dy = 0;
      if (klawisze.has('w') || klawisze.has('arrowup')) dy -= 1;
      if (klawisze.has('s') || klawisze.has('arrowdown')) dy += 1;
      if (klawisze.has('a') || klawisze.has('arrowleft')) dx -= 1;
      if (klawisze.has('d') || klawisze.has('arrowright')) dx += 1;
      if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
      ustawKierunek({ dx, dy });
    };
    const w = (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
        klawisze.add(k);
        zKlawiszy();
      }
    };
    const u = (e) => {
      const k = e.key.toLowerCase();
      if (klawisze.delete(k)) zKlawiszy();
    };
    const czysc = () => { klawisze.clear(); ustawKierunek({ dx: 0, dy: 0 }); };
    window.addEventListener('keydown', w);
    window.addEventListener('keyup', u);
    window.addEventListener('blur', czysc);
    return () => {
      window.removeEventListener('keydown', w);
      window.removeEventListener('keyup', u);
      window.removeEventListener('blur', czysc);
      if (joinedRef.current) socketRef.current?.emit('steruj', { dx: 0, dy: 0 });
    };
  }, [krok, stan?.tryb]);

  useEffect(() => () => socketRef.current?.disconnect(), []);

  // ---- KROK 1→2: sprawdzenie PIN ----
  async function sprawdzPin(e) {
    e?.preventDefault();
    if (czystyPin().length !== 6) {
      showMsg('Podaj 6-cyfrowy kod PIN podany przez nauczyciela.');
      return;
    }
    setBusy(true);
    try {
      const d = await apiGet(`/pokoje/${czystyPin()}/uczniowie`);
      if (d.status !== 'lobby') {
        showMsg('Gra w tym pokoju już się rozpoczęła. Poczekaj na nowy pokój.');
        return;
      }
      setInfo(d);
      setMsg({ text: '', type: 'error' });
      setKrok(KROKI.WYBOR);
    } catch (err) {
      showMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- KROK 2→3 ----
  function wybierzUcznia(u) {
    setWybrany(u);
    setAvatar({ ...DOMYSLNY_AVATAR, ...(u.avatar || {}) });
    setMsg({ text: '', type: 'error' });
    setKrok(KROKI.AWATAR);
  }

  // ---- KROK 3→4: zapis awatara + dołączenie ----
  async function dolaczDoPokoju() {
    const uczen = wybranyRef.current;
    if (!uczen) return;
    setBusy(true);
    setMsg({ text: '', type: 'error' });
    try {
      await apiPatch(`/uczniowie/${uczen.id}/avatar`, { avatar });
    } catch (err) {
      setBusy(false);
      showMsg(err.message);
      return;
    }

    const socket = io({ autoConnect: false });
    socketRef.current = socket;
    setStan(null);
    setKoniec(null);
    setJaPryw(null);
    setFlash(null);
    koniecRef.current = false;

    socket.on('uczen:stan', () => {
      joinedRef.current = true;
      setBusy(false);
      setKrok(KROKI.GRA);
    });
    socket.on('gra:stan', (s) => setStan(s));
    socket.on('gra:ja', (d) => setJaPryw(d));
    socket.on('gra:odpowiedz', (d) => setFlash({ ...d, ts: Date.now() }));
    socket.on('gra:koniec', (d) => setKoniec(d));
    socket.on('pokoj:blad', (d) => {
      setBusy(false);
      if (!koniecRef.current) {
        showMsg(d.error || 'Nie udało się dołączyć do pokoju.');
        socket.disconnect();
      }
    });
    socket.on('pokoj:zamkniety', () => {
      if (koniecRef.current) return;
      showMsg('Pokój został zamknięty przez nauczyciela.', 'ok');
      wychodzDoPin(socket);
    });
    socket.on('disconnect', () => {
      if (!koniecRef.current && krokRef.current === KROKI.GRA) {
        showMsg('Utracono połączenie z pokojem.');
        wychodzDoPin(socket);
      }
    });

    socket.connect();
    socket.emit('uczen:dolacz', { kod: czystyPin(), uczenId: uczen.id });
  }

  function wychodzDoPin(socket) {
    joinedRef.current = false;
    ustawKierunek({ dx: 0, dy: 0 });
    socket?.disconnect();
    setKrok(KROKI.PIN);
    setWybrany(null);
    setPin('');
    setStan(null);
    setKoniec(null);
    setJaPryw(null);
    setFlash(null);
    koniecRef.current = false;
    setMsg({ text: '', type: 'error' });
    setInfo(null);
  }

  function odpowiedz(lit) {
    if (stan?.faza !== 'pytanie') return;
    socketRef.current?.emit('odpowiedz', { odp: lit });
  }

  function uzyjKarty(typ, cel) {
    socketRef.current?.emit('karta', { typ, cel });
  }

  // ---------------- widoki ----------------
  if (krok === KROKI.GRA && wybrany) {
    const ja = (stan?.gracze || []).find(g => g.id === wybrany.id);
    const faza = stan?.faza || 'lobby';
    const pytanie = stan?.pytanie || null;
    const trybGry = stan?.tryb || '4pola';
    const budowla = trybGry === 'budowlanci';
    const ekipy = stan?.ekipy || [];
    const mojaEkipaIdx = budowla ? (jaPryw?.ekipa ?? ja?.ekipa ?? null) : null;
    const mojaEkipa = mojaEkipaIdx !== null ? ekipy.find(e => e.index === mojaEkipaIdx) || null : null;

    // ----- ekran budowlańca (szybki quiz) -----
    if (budowla) {
      const fazaOdp = faza === 'wynik' || faza === 'przerwa';
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '10px 12px 14px', maxWidth: 620, margin: '0 auto' }}>
          {/* pasek statusu */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="neu-btn neu-btn-sm" onClick={() => { if (confirm('Opuścić pokój?')) wychodzDoPin(socketRef.current); }}>← Wyjdź</button>
              <span className="muted" style={{ fontWeight: 700, fontSize: '0.78rem' }}>{info?.nazwaKlasy || ''}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {mojaEkipa && (
                <span style={{ background: mojaEkipa.kolor, color: '#fff', borderRadius: 12, padding: '3px 10px', fontSize: '0.8rem', fontWeight: 800 }}>
                  🏗️ {mojaEkipa.nazwa}
                </span>
              )}
              <span className="badge badge-amber">⚡ {ja?.xp || 0} XP</span>
              <span className="badge">✅ {ja?.poprawne || 0}</span>
            </div>
          </div>

          {/* moja wieża */}
          {mojaEkipa && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <Wiezowiec ekipa={mojaEkipa} szerokosc={210} wysPietra={22} />
            </div>
          )}

          {/* karta pytania / rundy */}
          <div className="neu-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', textAlign: 'center' }}>
            {faza === 'lobby' && (
              <>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🏗️</div>
                <h2 style={{ fontWeight: 800, marginBottom: 6 }}>Jesteś w pokoju!</h2>
                <p className="muted" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  Czekamy, aż nauczyciel uruchomi grę „Szaleni budowlańcy”.<br />
                  Ekipy zostaną przydzielone losowo.
                </p>
              </>
            )}
            {faza === 'odliczanie' && (
              <div style={{ fontWeight: 800, color: 'var(--blue-main)', fontSize: '1.3rem', padding: 30 }}>
                🚦 Za chwilę pytanie… {stan?.fazaCzas}
              </div>
            )}
            {(faza === 'pytanie' || faza === 'wynik' || faza === 'przerwa') && pytanie && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span className="badge">Pytanie {pytanie.nr}/{pytanie.liczba}</span>
                  {faza === 'pytanie' && <span className="badge badge-amber" style={{ fontSize: '1rem' }}>⏱ {stan?.fazaCzas}s</span>}
                  {faza === 'wynik' && <span className="badge">Wyniki…</span>}
                  {faza === 'przerwa' && <span className="badge">{stan?.auto ? 'Przerwa…' : 'Czekaj na nauczyciela…'}</span>}
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 14 }}>{pytanie.tresc}</div>

                {faza === 'pytanie' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1, alignContent: 'center' }}>
                    {OPCJE.map(o => {
                      const czyWybrana = jaPryw?.odpowiedzial && jaPryw.odpowiedz === o.lit;
                      const czyDobrze = flash && jaPryw?.odpowiedzial && jaPryw?.ok === true && czyWybrana;
                      const czyZle = flash && jaPryw?.odpowiedzial && jaPryw?.ok === false && czyWybrana;
                      return (
                        <button
                          key={o.lit}
                          disabled={!!jaPryw?.odpowiedzial}
                          onClick={() => odpowiedz(o.lit)}
                          className="neu-btn"
                          style={{
                            minHeight: 96, flexDirection: 'column', gap: 6, padding: '14px 10px',
                            borderRadius: 20, color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: 800,
                            background: czyDobrze ? 'rgba(16,185,129,0.35)' : czyZle ? 'rgba(239,68,68,0.3)' : 'var(--card-bg)',
                            border: `3px solid ${czyWybrana ? o.kolor : 'transparent'}`,
                            opacity: jaPryw?.odpowiedzial && !czyWybrana ? 0.55 : 1,
                            animation: czyDobrze ? 'skok 0.4s' : undefined
                          }}
                        >
                          <span style={{ background: o.kolor, color: '#fff', borderRadius: 12, padding: '2px 12px', fontWeight: 800 }}>
                            {o.lit}
                          </span>
                          <span>{pytanie[o.lit.toLowerCase()]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {faza === 'wynik' && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>
                      Poprawna: <span style={{ color: 'var(--green-main)' }}>{stan?.poprawna}</span>
                    </div>
                    {jaPryw?.odpowiedzial && jaPryw?.ok === true && (
                      <div style={{ color: 'var(--green-main)', fontWeight: 800 }}>✅ Dobra odpowiedź! Twoja ekipa dostaje cegły (+10 XP)</div>
                    )}
                    {jaPryw?.odpowiedzial && jaPryw?.ok === false && (
                      <div style={{ color: 'var(--red-main)', fontWeight: 800 }}>❌ Zła odpowiedź — nic nie tracisz</div>
                    )}
                    {!jaPryw?.odpowiedzial && <div className="muted" style={{ fontWeight: 700 }}>Nie zdążyłeś odpowiedzieć — bez cegły.</div>}
                  </div>
                )}

                {faza === 'przerwa' && (
                  <div className="muted" style={{ fontWeight: 700, padding: 20 }}>
                    {stan?.auto ? 'Za chwilę następne pytanie…' : 'Nauczyciel zaraz pokaże kolejne pytanie.'}
                  </div>
                )}

                {stan?.ogloszenie && (
                  <div style={{ fontWeight: 800, color: 'var(--red-main)', marginTop: 8, animation: 'skok 0.5s' }}>
                    {stan.ogloszenie}
                  </div>
                )}
              </>
            )}
          </div>

          {/* KARTY */}
          {(fazaOdp || koniec) && (jaPryw?.karty?.length > 0 || jaPryw?.podwojna) && (
            <div className="neu-card neu-card-sm" style={{ marginTop: 10, padding: '12px 14px' }}>
              <div style={{ fontWeight: 800, marginBottom: 8, fontSize: '0.95rem' }}>🎴 Twoje karty</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {jaPryw.podwojna && (
                  <span className="badge" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>⚡ Podwójna cegła (aktywna)</span>
                )}
                {(jaPryw.karty || []).map((typ, i) => {
                  const k = KARTY_INFO[typ];
                  return (
                    <button
                      key={i}
                      className="neu-btn neu-btn-sm"
                      onClick={() => {
                        if (typ === 'bomba' && !celBomby) setCelBomby(true);
                        else uzyjKarty(typ);
                      }}
                    >
                      {k.ikona} {k.nazwa}
                    </button>
                  );
                })}
              </div>
              {celBomby && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>Wybierz cel bomby 💣:</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {ekipy.filter(e => e.index !== mojaEkipaIdx).map(e => (
                      <button key={e.index} className="neu-btn neu-btn-sm" onClick={() => { uzyjKarty('bomba', e.index); setCelBomby(false); }}>
                        <span style={{ color: e.kolor, fontWeight: 800 }}>■</span> {e.nazwa}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* koniec gry */}
          {koniec && (
            <div className="modal-overlay" style={{ position: 'fixed' }}>
              <div className="modal" style={{ maxWidth: 480 }}>
                <div style={{ textAlign: 'center', fontSize: '1.8rem' }}>🏗️</div>
                <h2 style={{ textAlign: 'center', fontWeight: 800, marginBottom: 10 }}>Koniec budowy!</h2>

                {koniec.ekipy && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 }}>
                    {koniec.ekipy.map((e, i) => (
                      <div key={e.index} className="neu-card neu-card-sm" style={{
                        flex: '1 1 140px', textAlign: 'center', padding: 10,
                        border: e.index === koniec.zwyciezcaEkipa ? `3px solid ${e.kolor}` : '1px solid transparent'
                      }}>
                        <div style={{ fontWeight: 800 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {e.nazwa}</div>
                        <div className="muted" style={{ fontWeight: 700, fontSize: '0.8rem' }}>🏢 {e.pietra} • 🧱 {e.cegly}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, maxHeight: 220, overflowY: 'auto' }}>
                  {koniec.finalne.slice(0, 8).map((f, i) => {
                    const toJa = f.id === wybrany.id;
                    return (
                      <div key={f.id} className="row-item" style={{ marginBottom: 0, background: toJa ? 'rgba(37,99,235,0.1)' : undefined }}>
                        <div className="row-main">
                          <span style={{ width: 30, textAlign: 'center' }}>{['🥇', '🥈', '🥉'][i] || `${f.pozycja}.`}</span>
                          <b>{f.imie}{toJa ? ' (Ty)' : ''}</b>
                        </div>
                        <span className="badge badge-amber">+{f.xp} XP</span>
                      </div>
                    );
                  })}
                </div>
                <button className="neu-btn neu-btn-blue neu-btn-block" onClick={() => wychodzDoPin(socketRef.current)}>
                  Wróć na ekran PIN
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // ----- ekran 4pola (plansza + joystick) -----
    const zycia = ja?.zycia ?? 3;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '10px 12px 0', maxWidth: 760, margin: '0 auto' }}>
        {/* pasek statusu */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="neu-btn neu-btn-sm" onClick={() => { if (confirm('Opuścić pokój?')) wychodzDoPin(socketRef.current); }}>
              ← Wyjdź
            </button>
            <span className="muted" style={{ fontWeight: 700, fontSize: '0.8rem' }}>
              {info?.nazwaKlasy || ''} • <b style={{ letterSpacing: '0.1em' }}>{czystyPin()}</b>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', fontWeight: 800 }}>
            <span title="Życia">❤️ {Math.max(zycia, 0)}</span>
            <span className="muted" title="Poprawne">✅ {ja?.poprawne || 0}</span>
            <span className="badge badge-amber" title="Zdobyte XP">⚡ {ja?.xp || 0}</span>
          </div>
        </div>

        {/* karta pytania */}
        {pytanie && (faza === 'pytanie' || faza === 'wynik' || faza === 'przerwa' || faza === 'odliczanie') && (
          <div className="neu-card neu-card-sm" style={{ marginBottom: 10, padding: '12px 14px', textAlign: 'center' }}>
            {faza === 'odliczanie' && (
              <div style={{ fontWeight: 800, color: 'var(--blue-main)', fontSize: '1.1rem' }}>🚦 Start za {stan.fazaCzas}…</div>
            )}
            {(faza === 'pytanie' || faza === 'wynik' || faza === 'przerwa') && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span className="badge">Pytanie {pytanie.nr}/{pytanie.liczba}</span>
                  {faza === 'pytanie' && <span className="badge badge-amber">⏱ {stan.fazaCzas}s</span>}
                  {faza === 'wynik' && <span className="badge">Wyniki…</span>}
                  {faza === 'przerwa' && <span className="badge">Przerwa</span>}
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 10 }}>{pytanie.tresc}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {OPCJE.map(o => {
                    const ok = faza === 'wynik' && stan.poprawna === o.lit;
                    const zle = faza === 'wynik' && stan.poprawna !== o.lit;
                    return (
                      <div key={o.lit} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 12, fontSize: '0.82rem',
                        fontWeight: 700, background: ok ? 'rgba(16,185,129,0.3)' : zle ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.05)',
                        border: `2px solid ${ok ? '#10b981' : o.kolor}`, color: 'var(--text-main)', textAlign: 'left'
                      }}>
                        <span style={{ background: o.kolor, color: '#fff', borderRadius: 8, padding: '1px 8px', flexShrink: 0 }}>{o.lit}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{pytanie[o.lit.toLowerCase()]}</span>
                      </div>
                    );
                  })}
                </div>
                {faza === 'wynik' && ja && (
                  <div style={{ marginTop: 8, fontWeight: 800, fontSize: '0.95rem',
                    color: ja.wynikRundy === 'ok' ? 'var(--green-main)' : 'var(--red-main)' }}>
                    {ja.wynikRundy === 'ok' && '✅ Świetnie! Byłeś na właściwym polu (+10 XP)'}
                    {ja.wynikRundy === 'zly' && '💥 Złe pole — tracisz życie! Wracasz za chwilę…'}
                    {ja.wynikRundy === 'eliminacja' && '💀 Straciłeś wszystkie życia — oglądasz do końca!'}
                    {!ja.wynikRundy && !ja.aktywny && '💀 Odpadłeś z gry'}
                    {!ja.wynikRundy && ja.aktywny && faza === 'wynik' && '⏳ …'}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* plansza */}
        <div style={{ position: 'relative', flex: 1, minHeight: 240 }}>
          <Plansza
            gracze={stan?.gracze || []}
            faza={faza}
            mojId={wybrany.id}
            poprawna={stan?.poprawna || null}
            pokazImiona={false}
            podazaj={trybKamery === 'podazaj' ? { celX: ja?.x ?? 1200, celY: ja?.y ?? 700 } : null}
            wysokosc={window.innerHeight > 700 ? 430 : 300}
          />

          {faza === 'lobby' && (
            <div style={{
              position: 'absolute', left: '50%', top: 12, transform: 'translateX(-50%)',
              background: 'var(--card-bg)', borderRadius: 16, padding: '8px 18px', fontWeight: 700, fontSize: '0.9rem',
              boxShadow: '4px 4px 12px var(--shadow-dark)', zIndex: 5, whiteSpace: 'nowrap'
            }}>
              🎉 Jesteś w pokoju — czekamy na start…
            </div>
          )}
        </div>

        {/* sterowanie */}
        <div style={{ position: 'relative', height: 150, flexShrink: 0 }}>
          <div style={{ position: 'absolute', left: 4, bottom: 8 }}>
            <Joystick onSteruj={ustawKierunek} size={130} />
          </div>
          <div style={{ position: 'absolute', right: 6, bottom: 18, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
            <button className="neu-btn neu-btn-sm" onClick={() => setTrybKamery(trybKamery === 'podazaj' ? 'pelny' : 'podazaj')} style={{ fontSize: '0.75rem' }}>
              {trybKamery === 'podazaj' ? '🗺️ Cała plansza' : '🔍 Podążaj za mną'}
            </button>
            <span className="muted" style={{ fontSize: '0.7rem', fontWeight: 600, textAlign: 'right', maxWidth: 130 }}>
              {czujnikDotykowy ? 'Przeciągaj kciukiem' : 'Steruj WASD / strzałkami'}
            </span>
          </div>
        </div>

        {/* koniec gry */}
        {koniec && (
          <div className="modal-overlay" style={{ position: 'fixed' }}>
            <div className="modal" style={{ maxWidth: 480 }}>
              <div style={{ textAlign: 'center', fontSize: '1.8rem' }}>🏁</div>
              <h2 style={{ textAlign: 'center', fontWeight: 800, marginBottom: 14 }}>Koniec gry!</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {koniec.finalne.slice(0, 5).map((f, i) => {
                  const toJa = f.id === wybrany.id;
                  return (
                    <div key={f.id} className="row-item" style={{ marginBottom: 0, background: f.wygrana ? 'rgba(245,158,11,0.15)' : toJa ? 'rgba(37,99,235,0.1)' : undefined }}>
                      <div className="row-main">
                        <span style={{ width: 30, textAlign: 'center' }}>{['🥇', '🥈', '🥉'][i] || `${f.pozycja}.`}</span>
                        <b>{f.imie}{toJa ? ' (Ty)' : ''}</b>
                      </div>
                      <span className="badge badge-amber">+{f.xp} XP</span>
                    </div>
                  );
                })}
              </div>
              {koniec.finalne.length > 5 && (
                <p className="muted" style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, marginBottom: 8 }}>
                  Pełne wyniki zobaczy nauczyciel.
                </p>
              )}
              <button className="neu-btn neu-btn-blue neu-btn-block" onClick={() => wychodzDoPin(socketRef.current)}>
                Wróć na ekran PIN
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------- ekrany przed grą ----------------
  return (
    <div className="center-screen">
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div className="neu-card auth-card fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: '1.4rem' }}>🎮</span>
            <ThemeToggle />
          </div>

          {krok === KROKI.PIN && (
            <>
              <h1 className="page-title" style={{ fontSize: '1.6rem' }}>Dołącz do gry</h1>
              <p className="muted" style={{ fontWeight: 600, marginBottom: 22 }}>Wpisz kod PIN podany przez nauczyciela</p>
              <Msg type={msg.type} show={!!msg.text}>{msg.text}</Msg>
              <form onSubmit={sprawdzPin}>
                <input
                  className="neu-input"
                  style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.35em', marginBottom: 16, textTransform: 'uppercase' }}
                  placeholder="••• •••"
                  maxLength={7}
                  value={pin}
                  inputMode="numeric"
                  autoFocus
                  onChange={e => setPin(e.target.value.replace(/[^\d\s]/g, ''))}
                />
                <button className="neu-btn neu-btn-block neu-btn-blue" disabled={busy}>
                  {busy ? 'Sprawdzanie…' : 'Dalej →'}
                </button>
              </form>
              <div style={{ marginTop: 18, textAlign: 'center' }}>
                <Link to="/" className="link-btn muted">← Wróć na start</Link>
              </div>
            </>
          )}

          {krok === KROKI.WYBOR && info && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h1 className="page-title" style={{ fontSize: '1.35rem' }}>Kto gra?</h1>
                <button className="neu-btn neu-btn-sm" onClick={() => { setKrok(KROKI.PIN); setInfo(null); setMsg({ text: '', type: 'error' }); }}>← PIN</button>
              </div>
              <p className="muted" style={{ fontWeight: 600, marginBottom: 4 }}>Pokój: <b>{info.nazwaKlasy}</b> • zestaw: <b>{info.nazwaZestawu}</b></p>
              <p className="muted" style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>Wybierz siebie z dziennika:</p>
              <Msg type={msg.type} show={!!msg.text}>{msg.text}</Msg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                {info.uczniowie.map(u => (
                  <button key={u.id} type="button" onClick={() => wybierzUcznia(u)} className="row-item"
                    style={{ cursor: 'pointer', textAlign: 'left', width: '100%', border: 'none' }}>
                    <div className="row-main" style={{ flex: 1 }}>
                      <span className="badge" style={{ minWidth: 34, textAlign: 'center' }}>{u.numer_dziennika}</span>
                      <AvatarSvg avatar={u.avatar} size={42} />
                      <span style={{ fontWeight: 700 }}>{u.imie_nazwisko}</span>
                    </div>
                    <span style={{ color: 'var(--blue-main)', fontWeight: 800 }}>→</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {krok === KROKI.AWATAR && wybrany && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h1 className="page-title" style={{ fontSize: '1.35rem' }}>Twój awatar</h1>
                <button className="neu-btn neu-btn-sm" onClick={() => setKrok(KROKI.WYBOR)}>← Wstecz</button>
              </div>
              <p className="muted" style={{ fontWeight: 600, marginBottom: 16 }}>
                <b>{wybrany.numer_dziennika}. {wybrany.imie_nazwisko}</b> — dostosuj wygląd (zapamiętamy go):
              </p>
              <div style={{ marginBottom: 18 }}>
                <AvatarEditor value={avatar} onChange={setAvatar} />
              </div>
              <Msg type={msg.type} show={!!msg.text}>{msg.text}</Msg>
              <button className="neu-btn neu-btn-block neu-btn-blue" disabled={busy} onClick={dolaczDoPokoju}>
                {busy ? 'Dołączanie…' : 'Wejdź do pokoju 🎮'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
