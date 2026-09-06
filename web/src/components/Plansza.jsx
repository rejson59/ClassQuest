import { useEffect, useRef, useState } from 'react';
import AvatarSvg from './AvatarSvg.jsx';
import { SWIAT, STREFY, LITERY, SPAWN } from '../game/world.js';

// Plansza 2D — wspólna dla nauczyciela (duży ekran) i ucznia (telefon).
// Domyślnie: cała plansza skalowana do szerokości kontenera.
// Gdy podano `podazaj` {celX, celY}: kamera podąża za punktem (graczem),
// kontener ma wtedy stałą wysokość `wysokosc`.

const STREFY_WIDOCZNE = new Set(['pytanie', 'wynik']);

export default function Plansza({ gracze = [], faza = 'lobby', mojId = null, pokazImiona = true, poprawna = null, podazaj = null, wysokosc = 430 }) {
  const kontenerRef = useRef(null);
  const [wymiar, setWymiar] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = kontenerRef.current;
    if (!el) return;
    const zmierz = () => setWymiar({ w: el.clientWidth, h: el.clientHeight });
    zmierz();
    const ro = new ResizeObserver(zmierz);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = wymiar.w;
  let skala = W ? W / SWIAT.W : 0;
  let przesX = 0;
  let przesY = 0;
  let kontenerWys = W ? SWIAT.H * skala : 0;

  if (podazaj) {
    kontenerWys = wysokosc;
    if (W && wymiar.h) {
      const szerokoscKamery = 1050;
      skala = W / szerokoscKamery;
      const regionH = wymiar.h / skala;
      const kx = Math.min(Math.max(podazaj.celX - szerokoscKamery / 2, 0), SWIAT.W - szerokoscKamery);
      const ky = Math.min(Math.max(podazaj.celY - regionH / 2, 0), SWIAT.H - regionH);
      przesX = -kx * skala;
      przesY = -ky * skala;
    }
  }

  const R = SWIAT.PROMIEN;
  const pokazStrefy = STREFY_WIDOCZNE.has(faza);

  return (
    <div
      ref={kontenerRef}
      style={{
        width: '100%',
        height: podazaj ? wysokosc : undefined,
        aspectRatio: podazaj ? undefined : `${SWIAT.W} / ${SWIAT.H}`,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 24
      }}
    >
      {skala > 0 && (
        <div
          className="plansza-swiata"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: SWIAT.W,
            height: SWIAT.H,
            transform: `translate(${przesX}px, ${przesY}px) scale(${skala})`,
            transformOrigin: 'top left'
          }}
        >
          {/* podłoga */}
          <div className="plansza-podloga" style={{ position: 'absolute', inset: 0 }} />

          {/* ściany */}
          <div className="plansza-sciany" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

          {/* dekoracje */}
          <div className="plansza-dekor" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontSize: 64 }}>
            <span style={{ position: 'absolute', left: 140, top: 120, filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.15))' }}>🪴</span>
            <span style={{ position: 'absolute', left: 2280, top: 130, filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.15))' }}>📚</span>
            <span style={{ position: 'absolute', left: 150, top: 1210, filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.15))' }}>🏆</span>
            <span style={{ position: 'absolute', left: 2240, top: 1200, filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.15))' }}>🧪</span>
            <div style={{
              position: 'absolute', left: SPAWN.x - 230, top: SPAWN.y - 120, width: 460, height: 240,
              borderRadius: '50%', background: 'rgba(0,0,0,0.05)'
            }} />
          </div>

          {/* strefy odpowiedzi */}
          {pokazStrefy && LITERY.map(lit => {
            const s = STREFY[lit];
            const czyPoprawna = faza === 'wynik' && poprawna === lit;
            const czyInna = faza === 'wynik' && poprawna !== lit;
            return (
              <div
                key={lit}
                className={czyPoprawna ? 'strefa strefa-ok' : czyInna ? 'strefa strefa-zla' : 'strefa'}
                style={{
                  position: 'absolute',
                  left: s.x, top: s.y, width: s.w, height: s.h,
                  background: czyPoprawna
                    ? 'rgba(16,185,129,0.35)'
                    : czyInna
                      ? 'rgba(239,68,68,0.28)'
                      : 'rgba(255,255,255,0.22)',
                  border: `6px dashed ${czyPoprawna ? '#10b981' : czyInna ? '#ef4444' : 'rgba(255,255,255,0.65)'}`,
                  borderRadius: 40
                }}
              >
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 260, fontWeight: 800, color: czyPoprawna ? 'rgba(16,185,129,0.85)' : czyInna ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.8)',
                  textShadow: '0 6px 18px rgba(0,0,0,0.25)'
                }}>
                  {lit}
                  {czyPoprawna && <span style={{ position: 'absolute', fontSize: 90, top: 18, right: 30 }}>✅</span>}
                  {czyInna && <span style={{ position: 'absolute', fontSize: 90, top: 18, right: 30 }}>💥</span>}
                </div>
              </div>
            );
          })}

          {/* gracze */}
          {gracze.map(g => {
            const czyJa = mojId && g.id === mojId;
            const efekt = g.wynikRundy;
            return (
              <div
                key={g.id}
                className={`gracz ${efekt === 'zly' || efekt === 'eliminacja' ? 'gracz-spada' : ''} ${efekt === 'ok' ? 'gracz-ok' : ''}`}
                style={{
                  position: 'absolute',
                  left: g.x - R,
                  top: g.y - R,
                  width: R * 2,
                  height: R * 2,
                  zIndex: 3,
                  opacity: g.aktywny ? 1 : 0.5,
                  filter: g.aktywny ? 'none' : 'grayscale(0.7)'
                }}
              >
                <div style={{
                  position: 'absolute', left: '50%', top: '94%', transform: 'translateX(-50%)',
                  width: R * 1.7, height: R * 0.45, borderRadius: '50%', background: 'rgba(0,0,0,0.18)'
                }} />
                {czyJa && (
                  <div style={{
                    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                    width: R * 2.7, height: R * 2.7, borderRadius: '50%',
                    border: '4px solid var(--blue-main)', opacity: 0.6, animation: 'pulsuj 1.1s infinite'
                  }} />
                )}
                <div style={{ position: 'absolute', inset: 0 }}>
                  <AvatarSvg avatar={g.avatar} size={R * 2} />
                </div>
                {pokazImiona && (
                  <div style={{
                    position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap', fontSize: 19, fontWeight: 700, color: '#fff',
                    textShadow: '0 2px 4px rgba(0,0,0,0.55)', background: 'rgba(0,0,0,0.35)',
                    padding: '2px 10px', borderRadius: 12, lineHeight: 1.3
                  }}>
                    {g.numer}. {g.imie}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes pulsuj { 0%,100% { opacity: 0.3; } 50% { opacity: 0.8; } }
        .gracz-spada { animation: spadanie 0.9s ease-in forwards; }
        @keyframes spadanie { 0% { transform: translateY(0) rotate(0); opacity: 1; } 100% { transform: translateY(90px) rotate(30deg); opacity: 0.25; } }
        .gracz-ok { animation: skok 0.6s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes skok { 0% { transform: translateY(0); } 40% { transform: translateY(-26px); } 100% { transform: translateY(0); } }
        .strefa { transition: background 0.4s ease, border-color 0.4s ease; }
        .strefa-zla { animation: trzesienie 0.5s linear infinite; }
        @keyframes trzesienie { 0%,100% { transform: translate(0,0); } 25% { transform: translate(-3px,2px); } 75% { transform: translate(3px,-2px); } }
      `}</style>
    </div>
  );
}
