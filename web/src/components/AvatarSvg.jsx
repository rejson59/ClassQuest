// Awatar ucznia — rysowany w SVG (używany w listach, edytorze i później na planszy).

export const KOLORY = [
  '#2563eb', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16',
  '#f97316', '#14b8a6', '#e11d48', '#64748b'
];

export const OCZY = [
  { id: 'okragle', ikona: '👀', nazwa: 'Okrągłe' },
  { id: 'szczesliwe', ikona: '🙂', nazwa: 'Wesołe' },
  { id: 'wielkie', ikona: '😍', nazwa: 'Wielkie' },
  { id: 'zmruzone', ikona: '😆', nazwa: 'Zmrużone' }
];

export const BUZIE = [
  { id: 'usmiech', ikona: '😊', nazwa: 'Uśmiech' },
  { id: 'otwarta', ikona: '😮', nazwa: 'Zdziwiona' },
  { id: 'jezyk', ikona: '😛', nazwa: 'Z językiem' },
  { id: 'neutralna', ikona: '😐', nazwa: 'Neutralna' }
];

export const AKCESORIA = [
  { id: '', ikona: '🚫', nazwa: 'Bez' },
  { id: '👑', ikona: '👑', nazwa: 'Korona' },
  { id: '🎓', ikona: '🎓', nazwa: 'Biret' },
  { id: '🎧', ikona: '🎧', nazwa: 'Słuchawki' },
  { id: '🚀', ikona: '🚀', nazwa: 'Rakieta' },
  { id: '🎩', ikona: '🎩', nazwa: 'Cylinder' },
  { id: '🦸', ikona: '🦸', nazwa: 'Superbohater' },
  { id: '🐱', ikona: '🐱', nazwa: 'Kotek' },
  { id: '⚡', ikona: '⚡', nazwa: 'Błyskawica' }
];

export const DOMYSLNY_AVATAR = { kolor: KOLORY[0], oczy: 'okragle', buzia: 'usmiech', akcesorium: '' };

export default function AvatarSvg({ avatar = {}, size = 48, showShadow = true }) {
  const a = { ...DOMYSLNY_AVATAR, ...(avatar || {}) };
  const px = '#1f2937';
  const oczyX = [40, 60];
  const cy = 38;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible', display: 'block', flexShrink: 0 }}>
      {showShadow && <ellipse cx="50" cy="94" rx="25" ry="5" fill="rgba(0,0,0,0.16)" />}

      {a.akcesorium && (
        <text x="50" y="16" textAnchor="middle" fontSize="30" style={{ lineHeight: 1 }}>{a.akcesorium}</text>
      )}

      {/* korpus */}
      <path
        d="M24 34 Q24 6 50 6 Q76 6 76 34 L76 66 Q76 90 50 90 Q24 90 24 66 Z"
        fill={a.kolor}
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="2"
      />
      {/* poświata */}
      <path d="M35 16 Q39 11 45 11" stroke="rgba(255,255,255,0.55)" strokeWidth="7" strokeLinecap="round" fill="none" />
      {/* rumieńce */}
      <ellipse cx="32" cy="54" rx="5.5" ry="4" fill="rgba(255,120,120,0.35)" />
      <ellipse cx="68" cy="54" rx="5.5" ry="4" fill="rgba(255,120,120,0.35)" />

      {/* oczy */}
      {a.oczy === 'okragle' && oczyX.map(x => (
        <g key={x}>
          <ellipse cx={x} cy={cy} rx="6.5" ry="8.5" fill="#fff" />
          <circle cx={x} cy={cy + 2} r="3.2" fill={px} />
        </g>
      ))}
      {a.oczy === 'wielkie' && oczyX.map(x => (
        <g key={x}>
          <ellipse cx={x} cy={cy} rx="9" ry="11" fill="#fff" stroke="rgba(0,0,0,0.08)" strokeWidth="1.5" />
          <circle cx={x - 1.5} cy={cy + 2} r="4.5" fill={px} />
          <circle cx={x + 2.5} cy={cy - 3} r="1.7" fill="#fff" />
        </g>
      ))}
      {a.oczy === 'szczesliwe' && oczyX.map(x => (
        <path key={x} d={`M${x - 8} ${cy + 5} Q${x} ${cy - 9} ${x + 8} ${cy + 5}`} fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      ))}
      {a.oczy === 'zmruzone' && oczyX.map(x => (
        <path key={x} d={`M${x - 8} ${cy - 5} Q${x} ${cy + 8} ${x + 8} ${cy - 5}`} fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      ))}

      {/* buzia */}
      {a.buzia === 'usmiech' && (
        <path d="M41 60 Q50 70 59 60" fill="none" stroke={px} strokeWidth="4" strokeLinecap="round" />
      )}
      {a.buzia === 'otwarta' && (
        <ellipse cx="50" cy="64" rx="6.5" ry="8.5" fill={px} />
      )}
      {a.buzia === 'jezyk' && (
        <g>
          <path d="M40 58 Q50 74 60 58" fill="none" stroke={px} strokeWidth="4.5" strokeLinecap="round" />
          <ellipse cx="50" cy="69" rx="5.5" ry="4.5" fill="#fb7185" />
        </g>
      )}
      {a.buzia === 'neutralna' && (
        <path d="M43 63 L57 63" stroke={px} strokeWidth="4" strokeLinecap="round" />
      )}
    </svg>
  );
}
