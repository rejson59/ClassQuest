import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { getSecret } from './secret.js';
import { pobierzPokoj, listaUczniow, onZamknieciePokoju, dodajGracza, forEachPokoj } from './rooms.js';
import { SWIAT, losujSpawn, strefaGracza } from './world.js';

/**
 * Moduł gry (Socket.io). Serwer jest autorytetem: trzyma pozycje, fazy rund,
 * wyniki i (w trybie budowlańców) wieże ekip oraz karty graczy.
 *
 * Tryby:
 *  - 4pola      „Przetrwanie" — bieg do strefy A–D, 3 życia, ostatni wygrywa
 *  - budowlanci „Szaleni budowlańcy" — szybki quiz (klik A–D), ekipy budują wieżowiec
 */

const TICK_MS = 50;
const RUCH_DOZWOLONY = new Set(['lobby', 'odliczanie', 'pytanie', 'przerwa']); // tylko tryb 4pola
const CEL_PIETER = 4;           // wygrana budowlańców: pierwsza ekipa z 4 piętrami
const MAX_KART = 3;             // limit kart w ręce gracza
const EKIPA_PALETA = ['#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];
const TYPY_KART = ['bomba', 'tarcza', 'podwojna', 'cegla'];

function pieterZ(cegly, koszt) {
  return Math.floor(cegly / koszt);
}

function potasuj(tab) {
  const a = [...tab];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dajLosowaKarte() {
  return TYPY_KART[Math.floor(Math.random() * TYPY_KART.length)];
}

// biernik generowanych nazw ekip („Ekipa 1" → „Ekipę 1") — do komunikatów
function biernikEkipy(nazwa) {
  return nazwa.replace(/^Ekipa /, 'Ekipę ');
}

function respawnRanne(p) {
  for (const g of p.uczniowie.values()) {
    g.wynikRundy = null;
    if (!g.aktywny) continue;
    if (g.zycia < SWIAT.ZYCIA) {
      const s = losujSpawn();
      g.x = s.x;
      g.y = s.y;
    }
    g.dx = 0;
    g.dy = 0;
  }
}

export function initGame(httpServer) {
  const io = new Server(httpServer, { path: '/socket.io', serveClient: false });
  const JWT_SECRET = getSecret();

  function teacherIdZeSocketa(socket) {
    try {
      const cookie = socket.handshake.headers.cookie || '';
      const m = cookie.match(/(?:^|;\s*)cq_token=([^;]+)/);
      if (!m) return null;
      return jwt.verify(decodeURIComponent(m[1]), JWT_SECRET).id ?? null;
    } catch {
      return null;
    }
  }

  // ---------- pomocnicze ---------------------------------------------------

  function podsumowanie(p) {
    return {
      kod: p.kod,
      nazwaKlasy: p.nazwaKlasy,
      nazwaZestawu: p.nazwaZestawu,
      tryb: p.tryb,
      auto: p.auto,
      status: p.status,
      liczbaEkip: p.liczbaEkip
    };
  }

  function widokGracza(g) {
    return {
      id: g.uczenId,
      numer: g.numerDziennika,
      imie: g.imieNazwisko,
      avatar: g.avatar,
      ekipa: g.ekipa ?? null,
      x: Math.round(g.x),
      y: Math.round(g.y),
      zycia: g.zycia,
      aktywny: g.aktywny,
      wynikRundy: g.wynikRundy,
      xp: g.xpZdob,
      poprawne: g.poprawne,
      odpowiedzial: !!g.odpowiedzial
    };
  }

  function widokPrywatny(g) {
    return {
      uczenId: g.uczenId,
      ekipa: g.ekipa ?? null,
      karty: g.karty,
      podwojna: !!g.podwojna,
      odpowiedzial: !!g.odpowiedzial,
      odpowiedz: g.odpowiedz?.odp ?? null,
      ok: g.odpowiedz ? !!g.odpowiedz.ok : null
    };
  }

  function widokEkip(p, e, i) {
    return {
      index: i,
      nazwa: e.nazwa,
      kolor: e.kolor,
      cegly: e.cegly,
      koszt: e.koszt,
      pietra: pieterZ(e.cegly, e.koszt),
      tarcze: e.tarcze
    };
  }

  function ekipyPublicznie(p) {
    return p.ekipy ? p.ekipy.map((e, i) => widokEkip(p, e, i)) : [];
  }

  function stanPubliczny(p) {
    const pytanieWidoczne = ['pytanie', 'wynik', 'odliczanie', 'przerwa'].includes(p.faza);
    const s = {
      t: Date.now(),
      tryb: p.tryb,
      faza: p.faza,
      fazaCzas: Math.max(0, Math.ceil(p.fazaCzas / 1000)),
      fazaCzasMs: Math.max(0, p.fazaCzas),
      gracze: listaUczniow(p).map(widokGracza),
      pytanie: pytanieWidoczne && p.obecne ? {
        tresc: p.obecne.tresc,
        a: p.obecne.opcja_a,
        b: p.obecne.opcja_b,
        c: p.obecne.opcja_c,
        d: p.obecne.opcja_d,
        nr: p.indPytania + 1,
        liczba: p.pytania?.length || 0,
        czas: p.obecne.czas_sek || SWIAT.CZAS_PYTANIA_DOMYSLNY
      } : null,
      poprawna: p.faza === 'wynik' ? (p.obecne?.poprawna ?? null) : null,
      ogloszenie: p.ogloszenie && Date.now() - p.ogloszenie.t < 6000 ? p.ogloszenie.text : null
    };
    if (p.tryb === 'budowlanci') s.ekipy = ekipyPublicznie(p);
    return s;
  }

  function rozglosStan(p) {
    io.to('pokoj:' + p.kod).emit('gra:stan', stanPubliczny(p));
    if (p.tryb === 'budowlanci') {
      for (const g of p.uczniowie.values()) {
        io.to(g.socketId).emit('gra:ja', widokPrywatny(g));
      }
    }
  }

  function oglos(p, text) {
    p.ogloszenie = { text, t: Date.now() };
  }

  // ---------- przebieg rund (wspólny) -------------------------------------

  function startGry(p) {
    if (p.faza !== 'lobby' || p.uczniowie.size === 0) return;
    void (async () => {
      const q = await db.all('SELECT * FROM pytania WHERE zestaw_id = ? ORDER BY id ASC', p.zestawId);
      if (q.length === 0) return;

      p.pytania = q;
      p.indPytania = 0;
      p.obecne = q[0];
      p.status = 'playing';
      await db.run("UPDATE sesje SET status = 'playing' WHERE kod = ?", p.kod);

      if (p.tryb === 'budowlanci') {
        // losowy, wyrównany podział na ekipy
        const gracze = potasuj(listaUczniow(p));
        const L = Math.min(p.liczbaEkip, gracze.length);
        p.liczbaEkip = L;
        p.ekipy = Array.from({ length: L }, (_, i) => ({
          nazwa: `Ekipa ${i + 1}`,
          kolor: EKIPA_PALETA[i % EKIPA_PALETA.length],
          cegly: 0,
          tarcze: 0,
          koszt: 0
        }));
        const rozmiary = new Array(L).fill(0);
        gracze.forEach((g, idx) => {
          const e = idx % L;
          g.ekipa = e;
          g.karty = [];
          g.podwojna = false;
          g.odpowiedz = null;
          g.odpowiedzial = false;
          rozmiary[e]++;
        });
        p.ekipy.forEach((e, i) => { e.koszt = Math.max(2, Math.round(rozmiary[i] / 2)); });
        p.kolejnosc = [];
        p.ogloszenie = null;
      }

      p.faza = 'odliczanie';
      p.fazaCzas = SWIAT.CZAS_ODLICZANIA;
      rozglosStan(p);
    })().catch((err) => console.error('Błąd startu gry:', err));
  }

  function czasPytania(p) {
    return (p.obecne?.czas_sek || SWIAT.CZAS_PYTANIA_DOMYSLNY) * 1000;
  }

  function czyKoniecGry(p) {
    if (p.tryb === 'budowlanci') {
      // warunek sprawdzany „na żywo”: karty (np. 🧱) też mogą dokończyć wieżę
      const ktosMa4Pietra = (p.ekipy || []).some(e => pieterZ(e.cegly, e.koszt) >= CEL_PIETER);
      return ktosMa4Pietra || p.indPytania + 1 >= (p.pytania?.length || 0);
    }
    // 4pola: skończyły się pytania LUB został <=1 aktywny (a grało >=2)
    const aktywni = [...p.uczniowie.values()].filter(g => g.aktywny).length;
    const koniecPoPytaniach = p.indPytania + 1 >= (p.pytania?.length || 0);
    const zostalJeden = aktywni <= 1 && p.uczniowie.size >= 2;
    return koniecPoPytaniach || zostalJeden;
  }

  // ---------- ocena rundy wg trybu ----------------------------------------

  function ocen4pola(p) {
    const poprawna = p.obecne.poprawna;
    for (const g of p.uczniowie.values()) {
      g.wynikRundy = null;
      if (!g.aktywny) continue;
      if (strefaGracza(g.x, g.y) === poprawna) {
        g.wynikRundy = 'ok';
        g.poprawne += 1;
        g.xpZdob += 10;
      } else {
        g.zycia -= 1;
        g.wynikRundy = 'zly';
        if (g.zycia <= 0) {
          g.aktywny = false;
          g.wynikRundy = 'eliminacja';
        }
      }
    }
  }

  function ocenBudowlancow(p) {
    // cegły z poprawnych odpowiedzi
    for (const g of p.uczniowie.values()) {
      g.wynikRundy = null;
      const a = g.odpowiedz;
      if (!a) { g.wynikRundy = 'zle'; continue; }
      if (a.ok) {
        g.wynikRundy = 'ok';
        g.poprawne += 1;
        g.xpZdob += 10;
        const e = p.ekipy[g.ekipa];
        if (e) e.cegly += g.podwojna ? 2 : 1;
        g.podwojna = false;
      } else {
        g.wynikRundy = 'zle';
      }
    }
    // karty: najszybsza poprawna odpowiedź w każdej ekipie
    const najlepsi = new Map(); // ekipa -> {czasMs, uczenId}
    const sorter = p.kolejnosc || [];
    for (const a of sorter) {
      if (!a.ok) continue;
      const pop = najlepsi.get(a.ekipa);
      if (!pop || a.czasMs < pop.czasMs) najlepsi.set(a.ekipa, { czasMs: a.czasMs, uczenId: a.uczenId });
    }
    for (const g of p.uczniowie.values()) {
      const naj = najlepsi.get(g.ekipa);
      if (naj && naj.uczenId === g.uczenId && g.karty.length < MAX_KART) {
        g.karty.push(dajLosowaKarte());
      }
    }
  }

  function ocenRunde(p) {
    if (p.tryb === 'budowlanci') ocenBudowlancow(p);
    else ocen4pola(p);
  }

  // ---------- przejścia faz ------------------------------------------------

  function przejdzDoWyniku(p) {
    if (p.faza !== 'pytanie') return;
    ocenRunde(p);
    p.faza = 'wynik';
    p.fazaCzas = SWIAT.CZAS_WYNIKU;
    rozglosStan(p);
  }

  function nastepnePytanie(p) {
    if (p.faza !== 'wynik' && p.faza !== 'przerwa') return;
    if (czyKoniecGry(p)) {
      zakonczGre(p);
      return;
    }
    p.indPytania += 1;
    p.obecne = p.pytania[p.indPytania];
    if (p.tryb === 'budowlanci') {
      for (const g of p.uczniowie.values()) {
        g.odpowiedz = null;
        g.odpowiedzial = false;
      }
      p.kolejnosc = [];
      p.faza = 'pytanie';
    } else {
      respawnRanne(p);
      p.faza = 'pytanie';
    }
    p.fazaCzas = czasPytania(p);
    p.pytanieStart = Date.now();
    rozglosStan(p);
  }

  // ---------- zakończenie gry ----------------------------------------------

  function zakonczGre(p) {
    if (p.wynikiZapisane) return;
    p.wynikiZapisane = true;
    void (async () => {
    const gracze = listaUczniow(p);
    let zwyciezcaEkipa = null;
    let finalne = [];

    if (p.tryb === 'budowlanci') {
      // ranking ekip
      const ranking = p.ekipy
        .map((e, i) => ({ ...widokEkip(p, e, i), index: i }))
        .sort((a, b) => b.pietra - a.pietra || b.cegly - a.cegly || a.index - b.index);
      zwyciezcaEkipa = ranking[0];
      // bonus dla członków zwycięskiej ekipy
      for (const g of gracze) {
        if (g.ekipa === zwyciezcaEkipa.index) g.xpZdob += 25;
      }
      // kolejność graczy: ekipa wg rankingu, wewnątrz wg XP
      const pozEkipy = new Map(ranking.map((r, i) => [r.index, i]));
      gracze.sort((a, b) =>
        (pozEkipy.get(a.ekipa) ?? 99) - (pozEkipy.get(b.ekipa) ?? 99) ||
        b.xpZdob - a.xpZdob ||
        a.numerDziennika - b.numerDziennika
      );
      finalne = gracze.map((g, i) => ({
        pozycja: i + 1,
        id: g.uczenId,
        numer: g.numerDziennika,
        imie: g.imieNazwisko,
        avatar: g.avatar,
        ekipa: g.ekipa,
        xp: g.xpZdob,
        poprawne: g.poprawne,
        wygrana: g.ekipa === zwyciezcaEkipa.index
      }));
    } else {
      gracze.sort((a, b) =>
        b.xpZdob - a.xpZdob || b.zycia - a.zycia || b.poprawne - a.poprawne || a.numerDziennika - b.numerDziennika
      );
      if (gracze.length > 0) gracze[0].xpZdob += 25;
      finalne = gracze.map((g, i) => ({
        pozycja: i + 1,
        id: g.uczenId,
        numer: g.numerDziennika,
        imie: g.imieNazwisko,
        avatar: g.avatar,
        ekipa: null,
        xp: g.xpZdob,
        poprawne: g.poprawne,
        zycia: g.zycia,
        wygrana: i === 0
      }));
    }

    // zapis do bazy w jednej transakcji
    await db.withTx(async (tx) => {
      await tx.run("UPDATE sesje SET status = 'finished', zakonczona_at = datetime('now') WHERE kod = ?", p.kod);
      for (const f of finalne) {
        await tx.run(
          'INSERT INTO wyniki_gier (sesja_kod, uczen_id, pozycja, xp_zdobyte, poprawne, zycia_zostalo) VALUES (?, ?, ?, ?, ?, ?)',
          p.kod, f.id, f.pozycja, f.xp, f.poprawne, f.zycia ?? 0
        );
        if (f.xp > 0) {
          await tx.run('UPDATE uczniowie SET xp = xp + ? WHERE id = ?', f.xp, f.id);
          const dodatki = [];
          if (f.wygrana && p.tryb === 'budowlanci') dodatki.push(`wygrana ekipy ${(zwyciezcaEkipa?.index ?? 0) + 1}`);
          if (f.wygrana && p.tryb === '4pola') dodatki.push('WYGRANA');
          await tx.run(
            'INSERT INTO xp_logi (uczen_id, zrodlo, kwota, opis, sesja_kod) VALUES (?, ?, ?, ?, ?)',
            f.id, 'gra', f.xp, `Gra „${p.nazwaZestawu}”${dodatki.length ? ' — ' + dodatki.join(', ') : ''}`, p.kod
          );
        }
      }
    });

    p.status = 'finished';
    p.faza = 'koniec';
    p.fazaCzas = 0;
    const payload = { tryb: p.tryb, finalne, nazwaZestawu: p.nazwaZestawu };
    if (p.tryb === 'budowlanci') {
      payload.ekipy = p.ekipy.map((e, i) => widokEkip(p, e, i)).sort((a, b) => b.pietra - a.pietra || b.cegly - a.cegly);
      payload.zwyciezcaEkipa = zwyciezcaEkipa ? zwyciezcaEkipa.index : null;
    }
    io.to('pokoj:' + p.kod).emit('gra:koniec', payload);
    })().catch((err) => console.error('Błąd zapisu wyników gry:', err));
  }

  // ---------- karty (budowlańcy) -------------------------------------------

  function uzyjKarty(p, g, typ, cel) {
    const idx = g.karty.indexOf(typ);
    if (idx === -1) return false;
    if (p.faza !== 'wynik' && p.faza !== 'przerwa') return false;
    const mojaEkipa = p.ekipy[g.ekipa];
    if (!mojaEkipa) return false;

    if (typ === 'bomba') {
      cel = Number(cel);
      const celEkipa = p.ekipy[cel];
      if (!celEkipa || cel === g.ekipa) return false;
      if (celEkipa.tarcze > 0) {
        celEkipa.tarcze -= 1;
        oglos(p, `🛡️ Bomba na ${biernikEkipy(celEkipa.nazwa)} została zatrzymana przez tarczę!`);
      } else {
        celEkipa.cegly = Math.max(0, celEkipa.cegly - 2);
        oglos(p, `💣 ${mojaEkipa.nazwa} rzuciła bombę w ${biernikEkipy(celEkipa.nazwa)}! −2 cegły`);
      }
    } else if (typ === 'tarcza') {
      mojaEkipa.tarcze += 1;
      oglos(p, `🛡️ ${mojaEkipa.nazwa} stawia tarczę ochronną!`);
    } else if (typ === 'podwojna') {
      g.podwojna = true;
      oglos(p, `⚡ ${g.imieNazwisko} przygotowuje podwójną cegłę!`);
    } else if (typ === 'cegla') {
      mojaEkipa.cegly += 1;
      oglos(p, `🧱 ${mojaEkipa.nazwa} dorzuca cegłę (karta)!`);
    }
    g.karty.splice(idx, 1);
    return true;
  }

  // ---------- pętla gry (20 Hz) --------------------------------------------

  function tick() {
    const teraz = Date.now();
    forEachPokoj((p) => {
      const dt = teraz - p.ostatniTick;
      p.ostatniTick = teraz;
      if (p.status === 'finished') return;

      // ruch tylko w trybie 4pola
      if (p.tryb === '4pola' && RUCH_DOZWOLONY.has(p.faza)) {
        const margines = SWIAT.MARGINES + SWIAT.PROMIEN;
        for (const g of p.uczniowie.values()) {
          if (!g.aktywny && p.faza !== 'lobby') continue;
          if (g.dx === 0 && g.dy === 0) continue;
          const dl = Math.hypot(g.dx, g.dy) || 1;
          g.x += (g.dx / dl) * SWIAT.SZYBKOSC * (dt / 1000);
          g.y += (g.dy / dl) * SWIAT.SZYBKOSC * (dt / 1000);
          g.x = Math.min(Math.max(g.x, margines), SWIAT.W - margines);
          g.y = Math.min(Math.max(g.y, margines), SWIAT.H - margines);
        }
      }

      // odliczanie faz
      if (p.faza === 'odliczanie') {
        p.fazaCzas -= dt;
        if (p.fazaCzas <= 0) {
          p.faza = 'pytanie';
          p.fazaCzas = czasPytania(p);
          p.pytanieStart = Date.now();
        }
      } else if (p.faza === 'pytanie') {
        p.fazaCzas -= dt;
        if (p.fazaCzas <= 0) przejdzDoWyniku(p);
      } else if (p.faza === 'wynik') {
        p.fazaCzas -= dt;
        if (p.fazaCzas <= 0) {
          if (p.auto) {
            if (p.tryb === 'budowlanci') {
              // krótka przerwa, żeby można było użyć kart, potem auto dalej
              p.faza = 'przerwa';
              p.fazaCzas = 5000;
            } else {
              nastepnePytanie(p);
            }
          } else {
            p.faza = 'przerwa'; // czekamy na klik nauczyciela
            if (p.tryb !== 'budowlanci') respawnRanne(p);
          }
        }
      } else if (p.faza === 'przerwa') {
        p.fazaCzas -= dt;
        if (p.fazaCzas <= 0 && p.auto) nastepnePytanie(p);
      }

      // czyszczenie starych ogłoszeń
      if (p.ogloszenie && teraz - p.ogloszenie.t > 6000) p.ogloszenie = null;

      // broadcast: co klatkę w 4pola (ruch), w budowlańcach tylko gdy się coś zmienia
      const zmianaFazy = p.faza !== p._popFaza;
      const sek = Math.ceil(p.fazaCzas / 1000);
      const zmianaSek = sek !== p._popSek;
      p._popFaza = p.faza;
      p._popSek = sek;
      if (p.tryb === '4pola' || zmianaFazy || zmianaSek || p.ogloszenie) rozglosStan(p);
    });
  }
  setInterval(tick, TICK_MS);

  // ---------- zdarzenia socketów -------------------------------------------

  onZamknieciePokoju((kod) => {
    io.to('pokoj:' + kod).emit('pokoj:zamkniety', { kod });
  });

  io.on('connection', (socket) => {
    // nauczyciel: wejście do pokoju
    socket.on('nauczyciel:pokoj', ({ kod }) => {
      const p = pobierzPokoj(kod);
      const tid = teacherIdZeSocketa(socket);
      if (!p || !tid || p.teacherId !== tid) {
        socket.emit('pokoj:blad', { error: 'Brak dostępu do tego pokoju.' });
        return;
      }
      p.teacherSocketId = socket.id;
      socket.join('pokoj:' + p.kod);
      socket.data.nauczycielPokoj = p.kod;
      socket.emit('nauczyciel:stan', {
        pokoj: podsumowanie(p),
        uczniowie: listaUczniow(p).map(widokGracza)
      });
      socket.emit('gra:stan', stanPubliczny(p));
    });

    // nauczyciel: sterowanie grą
    socket.on('nauczyciel:start', ({ kod }) => {
      const p = pobierzPokoj(kod);
      const tid = teacherIdZeSocketa(socket);
      if (p && tid && p.teacherId === tid) startGry(p);
    });
    socket.on('nauczyciel:koniecRundy', ({ kod }) => {
      const p = pobierzPokoj(kod);
      const tid = teacherIdZeSocketa(socket);
      if (p && tid && p.teacherId === tid) przejdzDoWyniku(p);
    });
    socket.on('nauczyciel:nastepne', ({ kod }) => {
      const p = pobierzPokoj(kod);
      const tid = teacherIdZeSocketa(socket);
      if (p && tid && p.teacherId === tid) nastepnePytanie(p);
    });
    socket.on('nauczyciel:zakoncz', ({ kod }) => {
      const p = pobierzPokoj(kod);
      const tid = teacherIdZeSocketa(socket);
      if (p && tid && p.teacherId === tid) zakonczGre(p);
    });

    // uczeń: dołączenie do pokoju
    socket.on('uczen:dolacz', ({ kod, uczenId }) => {
      void (async () => {
        const p = pobierzPokoj(kod);
        uczenId = Number(uczenId);
        if (!p || p.status === 'finished') {
          socket.emit('pokoj:blad', { error: 'Pokój nie istnieje lub został zamknięty.' });
          return;
        }
        if (p.status !== 'lobby') {
          socket.emit('pokoj:blad', { error: 'Gra w tym pokoju już się rozpoczęła.' });
          return;
        }
        const uczen = await db.get(
          'SELECT id, klasa_id, numer_dziennika, imie_nazwisko, avatar_json FROM uczniowie WHERE id = ?',
          uczenId
        );
        if (!uczen || uczen.klasa_id !== p.klasaId) {
          socket.emit('pokoj:blad', { error: 'Nie możesz dołączyć do tego pokoju.' });
          return;
        }

        const stary = p.uczniowie.get(uczen.id);
        if (stary && stary.socketId !== socket.id) {
          try { io.sockets.sockets.get(stary.socketId)?.disconnect(true); } catch { /* stare */ }
        }

        dodajGracza(p, uczen, socket.id);

        socket.join('pokoj:' + p.kod);
        socket.data.pokojKod = p.kod;
        socket.data.uczenId = uczen.id;

        socket.emit('uczen:stan', {
          pokoj: podsumowanie(p),
          uczen: {
            uczenId: uczen.id,
            numerDziennika: uczen.numer_dziennika,
            imieNazwisko: uczen.imie_nazwisko,
            avatar: JSON.parse(uczen.avatar_json || '{}')
          }
        });
        socket.emit('gra:stan', stanPubliczny(p));
        io.to('pokoj:' + p.kod).emit('pokoj:uczniowie', {
          uczniowie: listaUczniow(p).map(widokGracza)
        });
      })().catch((err) => console.error('Błąd dołączania ucznia:', err));
    });

    // uczeń: sterowanie (wektor kierunku) — tylko 4pola
    socket.on('steruj', ({ dx, dy }) => {
      const p = socket.data.pokojKod ? pobierzPokoj(socket.data.pokojKod) : null;
      if (!p || p.tryb !== '4pola') return;
      const g = p.uczniowie.get(socket.data.uczenId);
      if (!g) return;
      g.dx = Math.max(-1, Math.min(1, Number(dx) || 0));
      g.dy = Math.max(-1, Math.min(1, Number(dy) || 0));
    });

    // uczeń: odpowiedź w trybie budowlańców (szybki quiz)
    socket.on('odpowiedz', ({ odp }) => {
      const p = socket.data.pokojKod ? pobierzPokoj(socket.data.pokojKod) : null;
      if (!p || p.tryb !== 'budowlanci' || p.faza !== 'pytanie' || !p.obecne) return;
      const g = p.uczniowie.get(socket.data.uczenId);
      if (!g || g.odpowiedzial) return;
      const lit = String(odp || '').toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(lit)) return;
      g.odpowiedzial = true;
      const ok = lit === p.obecne.poprawna;
      g.odpowiedz = { odp: lit, ok, czasMs: Date.now() - (p.pytanieStart || Date.now()) };
      p.kolejnosc = p.kolejnosc || [];
      p.kolejnosc.push({ uczenId: g.uczenId, ekipa: g.ekipa, ok, czasMs: g.odpowiedz.czasMs });
      socket.emit('gra:odpowiedz', { ok });
      io.to(g.socketId).emit('gra:ja', widokPrywatny(g));
      // odśwież wynik (liczba odpowiedzi) u nauczyciela
      rozglosStan(p);
    });

    // uczeń: użycie karty (budowlańcy)
    socket.on('karta', ({ typ, cel }) => {
      const p = socket.data.pokojKod ? pobierzPokoj(socket.data.pokojKod) : null;
      if (!p || p.tryb !== 'budowlanci') return;
      const g = p.uczniowie.get(socket.data.uczenId);
      if (!g) return;
      if (uzyjKarty(p, g, String(typ || ''), cel)) {
        io.to(g.socketId).emit('gra:ja', widokPrywatny(g));
        rozglosStan(p);
      }
    });

    // rozłączenie
    socket.on('disconnect', () => {
      if (socket.data.nauczycielPokoj) {
        const p = pobierzPokoj(socket.data.nauczycielPokoj);
        if (p && p.teacherSocketId === socket.id) p.teacherSocketId = null;
      }
      const kod = socket.data.pokojKod;
      const uczenId = socket.data.uczenId;
      if (kod && uczenId) {
        const p = pobierzPokoj(kod);
        if (p) {
          const s = p.uczniowie.get(uczenId);
          if (s && s.socketId === socket.id) {
            p.uczniowie.delete(uczenId);
            io.to('pokoj:' + kod).emit('pokoj:uczniowie', {
              uczniowie: listaUczniow(p).map(widokGracza)
            });
          }
        }
      }
    });
  });

  return io;
}
