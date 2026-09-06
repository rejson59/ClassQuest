// Geometria planszy i stref odpowiedzi — KLIENT.
// UWAGA: trzymać w synchronizacji z server/src/world.js (identyczne wartości).

export const SWIAT = {
  W: 2400,
  H: 1400,
  MARGINES: 45,
  SZYBKOSC: 320,
  PROMIEN: 30,
  ZYCIA: 3,
  CZAS_PYTANIA_DOMYSLNY: 15
};

export const SPAWN = { x: 1200, y: 700 };

export const STREFY = {
  A: { x: 180, y: 200, w: 820, h: 450, kolor: '#3b82f6' },
  B: { x: 1400, y: 200, w: 820, h: 450, kolor: '#10b981' },
  C: { x: 180, y: 750, w: 820, h: 450, kolor: '#f59e0b' },
  D: { x: 1400, y: 750, w: 820, h: 450, kolor: '#ec4899' }
};

export const LITERY = ['A', 'B', 'C', 'D'];
