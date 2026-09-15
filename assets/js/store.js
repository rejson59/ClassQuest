/* ==========================================================================
   ClassQuest — rdzeń danych i logiki (bez zależności, działa w przeglądarce)
   --------------------------------------------------------------------------
   Trzy tryby pracy (auto-detekcja, można wymusić w ustawieniach):
     1. lokalny  — localStorage (+ synchronizacja między kartami), zero SETUPU
     2. serwer   — node server.js (ten sam stan widzi tablica i telefony uczniów)
     3. supabase — PostgREST (kloud, gdy podasz URL + klucz w ustawieniach)

   Cała aplikacja mówi do `CQ.store`, więc tryb można zmienić bez ruszania stron.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ===== 0. narzędzia ==================================================== */

  const LS_DB = 'cq_db_v1';
  const LS_CFG = 'cq_config_v1';
  const LS_AUTH = 'cq_auth_v1';
  const LS_STUDENT = 'cq_uczen_v1';

  const TABLES = [
    'nauczyciele', 'klasy', 'uczniowie', 'zestawy', 'pytania',
    'sesje', 'gracze', 'odpowiedzi', 'zgloszenia', 'wpisy_xp', 'meta',
  ];

  const hasDoc = typeof document !== 'undefined';
  const ls = (() => {
    try {
      const t = '__cq';
      global.localStorage.setItem(t, '1');
      global.localStorage.removeItem(t);
      return global.localStorage;
    } catch (e) {
      const mem = {};
      return {
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: (k) => { delete mem[k]; },
      };
    }
  })();

  const uid = () =>
    (global.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

  const nowISO = () => new Date().toISOString();
  const clone = (o) => (o === undefined ? o : JSON.parse(JSON.stringify(o)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function randomCode(len = 6) {
    let out = '';
    for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
    return out;
  }

  function normalizeRow(row) {
    const clean = {};
    for (const [k, v] of Object.entries(row || {})) if (v !== undefined) clean[k] = v;
    return { utworzono: nowISO(), ...clean, id: clean.id || uid() };
  }

  function normalize(str) {
    return String(str == null ? '' : str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ąćęłńóśźż.+ %-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function initials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }

  /* ===== 1. przełącznik trybu (konfiguracja) ============================= */

  function readConfig() {
    const def = {
      mode: 'auto', serwerUrl: '', supabaseUrl: '', supabaseKey: '',
      defaultCzas: 20, punktyBazowe: 1000, bonusCzasowy: 500,
    };
    try {
      return { ...def, ...(JSON.parse(ls.getItem(LS_CFG) || '{}') || {}) };
    } catch (e) {
      return { ...def };
    }
  }

  function writeConfig(patch) {
    const next = { ...readConfig(), ...patch };
    ls.setItem(LS_CFG, JSON.stringify(next));
    return next;
  }

  /* ===== 2. backendy ===================================================== */

  /** Wspólny mechanizm: trzymamy cały stan w pamięci, zapisujemy i rozgłaszamy. */
  function createBaseStore() {
    const listeners = new Set();
    let db = emptyDb();

    function emptyDb() {
      const o = {};
      for (const t of TABLES) o[t] = [];
      return o;
    }

    function emit(info) {
      for (const cb of listeners) {
        try { cb(info); } catch (e) { console.error('[cq] listener:', e); }
      }
    }

    function applyOp(op) {
      const list = (db[op.table] = Array.isArray(db[op.table]) ? db[op.table] : []);
      if (op.type === 'insert') {
        if (!list.some((r) => r.id === op.row.id)) list.push(op.row);
      } else if (op.type === 'update') {
        const i = list.findIndex((r) => r.id === op.id);
        if (i >= 0) list[i] = { ...list[i], ...op.row };
      } else if (op.type === 'delete') {
        db[op.table] = list.filter((r) => r.id !== op.id);
      } else if (op.type === 'replace_table') {
        db[op.table] = op.rows || [];
      }
    }

    return {
      getDb: () => db,
      setDb: (next) => { db = { ...emptyDb(), ...(next || {}) }; emit({ type: 'reloaded' }); },
      emptyDb,
      applyOp,
      emit,
      listeners,
    };
  }

  /* ---- 2a. tryb lokalny ------------------------------------------------- */

  function createLocalBackend(base) {
    let channel = null;
    if (typeof BroadcastChannel !== 'undefined' && typeof window !== 'undefined') {
      channel = new BroadcastChannel('classquest');
      channel.onmessage = (ev) => {
        const msg = ev.data || {};
        if (msg.type === 'ops') { (msg.ops || []).forEach(base.applyOp); base.emit({ type: 'remote', tables: msg.tables }); }
        if (msg.type === 'reload') base.setDb(msg.db);
      };
    }
    if (hasDoc) {
      global.addEventListener('storage', (ev) => {
        if (ev.key === LS_DB) {
          base.setDb(parse(ev.newValue));
          base.emit({ type: 'remote', tables: Object.keys(TABLES) });
        }
      });
    }

    function parse(raw) {
      try { return raw ? JSON.parse(raw) : base.emptyDb(); } catch (e) { return base.emptyDb(); }
    }

    return {
      mode: 'lokalny',
      label: 'Przeglądarka (localStorage)',
      async init() {
        base.setDb(parse(ls.getItem(LS_DB)));
        return { ok: true };
      },
      async persist(ops) {
        const tables = [...new Set(ops.map((o) => o.table))];
        ls.setItem(LS_DB, JSON.stringify(base.getDb()));
        if (channel) channel.postMessage({ type: 'ops', ops, tables });
      },
      async reload() {
        base.setDb(parse(ls.getItem(LS_DB)));
      },
      async replaceAll(next) {
        ls.setItem(LS_DB, JSON.stringify(next));
        base.setDb(next);
        if (channel) channel.postMessage({ type: 'reload', db: next });
      },
      sizeKb() {
        const raw = ls.getItem(LS_DB) || '';
        return Math.round((raw.length / 1024) * 10) / 10;
      },
    };
  }

  /* ---- 2b. tryb serwerowy (node server.js) ------------------------------ */

  function createServerBackend(base, cfg = {}) {
    const B = String(cfg.serwerUrl || '').replace(/\/+$/, '');
    let version = -1;
    let source = null;
    let ok = false;
    let timer = null;

    async function api(relPath, opts) {
      const res = await fetch(B + relPath, { headers: { 'content-type': 'application/json' }, ...opts });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
        throw new Error(msg);
      }
      return res.json();
    }

    async function pull(force) {
      try {
        const data = await api('/api/db');
        if (force || data.version !== version) {
          version = data.version;
          base.setDb(data.db);
          ok = true;
        }
      } catch (e) {
        ok = false;
      }
    }

    return {
      mode: 'serwer',
      get label() { return ok ? 'Serwer klasy (server.js)' : 'Serwer klasy (niedostępny)'; },
      get online() { return ok; },
      async init() {
        try {
          const h = await api('/api/health');
          ok = !!h.ok;
          version = h.version;
          await pull(true);
          if (typeof EventSource !== 'undefined' || typeof global.EventSource !== 'undefined') {
            source = new EventSource(B + '/api/events');
            source.addEventListener('change', (ev) => {
              try {
                const msg = JSON.parse(ev.data);
                if (msg.version !== version) pull(false);
              } catch (e) { pull(false); }
            });
            source.onerror = () => { ok = false; };
          }
          timer = setInterval(() => { if (document.visibilityState !== 'hidden') pull(false); }, 4000);
          return { ok: true };
        } catch (e) {
          ok = false;
          throw e;
        }
      },
      async persist(ops) {
        const out = await api('/api/op', { method: 'POST', body: JSON.stringify({ type: 'bulk', ops }) });
        version = out.version;
      },
      async reload() { await pull(true); },
      async replaceAll(next) {
        await api('/api/op', { method: 'POST', body: JSON.stringify({ type: 'replace_db', db: next }) });
        base.setDb(next);
        await pull(true);
      },
      sizeKb() { return Math.round((JSON.stringify(base.getDb()).length / 1024) * 10) / 10; },
    };
  }

  /* ---- 2c. tryb Supabase (PostgREST przez fetch) ------------------------ */

  function createSupabaseBackend(base, cfg) {
    const root = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
    const key = cfg.supabaseKey || '';
    let ok = false;
    let timer = null;
    let watched = new Set(TABLES);

    async function req(path, opts = {}) {
      const res = await fetch(root + '/rest/v1/' + path, {
        ...opts,
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'content-type': 'application/json',
          prefer: 'return=representation',
          ...(opts.headers || {}),
        },
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = JSON.parse(text); msg = j.message || j.hint || msg; } catch (e) {}
        throw new Error(msg);
      }
      return text ? JSON.parse(text) : null;
    }

    async function pullTable(table) {
      const rows = await req(`${table}?select=*&limit=5000`);
      if (Array.isArray(rows)) {
        base.applyOp({ type: 'replace_table', table, rows });
        base.emit({ type: 'remote', tables: [table] });
      }
    }

    const TABLE_MAP = {
      nauczyciele: 'nauczyciele', klasy: 'cq_klasy', uczniowie: 'cq_uczniowie',
      zestawy: 'zestaw_pytan', pytania: 'pytania', sesje: 'sesje_gier',
      gracze: 'cq_gracze', odpowiedzi: 'cq_odpowiedzi', zgloszenia: 'cq_zgloszenia',
      wpisy_xp: 'cq_wpisy_xp', meta: 'cq_meta',
    };

    return {
      mode: 'supabase',
      get label() { return ok ? 'Supabase (chmura)' : 'Supabase (błąd połączenia)'; },
      get online() { return ok; },
      async init() {
        if (!root || !key) throw new Error('Brak URL lub klucza Supabase');
        await Promise.all([...watched].map((t) => pullTable(t).catch(() => {})));
        ok = true;
        timer = setInterval(() => {
          if (hasDoc && document.visibilityState === 'hidden') return;
          [...watched].forEach((t) => pullTable(t).catch(() => { ok = false; }));
        }, 3000);
        return { ok: true };
      },
      async persist(ops) {
        for (const op of ops) {
          const t = TABLE_MAP[op.table] || op.table;
          if (op.type === 'insert') await req(t, { method: 'POST', body: JSON.stringify(op.row) });
          else if (op.type === 'update') await req(`${t}?id=eq.${op.id}`, { method: 'PATCH', body: JSON.stringify(op.row) });
          else if (op.type === 'delete') await req(`${t}?id=eq.${op.id}`, { method: 'DELETE' });
        }
        const touched = [...new Set(ops.map((o) => o.table))];
        await Promise.all(touched.map((t) => pullTable(t).catch(() => {})));
      },
      async reload() { await Promise.all([...watched].map((t) => pullTable(t).catch(() => {}))); },
      async replaceAll() { throw new Error('Nadpisywanie całej bazy chmurowej jest zablokowane — użyj eksportu/importu'); },
      setWatch(tables) { watched = new Set(tables && tables.length ? tables : TABLES); },
      sizeKb() { return Math.round((JSON.stringify(base.getDb()).length / 1024) * 10) / 10; },
    };
  }

  /* ===== 3. CQ.store — fasada ============================================ */

  const base = createBaseStore();
  let backend = null;
  let readyPromise = null;

  async function pickBackend() {
    const cfg = readConfig();
    if (cfg.mode === 'supabase') {
      if (!cfg.supabaseUrl || !cfg.supabaseKey) throw new Error('Wybrano tryb Supabase, ale brakuje URL lub klucza (Ustawienia → Gdzie mieszkają dane).');
      return createSupabaseBackend(base, cfg);
    }
    if (cfg.mode === 'lokalny') return createLocalBackend(base);

    // 'serwer' (wymuszone) albo 'auto' na http(s): próbujemy połączenia z server.js
    const moznaSerwer = cfg.mode === 'serwer' || Boolean(cfg.serwerUrl)
      || (global.location && /^https?:$/.test(global.location.protocol));
    if (moznaSerwer) {
      const b = createServerBackend(base, cfg);
      try {
        await b.init();
        return b;
      } catch (e) {
        if (cfg.mode === 'serwer') {
          throw new Error('Serwer synchronizacji nie odpowiada: ' + e.message + ' (uruchom `node server.js` albo wróć do trybu lokalnego w Ustawieniach)');
        }
        console.info('[cq] tryb serwerowy niedostępny (' + e.message + ') — pracuję na danych lokalnych.');
      }
    }
    return createLocalBackend(base);
  }

  const store = {
    get db() { return base.getDb(); },
    get backend() { return backend; },
    get mode() { return backend ? backend.mode : 'lokalny'; },
    get modeLabel() { return backend ? backend.label : '—'; },

    async ready() {
      if (!readyPromise) {
        readyPromise = (async () => {
          backend = await pickBackend();
          await backend.init();
          if (!base.getDb().uczniowie.length && !base.getDb().nauczyciele.length) {
            await seedAll();
          }
          return true;
        })().catch((err) => {
          readyPromise = null;
          throw err;
        });
      }
      return readyPromise;
    },

    /** Podgląd tabeli */
    table(name) { return base.getDb()[name] || []; },
    byId(name, id) { return (base.getDb()[name] || []).find((r) => r.id === id) || null; },
    where(name, pred) { return (base.getDb()[name] || []).filter(pred); },

    /** Zapis: operacje trafiają do pamięci natychmiast, potem na backend. */
    async write(ops) {
      ops.forEach(base.applyOp);
      base.emit({ type: 'local', tables: [...new Set(ops.map((o) => o.table))] });
      try { await backend.persist(ops); } catch (err) { console.error('[cq] zapis nieudany:', err); throw err; }
      return ops.map((o) => o.row).filter(Boolean);
    },

    insert(table, row) {
      const full = normalizeRow(row);
      return this.write([{ type: 'insert', table, row: full }]).then(() => full);
    },
    async insertMany(table, rows) {
      const fulls = rows.map(normalizeRow);
      await this.write(fulls.map((row) => ({ type: 'insert', table, row })));
      return fulls;
    },
    update(table, id, patch) {
      return this.write([{ type: 'update', table, id, row: { ...patch, updated_at: nowISO() } }]);
    },
    remove(table, id) { return this.write([{ type: 'delete', table, id }]); },
    removeWhere(table, pred) {
      const ops = this.table(table).filter(pred).map((r) => ({ type: 'delete', table, id: r.id }));
      return ops.length ? this.write(ops) : Promise.resolve();
    },

    onChange(cb) { base.listeners.add(cb); return () => base.listeners.delete(cb); },
    watchSupabase(tables) { if (backend && backend.setWatch) backend.setWatch(tables); },
    async reloadAll() { if (backend && backend.reload) await backend.reload(); },
    async replaceAllDb(next) {
      const merged = { ...base.emptyDb(), ...next };
      await backend.replaceAll(merged);
      base.setDb(merged);
      return true;
    },
    storageKb() { return backend ? backend.sizeKb() : 0 },
    resetRuntime() { readyPromise = null; backend = null; },
  };

  /* ===== 4. hasła ======================================================== */

  async function hashPassword(pw, salt) {
    const input = `${salt}::${pw}`;
    if (global.crypto && crypto.subtle && crypto.subtle.digest) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
    return 'djb2-' + h.toString(16);
  }

  /* ===== 5. dane demo (seed) ============================================ */

  const PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];
  const HATS = ['👑', '🎓', '🎧', '🚀', '🦄', '⚡'];

  const IMIONA = [
    'Jan Kowalski', 'Anna Nowak', 'Piotr Wiśniewski', 'Katarzyna Zielińska', 'Szymon Lewandowski',
    'Maja Wójcik', 'Filip Kamiński', 'Zuzanna Mazur', 'Antoni Krawczyk', 'Lena Piotrowska',
    'Michał Zając', 'Alicja Król', 'Wojciech Górski', 'Emilia Pawlak', 'Kacper Jabłoński',
    'Nadia Wrona', 'Ignacy Kaczmarek', 'Julia Kowalczyk', 'Aleksander Malinowski', 'Hanna Jasinska',
    'Bruno Romanowski', 'Oliwia Żukowska', 'Franciszek Adamczyk', 'Marianna Sobczak',
  ];

  function banki() {
    const q = (tresc, typ, extra = {}) => ({
      tresc, typ, punkty: 100, wytlumaczenie: '', kolejnosc: 0,
      opcja_a: '', opcja_b: '', opcja_c: '', opcja_d: '', poprawna_opcja: '', poprawna_odp: '',
      ...extra,
    });
    const abcd = (tresc, a, b, c, d, poprawna, why) =>
      q(tresc, 'abcd', { opcja_a: a, opcja_b: b, opcja_c: c, opcja_d: d, poprawna_opcja: poprawna, wytlumaczenie: why });
    const pf = (tresc, poprawna, why) =>
      q(tresc, 'pf', { opcja_a: 'Prawda', opcja_b: 'Fałsz', poprawna_opcja: poprawna, wytlumaczenie: why });
    const otw = (tresc, odp, why) =>
      q(tresc, 'otwarte', { poprawna_odp: odp, wytlumaczenie: why || '' });

    return {
      'matma': [
        abcd('Ile wynosi 1/2 + 1/4?', '3/4', '2/6', '1/8', '2/4', 'A', 'Wspólny mianownik to 4, więc 2/4 + 1/4 = 3/4.'),
        abcd('Który ułamek jest największy?', '1/3', '1/2', '2/7', '3/10', 'B', 'Im mniejszy mianownik przy tej samej liczniku — tym większa wartość.'),
        pf('Ułamek 7/7 jest równy 1.', 'A', 'Licznik i mianownik są takie same, więc wartość to 1.'),
        abcd('Ile to 0,5 w postaci ułamka zwykłego?', '1/2', '1/5', '5/1', '1/20', 'A', '0,5 = 5/10 = 1/2.'),
        otw('Ile wynosi 3/4 z liczby 20?', '15;piętnaście', '20 : 4 · 3 = 15.'),
        abcd('Które liczby są względnie pierwsze?', '8 i 9', '6 i 9', '4 i 8', '10 i 15', 'A', 'NWD(8,9) = 1, reszta par ma wspólny dzielnik.'),
        pf('Suma kątów w trójkącie wynosi 180°.', 'A', 'To twierdzenie wynika z równoległości podstawy i ramion.'),
        abcd('Ile to 12 · 12?', '124', '144', '132', '154', 'B', '12 · 12 = 144.'),
        otw('Podaj liczbę, która ma dokładnie 3 dzielniki: 4, 6, 9?', '4;dwa;2', '4 ma dzielniki 1, 2, 4.'),
        abcd('Który wynik jest poprawny dla 2/3 ÷ 1/6?', '4', '1/9', '9', '1/4', 'A', 'Dzielenie = mnożenie przez odwrotność: 2/3 · 6 = 4.'),
      ],
      'przyroda': [
        abcd('Który narząd wymienia gazy we krwi?', 'płuca', 'wątroba', 'nerka', 'śledziona', 'A', 'W pęcherzykach płucnych zachodzi wymiana tlenu i dwutlenku węgla.'),
        pf('Serce jest mięśniem.', 'A', 'Serce zbudowane jest z mięśnia sercowego, który pracuje rytmicznie.'),
        abcd('Ile komór ma serce człowieka?', '4', '2', '3', '5', 'A', 'Dwa przedsionki i dwie komory.'),
        otw('Jak nazywa się proces, w którym roślina wytwarza glukozę?', 'fotosynteza;fotosynteza swietlna', 'Fotosynteza zachodzi w chloroplastach przy udziale światła.'),
        abcd('Który gaz pobieramy przy oddychaniu?', 'tlen', 'azot', 'dwutlenek węgla', 'argon', 'A', 'Pobieramy tlen, wydychamy mieszaninę z większą ilością CO₂.'),
        pf('Krew w żyłach zawsze jest ciemna.', 'B', 'W żyłach płucnych płynie krew bogata w tlen — jest jasna.'),
        abcd('Największy organ człowieka to:', 'skóra', 'wątroba', 'mózg', 'płuco', 'A', 'Skóra stanowi ok. 15% masy ciała.'),
        otw('Ile odcinków ma kręgosłup człowieka (szyjny, piersiowy, lędźwiowy, krzyżowy, guziczny) — podaj liczbę?', '5;pięć', 'To pięć odcinków.'),
      ],
      'historia': [
        abcd('W którym roku wybuchła II wojna światowa?', '1939', '1918', '1945', '1933', 'A', '1 września 1939 — atak na Polskę.'),
        abcd('Kto był pierwszym królem Polski (koronowanym)?', 'Bolesław Chrobry', 'Mieszko I', 'Kazimierz Wielki', 'Jan III Sobieski', 'A', 'Koronacja w 1025 roku.'),
        pf('Bitwa pod Grunwaldem rozegrała się w 1410 roku.', 'A', '15 lipca 1410 — zwycięstwo nad Zakonem Krzyżackim.'),
        otw('Jak nazywa się unia Polski i Litwy z 1569 roku?', 'lubelska;unia lubelska', 'Unia lubelska stworzyła Rzeczpospolitą Obojga Narodów.'),
        abcd('Która bitwa jest uznawana za początek końca napoleońskiej kampanii?', 'Leipzig', 'Waterloo', 'Austerlitz', 'Underwood', 'A', 'Klęska pod Lipskiem w 1813 r.'),
        pf('Rococo poprzedziło barok w sztuce europejskiej.', 'B', 'Kolejność jest odwrotna: barok → rokoko → klasycyzm.'),
        abcd('Co to jest „Polski Ład" w historii XX wieku?', 'hasło programowe, nie ustrój', 'konstytucja', 'traktat', 'podatek', 'A', 'To określenie programów gospodarczych, nie dokumentu prawnego.'),
      ],
      'polski': [
        abcd('Który wyraz jest rzeczownikiem?', 'bieganie', 'szybko', 'biec', 'biegnący', 'A', 'Rzeczownik odpowiada na pytanie „co?".'),
        pf('Przymiotnik odpowiada na pytanie „jaki?", „jaka?", „jakie?"', 'A', 'To podstawowa cecha przymiotnika.'),
        abcd('Które zdanie jest zapisane poprawnie?', 'Dałem mu książkę.', 'Dałem jemu książkę.', 'Dalem mu ksiazke', 'Dać mu książkę', 'A', 'Zaimki „jemu" używamy w mowie potocznej, w zapisie poprawna forma to „mu".'),
        otw('Podaj czasownik w bezokoliczniku od formy „czytasz"', 'czytać', 'Forma podstawowa to bezokolicznik.'),
        abcd('Ile przypadków ma rzeczownik w języku polskim?', '7', '5', '6', '8', 'A', 'm., dop., cel., biernik, nar., miejsc., wołacz.'),
      ],
      'informatyka': [
        abcd('Co oznacza skrót CPU?', 'jednostka centralna', 'pamięć masowa', 'karta sieciowa', 'system plików', 'A', 'Central Processing Unit.'),
        pf('HTML jest językiem programowania.', 'B', 'HTML to język znaczników — nie wykonuje logiki.'),
        abcd('Który rekord w bazie danych jest unikalny?', 'klucz główny', 'indeks', 'widok', 'kolumna', 'A', 'PRIMARY KEY musi być unikalny i niepusty.'),
        otw('Jak nazywa się usługa przechowująca dane w przeglądarce między sesjami? (localStorage / sessionStorage — wpisz jedno)', 'localstorage;sessionstorage;storage', 'To pamięć lokalna przeglądarki.'),
        abcd('Ile bitów to jeden bajt?', '8', '4', '16', '2', 'A', '1 B = 8 bitów.'),
        pf('Algorytm może być nieskończony.', 'B', 'Jedną z cech algorytmu jest skończoność.'),
      ],
    };
  }

  async function seedAll() {
    const db = base.emptyDb();
    const t = nowISO();

    const solA = uid().slice(0, 8);
    const admin = {
      id: uid(), imie_nazwisko: 'Administrator', email: 'admin@classquest.pl',
      haslo_hash: await hashPassword('admin123', solA), sol: solA, rola: 'admin',
      przedmiot: '—', utworzono: t,
    };
    const solT = 'demo1234';
    const teacher = {
      id: uid(), imie_nazwisko: 'Anna Kowalczyk', email: 'anna.kowalczyk@szkola.pl',
      haslo_hash: await hashPassword('demo123', solT), sol: solT, rola: 'nauczyciel',
      przedmiot: 'matematyka i przyroda', utworzono: t,
    };
    db.nauczyciele.push(admin, teacher);

    const klasDef = [
      { nazwa: '5A', opis: 'Szkoła podstawowa, wychowawczyni p. Kowalczyk', kolor: '#2563eb', n: 10 },
      { nazwa: '7B', opis: 'Klasa sportowa', kolor: '#10b981', n: 9 },
      { nazwa: '3G', opis: 'Przygotowanie do egzaminu', kolor: '#f59e0b', n: 6 },
    ];
    const klasek = klasDef.map((k, i) => ({
      id: uid(), nauczyciel_id: teacher.id, nazwa: k.nazwa, opis: k.opis,
      kolor: k.kolor, kod: String(1201 + i), utworzono: t, _n: k.n,
    }));
    db.klasy = klasek.map(({ _n, ...rest }) => rest);

    let nameIdx = 0;
    klasek.forEach((k) => {
      for (let i = 0; i < k._n; i++) {
        db.uczniowie.push({
          id: uid(), klasa_id: k.id, numer: i + 1, nazwa: IMIONA[nameIdx % IMIONA.length],
          kolor: PALETTE[i % PALETTE.length], nakrycie: HATS[i % HATS.length],
          xp: Math.round((Math.random() * 1800 + 100) / 10) * 10, utworzono: t,
        });
        nameIdx++;
      }
    });

    const bankiObj = banki();
    const meta = [
      ['matma', 'Matma: ułamki i działania', '5A', 'matematyka', 'Rozgrzewka przed kartkówką — 10 pytań, różne typy.'],
      ['przyroda', 'Przyroda: człowiek i jego ciało', '5A', 'przyroda', 'Układ oddechowy, krwionośny, skóra.'],
      ['historia', 'Historia: daty i fakty', '7B', 'historia', 'Powtórka przed sprawdzianem z działu 2.'],
      ['polski', 'Język polski: części mowy', '3G', 'język polski', 'Krótki zestaw powtórkowy dla klasy ósmej/trzeciej.'],
      ['informatyka', 'Informatyka: podstawy', '7B', 'informatyka', 'Sprzęt, dane, algorytmy.'],
    ];
    meta.forEach(([key, nazwa, klasa, przedmiot, opis]) => {
      const klasaRow = db.klasy.find((k) => k.nazwa === klasa);
      const zestaw = {
        id: uid(), nauczyciel_id: teacher.id, klasa_id: klasaRow ? klasaRow.id : null,
        nazwa_zestawu: nazwa, przedmiot, opis, utworzono: t,
      };
      db.zestawy.push(zestaw);
      (bankiObj[key] || []).forEach((question, i) => {
        db.pytania.push({ ...question, id: uid(), zestaw_id: zestaw.id, kolejnosc: i + 1, utworzono: t });
      });
    });

    // Jedna gotowa sesja „na już" + historyjne rozegrane, żeby były wyniki.
    const firstSet = db.zestawy[0];
    db.sesje.push({
      id: uid(), kod: '246810', nauczyciel_id: teacher.id, klasa_id: firstSet.klasa_id,
      zestaw_id: firstSet.id, tryb: 'klasyczny', status: 'lobby', indeks: 0, limit_s: 20,
      start_od: null, utworzono: t, zakonczo: null, nagroda_xp: true,
      nota: 'Sesja demonstracyjna — otwórz panel nauczyciela i kliknij Start.',
    });

    // Symulacja dwóch zakończonych gier (dane do wyników / XP).
    const questionRows = (zestawId) =>
      db.pytania.filter((p) => p.zestaw_id === zestawId).sort((a, b) => a.kolejnosc - b.kolejnosc);

    for (let s = 0; s < 2; s++) {
      const zestaw = db.zestawy[s];
      const qs = questionRows(zestaw.id);
      const players = db.uczniowie.filter((u) => u.klasa_id === zestaw.klasa_id).slice(0, 8);
      const sesja = {
        id: uid(), kod: randomCode(), nauczyciel_id: teacher.id, klasa_id: zestaw.klasa_id,
        zestaw_id: zestaw.id, tryb: s === 0 ? 'klasyczny' : 'ekspres', status: 'koniec', indeks: qs.length,
        limit_s: 20, utworzono: new Date(Date.now() - (s + 1) * 86400000).toISOString(),
        zakonczo: new Date(Date.now() - (s + 1) * 86400000 + 1200000).toISOString(), nagroda_xp: true,
      };
      db.sesje.push(sesja);
      const graczRows = players.map((u) => ({
        id: uid(), sesja_id: sesja.id, uczen_id: u.id, nazwa: u.nazwa,
        kolor: u.kolor, nakrycie: u.nakrycie, zespol: PALETTE.indexOf(u.kolor) % 4, utworzono: sesja.utworzono,
      }));
      db.gracze.push(...graczRows);

      graczRows.forEach((g) => {
        let punkty = 0;
        qs.forEach((p) => {
          const good = Math.random() < 0.62;
          const czas = Math.round(3000 + Math.random() * 9000);
          if (good) punkty += 1000 + Math.max(0, Math.round(500 - (czas / 20000) * 500));
          db.odpowiedzi.push({
            id: uid(), sesja_id: sesja.id, gracz_id: g.id, pytanie_id: p.id,
            tresc: good ? p.poprawna_opcja ? String.fromCharCode(64 + 'ABCD'.indexOf(p.poprawna_opcja)) : p.poprawna_odp.split(';')[0]
                        : 'B', poprawna: good, punkty: good ? Math.round((1000 + Math.max(0, 500 - czas / 40)) / 10) * 10 : 0,
            czas_ms: czas, utworzono: sesja.utworzono,
          });
        });
        db.wpisy_xp.push({
          id: uid(), uczen_id: g.uczen_id, kwota: Math.round(punkty / 1000) + 2,
          powod: `Wynik gry: ${setazwaSafe(zestaw)}`, typ: 'gra', sesja_id: sesja.id, utworzono: sesja.zakonczo,
        });
      });
    }

    // Pary otwartych wniosków XP, żeby panel nauczyciela miał co zatwierdzać.
    const someStudents = db.uczniowie.slice(0, 3);
    someStudents.forEach((u, i) => {
      db.zgloszenia.push({
        id: uid(), nauczyciel_id: teacher.id, uczen_id: u.id, sesja_id: null,
        tytul: ['Zadanie domowe — ułamki', 'Dodatkowe ćwiczenia z przyrody', 'Projekt: makieta układu krążenia'][i],
        opis: ['Rozwiązane wszystkie przykłady ze strony 42.', 'Karta pracy + notatka z lekcji.', 'Praca w grupie dwuosobowej, prezentacja w piątek.'][i],
        xp: [40, 25, 60][i], status: 'oczekuje', utworzono: t, rozstrzygnieto: null,
      });
    });

    db.meta.push({ id: 'seed', key: 'seed', wersja: 1, utworzono: t, note: 'Dane demonstracyjne ClassQuest' });

    base.setDb(db);
    await backend.replaceAll(clone(db));
    return true;
  }

  function setazwaSafe(z) { return (z && z.nazwa_zestawu) || 'zestaw'; }

  /* ===== 6. logika domenowa ============================================== */

  const POZIOM_PROG = 400;
  const POZIOM_NAZWY = ['Żółtodziób', 'Uczeń', 'Odkrywca', 'Zadaniowiec', 'Ekspert', 'Mistrz', 'Weteran', 'Legenda', 'Ekspert kwantowy', 'Arbiter quizów'];

  function poziomZxp(xp) {
    const n = Math.max(1, Math.floor((xp || 0) / POZIOM_PROG) + 1);
    return { poziom: n, nazwa: POZIOM_NAZWY[Math.min(n - 1, POZIOM_NAZWY.length - 1)], doKolejnego: POZIOM_PROG - ((xp || 0) % POZIOM_PROG), postep: ((xp || 0) % POZIOM_PROG) / POZIOM_PROG };
  }

  const Auth = {
    async register({ imieNazwisko, email, haslo, przedmiot }) {
      if (!imieNazwisko || imieNazwisko.trim().length < 3) throw new Error('Imię i nazwisko musi mieć min. 3 znaki.');
      if (!haslo || haslo.length < 5) throw new Error('Hasło musi mieć min. 5 znaków.');
      const istniejacy = store.where('nauczyciele', (n) => normalize(n.imie_nazwisko) === normalize(imieNazwisko));
      if (istniejacy.length) throw new Error('Nauczyciel o tym nazwisku już istnieje — spróbuj się zalogować.');
      if (email && store.where('nauczyciele', (n) => normalize(n.email) === normalize(email)).length) {
        throw new Error('Ten e-mail jest już zajęty.');
      }
      const sol = uid().slice(0, 8);
      const row = await store.insert('nauczyciele', {
        imie_nazwisko: imieNazwisko.trim(), email: (email || '').trim(), rola: 'nauczyciel',
        przedmiot: przedmiot || '', haslo_hash: await hashPassword(haslo, sol), sol,
      });
      await Auth._setSession(row);
      return row;
    },

    async login({ login, haslo }) {
      const key = normalize(login);
      const row = store.where('nauczyciele', (n) => normalize(n.imie_nazwisko) === key || normalize(n.email) === key)[0];
      if (!row) throw new Error('Nie znaleziono takiego konta.');
      const hash = await hashPassword(haslo, row.sol || '');
      if (hash !== row.haslo_hash) throw new Error('Nieprawidłowe hasło.');
      await store.update('nauczyciele', row.id, { ost_logowanie: nowISO() });
      await Auth._setSession(row);
      return row;
    },

    async _setSession(row) {
      const ses = { id: row.id, imie_nazwisko: row.imie_nazwisko, email: row.email, rola: row.rola, token: uid(), czas: nowISO() };
      ls.setItem(LS_AUTH, JSON.stringify(ses));
      return ses;
    },

    current() {
      try { return JSON.parse(ls.getItem(LS_AUTH) || 'null'); } catch (e) { return null; }
    },
    logout() { ls.removeItem(LS_AUTH); },
    async changePassword(userId, newHaslo) {
      if (!newHaslo || newHaslo.length < 5) throw new Error('Hasło musi mieć min. 5 znaków.');
      const sol = uid().slice(0, 8);
      await store.update('nauczyciele', userId, { haslo_hash: await hashPassword(newHaslo, sol), sol });
      return true;
    },
  };

  /** Identyfikacja ucznia na tym urządzeniu (bez konta — jak w Kahoot). */
  const Student = {
    current() {
      try { return JSON.parse(ls.getItem(LS_STUDENT) || 'null'); } catch (e) { return null; }
    },
    save(patch) {
      const next = { ...(Student.current() || {}), ...patch };
      ls.setItem(LS_STUDENT, JSON.stringify(next));
      return next;
    },
    clear() { ls.removeItem(LS_STUDENT); },
    row(id) { return store.byId('uczniowie', id || (Student.current() || {}).uczen_id); },
  };

  const Klasy = {
    list(nauczycielId) {
      return store.where('klasy', (k) => !nauczycielId || k.nauczyciel_id === nauczycielId);
    },
    withStats(nauczycielId) {
      return Klasy.list(nauczycielId).map((k) => ({
        ...k,
        uczniowie: Klasy.uczniowie(k.id),
        zestawy: store.where('zestawy', (z) => z.klasa_id === k.id).length,
      })).sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
    },
    uczniowie(klasaId) {
      return store.where('uczniowie', (u) => u.klasa_id === klasaId).sort((a, b) => (a.numer || 99) - (b.numer || 99));
    },
    async create(nauczycielId, { nazwa, opis, kolor }) {
      if (!nazwa || !nazwa.trim()) throw new Error('Podaj nazwę klasy.');
      const kod = await Klasy.freeCode();
      return store.insert('klasy', { nauczyciel_id: nauczycielId, nazwa: nazwa.trim(), opis: (opis || '').trim(), kolor: kolor || PALETTE[0], kod });
    },
    async freeCode() {
      let kod;
      do { kod = randomCode(4); } while (store.where('klasy', (k) => k.kod === kod).length);
      return kod;
    },
    async update(id, patch) { return store.update('klasy', id, patch); },
    async remove(id) {
      const uczniowie = Klasy.uczniowie(id).map((u) => u.id);
      const ops = [];
      ops.push({ type: 'delete', table: 'klasy', id });
      for (const u of uczniowie) {
        ops.push({ type: 'delete', table: 'uczniowie', id: u });
        store.table('wpisy_xp').filter((w) => w.uczen_id === u).forEach((w) => ops.push({ type: 'delete', table: 'wpisy_xp', id: w.id }));
        store.table('zgloszenia').filter((w) => w.uczen_id === u).forEach((w) => ops.push({ type: 'delete', table: 'zgloszenia', id: w.id }));
      }
      store.table('sesje').filter((s) => s.klasa_id === id).forEach((s) => {
        ops.push({ type: 'delete', table: 'sesje', id: s.id });
        store.table('gracze').filter((g) => g.sesja_id === s.id).forEach((g) => {
          ops.push({ type: 'delete', table: 'gracze', id: g.id });
          store.table('odpowiedzi').filter((o) => o.gracz_id === g.id).forEach((o) => ops.push({ type: 'delete', table: 'odpowiedzi', id: o.id }));
        });
      });
      store.table('zestawy').filter((z) => z.klasa_id === id).forEach((z) => {
        ops.push({ type: 'delete', table: 'zestawy', id: z.id });
        store.table('pytania').filter((p) => p.zestaw_id === z.id).forEach((p) => ops.push({ type: 'delete', table: 'pytania', id: p.id }));
      });
      await store.write(ops);
      return true;
    },
  };

  const Uczniowie = {
    async add(klasaId, nazwa, numer, extra = {}) {
      if (!nazwa || !nazwa.trim()) throw new Error('Podaj imię i nazwisko.');
      const used = Klasy.uczniowie(klasaId);
      return store.insert('uczniowie', {
        klasa_id: klasaId, nazwa: nazwa.trim(), numer: numer || used.length + 1,
        kolor: PALETTE[used.length % PALETTE.length], nakrycie: HATS[used.length % HATS.length],
        xp: 0, ...extra,
      });
    },
    /** Wklejone listy: "1. Jan Kowalski" albo jedno nazwisko w linii. */
    async addBulk(klasaId, text) {
      const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const used = Klasy.uczniowie(klasaId);
      const rows = lines.map((line, i) => {
        const m = line.match(/^(\d+)[.)\s-]+(.*)$/);
        const numer = m ? Number(m[1]) : used.length + i + 1;
        const nazwa = (m ? m[2] : line).trim();
        return {
          klasa_id: klasaId, nazwa, numer, xp: 0,
          kolor: PALETTE[(used.length + i) % PALETTE.length],
          nakrycie: HATS[(used.length + i) % HATS.length],
        };
      }).filter((r) => r.nazwa);
      return store.insertMany('uczniowie', rows);
    },
    async remove(id) {
      const ops = [];
      store.table('wpisy_xp').filter((w) => w.uczen_id === id).forEach((w) => ops.push({ type: 'delete', table: 'wpisy_xp', id: w.id }));
      store.table('zgloszenia').filter((w) => w.uczen_id === id).forEach((w) => ops.push({ type: 'delete', table: 'zgloszenia', id: w.id }));
      ops.push({ type: 'delete', table: 'uczniowie', id });
      await store.write(ops);
    },
    async awardXp(uczenId, kwota, powod, typ = 'manualne', sesjaId = null) {
      const uczen = store.byId('uczniowie', uczenId);
      if (!uczen) throw new Error('Nie znaleziono ucznia.');
      const n = Number(kwota);
      if (!Number.isFinite(n) || n === 0) throw new Error('Podaj liczbę punktów różną od zera.');
      const wpis = await store.insert('wpisy_xp', {
        uczen_id: uczenId, kwota: Math.round(n), powod: (powod || '—').trim(), typ, sesja_id: sesjaId,
      });
      await store.update('uczniowie', uczenId, { xp: Math.max(0, (uczen.xp || 0) + Math.round(n)) });
      return wpis;
    },
    historia(uczenId) {
      return store.where('wpisy_xp', (w) => w.uczen_id === uczenId).sort((a, b) => String(b.utworzono).localeCompare(String(a.utworzono)));
    },
  };

  const Zestawy = {
    list(nauczycielId) {
      return store.where('zestawy', (z) => !nauczycielId || z.nauczyciel_id === nauczycielId);
    },
    details(nauczycielId) {
      return Zestawy.list(nauczycielId).map((z) => ({
        ...z,
        pytania: Zestawy.pytania(z.id),
        klasa: store.byId('klasy', z.klasa_id),
        grane: store.where('sesje', (s) => s.zestaw_id === z.id).length,
      })).sort((a, b) => String(b.utworzono).localeCompare(String(a.utworzono)));
    },
    pytania(zestawId) {
      return store.where('pytania', (p) => p.zestaw_id === zestawId).sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0));
    },
    async create(nauczycielId, { nazwa_zestawu, przedmiot, opis, klasa_id }) {
      if (!nazwa_zestawu || !nazwa_zestawu.trim()) throw new Error('Podaj nazwę zestawu.');
      return store.insert('zestawy', {
        nauczyciel_id: nauczycielId, nazwa_zestawu: nazwa_zestawu.trim(),
        przedmiot: przedmiot || '', opis: opis || '', klasa_id: klasa_id || null,
      });
    },
    update(id, patch) { return store.update('zestawy', id, patch); },
    async remove(id) {
      const ops = [{ type: 'delete', table: 'zestawy', id }];
      store.table('pytania').filter((p) => p.zestaw_id === id).forEach((p) => ops.push({ type: 'delete', table: 'pytania', id: p.id }));
      await store.write(ops);
    },
    async duplicate(id, nauczycielId) {
      const src = store.byId('zestawy', id);
      if (!src) throw new Error('Brak zestawu.');
      const copy = await store.insert('zestawy', {
        ...src, id: undefined, nazwa_zestawu: src.nazwa_zestawu + ' (kopia)', nauczyciel_id: nauczycielId || src.nauczyciel_id,
      });
      const qs = Zestawy.pytania(id);
      await store.insertMany('pytania', qs.map((q, i) => ({ ...q, id: undefined, zestaw_id: copy.id, kolejnosc: i + 1 })));
      return copy;
    },
    async saveQuestion(zestawId, data, existingId) {
      const count = Zestawy.pytania(zestawId).length;
      const row = {
        zestaw_id: zestawId,
        tresc: String(data.tresc || '').trim(),
        typ: data.typ || 'abcd',
        opcja_a: data.opcja_a || '', opcja_b: data.opcja_b || '',
        opcja_c: data.typ === 'abcd' ? (data.opcja_c || '') : '',
        opcja_d: data.typ === 'abcd' ? (data.opcja_d || '') : '',
        poprawna_opcja: data.poprawna_opcja || '',
        poprawna_odp: data.poprawna_odp || '',
        punkty: Number(data.punkty) || 100,
        czas: Number(data.czas) || 20,
        wytlumaczenie: data.wytlumaczenie || '',
        kolejnosc: Number(data.kolejnosc) || count + 1,
      };
      if (!row.tresc) throw new Error('Treść pytania nie może być pusta.');
      if (row.typ === 'abcd' && (!row.opcja_a || !row.opcja_b || !'ABCD'.includes(row.poprawna_opcja))) {
        throw new Error('Pytanie A/B/C/D wymaga dwóch pierwszych odpowiedzi i wskazanej poprawnej.');
      }
      if (row.typ === 'pf' && !'AB'.includes(row.poprawna_opcja)) throw new Error('Wybierz, czy poprawna jest Prawda, czy Fałsz.');
      if (row.typ === 'otwarte' && !row.poprawna_odp.trim()) throw new Error('Podaj przynajmniej jedną poprawną odpowiedź (rozdziel średnikami).');
      if (existingId) { await store.update('pytania', existingId, row); return store.byId('pytania', existingId); }
      return store.insert('pytania', row);
    },
    async moveQuestion(id, dir) {
      const q = store.byId('pytania', id);
      if (!q) return;
      const all = Zestawy.pytania(q.zestaw_id);
      const i = all.findIndex((x) => x.id === id);
      const j = i + dir;
      if (j < 0 || j >= all.length) return;
      const swap = all[j];
      await store.write([
        { type: 'update', table: 'pytania', id: q.id, row: { kolejnosc: swap.kolejnosc } },
        { type: 'update', table: 'pytania', id: swap.id, row: { kolejnosc: q.kolejnosc } },
      ]);
    },
    async exportJson(id) {
      const z = store.byId('zestawy', id);
      return { klasa: 'classquest-zestaw-v1', ...z, pytania: Zestawy.pytania(id).map(({ id: _id, zestaw_id: _z, ...rest }) => rest) };
    },
    async importJson(nauczycielId, payload) {
      if (!payload || !payload.klasa || payload.klasa !== 'classquest-zestaw-v1') throw new Error('Nieznany format pliku.');
      const zestaw = await store.insert('zestawy', {
        nauczyciel_id: nauczycielId, nazwa_zestawu: payload.nazwa_zestawu + ' (import)',
        przedmiot: payload.przedmiot || '', opis: payload.opis || '', klasa_id: payload.klasa_id || null,
      });
      const qs = (payload.pytania || []).map((q, i) => ({ ...q, zestaw_id: zestaw.id, kolejnosc: i + 1, id: uid() }));
      if (qs.length) await store.insertMany('pytania', qs);
      return { zestaw, liczba: qs.length };
    },
  };

  /* ---- gry ------------------------------------------------------------- */

  const TRYBY = {
    klasyczny: { nazwa: 'Klasyczny', opis: 'Każde pytanie ma własny limit czasu, punkty za szybkość i serię.', ikona: '🎯' },
    ekspres: { nazwa: 'Ekspres', opis: 'Krótki czas (8 s), podwójne bonusy za serię. Maks. 10 pytań.', ikona: '⚡' },
    druzyny: { nazwa: 'Drużynowy', opis: 'Wyniki liczone dla 4 drużyn — rywalizacja zespołowa.', ikona: '🤝' },
    trening: { nazwa: 'Trening solo', opis: 'Bez presji czasu i rankingu — nauka na własnej ręce.', ikona: '🧘' },
  };

  const ZESPOLY = [
    { nazwa: 'Niebiescy', kolor: '#2563eb', emoji: '💠' },
    { nazwa: 'Pomarańczowi', kolor: '#f59e0b', emoji: '🔶' },
    { nazwa: 'Zieloni', kolor: '#10b981', emoji: '🍀' },
    { nazwa: 'Różowi', kolor: '#ec4899', emoji: '🌸' },
  ];

  const Gra = {
    async createSession({ nauczycielId, klasaId, zestawId, tryb = 'klasyczny', limitS, nagrodaXp = true }) {
      const pytania = Zestawy.pytania(zestawId);
      if (!pytania.length) throw new Error('Ten zestaw nie ma jeszcze pytań — dodaj pytania w banku.');
      let kod;
      let guard = 0;
      do { kod = randomCode(); guard++; } while (
        store.where('sesje', (s) => s.kod === kod && s.status !== 'koniec').length && guard < 40
      );
      const cfg = readConfig();
      const sesja = await store.insert('sesje', {
        kod,
        nauczyciel_id: nauczycielId, klasa_id: klasaId || null, zestaw_id: zestawId,
        tryb, status: 'lobby', indeks: 0,
        limit_s: Number(limitS) || (tryb === 'ekspres' ? 8 : cfg.defaultCzas || 20),
        start_od: null, punkty_bazowe: cfg.punktyBazowe || 1000, bonus_max: tryb === 'ekspres' ? 700 : (cfg.bonusCzasowy || 500),
        zakonczo: null,
      });
      return sesja;
    },

    poKodzie(kod) {
      const k = String(kod || '').replace(/\s/g, '');
      return store.where('sesje', (s) => s.kod === k).sort((a, b) => String(b.utworzono).localeCompare(String(a.utworzono)))[0] || null;
    },
    aktywne(nauczycielId) {
      return store.where('sesje', (s) => (!nauczycielId || s.nauczyciel_id === nauczycielId) && s.status !== 'koniec');
    },
    historia(nauczycielId) {
      return store.where('sesje', (s) => s.status === 'koniec' && (!nauczycielId || s.nauczyciel_id === nauczycielId))
        .sort((a, b) => String(b.zakonczo || b.utworzono).localeCompare(String(a.zakonczo || a.utworzono)));
    },

    pytania(sesja) {
      let qs = Zestawy.pytania(sesja.zestaw_id);
      if (sesja.tryb === 'ekspres') qs = qs.slice(0, 10);
      return qs;
    },
    aktualnePytanie(sesja) {
      const qs = Gra.pytania(sesja);
      return qs[Math.min(sesja.indeks, qs.length - 1)] || null;
    },
    liczbaPytan(sesja) { return Gra.pytania(sesja).length; },

    async join(kod, { nazwa, uczenId, kolor, nakrycie, zespol = 0 }) {
      const sesja = Gra.poKodzie(kod);
      if (!sesja) throw new Error('Nie znaleziono gry o tym kodzie. Poproś nauczyciela o nowy kod.');
      if (sesja.status === 'koniec') throw new Error('Ta gra już się zakończyła.');
      const imie = (nazwa || (uczenId && (store.byId('uczniowie', uczenId) || {}).nazwa) || '').trim();
      if (!imie) throw new Error('Podaj imię lub wybierz się z listy klasy.');
      const gracze = store.where('gracze', (g) => g.sesja_id === sesja.id);
      if (gracze.some((g) => normalize(g.nazwa) === normalize(imie))) {
        const stary = gracze.find((g) => normalize(g.nazwa) === normalize(imie));
        return { sesja, gracz: stary, wznowiono: true };
      }
      const gracz = await store.insert('gracze', {
        sesja_id: sesja.id, uczen_id: uczenId || null, nazwa: imie,
        kolor: kolor || PALETTE[gracze.length % PALETTE.length],
        nakrycie: nakrycie || HATS[gracze.length % HATS.length],
        zespol: Number(zespol) || 0,
      });
      return { sesja, gracz };
    },
    async leave(graczId) {
      const sesja = store.byId('gracze', graczId);
      if (!sesja) return;
      const ops = [{ type: 'delete', table: 'gracze', id: graczId }];
      store.table('odpowiedzi').filter((o) => o.gracz_id === graczId).forEach((o) => ops.push({ type: 'delete', table: 'odpowiedzi', id: o.id }));
      await store.write(ops);
    },

    gracze(sesjaId) { return store.where('gracze', (g) => g.sesja_id === sesjaId); },
    odpowiedzi(sesjaId, graczId) {
      return store.where('odpowiedzi', (o) => o.sesja_id === sesjaId && (!graczId || o.gracz_id === graczId));
    },
    odpowiedzGracza(sesjaId, graczId, pytanieId) {
      return store.where('odpowiedzi', (o) => o.sesja_id === sesjaId && o.gracz_id === graczId && o.pytanie_id === pytanieId)[0] || null;
    },

    /** Aktualne okno czasowe; null = brak aktywnego pytania. */
    stanCzasu(sesja) {
      if (sesja.status !== 'pytanie' || !sesja.start_od) return { pozostalo: sesja.limit_s, koniec: null, czas: 0, koniecTs: null };
      const start = Date.parse(sesja.start_od);
      const limit = (sesja.limit_s || 20) * 1000;
      const czas = Math.max(0, Date.now() - start);
      return {
        czas,
        koniec: Math.max(0, limit - czas),
        koniecTs: start + limit,
        pozostalo: Math.ceil(Math.max(0, limit - czas) / 1000),
        koniecCzasu: czas >= limit,
      };
    },

    async start(sesjaId) {
      const sesja = store.byId('sesje', sesjaId);
      if (!sesja) throw new Error('Brak sesji.');
      if (!Gra.pytania(sesja).length) throw new Error('Zestaw nie zawiera pytań.');
      await store.update('sesje', sesjaId, { status: 'pytanie', indeks: 0, start_od: nowISO(), zakonczono_przerwa: null });
      return store.byId('sesje', sesjaId);
    },
    async next(sesjaId) {
      const sesja = store.byId('sesje', sesjaId);
      const qs = Gra.pytania(sesja);
      if (sesja.indeks + 1 >= qs.length) return Gra.finish(sesjaId);
      await store.update('sesje', sesjaId, { status: 'pytanie', indeks: sesja.indeks + 1, start_od: nowISO() });
      return store.byId('sesje', sesjaId);
    },
    async reveal(sesjaId) {
      await store.update('sesje', sesjaId, { status: 'podsumowanie', start_od: null });
      return store.byId('sesje', sesjaId);
    },
    async pause(sesjaId) {
      const sesja = store.byId('sesje', sesjaId);
      if (sesja.status === 'przerwa') {
        await store.update('sesje', sesjaId, { status: 'pytanie', start_od: nowISO() });
      } else {
        await store.update('sesje', sesjaId, { status: 'przerwa', start_od: null });
      }
      return store.byId('sesje', sesjaId);
    },
    async openLobby(sesjaId) {
      await store.update('sesje', sesjaId, { status: 'lobby', indeks: 0, start_od: null });
      return store.byId('sesje', sesjaId);
    },

    async answer({ sesjaId, graczId, pytanieId, tresc }) {
      const sesja = store.byId('sesje', sesjaId);
      const pytanie = store.byId('pytania', pytanieId);
      if (!sesja || !pytanie) throw new Error('Nie znaleziono pytania.');
      if (sesja.status !== 'pytanie') throw new Error('Na odpowiedzi jeszcze nie czas.');
      const aktywne = Gra.aktualnePytanie(sesja);
      if (!aktywne || aktywne.id !== pytanieId) throw new Error('To pytanie już minęło — poczekaj na następne.');
      if (Gra.odpowiedzGracza(sesjaId, graczId, pytanieId)) throw new Error('Na to pytanie już odpowiedziałeś.');

      const good = Gra.sprawdz(pytanie, tresc);
      const { czas } = Gra.stanCzasu(sesja);
      const wykorzystany = Math.min(czas, (sesja.limit_s || 20) * 1000);
      const pozostaloFrac = Math.max(0, 1 - wykorzystany / ((sesja.limit_s || 20) * 1000));
      const streak = Gra.seria(sesjaId, graczId).dobre;
      const mult = 1 + Math.min(streak, 5) * (sesja.tryb === 'ekspres' ? 0.12 : 0.08);
      const bazowe = sesja.punkty_bazowe || 1000;
      const bonus = sesja.bonus_max || 500;
      let punkty = 0;
      if (good) {
        punkty = Math.round(((bazowe * ((pytanie.punkty || 100) / 100)) + pozostaloFrac * bonus) * mult / 10) * 10;
      }
      const row = await store.insert('odpowiedzi', {
        sesja_id: sesjaId, gracz_id: graczId, pytanie_id: pytanieId,
        tresc: String(tresc || '').slice(0, 200), poprawna: good, punkty, czas_ms: Math.round(wykorzystany),
      });
      return row;
    },

    sprawdz(pytanie, tresc) {
      if (pytanie.typ === 'otwarte') {
        const alternatives = String(pytanie.poprawna_odp || '').split(';').map(normalize).filter(Boolean);
        const given = normalize(tresc);
        if (!given) return false;
        return alternatives.some((a) => given === a || given.includes(a) || a.includes(given));
      }
      return normalize(tresc) === normalize(pytanie.poprawna_opcja);
    },

    seria(sesjaId, graczId) {
      const qs = store.where('odpowiedzi', (o) => o.sesja_id === sesjaId && o.gracz_id === graczId)
        .sort((a, b) => String(a.utworzono).localeCompare(String(b.utworzono)));
      let dobre = 0;
      for (let i = qs.length - 1; i >= 0; i--) { if (qs[i].poprawna) dobre++; else break; }
      return {
        dobre,
        wszystkie: qs.length,
        poprawne: qs.filter((q) => q.poprawna).length,
      };
    },

    wynik(sesjaId) {
      const sesja = store.byId('sesje', sesjaId);
      const gracze = Gra.gracze(sesjaId);
      const odp = Gra.odpowiedzi(sesjaId);
      const suma = Object.create(null);
      for (const g of gracze) suma[g.id] = { punkty: 0, dobre: 0, zle: 0, czasy: [] };
      for (const o of odp) {
        if (!suma[o.gracz_id]) continue;
        suma[o.gracz_id].punkty += o.punkty || 0;
        if (o.poprawna) { suma[o.gracz_id].dobre++; suma[o.gracz_id].czasy.push(o.czas_ms || 0); } else suma[o.gracz_id].zle++;
      }
      const rows = gracze.map((g) => ({
        ...g,
        ...(suma[g.id] || { punkty: 0, dobre: 0, zle: 0, czasy: [] }),
        sredniCzas: (suma[g.id] && suma[g.id].czasy.length)
          ? Math.round(suma[g.id].czasy.reduce((a, b) => a + b, 0) / suma[g.id].czasy.length) : null,
      }));
      rows.sort((a, b) => b.punkty - a.punkty || a.sredniCzas - b.sredniCzas);
      rows.forEach((r, i) => { r.miejsce = i + 1; });

      let druzyny = null;
      if (sesja && sesja.tryb === 'druzyny') {
        druzyny = ZESPOLY.map((z, i) => {
          const members = rows.filter((r) => (r.zespol | 0) === i);
          return { ...z, indeks: i, punkty: members.reduce((a, b) => a + b.punkty, 0), licznik: members.length, gracze: members };
        }).sort((a, b) => b.punkty - a.punkty);
      }
      return { rows, druzyny };
    },

    statystykiPytania(sesjaId, pytanieId) {
      const sesja = store.byId('sesje', sesjaId);
      const pytanie = store.byId('pytania', pytanieId);
      const odp = store.where('odpowiedzi', (o) => o.sesja_id === sesjaId && o.pytanie_id === pytanieId);
      const rozklad = {};
      odp.forEach((o) => {
        const key = pytanie && pytanie.typ !== 'otwarte' ? o.tresc : (o.poprawna ? 'OK' : 'błąd');
        rozklad[key] = (rozklad[key] || 0) + 1;
      });
      const liczba = Gra.gracze(sesjaId).length || 1;
      return {
        odp: odp.length,
        poprawnych: odp.filter((o) => o.poprawna).length,
        frekwencja: Math.min(100, Math.round((odp.length / liczba) * 100)),
        sredniCzas: odp.length ? Math.round(odp.reduce((a, b) => a + (b.czas_ms || 0), 0) / odp.length) : 0,
        rozklad,
        najszybszy: odp.filter((o) => o.poprawna).sort((a, b) => a.czas_ms - b.czas_ms)[0] || null,
      };
    },

    /** Zakończenie: policz XP, zapisz wpisy, ustaw status. */
    async finish(sesjaId) {
      const sesja = store.byId('sesje', sesjaId);
      if (!sesja) throw new Error('Brak sesji.');
      const { rows, druzyny } = Gra.wynik(sesjaId);
      const ops = [{ type: 'update', table: 'sesje', id: sesjaId, row: { status: 'koniec', start_od: null, zakonczo: nowISO() } }];

      if (sesja.nagroda_xp !== false) {
        const wygranaDruzyna = druzyny && druzyny[0] ? druzyny[0].indeks : null;
        rows.forEach((r) => {
          if (!r.uczen_id) return;
          const placeBonus = r.miejsce === 1 ? 15 : r.miejsce === 2 ? 10 : r.miejsce === 3 ? 5 : 0;
          const teamBonus = wygranaDruzyna !== null && (r.zespol | 0) === wygranaDruzyna ? 5 : 0;
          const kwota = Math.max(2, Math.round((r.punkty || 0) / 1000) + placeBonus + teamBonus);
          const uczen = store.byId('uczniowie', r.uczen_id);
          ops.push({ type: 'insert', table: 'wpisy_xp', row: {
            id: uid(), utworzono: nowISO(), uczen_id: r.uczen_id, kwota,
            powod: `Wynik gry (${(store.byId('zestawy', sesja.zestaw_id) || {}).nazwa_zestawu || 'sesja'})`, typ: 'gra', sesja_id: sesjaId,
          } });
          ops.push({ type: 'update', table: 'uczniowie', id: r.uczen_id, row: { xp: Math.max(0, ((uczen && uczen.xp) || 0) + kwota) } });
        });
      }
      await store.write(ops);
      return { sesja: store.byId('sesje', sesjaId), wynik: { rows, druzyny } };
    },

    async usun(sesjaId) {
      const ops = [{ type: 'delete', table: 'sesje', id: sesjaId }];
      store.table('gracze').filter((g) => g.sesja_id === sesjaId).forEach((g) => {
        ops.push({ type: 'delete', table: 'gracze', id: g.id });
        store.table('odpowiedzi').filter((o) => o.gracz_id === g.id).forEach((o) => ops.push({ type: 'delete', table: 'odpowiedzi', id: o.id }));
      });
      store.table('odpowiedzi').filter((o) => o.sesja_id === sesjaId).forEach((o) => ops.push({ type: 'delete', table: 'odpowiedzi', id: o.id }));
      await store.write(ops);
    },

    async zamknijStareSesje(maksWiekH = 6) {
      const śmieci = store.where('sesje', (s) => s.status !== 'koniec' && Date.now() - Date.parse(s.utworzono) > maksWiekH * 3600000);
      for (const s of śmieci) await store.update('sesje', s.id, { status: 'koniec', zakonczo: nowISO(), start_od: null, nota: 'Zamknięta automatycznie' });
      return śmieci.length;
    },
  };

  const Zgloszenia = {
    async create({ nauczycielId, uczenId, sesjaId = null, tytul, opis, xp }) {
      if (!tytul || !tytul.trim()) throw new Error('Podaj tytuł zgłoszenia.');
      const kwota = Number(xp);
      if (!Number.isFinite(kwota) || kwota <= 0 || kwota > 500) throw new Error('XP musi być z zakresu 1–500.');
      return store.insert('zgloszenia', {
        nauczyciel_id: nauczycielId || null, uczen_id: uczenId || null, sesja_id: sesjaId,
        tytul: tytul.trim(), opis: (opis || '').trim(), xp: Math.round(kwota), status: 'oczekuje', rozstrzygnieto: null,
      });
    },
    forTeacher(nauczycielId, status = 'oczekuje') {
      return store.where('zgloszenia', (z) => (!nauczycielId || z.nauczyciel_id === nauczycielId) && (!status || z.status === status))
        .sort((a, b) => String(b.utworzono).localeCompare(String(a.utworzono)));
    },
    forStudent(uczenId) {
      return store.where('zgloszenia', (z) => z.uczen_id === uczenId).sort((a, b) => String(b.utworzono).localeCompare(String(a.utworzono)));
    },
    async approve(id) {
      const z = store.byId('zgloszenia', id);
      if (!z) throw new Error('Zgłoszenie nie istnieje.');
      await store.write([
        { type: 'update', table: 'zgloszenia', id, row: { status: 'zatwierdzone', rozstrzygnieto: nowISO() } },
      ]);
      if (z.uczen_id) await Uczniowie.awardXp(z.uczen_id, z.xp, `Zatwierdzone: ${z.tytul}`, 'wniosek');
      return true;
    },
    async reject(id, comment) {
      await store.write([{ type: 'update', table: 'zgloszenia', id, row: { status: 'odrzucone', rozstrzygnieto: nowISO(), komentarz: comment || '' } }]);
      return true;
    },
    async remove(id) { return store.remove('zgloszenia', id); },
  };

  /* ===== 7. statystyki i raporty ======================================== */

  const Raporty = {
    przeglad(nauczycielId) {
      const klasy = Klasy.list(nauczycielId);
      const zestawy = Zestawy.list(nauczycielId);
      const uczniowie = store.where('uczniowie', (u) => klasy.some((k) => k.id === u.klasa_id));
      const sesje = store.where('sesje', (s) => !nauczycielId || s.nauczyciel_id === nauczycielId);
      const odpowiedzi = store.where('odpowiedzi', (o) => sesje.some((s) => s.id === o.sesja_id));
      return {
        klasy: klasy.length,
        uczniowie: uczniowie.length,
        zestawy: zestawy.length,
        pytania: store.where('pytania', (p) => zestawy.some((z) => z.id === p.zestaw_id)).length,
        sesje: sesje.filter((s) => s.status === 'koniec').length,
        aktywne: sesje.filter((s) => s.status !== 'koniec').length,
        odpowiedzi: odpowiedzi.length,
        poprawne: odpowiedzi.filter((o) => o.poprawna).length,
        dokladnosc: odpowiedzi.length ? Math.round((odpowiedzi.filter((o) => o.poprawna).length / odpowiedzi.length) * 100) : 0,
        xp: uczniowie.reduce((a, b) => a + (b.xp || 0), 0),
      };
    },
    rankingKlasy(klasaId) {
      return Klasy.uczniowie(klasaId).map((u) => {
        const gra = store.where('odpowiedzi', (o) => {
          const g = store.byId('gracze', o.gracz_id);
          return g && g.uczen_id === u.id;
        });
        const p = poziomZxp(u.xp);
        return {
          ...u, ...p,
          gry: new Set(gra.map((g) => g.sesja_id)).size,
          poprawne: gra.filter((g) => g.poprawna).length,
          odpowiedzi: gra.length,
          dokladnosc: gra.length ? Math.round((gra.filter((g) => g.poprawna).length / gra.length) * 100) : 0,
        };
      }).sort((a, b) => (b.xp || 0) - (a.xp || 0));
    },
    podsumowanieSesji(sesjaId) {
      const sesja = store.byId('sesje', sesjaId);
      if (!sesja) return null;
      const qs = Zestawy.pytania(sesja.zestaw_id);
      const { rows, druzyny } = Gra.wynik(sesjaId);
      const perQ = qs.map((p) => ({ pytanie: p, ...Gra.statystykiPytania(sesjaId, p.id) }));
      return {
        sesja,
        zestaw: store.byId('zestawy', sesja.zestaw_id),
        klasa: store.byId('klasy', sesja.klasa_id),
        wyniki: rows, druzyny, perQuestion: perQ,
        najtrudniejsze: [...perQ].sort((a, b) => (a.poprawnych / (a.odp || 1)) - (b.poprawnych / (b.odp || 1))).slice(0, 3),
      };
    },
    doCsv(sesjaId) {
      const rep = Raporty.podsumowanieSesji(sesjaId);
      if (!rep) return '';
      const lines = [['Pozycja', 'Uczeń', 'Punkty', 'Poprawne', 'Błędne', 'Śr. czas (s)'].join(';')];
      rep.wyniki.forEach((r) => lines.push([r.miejsce, r.nazwa, r.punkty, r.dobre, r.zle, r.sredniCzas ? (r.sredniCzas / 1000).toFixed(1) : '-'].join(';')));
      return lines.join('\n');
    },
  };

  /* ===== 8. testy stanu instalacji ====================================== */

  const Diagnostyka = {
    async run() {
      const out = [];
      const push = (name, ok, msg, hint) => out.push({ name, ok, msg, hint });
      const db = store.db;

      push('Sposób przechowywania danych', true, store.modeLabel, 'Zmień w Ustawieniach, jeśli potrzebujesz innej synchronizacji.');
      const intakt = TABLES.every((t) => Array.isArray(db[t]));
      push('Struktura danych', intakt, intakt ? `${TABLES.length} tabel dostępnych` : 'Brak którejś tabeli', 'Użyj „Przebuduj dane demo".');

      const osierocone = {
        pytania: store.where('pytania', (p) => !store.byId('zestawy', p.zestaw_id)).length,
        uczniowie: store.where('uczniowie', (u) => !store.byId('klasy', u.klasa_id)).length,
        gracze: store.where('gracze', (g) => !store.byId('sesje', g.sesja_id)).length,
        odpowiedzi: store.where('odpowiedzi', (o) => !store.byId('gracze', o.gracz_id)).length,
      };
      const suma = Object.values(osierocone).reduce((a, b) => a + b, 0);
      push('Spójność relacji', suma === 0,
        suma === 0 ? 'Brak osieroconych rekordów' : `Rekordy bez rodzica: ${JSON.stringify(osierocone)}`,
        suma ? 'Kliknij „Napraw dane".' : '');

      const hasTeacher = db.nauczyciele.some((n) => n.rola !== 'admin');
      push('Konta nauczycieli', hasTeacher, `${db.nauczyciele.length} kont`, hasTeacher ? '' : 'Zarejestruj nauczyciela albo wgraj dane demo.');
      const setsWithQ = db.zestawy.filter((z) => Zestawy.pytania(z.id).length).length;
      push('Bank pytań', setsWithQ > 0, `${setsWithQ}/${db.zestawy.length} zestawów z pytaniami`, setsWithQ ? '' : 'Dodaj pytania w „Bank pytań".');
      const openQ = db.pytania.filter((p) => {
        if (p.typ === 'otwarte') return !(p.poprawna_odp || '').trim();
        if (p.typ === 'pf') return !'AB'.includes(p.poprawna_opcja);
        return !p.opcja_a || !p.opcja_b || !'ABCD'.includes(p.poprawna_opcja);
      }).length;
      push('Poprawność pytań', openQ === 0, openQ ? `${openQ} pytań bez poprawnej odpowiedzi` : 'Wszystkie pytania mają poprawną odpowiedź', openQ ? 'Uzupełnij w edytorze pytań.' : '');

      const stuck = db.sesje.filter((s) => s.status !== 'koniec' && Date.now() - Date.parse(s.utworzono) > 6 * 3600000).length;
      push('Zawieszone sesje', stuck === 0, stuck ? `${stuck} sesji starszych niż 6 h` : 'Brak zawieszonych sesji', stuck ? 'Administrator może zamknąć je jednym kliknięciem.' : '');

      const cfg = readConfig();
      if (cfg.mode === 'supabase') {
        let ok = false, msg = 'Brak konfiguracji';
        if (cfg.supabaseUrl && cfg.supabaseKey) {
          try {
            const res = await fetch(String(cfg.supabaseUrl).replace(/\/+$/, '') + '/rest/v1/nauczyciele?select=id&limit=1', {
              headers: { apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey },
            });
            ok = res.ok;
            msg = ok ? 'Połączenie OK' : `Błąd HTTP ${res.status} — sprawdź klucze i polityki RLS`;
          } catch (e) { msg = 'Brak zasięgu do Supabase: ' + e.message; }
        }
        push('Połączenie Supabase', ok, msg, ok ? '' : 'Wymagane tabele znajdziesz w pliku supabase/schema.sql.');
      }

      push('Rozmiar danych', store.storageKb() < 4000, `${store.storageKb()} kB`, '');
      return out;
    },
    async napraw() {
      let usuniete = 0;
      const ops = [];
      store.where('pytania', (p) => !store.byId('zestawy', p.zestaw_id)).forEach((p) => { ops.push({ type: 'delete', table: 'pytania', id: p.id }); usuniete++; });
      store.where('gracze', (g) => !store.byId('sesje', g.sesja_id)).forEach((g) => { ops.push({ type: 'delete', table: 'gracze', id: g.id }); usuniete++; });
      store.where('odpowiedzi', (o) => !store.byId('gracze', o.gracz_id)).forEach((o) => { ops.push({ type: 'delete', table: 'odpowiedzi', id: o.id }); usuniete++; });
      store.where('uczniowie', (u) => !store.byId('klasy', u.klasa_id)).forEach((u) => { ops.push({ type: 'delete', table: 'uczniowie', id: u.id }); usuniete++; });
      if (ops.length) await store.write(ops);
      return usuniete;
    },
  };

  /* ===== 9. eksport / import ============================================ */

  const Dane = {
    export() {
      return JSON.stringify({ klasa: 'classquest-backup-v1', kiedy: nowISO(), aplikacja: 'ClassQuest', db: clone(store.db) }, null, 2);
    },
    async import(json) {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      if (!parsed || !parsed.db) throw new Error('To nie jest kopia ClassQuest (brak pola „db").');
      const next = { ...base.emptyDb(), ...parsed.db };
      for (const t of TABLES) if (!Array.isArray(next[t])) next[t] = [];
      await store.replaceAllDb(next);
      return Object.fromEntries(TABLES.map((t) => [t, next[t].length]));
    },
    async resetDemo() {
      base.setDb(base.emptyDb());
      await seedAll();
      return true;
    },
    async wipe() {
      const empty = base.emptyDb();
      await store.replaceAllDb(empty);
      ls.removeItem(LS_AUTH);
      ls.removeItem(LS_STUDENT);
      return true;
    },
  };

  /* ===== 10. eksport ==================================================== */

  const CQ = {
    uid, nowISO, clone, sleep, normalize, initials, randomCode,
    PALETTE, HATS, ZESPOLY, TRYBY, TABLES,
    readConfig, writeConfig,
    store, Auth, Student, Klasy, Uczniowie, Zestawy, Gra, Zgloszenia, Raporty, Diagnostyka, Dane,
    poziomZxp,
    wersja: '1.0.0',
  };

  global.CQ = CQ;
  if (typeof module !== 'undefined' && module.exports) module.exports = CQ;
})(typeof window !== 'undefined' ? window : globalThis);
