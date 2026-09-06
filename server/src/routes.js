import express from 'express';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getSecret } from './secret.js';
import { DB_PATH } from './db.js';
import { utworzPokoj, pobierzPokoj, zakonczPokoj, listaUczniow, listaPokoi } from './rooms.js';

const JWT_SECRET = getSecret();
const COOKIE = 'cq_token';

export function nowIso() {
  return new Date().toISOString();
}

export function mountRoutes(app, db) {
  app.use(express.json());

  // -------- pomocnicze ---------------------------------------------------
  function sign(teacher) {
    return jwt.sign({ id: teacher.id, email: teacher.email }, JWT_SECRET, { expiresIn: '30d' });
  }

  function auth(req, res, next) {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: 'Brak sesji. Zaloguj się.' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const teacher = db.prepare(
        'SELECT id, imie_nazwisko, email, rola FROM teachers WHERE id = ?'
      ).get(payload.id);
      if (!teacher) return res.status(401).json({ error: 'Konto nie istnieje.' });
      req.teacher = teacher;
      next();
    } catch {
      return res.status(401).json({ error: 'Sesja wygasła. Zaloguj się ponownie.' });
    }
  }

  function adminOnly(req, res, next) {
    if (req.teacher?.rola !== 'admin') {
      return res.status(403).json({ error: 'Wymagane konto administratora.' });
    }
    next();
  }

  function ownedClass(teacherId, klasaId) {
    return db.prepare('SELECT * FROM klasy WHERE id = ? AND teacher_id = ?').get(klasaId, teacherId);
  }

  function ownedSet(teacherId, zestawId) {
    return db.prepare('SELECT * FROM zestawy_pytan WHERE id = ? AND teacher_id = ?').get(zestawId, teacherId);
  }

  // -------- AUTH ---------------------------------------------------------
  app.post('/api/auth/rejestracja', (req, res) => {
    const imieNazwisko = (req.body.imieNazwisko || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const haslo = (req.body.haslo || '').toString();

    if (!imieNazwisko || !email || haslo.length < 6) {
      return res.status(400).json({ error: 'Uzupełnij imię i nazwisko, poprawny e-mail oraz hasło (min. 6 znaków).' });
    }
    const exists = db.prepare('SELECT id FROM teachers WHERE email = ?').get(email);
    if (exists) return res.status(409).json({ error: 'Konto z tym e-mailem już istnieje.' });

    const hash = bcrypt.hashSync(haslo, 10);
    const info = db.prepare(
      'INSERT INTO teachers (imie_nazwisko, email, haslo_hash) VALUES (?, ?, ?)'
    ).run(imieNazwisko, email, hash);
    const teacher = { id: info.lastInsertRowid, imie_nazwisko: imieNazwisko, email, rola: 'nauczyciel' };
    res.cookie(COOKIE, sign(teacher), { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
    res.json({ teacher });
  });

  app.post('/api/auth/logowanie', (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const haslo = (req.body.haslo || '').toString();
    const row = db.prepare('SELECT * FROM teachers WHERE email = ?').get(email);
    if (!row || !bcrypt.compareSync(haslo, row.haslo_hash)) {
      return res.status(401).json({ error: 'Nieprawidłowy e-mail lub hasło.' });
    }
    const teacher = { id: row.id, imie_nazwisko: row.imie_nazwisko, email: row.email, rola: row.rola || 'nauczyciel' };
    res.cookie(COOKIE, sign(teacher), { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
    res.json({ teacher });
  });

  app.post('/api/auth/wyloguj', (_req, res) => {
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  app.get('/api/auth/ja', auth, (req, res) => res.json({ teacher: req.teacher }));

  // -------- KLASY ---------------------------------------------------------
  app.get('/api/klasy', auth, (req, res) => {
    const klasy = db.prepare(`
      SELECT k.*, COUNT(u.id) AS liczba_uczniow
      FROM klasy k
      LEFT JOIN uczniowie u ON u.klasa_id = k.id
      WHERE k.teacher_id = ?
      GROUP BY k.id ORDER BY k.created_at DESC
    `).all(req.teacher.id);
    res.json({ klasy });
  });

  app.post('/api/klasy', auth, (req, res) => {
    const nazwa = (req.body.nazwa || '').trim();
    if (!nazwa) return res.status(400).json({ error: 'Podaj nazwę klasy.' });
    const info = db.prepare('INSERT INTO klasy (teacher_id, nazwa) VALUES (?, ?)')
      .run(req.teacher.id, nazwa);
    res.json({ klasa: { id: info.lastInsertRowid, nazwa, liczba_uczniow: 0 } });
  });

  app.patch('/api/klasy/:id', auth, (req, res) => {
    const klasa = ownedClass(req.teacher.id, req.params.id);
    if (!klasa) return res.status(404).json({ error: 'Nie znaleziono klasy.' });
    const nazwa = (req.body.nazwa || '').trim();
    if (!nazwa) return res.status(400).json({ error: 'Podaj nazwę klasy.' });
    db.prepare('UPDATE klasy SET nazwa = ? WHERE id = ?').run(nazwa, klasa.id);
    res.json({ ok: true });
  });

  app.delete('/api/klasy/:id', auth, (req, res) => {
    const klasa = ownedClass(req.teacher.id, req.params.id);
    if (!klasa) return res.status(404).json({ error: 'Nie znaleziono klasy.' });
    db.prepare('DELETE FROM klasy WHERE id = ?').run(klasa.id);
    res.json({ ok: true });
  });

  // -------- UCZNIOWIE ------------------------------------------------------
  app.get('/api/klasy/:id/uczniowie', auth, (req, res) => {
    const klasa = ownedClass(req.teacher.id, req.params.id);
    if (!klasa) return res.status(404).json({ error: 'Nie znaleziono klasy.' });
    const uczniowie = db.prepare(`
      SELECT id, klasa_id, numer_dziennika, imie_nazwisko, avatar_json, xp,
             (SELECT COUNT(*) FROM xp_logi x WHERE x.uczen_id = u.id) AS logow
      FROM uczniowie u WHERE klasa_id = ? ORDER BY numer_dziennika ASC
    `).all(klasa.id);
    res.json({ uczniowie, klasa });
  });

  app.post('/api/klasy/:id/uczniowie', auth, (req, res) => {
    const klasa = ownedClass(req.teacher.id, req.params.id);
    if (!klasa) return res.status(404).json({ error: 'Nie znaleziono klasy.' });
    const imieNazwisko = (req.body.imieNazwisko || '').trim();
    const numer = parseInt(req.body.numerDziennika, 10);
    if (!imieNazwisko || !numer) {
      return res.status(400).json({ error: 'Podaj numer z dziennika oraz imię i nazwisko.' });
    }
    const dup = db.prepare(
      'SELECT id FROM uczniowie WHERE klasa_id = ? AND numer_dziennika = ?'
    ).get(klasa.id, numer);
    if (dup) return res.status(409).json({ error: `Uczeń nr ${numer} już istnieje w tej klasie.` });
    const info = db.prepare(
      'INSERT INTO uczniowie (klasa_id, numer_dziennika, imie_nazwisko) VALUES (?, ?, ?)'
    ).run(klasa.id, numer, imieNazwisko);
    res.json({ uczen: { id: info.lastInsertRowid, numer_dziennika: numer, imie_nazwisko: imieNazwisko, avatar_json: '{}', xp: 0 } });
  });

  app.patch('/api/uczniowie/:id', auth, (req, res) => {
    const uczen = db.prepare(`
      SELECT u.* FROM uczniowie u JOIN klasy k ON k.id = u.klasa_id
      WHERE u.id = ? AND k.teacher_id = ?
    `).get(req.params.id, req.teacher.id);
    if (!uczen) return res.status(404).json({ error: 'Nie znaleziono ucznia.' });

    const akt = {};
    if (typeof req.body.avatar_json === 'object' && req.body.avatar_json !== null) {
      akt.avatar_json = JSON.stringify(req.body.avatar_json);
    }
    if (typeof req.body.imieNazwisko === 'string') {
      const imieNazwisko = req.body.imieNazwisko.trim();
      if (imieNazwisko) akt.imie_nazwisko = imieNazwisko;
    }
    if (typeof req.body.numerDziennika !== 'undefined') {
      const numer = parseInt(req.body.numerDziennika, 10);
      if (numer) {
        const dup = db.prepare(
          'SELECT id FROM uczniowie WHERE klasa_id = ? AND numer_dziennika = ? AND id != ?'
        ).get(uczen.klasa_id, numer, uczen.id);
        if (dup) return res.status(409).json({ error: `Uczeń nr ${numer} już istnieje.` });
        akt.numer_dziennika = numer;
      }
    }
    if (Object.keys(akt).length) {
      const set = Object.keys(akt).map(k => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE uczniowie SET ${set} WHERE id = @id`).run({ ...akt, id: uczen.id });
    }
    res.json({ ok: true });
  });

  app.delete('/api/uczniowie/:id', auth, (req, res) => {
    const uczen = db.prepare(`
      SELECT u.* FROM uczniowie u JOIN klasy k ON k.id = u.klasa_id
      WHERE u.id = ? AND k.teacher_id = ?
    `).get(req.params.id, req.teacher.id);
    if (!uczen) return res.status(404).json({ error: 'Nie znaleziono ucznia.' });
    db.prepare('DELETE FROM uczniowie WHERE id = ?').run(uczen.id);
    res.json({ ok: true });
  });

  // -------- XP (ręczne przyznawanie) --------------------------------------
  app.post('/api/uczniowie/:id/xp', auth, (req, res) => {
    const uczen = db.prepare(`
      SELECT u.* FROM uczniowie u JOIN klasy k ON k.id = u.klasa_id
      WHERE u.id = ? AND k.teacher_id = ?
    `).get(req.params.id, req.teacher.id);
    if (!uczen) return res.status(404).json({ error: 'Nie znaleziono ucznia.' });

    const kwota = parseInt(req.body.kwota, 10);
    const opis = (req.body.opis || '').trim();
    if (!kwota || kwota <= 0) return res.status(400).json({ error: 'Podaj dodatnią liczbę XP.' });

    db.prepare('UPDATE uczniowie SET xp = xp + ? WHERE id = ?').run(kwota, uczen.id);
    db.prepare(
      'INSERT INTO xp_logi (uczen_id, zrodlo, kwota, opis) VALUES (?, ?, ?, ?)'
    ).run(uczen.id, 'reczne', kwota, opis || 'Ręczne przyznanie XP');
    res.json({ ok: true, xp: uczen.xp + kwota });
  });

  // -------- ZESTAWY PYTAŃ --------------------------------------------------
  app.get('/api/zestawy', auth, (req, res) => {
    const zestawy = db.prepare(`
      SELECT z.*, COUNT(p.id) AS liczba_pytan
      FROM zestawy_pytan z
      LEFT JOIN pytania p ON p.zestaw_id = z.id
      WHERE z.teacher_id = ?
      GROUP BY z.id ORDER BY z.created_at DESC
    `).all(req.teacher.id);
    res.json({ zestawy });
  });

  app.post('/api/zestawy', auth, (req, res) => {
    const nazwa = (req.body.nazwa || '').trim();
    if (!nazwa) return res.status(400).json({ error: 'Podaj nazwę zestawu.' });
    const info = db.prepare('INSERT INTO zestawy_pytan (teacher_id, nazwa) VALUES (?, ?)')
      .run(req.teacher.id, nazwa);
    res.json({ zestaw: { id: info.lastInsertRowid, nazwa, liczba_pytan: 0 } });
  });

  app.patch('/api/zestawy/:id', auth, (req, res) => {
    const zestaw = ownedSet(req.teacher.id, req.params.id);
    if (!zestaw) return res.status(404).json({ error: 'Nie znaleziono zestawu.' });
    const nazwa = (req.body.nazwa || '').trim();
    if (!nazwa) return res.status(400).json({ error: 'Podaj nazwę zestawu.' });
    db.prepare('UPDATE zestawy_pytan SET nazwa = ? WHERE id = ?').run(nazwa, zestaw.id);
    res.json({ ok: true });
  });

  app.delete('/api/zestawy/:id', auth, (req, res) => {
    const zestaw = ownedSet(req.teacher.id, req.params.id);
    if (!zestaw) return res.status(404).json({ error: 'Nie znaleziono zestawu.' });
    db.prepare('DELETE FROM zestawy_pytan WHERE id = ?').run(zestaw.id);
    res.json({ ok: true });
  });

  // -------- PYTANIA ---------------------------------------------------------
  app.get('/api/zestawy/:id/pytania', auth, (req, res) => {
    const zestaw = ownedSet(req.teacher.id, req.params.id);
    if (!zestaw) return res.status(404).json({ error: 'Nie znaleziono zestawu.' });
    const pytania = db.prepare('SELECT * FROM pytania WHERE zestaw_id = ? ORDER BY id ASC').all(zestaw.id);
    res.json({ pytania, zestaw });
  });

  app.post('/api/zestawy/:id/pytania', auth, (req, res) => {
    const zestaw = ownedSet(req.teacher.id, req.params.id);
    if (!zestaw) return res.status(404).json({ error: 'Nie znaleziono zestawu.' });

    const b = req.body;
    const tresc = (b.tresc || '').trim();
    const opcje = ['A', 'B', 'C', 'D'].map(l => (b[`opcja_${l.toLowerCase()}`] || '').trim());
    const poprawna = (b.poprawna || '').toUpperCase();
    if (!tresc || opcje.some(o => !o) || !['A', 'B', 'C', 'D'].includes(poprawna)) {
      return res.status(400).json({ error: 'Wypełnij treść, wszystkie 4 odpowiedzi i zaznacz poprawną.' });
    }
    const czas = Math.min(Math.max(parseInt(b.czas_sek, 10) || 0, 0), 120);
    const info = db.prepare(
      `INSERT INTO pytania (zestaw_id, tresc, opcja_a, opcja_b, opcja_c, opcja_d, poprawna, czas_sek)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(zestaw.id, tresc, opcje[0], opcje[1], opcje[2], opcje[3], poprawna, czas);
    res.json({ pytanie: { id: info.lastInsertRowid, tresc, opcja_a: opcje[0], opcja_b: opcje[1], opcja_c: opcje[2], opcja_d: opcje[3], poprawna, czas_sek: czas } });
  });

  app.patch('/api/pytania/:id', auth, (req, res) => {
    const pytanie = db.prepare(`
      SELECT p.* FROM pytania p JOIN zestawy_pytan z ON z.id = p.zestaw_id
      WHERE p.id = ? AND z.teacher_id = ?
    `).get(req.params.id, req.teacher.id);
    if (!pytanie) return res.status(404).json({ error: 'Nie znaleziono pytania.' });

    const b = req.body;
    const tresc = (b.tresc ?? pytanie.tresc).trim();
    const opcje = ['A', 'B', 'C', 'D'].map(l =>
      (b[`opcja_${l.toLowerCase()}`] ?? pytanie[`opcja_${l.toLowerCase()}`]).trim()
    );
    const poprawna = ((b.poprawna ?? pytanie.poprawna) || '').toUpperCase();
    if (!tresc || opcje.some(o => !o) || !['A', 'B', 'C', 'D'].includes(poprawna)) {
      return res.status(400).json({ error: 'Wypełnij treść, wszystkie 4 odpowiedzi i zaznacz poprawną.' });
    }
    const czas = Math.min(Math.max(parseInt(b.czas_sek, 10) || pytanie.czas_sek || 0, 0), 120);
    db.prepare(
      `UPDATE pytania SET tresc = ?, opcja_a = ?, opcja_b = ?, opcja_c = ?, opcja_d = ?, poprawna = ?, czas_sek = ?
       WHERE id = ?`
    ).run(tresc, opcje[0], opcje[1], opcje[2], opcje[3], poprawna, czas, pytanie.id);
    res.json({ ok: true });
  });

  app.delete('/api/pytania/:id', auth, (req, res) => {
    const pytanie = db.prepare(`
      SELECT p.* FROM pytania p JOIN zestawy_pytan z ON z.id = p.zestaw_id
      WHERE p.id = ? AND z.teacher_id = ?
    `).get(req.params.id, req.teacher.id);
    if (!pytanie) return res.status(404).json({ error: 'Nie znaleziono pytania.' });
    db.prepare('DELETE FROM pytania WHERE id = ?').run(pytanie.id);
    res.json({ ok: true });
  });

  // -------- POKOJE GIER ------------------------------------------------------
  // Utworzenie pokoju przez nauczyciela (klasa + zestaw pytań) → kod PIN.
  app.post('/api/pokoje', auth, (req, res) => {
    try {
      const p = utworzPokoj({
        teacherId: req.teacher.id,
        klasaId: req.body.klasaId,
        zestawId: req.body.zestawId,
        auto: !!req.body.auto,
        tryb: req.body.tryb || '4pola',
        liczbaEkip: req.body.liczbaEkip || 2
      });
      res.json({ kod: p.kod, nazwaKlasy: p.nazwaKlasy, nazwaZestawu: p.nazwaZestawu, tryb: p.tryb, liczbaEkip: p.liczbaEkip });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message });
    }
  });

  // Podgląd pokoju (dla nauczyciela-właściciela).
  app.get('/api/pokoje/:kod', auth, (req, res) => {
    const p = pobierzPokoj(req.params.kod);
    if (!p || p.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Nie znaleziono pokoju.' });
    }
    res.json({
      pokoj: {
        kod: p.kod,
        nazwaKlasy: p.nazwaKlasy,
        nazwaZestawu: p.nazwaZestawu,
        tryb: p.tryb,
        auto: p.auto,
        status: p.status,
        liczba_uczniow: p.uczniowie.size
      }
    });
  });

  // Zamknięcie pokoju przez nauczyciela.
  app.delete('/api/pokoje/:kod', auth, (req, res) => {
    const p = pobierzPokoj(req.params.kod);
    if (!p || p.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Nie znaleziono pokoju.' });
    }
    zakonczPokoj(p.kod);
    res.json({ ok: true });
  });

  // Lista klasy dla pokoju (uczeń wybiera siebie z dziennika) — bez logowania.
  app.get('/api/pokoje/:kod/uczniowie', (req, res) => {
    const p = pobierzPokoj(req.params.kod);
    if (!p) return res.status(404).json({ error: 'Nie znaleziono pokoju o tym kodzie.' });
    const uczniowie = db.prepare(
      'SELECT id, numer_dziennika, imie_nazwisko, avatar_json FROM uczniowie WHERE klasa_id = ? ORDER BY numer_dziennika ASC'
    ).all(p.klasaId);
    res.json({
      kod: p.kod,
      nazwaKlasy: p.nazwaKlasy,
      nazwaZestawu: p.nazwaZestawu,
      status: p.status,
      liczba_uczniow: p.uczniowie.size,
      uczniowie: uczniowie.map(u => ({
        id: u.id,
        numer_dziennika: u.numer_dziennika,
        imie_nazwisko: u.imie_nazwisko,
        avatar: JSON.parse(u.avatar_json || '{}')
      }))
    });
  });

  // Zapis awatara ucznia (bez logowania — uczeń wybiera sam siebie po numerze).
  app.patch('/api/uczniowie/:id/avatar', (req, res) => {
    const uczen = db.prepare('SELECT * FROM uczniowie WHERE id = ?').get(req.params.id);
    if (!uczen) return res.status(404).json({ error: 'Nie znaleziono ucznia.' });
    const a = req.body.avatar || {};
    const avatar = {
      kolor: typeof a.kolor === 'string' && a.kolor.trim() ? a.kolor.trim() : '#2563eb',
      oczy: ['okragle', 'szczesliwe', 'wielkie', 'zmruzone'].includes(a.oczy) ? a.oczy : 'okragle',
      buzia: ['usmiech', 'otwarta', 'jezyk', 'neutralna'].includes(a.buzia) ? a.buzia : 'usmiech',
      akcesorium: typeof a.akcesorium === 'string' ? a.akcesorium.slice(0, 8) : ''
    };
    db.prepare('UPDATE uczniowie SET avatar_json = ? WHERE id = ?').run(JSON.stringify(avatar), uczen.id);
    res.json({ ok: true, avatar });
  });

  // -------- PANEL ADMINISTRATORA (/api/admin/*) -----------------------------
  // Dostęp tylko dla kont z rolą „admin" — pełny wgląd we wszystkie dane.

  app.get('/api/admin/podsumowanie', auth, adminOnly, (req, res) => {
    const ile = (sql) => db.prepare(sql).get().c;
    let rozmiarBazy = null;
    try { rozmiarBazy = fs.statSync(DB_PATH).size; } catch { /* brak pliku */ }
    const pokoje = listaPokoi().map((p) => {
      const n = db.prepare('SELECT imie_nazwisko, email FROM teachers WHERE id = ?').get(p.teacherId);
      return { ...p, nauczyciel: n?.imie_nazwisko || '—', email: n?.email || '' };
    });
    res.json({
      liczby: {
        nauczyciele: ile('SELECT COUNT(*) AS c FROM teachers'),
        admini: ile("SELECT COUNT(*) AS c FROM teachers WHERE rola = 'admin'"),
        klasy: ile('SELECT COUNT(*) AS c FROM klasy'),
        uczniowie: ile('SELECT COUNT(*) AS c FROM uczniowie'),
        zestawy: ile('SELECT COUNT(*) AS c FROM zestawy_pytan'),
        pytania: ile('SELECT COUNT(*) AS c FROM pytania'),
        sesje: ile('SELECT COUNT(*) AS c FROM sesje'),
        gryZakonczone: ile("SELECT COUNT(*) AS c FROM sesje WHERE status = 'finished'"),
        sumaXp: db.prepare('SELECT COALESCE(SUM(xp), 0) AS c FROM uczniowie').get().c
      },
      system: {
        czas: new Date().toISOString(),
        uptimeSek: Math.round(process.uptime()),
        pamiecMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        rozmiarBazyB: rozmiarBazy,
        node: process.version
      },
      pokoje
    });
  });

  app.get('/api/admin/nauczyciele', auth, adminOnly, (req, res) => {
    const nauczyciele = db.prepare(`
      SELECT t.id, t.imie_nazwisko, t.email, t.rola, t.created_at,
        (SELECT COUNT(*) FROM klasy k WHERE k.teacher_id = t.id) AS klasy,
        (SELECT COUNT(*) FROM uczniowie u JOIN klasy k ON u.klasa_id = k.id
           WHERE k.teacher_id = t.id) AS uczniowie,
        (SELECT COUNT(*) FROM zestawy_pytan z WHERE z.teacher_id = t.id) AS zestawy,
        (SELECT COUNT(*) FROM pytania p JOIN zestawy_pytan z ON p.zestaw_id = z.id
           WHERE z.teacher_id = t.id) AS pytania,
        (SELECT COALESCE(SUM(u2.xp), 0) FROM uczniowie u2 JOIN klasy k2 ON u2.klasa_id = k2.id
           WHERE k2.teacher_id = t.id) AS suma_xp,
        (SELECT COUNT(*) FROM sesje s WHERE s.teacher_id = t.id) AS sesje
      FROM teachers t ORDER BY t.id ASC
    `).all();
    res.json({ nauczyciele });
  });

  app.patch('/api/admin/nauczyciele/:id/rola', auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    const rola = req.body.rola;
    if (!['admin', 'nauczyciel'].includes(rola)) {
      return res.status(400).json({ error: 'Nieprawidłowa rola.' });
    }
    if (id === req.teacher.id) {
      return res.status(400).json({ error: 'Nie możesz zmienić roli własnego konta.' });
    }
    const cel = db.prepare('SELECT * FROM teachers WHERE id = ?').get(id);
    if (!cel) return res.status(404).json({ error: 'Nie znaleziono konta.' });
    if (rola === 'nauczyciel' && cel.rola === 'admin') {
      const admini = db.prepare("SELECT COUNT(*) AS c FROM teachers WHERE rola = 'admin'").get().c;
      if (admini <= 1) {
        return res.status(400).json({ error: 'To ostatnie konto administratora — nie można go zdegradować.' });
      }
    }
    db.prepare('UPDATE teachers SET rola = ? WHERE id = ?').run(rola, id);
    res.json({ ok: true });
  });

  app.delete('/api/admin/nauczyciele/:id', auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.teacher.id) {
      return res.status(400).json({ error: 'Nie możesz usunąć własnego konta.' });
    }
    const cel = db.prepare('SELECT * FROM teachers WHERE id = ?').get(id);
    if (!cel) return res.status(404).json({ error: 'Nie znaleziono konta.' });
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM sesje WHERE teacher_id = ?').run(id);
      db.prepare('DELETE FROM klasy WHERE teacher_id = ?').run(id);
      db.prepare('DELETE FROM zestawy_pytan WHERE teacher_id = ?').run(id);
      db.prepare('DELETE FROM teachers WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.json({ ok: true });
  });

  app.get('/api/admin/sesje', auth, adminOnly, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const sesje = db.prepare(`
      SELECT s.kod, s.teacher_id, s.klasa_id, s.zestaw_id, s.tryb, s.status, s.auto,
             s.utworzona_at, s.zakonczona_at,
             t.imie_nazwisko AS nauczyciel, k.nazwa AS klasa, z.nazwa AS zestaw,
             (SELECT COUNT(*) FROM wyniki_gier w WHERE w.sesja_kod = s.kod) AS wynikow
      FROM sesje s
      LEFT JOIN teachers t ON t.id = s.teacher_id
      LEFT JOIN klasy k ON k.id = s.klasa_id
      LEFT JOIN zestawy_pytan z ON z.id = s.zestaw_id
      ORDER BY s.utworzona_at DESC
      LIMIT ?
    `).all(limit);
    res.json({ sesje });
  });

  app.get('/api/admin/sesje/:kod/wyniki', auth, adminOnly, (req, res) => {
    const sesja = db.prepare(`
      SELECT s.*, t.imie_nazwisko AS nauczyciel, k.nazwa AS klasa, z.nazwa AS zestaw
      FROM sesje s
      LEFT JOIN teachers t ON t.id = s.teacher_id
      LEFT JOIN klasy k ON k.id = s.klasa_id
      LEFT JOIN zestawy_pytan z ON z.id = s.zestaw_id
      WHERE s.kod = ?
    `).get(String(req.params.kod));
    if (!sesja) return res.status(404).json({ error: 'Nie znaleziono sesji.' });
    const wyniki = db.prepare(`
      SELECT w.pozycja, w.xp_zdobyte, w.poprawne, w.zycia_zostalo,
             u.imie_nazwisko, u.numer_dziennika, u.avatar_json
      FROM wyniki_gier w
      LEFT JOIN uczniowie u ON u.id = w.uczen_id
      WHERE w.sesja_kod = ?
      ORDER BY w.pozycja ASC
    `).all(String(req.params.kod));
    res.json({ sesja, wyniki });
  });

  app.get('/api/admin/eksport', auth, adminOnly, (_req, res) => {
    const dane = {
      teachers: db.prepare('SELECT * FROM teachers').all(),
      klasy: db.prepare('SELECT * FROM klasy').all(),
      uczniowie: db.prepare('SELECT * FROM uczniowie').all(),
      zestawy: db.prepare('SELECT * FROM zestawy_pytan').all(),
      pytania: db.prepare('SELECT * FROM pytania').all(),
      sesje: db.prepare('SELECT * FROM sesje').all(),
      wyniki_gier: db.prepare('SELECT * FROM wyniki_gier').all(),
      xp_logi: db.prepare('SELECT * FROM xp_logi').all()
    };
    res.json({
      aplikacja: 'ClassQuest',
      wyeksportowano: new Date().toISOString(),
      dane
    });
  });

  // -------- obsługa błędów JSON --------------------------------------------
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Wewnętrzny błąd serwera.' });
  });
}
