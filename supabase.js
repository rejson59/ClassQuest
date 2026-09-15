/* ==========================================================================
   ClassQuest — kompatybilność z Supabase
   --------------------------------------------------------------------------
   Kiedyś to był jedyny sposób na dane w ClassQuest i to on był źródłem
   problemów: strony wołały funkcji, których tu nie było (getStudentsByTeacher,
   addXpToStudent, getPendingRequests…) i logowały „po nazwisku + hasło wprost”.

   Teraz:
     • cała logika danych mieszka w assets/js/store.js (trzy tryby: lokalny,
       serwer klasy, Supabase). Supabase NIE jest już wymagane, żeby cokolwiek
       działało na lekcji;
     • ten plik czyta konfigurację ustawioną w „Ustawienia → Gdzie mieszkają
       dane” i udostępnia stare nazwy funkcji, żeby linki/zakładki z dawnych
       wersji nie wysypywały się w środku lekcji.

   Stare wywołania -> nowe mapowanie:
     loginTeacher / registerTeacher   -> CQ.Auth.login / CQ.Auth.register
     getCurrentTeacher                -> CQ.Auth.current
     requireTeacher / logoutTeacher   -> CQ.Auth (strażnik w CQ.ui.bootTeacher)
     getTeacherSets                   -> CQ.Zestawy.list
     createQuestionSet                -> CQ.Zestawy.create
     getQuestionsFromSet              -> CQ.Zestawy.pytania
     addQuestion                      -> CQ.Zestawy.saveQuestion
     createGameSession                -> CQ.Gra.createSession
     updateGameStatus                 -> CQ.store.update('sesje', …)
     joinRoomAsStudent                -> CQ.Gra.join
     getStudentsInRoom                -> CQ.Gra.gracze
     updateStudentScore               -> CQ.Uczniowie.awardXp
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---- 1. Parametry projektu (nadpisywane przez ustawienia aplikacji) ---- */
  const LEGACY = {
    url: 'https://tvigygkvhiljepzvyuyw.supabase.co',
    key: 'sb_publishable_GtGlG0aG9J5784cLhnIR7w_dFFFHu4D',
  };

  function cfg() {
    const c = (global.CQ && global.CQ.readConfig()) || {};
    return {
      url: (c.supabaseUrl || LEGACY.url).replace(/\/+$/, ''),
      key: c.supabaseKey || LEGACY.key,
      mode: c.mode || 'auto',
      aktywny: c.mode === 'supabase' && !!(c.supabaseUrl && c.supabaseKey),
    };
  }

  /** Czy SDK supabase-js jest dostępne (ładowane tylko gdy tryb chmurowy). */
  function sdkGotowe() { return !!global.supabase && typeof global.supabase.createClient === 'function'; }

  let client = null;
  function getSupabase() {
    const c = cfg();
    if (!c.aktywny) return null;
    if (client) return client;
    if (!sdkGotowe()) {
      console.warn('[ClassQuest] Supabase włączony, ale SDK jeszcze nie wczytane — aplikacja korzysta z CQ.store.');
      return null;
    }
    client = global.supabase.createClient(c.url, c.key);
    return client;
  }

  /** Doładowuje SDK leniwie, żeby nie blokować startu przy trybie lokalnym. */
  function zaladujSdk() {
    const c = cfg();
    if (c.mode !== 'supabase' || sdkGotowe() || document.getElementById('cq-supabase-sdk')) return;
    const s = document.createElement('script');
    s.id = 'cq-supabase-sdk';
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    document.head.appendChild(s);
  }

  /* ---- 2. Pomocnik REST (bez SDK, zgodny z CQ.store) -------------------- */
  async function res(name, path, opts = {}) {
    const c = cfg();
    if (!c.aktywny) throw new Error('Supabase jest wyłączony — użyj trybu lokalnego lub serwera klasy (Ustawienia).');
    const out = await fetch(`${c.url}/rest/v1/${name}${path}`, {
      ...opts,
      headers: {
        apikey: c.key, Authorization: `Bearer ${c.key}`, 'content-type': 'application/json',
        prefer: 'return=representation', ...(opts.headers || {}),
      },
    });
    const text = await out.text();
    if (!out.ok) {
      let msg = `HTTP ${out.status}`;
      try { const j = JSON.parse(text); msg = j.message || msg; } catch (e) {}
      throw new Error(msg);
    }
    return text ? JSON.parse(text) : null;
  }

  /* ---- 3. Stare API (wszystko idzie przez CQ.store, więc działa w każdym trybie) */
  const db = () => global.CQ.store;

  const klasyczne = {
    // --- konfiguracja ---
    SUPABASE_URL: cfg().url,
    SUPABASE_ANON_KEY: cfg().key,
    getSupabase,
    zaladujSdk,
    config: cfg,

    // --- nauczyciele / logowanie ---
    async loginTeacher(imieNazwisko, haslo) {
      try { return { teacher: await global.CQ.Auth.login({ login: imieNazwisko, haslo }) }; }
      catch (err) { return { error: err.message }; }
    },
    async registerTeacher(imieNazwisko, haslo) {
      try { return { teacher: await global.CQ.Auth.register({ imieNazwisko, haslo }) }; }
      catch (err) { return { error: err.message }; }
    },
    getCurrentTeacher() { return global.CQ.Auth.current(); },
    requireTeacherAuth() {
      const me = global.CQ.Auth.current();
      if (!me) global.location.href = 'logowanie.html';
      return me;
    },
    logoutTeacher() { global.CQ.Auth.logout(); global.location.href = 'logowanie.html'; },

    // --- zestawy i pytania ---
    async getTeacherSets(nauczycielId) {
      return { data: global.CQ.Zestawy.list(nauczycielId), error: null };
    },
    async createQuestionSet(nauczycielId, nazwaZestawu) {
      const row = await global.CQ.Zestawy.create(nauczycielId, { nazwa_zestawu: nazwaZestawu });
      return { data: row, error: null };
    },
    async getQuestionsFromSet(zestawId) {
      return { data: global.CQ.Zestawy.pytania(zestawId), error: null };
    },
    async addQuestion(zestawId, pytanieData) {
      const row = await global.CQ.Zestawy.saveQuestion(zestawId, pytanieData);
      return { data: row, error: null };
    },

    // --- sesje gier ---
    async createGameSession(zestawId, kodPokoju, typGry = 'klasyczny') {
      const sesja = await global.CQ.Gra.createSession({ zestawId, tryb: typGry });
      if (kodPokoju) await db().update('sesje', sesja.id, { kod: String(kodPokoju).replace(/\D/g, '').slice(0, 6) || sesja.kod });
      return { data: db().byId('sesje', sesja.id), error: null };
    },
    async updateGameStatus(sessionId, status) {
      const mapa = { waiting: 'lobby', active: 'pytanie', finished: 'koniec' };
      await db().update('sesje', sessionId, { status: mapa[status] || status });
      return { error: null };
    },
    async getGameByCode(kod) { return global.CQ.Gra.poKodzie(kod); },

    // --- uczniowie ---
    async joinRoomAsStudent(kodPokoju, nickname, numerDziennika = null) {
      try {
        const out = await global.CQ.Gra.join(kodPokoju, { nazwa: nickname, numerDziennika });
        return { data: out.gracz, error: null };
      } catch (err) { return { error: err.message }; }
    },
    async getStudentsInRoom(kodPokoju) {
      const sesja = global.CQ.Gra.poKodzie(kodPokoju);
      return { data: sesja ? global.CQ.Gra.gracze(sesja.id) : [], error: null };
    },
    async updateStudentScore(studentId, newScore) {
      const uczen = db().byId('uczniowie', studentId);
      if (!uczen) return { error: 'Nie znaleziono ucznia.' };
      const delta = Number(newScore) - (uczen.xp || 0);
      await global.CQ.Uczniowie.awardXp(studentId, delta, 'Aktualizacja wyniku', 'manualne');
      return { error: null };
    },

    // --- niskopoziomowe wyjście na chmurę, gdy ktoś chce pisać własne zapytania ---
    query: res,
  };

  global.SupabaseLegacy = klasyczne;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', zaladujSdk, { once: true });
  } else {
    zaladujSdk();
  }

  console.info(
    `%c[ClassQuest] Supabase: ${cfg().aktywny ? 'WŁĄCZONY (chmura)' : 'opcjonalny — dane trzymane lokalnie/na serwerze klasy'}`,
    'color:#2563eb;font-weight:bold'
  );
})(window);
