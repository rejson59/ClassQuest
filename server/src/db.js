import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// ClassQuest — warstwa danych.
//
// Dwa backendy pod jednym, w pełni asynchronicznym interfejsem:
//   • SQLite  (node:sqlite)  — gdy brak DATABASE_URL  → lokalny rozwój/testy
//   • Postgres (pg, Supabase) — gdy jest DATABASE_URL → produkcja/hosting
//
// Interfejs (wszystko async): db.get(sql, ...p), db.all(sql, ...p),
// db.run(sql, ...p) → {lastInsertRowid?}, db.exec(sql), db.withTx(fn),
// db.rozmiarB() → liczba bajtów pliku (tylko SQLite; w pg null).
// W zapytaniach używamy wyłącznie placeholderów „?" — backend pg sam
// zamienia je na $1, $2… (kod pozostaje jeden dla obu silników).
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const SQLITE_PATH = path.join(dataDir, 'classquest.db');

// Ścieżka do pliku bazy — używana przez panel admina do pokazania rozmiaru.
export const DB_PATH = process.env.DATABASE_URL ? null : SQLITE_PATH;

// ---------------------------------------------------------------------------
// Schemat SQLite (lokalny rozwój)
// ---------------------------------------------------------------------------
const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imie_nazwisko TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  haslo_hash TEXT NOT NULL,
  rola TEXT NOT NULL DEFAULT 'nauczyciel',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS klasy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  nazwa TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uczniowie (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  klasa_id INTEGER NOT NULL REFERENCES klasy(id) ON DELETE CASCADE,
  numer_dziennika INTEGER NOT NULL,
  imie_nazwisko TEXT NOT NULL,
  avatar_json TEXT NOT NULL DEFAULT '{}',
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (klasa_id, numer_dziennika)
);

