import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'classquest.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schemat
// ---------------------------------------------------------------------------
db.exec(`
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
`);

// Migracja dla istniejących baz: kolumna „rola" w teachers (admin/nauczyciel)
const kolumnyTeachers = db.prepare('PRAGMA table_info(teachers)').all().map(c => c.name);
if (!kolumnyTeachers.includes('rola')) {
  db.exec("ALTER TABLE teachers ADD COLUMN rola TEXT NOT NULL DEFAULT 'nauczyciel'");
}
const liczbaAdminow = db.prepare("SELECT COUNT(*) AS c FROM teachers WHERE rola = 'admin'").get().c;
if (liczbaAdminow === 0) {
  // pierwsze konto w systemie zostaje administratorem (bezpieczeństwo: jest admin)
  db.exec("UPDATE teachers SET rola = 'admin' WHERE id = (SELECT MIN(id) FROM teachers)");
}

// ---------------------------------------------------------------------------
// Dane demo (tylko gdy baza jest pusta)
// ---------------------------------------------------------------------------
function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM teachers').get().c;
  if (count > 0) return;

  const hasloHash = bcrypt.hashSync('demo1234', 10);
  const teacher = db.prepare(
    'INSERT INTO teachers (imie_nazwisko, email, haslo_hash, rola) VALUES (?, ?, ?, ?)'
  ).run('Nauczyciel Testowy', 'nauczyciel@demo.pl', hasloHash, 'admin');
  const teacherId = teacher.lastInsertRowid;

  const klasa = db.prepare(
    'INSERT INTO klasy (teacher_id, nazwa) VALUES (?, ?)'
  ).run(teacherId, '8B');
  const klasaId = klasa.lastInsertRowid;

  const uczniowie = [
    'Jan Kowalski', 'Anna Nowak', 'Piotr Wiśniewski', 'Katarzyna Zielińska',
    'Michał Lewandowski', 'Zuzanna Wójcik', 'Jakub Kamiński', 'Julia Lewandowska',
    'Bartosz Szymański', 'Maja Dąbrowska', 'Szymon Kozłowski', 'Nikola Jankowska'
  ];
  const insUczen = db.prepare(
    'INSERT INTO uczniowie (klasa_id, numer_dziennika, imie_nazwisko) VALUES (?, ?, ?)'
  );
  uczniowie.forEach((imie, i) => insUczen.run(klasaId, i + 1, imie));

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

  const insZestaw = db.prepare(
    'INSERT INTO zestawy_pytan (teacher_id, nazwa) VALUES (?, ?)'
  );
  const insPytanie = db.prepare(
    `INSERT INTO pytania (zestaw_id, tresc, opcja_a, opcja_b, opcja_c, opcja_d, poprawna)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const z of zestawy) {
    const zestawId = insZestaw.run(teacherId, z.nazwa).lastInsertRowid;
    for (const q of z.pytania) {
      insPytanie.run(zestawId, q.t, q.a, q.b, q.c, q.d, q.p);
    }
  }

  console.log('✅ Baza danych utworzona z danymi demo.');
}

seed();

// ścieżka pliku bazy (używana przez panel administratora do pokazania rozmiaru)
export const DB_PATH = path.join(dataDir, 'classquest.db');

export default db;
