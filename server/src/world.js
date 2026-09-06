// Geometria planszy i stref odpowiedzi.
// UWAGA: trzymać w synchronizacji z web/src/game/world.js (identyczne wartości).

export const SWIAT = {
  W: 2400,
  H: 1400,
  MARGINES: 45,
  SZYBKOSC: 320,       // jednostek świata na sekundę
  PROMIEN: 30,         // promień awatara (w jednostkach świata)
  ZYCIA: 3,
  CZAS_PYTANIA_DOMYSLNY: 15, // sekundy
  CZAS_WYNIKU: 4500,   // ms fazy wyników
  CZAS_ODLICZANIA: 3000 // ms odliczania przed pierwszym pytaniem
};

export const SPAWN = { x: 1200, y: 700 };

export function losujSpawn() {
  return {
    x: SPAWN.x + (Math.random() - 0.5) * 260,
    y: SPAWN.y + (Math.random() - 0.5) * 180
  };
}

// Cztery strefy odpowiedzi (A–D) pokazywane w fazie pytania/wyniku.
export const STREFY = {
  A: { x: 180, y: 200, w: 820, h: 450, kolor: '#3b82f6' },
  B: { x: 1400, y: 200, w: 820, h: 450, kolor: '#10b981' },
  C: { x: 180, y: 750, w: 820, h: 450, kolor: '#f59e0b' },
  D: { x: 1400, y: 750, w: 820, h: 450, kolor: '#ec4899' }
};

export function punktWStrefie(px, py, s) {
  return px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h;
}

export function strefaGracza(px, py) {
  for (const lit of ['A', 'B', 'C', 'D']) {
    if (punktWStrefie(px, py, STREFY[lit])) return lit;
  }
  return null;
}