CREATE TABLE IF NOT EXISTS zestawy_pytan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  nazwa TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pytania (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zestaw_id INTEGER NOT NULL REFERENCES zestawy_pytan(id) ON DELETE CASCADE,
  tresc TEXT NOT NULL,
  opcja_a TEXT NOT NULL,
  opcja_b TEXT NOT NULL,
  opcja_c TEXT NOT NULL,
  opcja_d TEXT NOT NULL,
  poprawna TEXT NOT NULL CHECK (poprawna IN ('A','B','C','D')),
  czas_sek INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sesje (
  kod TEXT PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  klasa_id INTEGER NOT NULL REFERENCES klasy(id),
  zestaw_id INTEGER NOT NULL REFERENCES zestawy_pytan(id),
  tryb TEXT NOT NULL DEFAULT '4pola',
  status TEXT NOT NULL DEFAULT 'lobby',
  auto INTEGER NOT NULL DEFAULT 0,
  utworzona_at TEXT NOT NULL DEFAULT (datetime('now')),
  zakonczona_at TEXT
);

CREATE TABLE IF NOT EXISTS wyniki_gier (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesja_kod TEXT NOT NULL REFERENCES sesje(kod) ON DELETE CASCADE,
  uczen_id INTEGER NOT NULL REFERENCES uczniowie(id) ON DELETE CASCADE,
  pozycja INTEGER NOT NULL,
  xp_zdobyte INTEGER NOT NULL DEFAULT 0,
  poprawne INTEGER NOT NULL DEFAULT 0,
  zycia_zostalo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS xp_logi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uczen_id INTEGER NOT NULL REFERENCES uczniowie(id) ON DELETE CASCADE,
  zrodlo TEXT NOT NULL,
  kwota INTEGER NOT NULL,
  opis TEXT NOT NULL DEFAULT '',
  sesja_kod TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_uczniowie_klasa ON uczniowie(klasa_id);
CREATE INDEX IF NOT EXISTS idx_pytania_zestaw ON pytania(zestaw_id);
`;

// Schemat dla Postgresa czyta się z supabase/schema.sql (jedno źródło prawdy).
const SCHEMA_PG_PATH = path.join(__dirname, '..', '..', 'supabase', 'schema.sql');

// ---------------------------------------------------------------------------
// Implementacje
// ---------------------------------------------------------------------------

let impl = null; // aktywny backend: {get, all, run, exec, withTx, rozmiarB, close}
let backend = null; // 'sqlite' | 'pg'

export function backendName() {
  return backend;
}

// ---- SQLite ---------------------------------------------------------------

function utworzSqlite() {
  fs.mkdirSync(dataDir, { recursive: true });
  const s = new DatabaseSync(SQLITE_PATH);
  s.exec('PRAGMA journal_mode = WAL');
  s.exec('PRAGMA foreign_keys = ON');
  s.exec(SCHEMA_SQLITE);

  // Migracja dla istniejących baz: kolumna „rola" w teachers.
  const kolumny = s.prepare('PRAGMA table_info(teachers)').all().map((c) => c.name);
  if (!kolumny.includes('rola')) {
    s.exec("ALTER TABLE teachers ADD COLUMN rola TEXT NOT NULL DEFAULT 'nauczyciel'");
  }

  const api = {
    get: async (sql, ...p) => s.prepare(sql).get(...p),
    all: async (sql, ...p) => s.prepare(sql).all(...p),
    run: async (sql, ...p) => {
      const r = s.prepare(sql).run(...p);
      return { lastInsertRowid: r.lastInsertRowid == null ? undefined : Number(r.lastInsertRowid) };
    },
    exec: async (sql) => { s.exec(sql); return {}; },
    withTx: async (fn) => {
      s.exec('BEGIN');
      try {
        const out = await fn(api);
        s.exec('COMMIT');
        return out;
      } catch (err) {
        try { s.exec('ROLLBACK'); } catch { /* ignoruj */ }
        throw err;
      }
    },
    rozmiarB: () => {
      try { return fs.statSync(SQLITE_PATH).size; } catch { return null; }
    },
    close: () => { try { s.close(); } catch { /* ignoruj */ } }
  };
  return api;
}

// ---- PostgreSQL (Supabase) -------------------------------------------------

// Zamiana zapytań „SQLite-owych" na składnię Postgresa.
function normSql(sql) {
  let i = 0;
  let out = sql.replace(/\?/g, () => '$' + ++i);
  out = out.replace(/datetime\('now'\)/g, "to_char(now(), 'YYYY-MM-DD HH24:MI:SS')");
  return out;
}

// Tabele z kolumną id — dla nich INSERT dostaje RETURNING id (potrzebne do lastInsertRowid).
const TABELE_Z_ID = new Set(['teachers', 'klasy', 'uczniowie', 'zestawy_pytan', 'pytania']);
const INS_WITH_ID = /^\s*insert\s+into\s+(teachers|klasy|uczniowie|zestawy_pytan|pytania)\b/i;

async function utworzPg() {
  const { default: pg } = await import('pg');
  const { Pool } = pg;
  const url = process.env.DATABASE_URL;
  // Supabase wymaga SSL; lokalny Postgres (testy) — nie.
  const ssl = /(sslmode=require|supabase\.co|pooler\.supabase\.com)/i.test(url || '')
    ? { rejectUnauthorized: false }
    : undefined;
  const pool = new Pool({
    connectionString: url,
    ...(ssl ? { ssl } : {}),
    max: 5
  });

  // Wykonaj zapytanie na wskazanym executorze (pool albo client transakcji).
  const makeApi = (executor) => {
    const q = async (sql, params) => {
      const res = await executor.query(normSql(sql), params || []);
      return res.rows;
    };
    return {
      get: async (sql, ...p) => (await q(sql, p))[0],
      all: async (sql, ...p) => await q(sql, p),
      run: async (sql, ...p) => {
        let s = sql;
        if (INS_WITH_ID.test(s) && !/returning\b/i.test(s)) s = s.replace(/;\s*$/, '') + ' RETURNING id';
        const rows = await q(s, p);
        return { lastInsertRowid: rows?.[0]?.id != null ? Number(rows[0].id) : undefined };
      },
      exec: async (sql) => { await executor.query(normSql(sql)); return {}; },
      withTx: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const tx = makeApi(client);
          const out = await fn(tx);
          await client.query('COMMIT');
          return out;
        } catch (err) {
          try { await client.query('ROLLBACK'); } catch { /* ignoruj */ }
          throw err;
        } finally {
          client.release();
        }
      },
      rozmiarB: () => null
    };
  };

  const api = makeApi(pool);
  // Postgres nie ma „PRAGMA" — klucze obce są domyślnie włączone.
  // Schemat tworzymy z supabase/schema.sql (CREATE TABLE IF NOT EXISTS).
  const schema = fs.readFileSync(SCHEMA_PG_PATH, 'utf8');
  // Wytnij komentarze, żeby czytało się je jako czysty SQL
  const czysty = schema
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  await api.exec(czysty);
  api._pool = pool;
  return api;
}

// ---------------------------------------------------------------------------
// Wspólne reguły (administrator + dane demo)
// ---------------------------------------------------------------------------

async function pilnujAdmina(d) {
  // Jeśli w systemie nie ma ani jednego administratora — pierwsze konto nim zostaje.
  const r = await d.get("SELECT COUNT(*) AS c FROM teachers WHERE rola = 'admin'");
  if (Number(r?.c ?? 0) === 0) {
    const najstarsze = await d.get('SELECT MIN(id) AS id FROM teachers');
    if (najstarsze?.id != null) {
      await d.run("UPDATE teachers SET rola = 'admin' WHERE id = ?", najstarsze.id);
    }
  }
}

async function seedDemo(d) {
  const count = await d.get('SELECT COUNT(*) AS c FROM teachers');
  if (Number(count?.c ?? 0) > 0) return;

  const hasloHash = bcrypt.hashSync('demo1234', 10);
  const t = await d.run(
    'INSERT INTO teachers (imie_nazwisko, email, haslo_hash, rola) VALUES (?, ?, ?, ?)',
    'Nauczyciel Testowy', 'nauczyciel@demo.pl', hasloHash, 'admin'
  );
  const teacherId = t.lastInsertRowid;

  const k = await d.run('INSERT INTO klasy (teacher_id, nazwa) VALUES (?, ?)', teacherId, '8B');
  const klasaId = k.lastInsertRowid;

  const uczniowie = [
    'Jan Kowalski', 'Anna Nowak', 'Piotr Wiśniewski', 'Katarzyna Zielińska',
    'Michał Lewandowski', 'Zuzanna Wójcik', 'Jakub Kamiński', 'Julia Lewandowska',
    'Bartosz Szymański', 'Maja Dąbrowska', 'Szymon Kozłowski', 'Nikola Jankowska'
  ];
  for (let i = 0; i < uczniowie.length; i++) {
    await d.run(
      'INSERT INTO uczniowie (klasa_id, numer_dziennika, imie_nazwisko) VALUES (?, ?, ?)',
      klasaId, i + 1, uczniowie[i]
    );
  }

  const zestawy = [
    {
      nazwa: 'Matematyka — ułamki i procenty',
      pytania: [
        { t: 'Ile to jest 1/2 + 1/4?', a: '3/4', b: '2/6', c: '1/6', d: '3/6', p: 'A' },
        { t: 'Który ułamek jest największy?', a: '2/3', b: '3/5', c: '5/8', d: '7/12', p: 'A' },
        { t: 'Ile to jest 25% ze 160?', a: '25', b: '40', c: '50', d: '80', p: 'B' },
        { t: 'Zamień 0,75 na procent.', a: '7,5%', b: '75%', c: '0,75%', d: '750%', p: 'B' },
        { t: 'Skróć ułamek 8/12.', a: '4/6', b: '2/3', c: '1/3', d: '8/12', p: 'B' }
      ]
    },
    {
      nazwa: 'Przyroda — zwierzęta',
      pytania: [
        { t: 'Które zwierzę jest największym ssakiem świata?', a: 'Słoń afrykański', b: 'Płetwal błękitny', c: 'Żyrafa', d: 'Hipopotam', p: 'B' },
        { t: 'Które zwierzę zapada w sen zimowy?', a: 'Lis', b: 'Zając', c: 'Jeż', d: 'Sarna', p: 'C' },
        { t: 'Kolibry to...', a: 'owady', b: 'ssaki', c: 'ptaki', d: 'gady', p: 'C' },
        { t: 'Które z tych zwierząt nie jest drapieżnikiem?', a: 'Wilk', b: 'Orzeł', c: 'Rekin', d: 'Krowa', p: 'D' }
      ]
    }
  ];

  for (const z of zestawy) {
    const zs = await d.run('INSERT INTO zestawy_pytan (teacher_id, nazwa) VALUES (?, ?)', teacherId, z.nazwa);
    for (const q of z.pytania) {
      await d.run(
        `INSERT INTO pytania (zestaw_id, tresc, opcja_a, opcja_b, opcja_c, opcja_d, poprawna)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        zs.lastInsertRowid, q.t, q.a, q.b, q.c, q.d, q.p
      );
    }
  }

  console.log('✅ Baza danych utworzona z danymi demo.');
}

