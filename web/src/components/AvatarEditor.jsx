import AvatarSvg, { KOLORY, OCZY, BUZIE, AKCESORIA } from './AvatarSvg.jsx';

// Edytor awatara: kolor + oczy + buzia + akcesorium, z podglądem na żywo.
export default function AvatarEditor({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          padding: 16, borderRadius: 22, background: 'var(--card-bg)',
          boxShadow: 'inset 4px 4px 9px var(--shadow-dark), inset -4px -4px 9px var(--shadow-light)'
        }}>
          <AvatarSvg avatar={value} size={110} />
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: 10 }}>Podgląd</p>
      </div>

      <div style={{ flex: 1, minWidth: 250, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div className="neu-label">Kolor</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {KOLORY.map(k => (
              <button
                key={k}
                type="button"
                title={k}
                onClick={() => set({ kolor: k })}
                style={{
                  width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
                  background: k, border: '2px solid transparent', flexShrink: 0,
                  outline: value.kolor === k ? '3px solid var(--blue-main)' : 'none',
                  outlineOffset: 1,
                  boxShadow: '3px 3px 6px rgba(0,0,0,0.25)'
                }}
              />
            ))}
          </div>
        </div>

        <Opcje label="Oczy" wartosci={OCZY} wybrana={value.oczy} onWybierz={id => set({ oczy: id })} />
        <Opcje label="Buzia" wartosci={BUZIE} wybrana={value.buzia} onWybierz={id => set({ buzia: id })} />
        <Opcje label="Akcesorium" wartosci={AKCESORIA} wybrana={value.akcesorium} onWybierz={id => set({ akcesorium: id })} />
      </div>
    </div>
  );
}

function Opcje({ label, wartosci, wybrana, onWybierz }) {
  return (
    <div>
      <div className="neu-label">{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {wartosci.map(o => {
          const aktywny = o.id === wybrana;
          return (
            <button
              key={o.id}
              type="button"
              title={o.nazwa}
              onClick={() => onWybierz(o.id)}
              className="neu-btn neu-btn-sm"
              style={aktywny
                ? { color: 'var(--blue-main)', boxShadow: 'inset 3px 3px 6px var(--shadow-dark), inset -3px -3px 6px var(--shadow-light)' }
                : {}}
            >
              <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>{o.ikona}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
