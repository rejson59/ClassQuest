// Wieżowiec ekipy — wizualizacja postępu budowy (używana u nauczyciela i ucznia).

export default function Wiezowiec({ ekipa, szerokosc = 200, wysPietra = 26 }) {
  if (!ekipa) return null;
  const { nazwa, kolor, cegly = 0, koszt = 1, pietra = 0, tarcze = 0 } = ekipa;
  const progress = Math.min(1, (cegly % koszt) / koszt);
  const MAX_WYS = 6; // ile pięter rysujemy, reszta jako liczba

  return (
    <div className="neu-card neu-card-sm" style={{ width: szerokosc, padding: '14px', textAlign: 'center' }}>
      <div style={{ fontWeight: 800, marginBottom: 2 }}>{nazwa}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 8, minHeight: 20 }}>
        <span className="badge">🏢 {pietra}</span>
        {tarcze > 0 && <span className="badge" title="Tarcza aktywna">🛡️ ×{tarcze}</span>}
      </div>

      {/* wieża */}
      <div style={{
        height: wysPietra * Math.min(MAX_WYS, Math.max(pietra, 0)) + 8,
        display: 'flex', flexDirection: 'column-reverse', alignItems: 'center',
        justifyContent: 'flex-start', gap: 2, transition: 'height 0.4s ease'
      }}>
        {pietra > 0 && Array.from({ length: Math.min(MAX_WYS, pietra) }).map((_, i) => (
          <div key={i} style={{
            width: '72%', height: wysPietra - 4, borderRadius: 4,
            background: `linear-gradient(180deg, ${kolor}, ${kolor}cc)`,
            boxShadow: '0 2px 3px rgba(0,0,0,0.18), inset 0 2px 3px rgba(255,255,255,0.35)',
            animation: 'pietroWskakuje 0.35s cubic-bezier(0.34,1.56,0.64,1)'
          }} />
        ))}
        {pietra > MAX_WYS && (
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>… ×{pietra}</div>
        )}
      </div>

      {/* fundament */}
      <div style={{
        width: '90%', height: 8, margin: '0 auto', borderRadius: 3,
        background: 'linear-gradient(180deg, #8b7355, #6b563f)', boxShadow: '0 2px 4px rgba(0,0,0,0.25)'
      }} />

      {/* pasek cegieł do następnego piętra */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3 }}>
          {cegly % koszt}/{koszt} 🧱 do piętra
        </div>
        <div style={{
          height: 10, borderRadius: 6, overflow: 'hidden',
          background: 'var(--card-bg)', boxShadow: 'inset 3px 3px 6px var(--shadow-dark), inset -3px -3px 6px var(--shadow-light)'
        }}>
          <div style={{
            height: '100%', width: `${Math.round(progress * 100)}%`, borderRadius: 6,
            background: `linear-gradient(90deg, ${kolor}99, ${kolor})`, transition: 'width 0.5s ease'
          }} />
        </div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: 3 }}>
          🧱 {cegly} łącznie
        </div>
      </div>
    </div>
  );
}
