import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getSecret } from './secret.js';
import { utworzPokoj, pobierzPokoj, zakonczPokoj, listaUczniow, listaPokoi } from './rooms.js';

const JWT_SECRET = getSecret();
const COOKIE = 'cq_token';

export function nowIso() {
  return new Date().toISOString();
}

// Opakowanie handlerów async — błędy lecą do wspólnej obsługi (next(err)).
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function mountRoutes(app, db) {
  app.use(express.json());

  // -------- pomocnicze ---------------------------------------------------
  function sign(teacher) {
    return jwt.sign({ id: teacher.id, email: teacher.email }, JWT_SECRET, { expiresIn: '30d' });
  }

  async function auth(req, res, next) {
    const authH = req.headers.authorization || '';
    const token = authH.startsWith('Bearer ')
      ? authH.slice(7).trim()
      : req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: 'Brak sesji. Zaloguj się.' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const teacher = await db.get(
        'SELECT id, imie_nazwisko, email, rola FROM teachers WHERE id = ?',
        payload.id
      );
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

  async function ownedClass(teacherId, klasaId) {
    return db.get('SELECT * FROM klasy WHERE id = ? AND teacher_id = ?', klasaId, teacherId);
  }

  async function ownedSet(teacherId, zestawId) {
    return db.get('SELECT * FROM zestawy_pytan WHERE id = ? AND teacher_id = ?', zestawId, teacherId);
  }

  // -------- AUTH ---------------------------------------------------------
  app.post('/api/auth/rejestracja', ah(async (req, res) => {
    const imieNazwisko = (req.body.imieNazwisko || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const haslo = (req.body.haslo || '').toString();

    if (!imieNazwisko || !email || haslo.length < 6) {
      return res.status(400).json({ error: 'Uzupełnij imię i nazwisko, poprawny e-mail oraz hasło (min. 6 znaków).' });
    }
    const exists = await db.get('SELECT id FROM teachers WHERE email = ?', email);
    if (exists) return res.status(409).json({ error: 'Konto z tym e-mailem już istnieje.' });

    const hash = bcrypt.hashSync(haslo, 10);
    const info = await db.run(
      'INSERT INTO teachers (imie_nazwisko, email, haslo_hash) VALUES (?, ?, ?)',
      imieNazwisko, email, hash
    );
    const id = info.lastInsertRowid;

    // Pierwsze konto w systemie zostaje administratorem (bezpieczeństwo panelu).
    let rola = 'nauczyciel';
    const ilosc = await db.get('SELECT COUNT(*) AS c FROM teachers');
    if (Number(ilosc?.c ?? 0) === 1) {
      await db.run("UPDATE teachers SET rola = 'admin' WHERE id = ?", id);
      rola = 'admin';
    }

    const teacher = { id, imie_nazwisko: imieNazwisko, email, rola };
    const token = sign(teacher);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
    res.json({ teacher, token });
  }));

  app.post('/api/auth/logowanie', ah(async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const haslo = (req.body.haslo || '').toString();
    const row = await db.get('SELECT * FROM teachers WHERE email = ?', email);
    if (!row || !bcrypt.compareSync(haslo, row.haslo_hash)) {
      return res.status(401).json({ error: 'Nieprawidłowy e-mail lub hasło.' });
    }
    const teacher = { id: row.id, imie_nazwisko: row.imie_nazwisko, email: row.email, rola: row.rola || 'nauczyciel' };
    const token = sign(teacher);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
    res.json({ teacher, token });
  }));

  app.post('/api/auth/wyloguj', (_req, res) => {
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  app.get('/api/auth/ja', auth, (req, res) => res.json({ teacher: req.teacher }));

  // Czy konto demo istnieje? (tylko lokalna baza SQLite z seedem) — frontend
  // pokazuje wtedy przycisk „Użyj demo". Na produkcji (Postgres) go ukrywa.
  app.get('/api/demo', ah(async (_req, res) => {
    const r = await db.get("SELECT COUNT(*) AS c FROM teachers WHERE email = 'nauczyciel@demo.pl'");
    res.json({ dostepne: Number(r?.c ?? 0) > 0 });
  }));

  // -------- KLASY ---------------------------------------------------------
  app.get('/api/klasy', auth, ah(async (req, res) => {
    const rows = await db.all(`
      SELECT k.*, COUNT(u.id) AS liczba_uczniow
      FROM klasy k
      LEFT JOIN uczniowie u ON u.klasa_id = k.id
      WHERE k.teacher_id = ?
      GROUP BY k.id ORDER BY k.created_at DESC
    `, req.teacher.id);
    res.json({ klasy: rows.map((k) => ({ ...k, liczba_uczniow: Number(k.liczba_uczniow) })) });
  }));

  app.post('/api/klasy', auth, ah(async (req, res) => {
    const nazwa = (req.body.nazwa || '').trim();
    if (!nazwa) return res.status(400).json({ error: 'Podaj nazwę klasy.' });
    const info = await db.run('INSERT INTO klasy (teacher_id, nazwa) VALUES (?, ?)', req.teacher.id, nazwa);
    res.json({ klasa: { id: info.lastInsertRowid, nazwa, liczba_uczniow: 0 } });
  }));

  app.patch('/api/klasy/:id', auth, ah(async (req, res) => {
    const klasa = await ownedClass(req.teacher.id, req.params.id);
    if (!klasa) return res.status(404).json({ error: 'Nie znaleziono klasy.' });
    const nazwa = (req.body.nazwa || '').trim();
    if (!nazwa) return res.status(400).json({ error: 'Podaj nazwę klasy.' });
    await db.run('UPDATE klasy SET nazwa = ? WHERE id = ?', nazwa, klasa.id);
    res.json({ ok: true });
  }));

  app.delete('/api/klasy/:id', auth, ah(async (req, res) => {
    const klasa = await ownedClass(req.teacher.id, req.params.id);
    if (!klasa) return res.status(404).json({ error: 'Nie znaleziono klasy.' });
    await db.run('DELETE FROM klasy WHERE id = ?', klasa.id);
    res.json({ ok: true });
  }));

  // -------- UCZNIOWIE ------------------------------------------------------
  app.get('/api/klasy/:id/uczniowie', auth, ah(async (req, res) => {
    const klasa = await ownedClass(req.teacher.id, req.params.id);
    if (!klasa) return res.status(404).json({ error: 'Nie znaleziono klasy.' });
    const rows = await db.all(`
      SELECT id, klasa_id, numer_dziennika, imie_nazwisko, avatar_json, xp,
             (SELECT COUNT(*) FROM xp_logi x WHERE x.uczen_id = u.id) AS logow
      FROM uczniowie u WHERE klasa_id = ? ORDER BY numer_dziennika ASC
    `, klasa.id);
    res.json({ uczniowie: rows.map((u) => ({ ...u, logow: Number(u.logow) })), klasa });
  }));

  app.post('/api/klasy/:id/uczniowie', auth, ah(async (req, res) => {
    const klasa = await ownedClass(req.teacher.id, req.params.id);
    if (!klasa) return res.status(404).json({ error: 'Nie znaleziono klasy.' });
    const imieNazwisko = (req.body.imieNazwisko || '').trim();
    const numer = parseInt(req.body.numerDziennika, 10);
    if (!imieNazwisko || !numer) {
      return res.status(400).json({ error: 'Podaj numer z dziennika oraz imię i nazwisko.' });
    }
    const dup = await db.get(
      'SELECT id FROM uczniowie WHERE klasa_id = ? AND numer_dziennika = ?',
      klasa.id, numer
    );
    if (dup) return res.status(409).json({ error: `Uczeń nr ${numer} już istnieje w tej klasie.` });
    const info = await db.run(
      'INSERT INTO uczniowie (klasa_id, numer_dziennika, imie_nazwisko) VALUES (?, ?, ?)',
      klasa.id, numer, imieNazwisko
    );
    res.json({ uczen: { id: info.lastInsertRowid, numer_dziennika: numer, imie_nazwisko: imieNazwisko, avatar_json: '{}', xp: 0 } });
  }));

  app.patch('/api/uczniowie/:id', auth, ah(async (req, res) => {
    const uczen = await db.get(`
      SELECT u.* FROM uczniowie u JOIN klasy k ON k.id = u.klasa_id
      WHERE u.id = ? AND k.teacher_id = ?
    `, req.params.id, req.teacher.id);
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
        const dup = await db.get(
          'SELECT id FROM uczniowie WHERE klasa_id = ? AND numer_dziennika = ? AND id != ?',
          uczen.klasa_id, numer, uczen.id
        );
        if (dup) return res.status(409).json({ error: `Uczeń nr ${numer} już istnieje.` });
        akt.numer_dziennika = numer;
      }
    }
    if (Object.keys(akt).length) {
      const kolumny = Object.keys(akt).map((k) => `${k} = ?`).join(', ');
      await db.run(`UPDATE uczniowie SET ${kolumny} WHERE id = ?`, ...Object.values(akt), uczen.id);
    }
    res.json({ ok: true });
  }));

  app.delete('/api/uczniowie/:id', auth, ah(async (req, res) => {
    const uczen = await db.get(`
      SELECT u.* FROM uczniowie u JOIN klasy k ON k.id = u.klasa_id
      WHERE u.id = ? AND k.teacher_id = ?
    `, req.params.id, req.teacher.id);
    if (!uczen) return res.status(404).json({ error: 'Nie znaleziono ucznia.' });
    await db.run('DELETE FROM uczniowie WHERE id = ?', uczen.id);
    res.json({ ok: true });
  }));

  // -------- XP (ręczne przyznawanie) --------------------------------------
  app.post('/api/uczniowie/:id/xp', auth, ah(async (req, res) => {
    const uczen = await db.get(`
      SELECT u.* FROM uczniowie u JOIN klasy k ON k.id = u.klasa_id
      WHERE u.id = ? AND k.teacher_id = ?
    `, req.params.id, req.teacher.id);
    if (!uczen) return res.status(404).json({ error: 'Nie znaleziono ucznia.' });

    const kwota = parseInt(req.body.kwota, 10);
    const opis = (req.body.opis || '').trim();
    if (!kwota || kwota <= 0) return res.status(400).json({ error: 'Podaj dodatnią liczbę XP.' });

    await db.run('UPDATE uczniowie SET xp = xp + ? WHERE id = ?', kwota, uczen.id);
    await db.run(
      'INSERT INTO xp_logi (uczen_id, zrodlo, kwota, opis) VALUES (?, ?, ?, ?)',
      uczen.id, 'reczne', kwota, opis || 'Ręczne przyznanie XP'
    );
    res.json({ ok: true, xp: uczen.xp + kwota });
  }));

  // -------- ZESTAWY PYTAŃ --------------------------------------------------
  app.get('/api/zestawy', auth, ah(async (req, res) => {
    const rows = await db.all(`
      SELECT z.*, COUNT(p.id) AS liczba_pytan
      FROM zestawy_pytan z
      LEFT JOIN pytania p ON p.zestaw_id = z.id
      WHERE z.teacher_id = ?
      GROUP BY z.id ORDER BY z.created_at DESC
    `, req.teacher.id);
    res.json({ zestawy: rows.map((z) => ({ ...z, liczba_pytan: Number(z.liczba_pytan) })) });
  }));

  app.post('/api/zestawy', auth, ah(async (req, res) => {
    const nazwa = (req.body.nazwa || '').trim();
    if (!nazwa) return res.status(400).json({ error: 'Podaj nazwę zestawu.' });
    const info = await db.run('INSERT INTO zestawy_pytan (teacher_id, nazwa) VALUES (?, ?)', req.teacher.id, nazwa);
    res.json({ zestaw: { id: info.lastInsertRowid, nazwa, liczba_pytan: 0 } });
  }));

  app.patch('/api/zestawy/:id', auth, ah(async (req, res) => {
    const zestaw = await ownedSet(req.teacher.id, req.params.id);
    if (!zestaw) return res.status(404).json({ error: 'Nie znaleziono zestawu.' });
    const nazwa = (req.body.nazwa || '').trim();
    if (!nazwa) return res.status(400).json({ error: 'Podaj nazwę zestawu.' });
    await db.run('UPDATE zestawy_pytan SET nazwa = ? WHERE id = ?', nazwa, zestaw.id);
    res.json({ ok: true });
  }));

  app.delete('/api/zestawy/:id', auth, ah(async (req, res) => {
    const zestaw = await ownedSet(req.teacher.id, req.params.id);
    if (!zestaw) return res.status(404).json({ error: 'Nie znaleziono zestawu.' });
    await db.run('DELETE FROM zestawy_pytan WHERE id = ?', zestaw.id);
    res.json({ ok: true });
  }));

  // -------- PYTANIA ---------------------------------------------------------
  app.get('/api/zestawy/:id/pytania', auth, ah(async (req, res) => {
    const zestaw = await ownedSet(req.teacher.id, req.params.id);
    if (!zestaw) return res.status(404).json({ error: 'Nie znaleziono zestawu.' });
    const pytania = await db.all('SELECT * FROM pytania WHERE zestaw_id = ? ORDER BY id ASC', zestaw.id);
    res.json({ pytania, zestaw });
  }));

  app.post('/api/zestawy/:id/pytania', auth, ah(async (req, res) => {
    const zestaw = await ownedSet(req.teacher.id, req.params.id);
    if (!zestaw) return res.status(404).json({ error: 'Nie znaleziono zestawu.' });

    const b = req.body;
    const tresc = (b.tresc || '').trim();
    const opcje = ['A', 'B', 'C', 'D'].map(l => (b[`opcja_${l.toLowerCase()}`] || '').trim());
    const poprawna = (b.poprawna || '').toUpperCase();
    if (!tresc || opcje.some(o => !o) || !['A', 'B', 'C', 'D'].includes(poprawna)) {
      return res.status(400).json({ error: 'Wypełnij treść, wszystkie 4 odpowiedzi i zaznacz poprawną.' });
    }
    const czas = Math.min(Math.max(parseInt(b.czas_sek, 10) || 0, 0), 120);
    const info = await db.run(
      `INSERT INTO pytania (zestaw_id, tresc, opcja_a, opcja_b, opcja_c, opcja_d, poprawna, czas_sek)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      zestaw.id, tresc, opcje[0], opcje[1], opcje[2], opcje[3], poprawna, czas
    );
    res.json({ pytanie: { id: info.lastInsertRowid, tresc, opcja_a: opcje[0], opcja_b: opcje[1], opcja_c: opcje[2], opcja_d: opcje[3], poprawna, czas_sek: czas } });
  }));

  app.patch('/api/pytania/:id', auth, ah(async (req, res) => {
    const pytanie = await db.get(`
      SELECT p.* FROM pytania p JOIN zestawy_pytan z ON z.id = p.zestaw_id
      WHERE p.id = ? AND z.teacher_id = ?
    `, req.params.id, req.teacher.id);
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
    await db.run(
      `UPDATE pytania SET tresc = ?, opcja_a = ?, opcja_b = ?, opcja_c = ?, opcja_d = ?, poprawna = ?, czas_sek = ?
       WHERE id = ?`,
      tresc, opcje[0], opcje[1], opcje[2], opcje[3], poprawna, czas, pytanie.id
    );
    res.json({ ok: true });
  }));

  app.delete('/api/pytania/:id', auth, ah(async (req, res) => {
    const pytanie = await db.get(`
      SELECT p.* FROM pytania p JOIN zestawy_pytan z ON z.id = p.zestaw_id
      WHERE p.id = ? AND z.teacher_id = ?
    `, req.params.id, req.teacher.id);
    if (!pytanie) return res.status(404).json({ error: 'Nie znaleziono pytania.' });
    await db.run('DELETE FROM pytania WHERE id = ?', pytanie.id);
    res.json({ ok: true });
  }));

  // -------- POKOJE GIER ------------------------------------------------------
  // Utworzenie pokoju przez nauczyciela (klasa + zestaw pytań) → kod PIN.
  app.post('/api/pokoje', auth, ah(async (req, res) => {
    try {
      const p = await utworzPokoj({
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
  }));

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
  app.delete('/api/pokoje/:kod', auth, ah(async (req, res) => {
    const p = pobierzPokoj(req.params.kod);
    if (!p || p.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Nie znaleziono pokoju.' });
    }
    await zakonczPokoj(p.kod);
    res.json({ ok: true });
  }));

  // Lista klasy dla pokoju (uczeń wybiera siebie z dziennika) — bez logowania.
  app.get('/api/pokoje/:kod/uczniowie', ah(async (req, res) => {
    const p = pobierzPokoj(req.params.kod);
    if (!p) return res.status(404).json({ error: 'Nie znaleziono pokoju o tym kodzie.' });
    const uczniowie = await db.all(
      'SELECT id, numer_dziennika, imie_nazwisko, avatar_json FROM uczniowie WHERE klasa_id = ? ORDER BY numer_dziennika ASC',
      p.klasaId
    );
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
  }));

  // Zapis awatara ucznia (bez logowania — uczeń wybiera sam siebie po numerze).
  app.patch('/api/uczniowie/:id/avatar', ah(async (req, res) => {
    const uczen = await db.get('SELECT * FROM uczniowie WHERE id = ?', req.params.id);
    if (!uczen) return res.status(404).json({ error: 'Nie znaleziono ucznia.' });
    const a = req.body.avatar || {};
    const avatar = {
      kolor: typeof a.kolor === 'string' && a.kolor.trim() ? a.kolor.trim() : '#2563eb',
      oczy: ['okragle', 'szczesliwe', 'wielkie', 'zmruzone'].includes(a.oczy) ? a.oczy : 'okragle',
      buzia: ['usmiech', 'otwarta', 'jezyk', 'neutralna'].includes(a.buzia) ? a.buzia : 'usmiech',
      akcesorium: typeof a.akcesorium === 'string' ? a.akcesorium.slice(0, 8) : ''
    };
    await db.run('UPDATE uczniowie SET avatar_json = ? WHERE id = ?', JSON.stringify(avatar), uczen.id);
    res.json({ ok: true, avatar });
  }));

  // -------- PANEL ADMINISTRATORA (/api/admin/*) -----------------------------
  // Dostęp tylko dla kont z rolą „admin" — pełny wgląd we wszystkie dane.

  app.get('/api/admin/podsumowanie', auth, adminOnly, ah(async (req, res) => {
    const policz = async (sql) => Number((await db.get(sql)).c ?? 0);
    const [nauczyciele, admini, klasy, uczniowie, zestawy, pytania, sesje, gryZakonczone] = await Promise.all([
      policz('SELECT COUNT(*) AS c FROM teachers'),
      policz("SELECT COUNT(*) AS c FROM teachers WHERE rola = 'admin'"),
      policz('SELECT COUNT(*) AS c FROM klasy'),
      policz('SELECT COUNT(*) AS c FROM uczniowie'),
      policz('SELECT COUNT(*) AS c FROM zestawy_pytan'),
      policz('SELECT COUNT(*) AS c FROM pytania'),
      policz('SELECT COUNT(*) AS c FROM sesje'),
      policz("SELECT COUNT(*) AS c FROM sesje WHERE status = 'finished'")
    ]);
    const sumaXpRow = await db.get('SELECT COALESCE(SUM(xp), 0) AS c FROM uczniowie');

    const pokoje = [];
    for (const p of listaPokoi()) {
      const n = await db.get('SELECT imie_nazwisko, email FROM teachers WHERE id = ?', p.teacherId);
      pokoje.push({ ...p, nauczyciel: n?.imie_nazwisko || '—', email: n?.email || '' });
    }

    res.json({
      liczby: {
        nauczyciele, admini, klasy, uczniowie, zestawy, pytania, sesje,
        gryZakonczone,
        sumaXp: Number(sumaXpRow?.c ?? 0)
      },
      system: {
        czas: new Date().toISOString(),
        uptimeSek: Math.round(process.uptime()),
        pamiecMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        rozmiarBazyB: db.rozmiarB(),
        node: process.version
      },
      pokoje
    });
  }));

  app.get('/api/admin/nauczyciele', auth, adminOnly, ah(async (_req, res) => {
    const rows = await db.all(`
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
    `);
    res.json({
      nauczyciele: rows.map((t) => ({
        ...t,
        id: Number(t.id),
        klasy: Number(t.klasy),
        uczniowie: Number(t.uczniowie),
        zestawy: Number(t.zestawy),
        pytania: Number(t.pytania),
        suma_xp: Number(t.suma_xp),
        sesje: Number(t.sesje)
      }))
    });
  }));

  app.patch('/api/admin/nauczyciele/:id/rola', auth, adminOnly, ah(async (req, res) => {
    const id = Number(req.params.id);
    const rola = req.body.rola;
    if (!['admin', 'nauczyciel'].includes(rola)) {
      return res.status(400).json({ error: 'Nieprawidłowa rola.' });
    }
    if (id === req.teacher.id) {
      return res.status(400).json({ error: 'Nie możesz zmienić roli własnego konta.' });
    }
    const cel = await db.get('SELECT * FROM teachers WHERE id = ?', id);
    if (!cel) return res.status(404).json({ error: 'Nie znaleziono konta.' });
    if (rola === 'nauczyciel' && cel.rola === 'admin') {
      const admini = await db.get("SELECT COUNT(*) AS c FROM teachers WHERE rola = 'admin'");
      if (Number(admini?.c ?? 0) <= 1) {
        return res.status(400).json({ error: 'To ostatnie konto administratora — nie można go zdegradować.' });
      }
    }
    await db.run('UPDATE teachers SET rola = ? WHERE id = ?', rola, id);
    res.json({ ok: true });
  }));

  app.delete('/api/admin/nauczyciele/:id', auth, adminOnly, ah(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.teacher.id) {
      return res.status(400).json({ error: 'Nie możesz usunąć własnego konta.' });
    }
    const cel = await db.get('SELECT * FROM teachers WHERE id = ?', id);
    if (!cel) return res.status(404).json({ error: 'Nie znaleziono konta.' });
    await db.withTx(async (tx) => {
      await tx.run('DELETE FROM sesje WHERE teacher_id = ?', id);
      await tx.run('DELETE FROM klasy WHERE teacher_id = ?', id);
      await tx.run('DELETE FROM zestawy_pytan WHERE teacher_id = ?', id);
      await tx.run('DELETE FROM teachers WHERE id = ?', id);
    });
    res.json({ ok: true });
  }));

  app.get('/api/admin/sesje', auth, adminOnly, ah(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const sesje = await db.all(`
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
    `, limit);
    res.json({ sesje: sesje.map((s) => ({ ...s, wynikow: Number(s.wynikow) })) });
  }));

  app.get('/api/admin/sesje/:kod/wyniki', auth, adminOnly, ah(async (req, res) => {
    const sesja = await db.get(`
      SELECT s.*, t.imie_nazwisko AS nauczyciel, k.nazwa AS klasa, z.nazwa AS zestaw
      FROM sesje s
      LEFT JOIN teachers t ON t.id = s.teacher_id
      LEFT JOIN klasy k ON k.id = s.klasa_id
      LEFT JOIN zestawy_pytan z ON z.id = s.zestaw_id
      WHERE s.kod = ?
    `, String(req.params.kod));
    if (!sesja) return res.status(404).json({ error: 'Nie znaleziono sesji.' });
    const wyniki = await db.all(`
      SELECT w.pozycja, w.xp_zdobyte, w.poprawne, w.zycia_zostalo,
             u.imie_nazwisko, u.numer_dziennika, u.avatar_json
      FROM wyniki_gier w
      LEFT JOIN uczniowie u ON u.id = w.uczen_id
      WHERE w.sesja_kod = ?
      ORDER BY w.pozycja ASC
    `, String(req.params.kod));
    res.json({ sesja, wyniki });
  }));

  app.get('/api/admin/eksport', auth, adminOnly, ah(async (_req, res) => {
    const [teachers, klasy, uczniowie, zestawy, pytania, sesje, wyniki_gier, xp_logi] = await Promise.all([
      db.all('SELECT * FROM teachers'),
      db.all('SELECT * FROM klasy'),
      db.all('SELECT * FROM uczniowie'),
      db.all('SELECT * FROM zestawy_pytan'),
      db.all('SELECT * FROM pytania'),
      db.all('SELECT * FROM sesje'),
      db.all('SELECT * FROM wyniki_gier'),
      db.all('SELECT * FROM xp_logi')
    ]);
    res.json({
      aplikacja: 'ClassQuest',
      wyeksportowano: new Date().toISOString(),
      dane: { teachers, klasy, uczniowie, zestawy, pytania, sesje, wyniki_gier, xp_logi }
    });
  }));

  // -------- obsługa błędów JSON --------------------------------------------
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Wewnętrzny błąd serwera.' });
  });
}
