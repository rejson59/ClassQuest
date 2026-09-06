import db from './db.js';
import { losujSpawn } from './world.js';

// Pokoje gier trzymane w pamięci serwera (stan na żywo).
// Kod PIN: 6 cyfr. Czas życia pokoju: 3h (sprzątanie co 10 min).

const pokoje = new Map();
const CZAS_ZYCIA = 3 * 60 * 60 * 1000;
const DOSTEPNE_TRYBY = new Set(['4pola', 'budowlanci']);

function losujKod() {
  let kod;
  do {
    kod = String(Math.floor(100000 + Math.random() * 900000));
  } while (pokoje.has(kod));
  return kod;
}

export function utworzPokoj({ teacherId, klasaId, zestawId, auto, tryb = '4pola', liczbaEkip = 2 }) {
  const klasa = db.prepare('SELECT * FROM klasy WHERE id = ? AND teacher_id = ?').get(klasaId, teacherId);
  const zestaw = db.prepare('SELECT * FROM zestawy_pytan WHERE id = ? AND teacher_id = ?').get(zestawId, teacherId);
  if (!klasa || !zestaw) {
    const err = new Error('Nie znaleziono klasy lub zestawu pytań.');
    err.status = 400;
    throw err;
  }
  if (!DOSTEPNE_TRYBY.has(tryb)) {
    const err = new Error('Nieznany tryb gry.');
    err.status = 400;
    throw err;
  }
  liczbaEkip = Math.min(Math.max(parseInt(liczbaEkip, 10) || 2, 2), 5);

  const kod = losujKod();
  const pokoj = {
    kod,
    teacherId,
    klasaId: klasa.id,
    nazwaKlasy: klasa.nazwa,
    zestawId: zestaw.id,
    nazwaZestawu: zestaw.nazwa,
    tryb,
    auto: !!auto,
    status: 'lobby', // lobby | playing | finished
    utworzonyAt: Date.now(),
    teacherSocketId: null,
    uczniowie: new Map(), // uczenId -> obiekt gracza (patrz: dodajGracza)

    // --- stan przebiegu gry ---
    faza: 'lobby',   // lobby | odliczanie | pytanie | wynik | przerwa | koniec
    fazaCzas: 0,     // ile ms zostało w bieżącej fazie
    ostatniBroadcastS: -1,
    pytania: null,   // wczytane pytania zestawu
    indPytania: 0,
    obecne: null,    // aktualne pytanie
    wynikiZapisane: false,
    ostatniTick: Date.now(),

    // --- tryb „Szaleni budowlańcy" ---
    liczbaEkip,
    ekipy: null,     // [{nazwa,kolor,cegly,tarcze,koszt}] po starcie
    ogloszenie: null // {text, czas} dramatyczne komunikaty (bomby itp.)
  };

  pokoje.set(kod, pokoj);

  db.prepare(
    `INSERT INTO sesje (kod, teacher_id, klasa_id, zestaw_id, tryb, status, auto)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(kod, teacherId, klasa.id, zestaw.id, tryb, 'lobby', pokoj.auto ? 1 : 0);

  return pokoj;
}

export function dodajGracza(pokoj, uczen, socketId) {
  const start = losujSpawn();
  pokoj.uczniowie.set(uczen.id, {
    uczenId: uczen.id,
    numerDziennika: uczen.numer_dziennika,
    imieNazwisko: uczen.imie_nazwisko,
    avatar: JSON.parse(uczen.avatar_json || '{}'),
    socketId,
    // pozycja (używana w trybie 4pola)
    x: start.x,
    y: start.y,
    dx: 0,
    dy: 0,
    // wspólne statystyki
    zycia: 3,
    poprawne: 0,
    xpZdob: 0,
    aktywny: true,
    wynikRundy: null, // 'ok' | 'zly' | 'eliminacja' | null
    // tryb „Szaleni budowlańcy"
    ekipa: null,       // index ekipy (nadawany na starcie)
    karty: [],         // ręka gracza (prywatna)
    podwojna: false,   // następna dobra odpowiedź = 2 cegły
    odpowiedz: null,   // {odp, ok, czasMs} z bieżącej rundy
    odpowiedzial: false
  });
}

export function pobierzPokoj(kod) {
  return pokoje.get(String(kod));
}

export function listaUczniow(pokoj) {
  return [...pokoj.uczniowie.values()].sort((a, b) => a.numerDziennika - b.numerDziennika);
}

export function forEachPokoj(fn) {
  pokoje.forEach(fn);
}

// podgląd wszystkich pokoi (dla panelu administratora)
export function listaPokoi() {
  return [...pokoje.values()].map((p) => ({
    kod: p.kod,
    teacherId: p.teacherId,
    nazwaKlasy: p.nazwaKlasy,
    nazwaZestawu: p.nazwaZestawu,
    tryb: p.tryb,
    auto: p.auto,
    status: p.status,
    faza: p.faza,
    gracze: p.uczniowie.size,
    utworzonyAt: p.utworzonyAt
  }));
}

let callbackZamkniecia = null;
export function onZamknieciePokoju(fn) {
  callbackZamkniecia = fn;
}

export function zakonczPokoj(kod) {
  const p = pokoje.get(String(kod));
  if (!p) return;
  pokoje.delete(String(kod));
  db.prepare("UPDATE sesje SET status = 'finished', zakonczona_at = datetime('now') WHERE kod = ?").run(String(kod));
  callbackZamkniecia?.(p.kod);
}

function posprzataj() {
  const teraz = Date.now();
  for (const [kod, p] of pokoje) {
    if (teraz - p.utworzonyAt > CZAS_ZYCIA) zakonczPokoj(kod);
  }
}
setInterval(posprzataj, 10 * 60 * 1000).unref?.();
