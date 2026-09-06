import { useRef, useState } from 'react';

// Wirtualny joystick (dotyk / mysz). onSteruj({dx,dy}) — składowe -1..1.
export default function Joystick({ onSteruj, size = 140 }) {
  const bazaRef = useRef(null);
  const galkaRef = useRef(null);
  const aktywnyRef = useRef(false);
  const [wcisniety, setWcisniety] = useState(false);

  function przelicz(e) {
    const r = bazaRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const dl = Math.hypot(dx, dy);
    if (dl > 1) { dx /= dl; dy /= dl; }
    const g = galkaRef.current;
    if (g) {
      const max = r.width / 2 - 26;
      g.style.transform = `translate(${dx * max}px, ${dy * max}px)`;
    }
    onSteruj?.({ dx, dy });
  }

  function reset() {
    aktywnyRef.current = false;
    setWcisniety(false);
    const g = galkaRef.current;
    if (g) g.style.transform = 'translate(0px, 0px)';
    onSteruj?.({ dx: 0, dy: 0 });
  }

  return (
    <div
      ref={bazaRef}
      className="joystick-baza"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--card-bg)',
        boxShadow: wcisniety
          ? 'inset 6px 6px 12px var(--shadow-dark), inset -6px -6px 12px var(--shadow-light)'
          : '8px 8px 16px var(--shadow-dark), -8px -8px 16px var(--shadow-light)',
        position: 'relative',
        touchAction: 'none',
        userSelect: 'none',
        flexShrink: 0
      }}
      onPointerDown={e => {
        aktywnyRef.current = true;
        setWcisniety(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        przelicz(e);
      }}
      onPointerMove={e => { if (aktywnyRef.current) przelicz(e); }}
      onPointerUp={reset}
      onPointerCancel={reset}
    >
      <div
        ref={galkaRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: size * 0.52,
          height: size * 0.52,
          borderRadius: '50%',
          marginLeft: -size * 0.26,
          marginTop: -size * 0.26,
          background: 'radial-gradient(circle at 35% 30%, #ffffff, var(--blue-main) 70%)',
          boxShadow: '4px 4px 10px rgba(0,0,0,0.3)',
          transition: 'transform 0.03s linear'
        }}
      />
    </div>
  );
}