// ---------------------------------------------------------------------------
// Inicjalizacja
// ---------------------------------------------------------------------------

export async function initDb() {
  if (impl) return impl;

  if (process.env.DATABASE_URL) {
    backend = 'pg';
    impl = await utworzPg();
    // Na produkcji NIE wsadzamy konta demo (publiczny dostęp!). Pierwsze
    // zarejestrowane konto samo zostanie administratorem (logika w routes.js).
    if (process.env.SEED_DEMO === '1') await seedDemo(impl);
  } else {
    backend = 'sqlite';
    impl = utworzSqlite();
    await seedDemo(impl); // lokalny rozwój: wygodne dane do testów
  }

  await pilnujAdmina(impl);
  console.log(`🗄️  Baza: ${backend}${backend === 'pg' ? ' (PostgreSQL/Supabase)' : ' (SQLite — lokalna)'}`);
  return impl;
}

// ---------------------------------------------------------------------------
// Facade — reszta kodu (routes/game/rooms) woła db.* — async.
// ---------------------------------------------------------------------------

function wymagaj() {
  if (!impl) throw new Error('Baza danych nie została zainicjalizowana (initDb).');
}

const db = {
  get: (...a) => { wymagaj(); return impl.get(...a); },
  all: (...a) => { wymagaj(); return impl.all(...a); },
  run: (...a) => { wymagaj(); return impl.run(...a); },
  exec: (...a) => { wymagaj(); return impl.exec(...a); },
  withTx: (...a) => { wymagaj(); return impl.withTx(...a); },
  rozmiarB: () => { wymagaj(); return impl.rozmiarB(); },
  close: () => { wymagaj(); return impl.close(); }
};

export default db;
