# ClassQuest — plan wdrożenia produkcyjnego

> Status: 2026-09-06. Kod działa lokalnie (React + Node + Socket.io + SQLite).
> **Hosting aplikacji: decyzja otwarta.** Domena: **darmowa subdomena** (wybór właściciela).
> Baza docelowa: **Supabase free** (założenie z ustaleń; alternatywa: Neon free).
> Ten dokument to plan — **nie wdrażamy go, dopóki właściciel nie zatwierdzi wariantu.**

---

## 1. Weryfikacja rynku — wrzesień 2026 (sprawdzone na żywo)

Pytanie właściciela: „czy da się to zrobić łatwiej i lepiej?". Odpowiedź po sprawdzeniu
aktualnych (2026) darmowych planów: **nie pojawił się żaden darmowy hosting, który
(a) bez karty, (b) bez uśpienia, (c) z trwałym dyskiem prowadzi aplikację Node + WebSocket.**
To trzy warunki naraz — nie istnieją dziś razem za 0 zł. Konkretnie:

| Platforma (2026) | Node + WebSocket? | Uśpienie | Trwały dysk | Karta? | Werdykt |
|---|---|---|---|---|---|
| **Koyeb free** | ✔ (oficjalnie, WS do 12 h) | po **1 h** bez ruchu; budzenie **1–5 s** | ❌ brak wolumenów (tylko efemeryczny SSD 2 GB) | zwykle nie; czasem przy weryfikacji | ✅ rekomendacja główna |
| **Render free** | ✔ (oficjalne docs: ruch WS liczy się do aktywności) | po **15 min**; budzenie **~1 min** z ekranem „loading" | ❌ brak persistent disk | **nigdy** | ✅ rekomendacja awaryjna (bez karty gwarantowane) |
| **Northflank free** | ✔ | **nigdy nie śpi** | ✔ (usługa) | **tak, wymagana** | ❌ odpada (karta) |
| **Railway free** | ✔ | nie | ❌ | nie | ❌ darmowy kredyt się kończy |
| **Render free Postgres** | — | — | — | — | ❌ wygasa po 30 dniach → nie jako baza |
| **Koyeb free Postgres** | — | — | — | — | ❌ tylko 5 h/mies. → nie jako baza |
| **Vercel / Netlify / Cloudflare** | ❌ serverless (bez długiego procesu) | — | ❌ | nie | ❌ nie dla gry na żywo |

**Wniosek:** gra na żywo (Socket.io, stan pokoi w pamięci) potrzebuje „prawdziwego"
procesu — taki za darmo zawsze śpi (Koyeb/Render) albo wymaga karty (Northflank).
A skoro na darmowych planach **nie ma trwałego dysku**, baza musi mieszkać poza
serwerem (Supabase/Neon) — **to jest jedyna realna zmiana w kodzie** i jest
nieunikniona na każdej darmowej drodze. Reszta (build, port, brak localhostów,
sesje JWT) jest już gotowa.

Dlatego „łatwiej i lepiej" niż obecny plan **się nie da zrobić architektonicznie** —
da się tylko wybrać najmniej tarcia operacyjnego:

- **A. Koyeb** — jeśli rejestracja nie poprosi o kartę: budzenie 1–5 s (uczeń/nauczyciel
  nie czeka), więc ping niepotrzebny; wada: ewentualna prośba o kartę przy rejestracji.
- **B. Render** — bez karty zawsze; wada: po 15 min bez ruchu usypia na ~1 min → trzeba
  trzymać ping co ~10–14 min (darmowy cron-job.org) albo pogodzić się z 1-minutowym
  czekaniem na starcie lekcji. Jedna zawsze obudzona instancja mieści się w 750 h/mies.
  (24/7 = maks. 744 h).
- **Baza: Supabase free** (wybór właściciela) z codziennym pingiem (inaczej pauza po
  7 dniach); alternatywa Neon free (budzenie ~0,5 s, bez ryzyka kasacji).


## 2. Stan dzisiejszy (co już jest gotowe pod hosting)

| Element | Stan | Uwagi |
|---|---|---|
| Frontend | 1 komenda `npm run build -w web` → `web/dist` | czysty build, bez błędów |
| Serwer | `npm start` (`NODE_ENV=production node server/src/index.js`) | sam serwuje `web/dist` + API + grę |
| Port | `process.env.PORT` (domyślnie 4001), bind `0.0.0.0` | gotowe pod hosty |
| Adresy w kliencie | **brak `localhost`/wpisanych URL** — tylko względne `/api` i `io()` same-origin | nic do poprawy |
| Sesje | JWT w httpOnly cookie `cq_token` (bezstanowe, `sameSite: lax`, 30 dni) | działa na każdym hostingu |
| Sekret JWT | `server/src/secret.js` — plik `.secret` w `server/data/` | **do zmiany na env** (patrz §7) |
| Baza | SQLite, plik `server/data/classquest.db` (`node:sqlite`, Node ≥ 22) | **nie przetrwa na darmowym hostingu** → migracja (§6) |
| Stan gry | pokoje/pozycje w pamięci procesu (Mapa + timery) | wymaga **1 egzemplarza** serwera (bez skalowania poziomego) |
| Backup | `GET /api/admin/eksport` (pełny JSON całej bazy) | już działa, do wykorzystania przy migracji |
| Git | `server/data/`, `web/dist/`, `node_modules/` w `.gitignore` | baza NIGDY nie trafia do repo |

Zapytania do bazy są w 4 plikach: `db.js` (8), `routes.js` (57), `game.js` (7), `rooms.js` (4) — łącznie ~76 miejsc (`db.prepare(...).get/all/run`).

## 3. Ustalone ograniczenia (od właściciela)

- **0 zł miesięcznie, bez karty kredytowej.**
- Wszystko w przeglądarce (komputer w szkole bez instalacji).
- Realne użycie: ~5 h gry / miesiąc, jedna klasa (do ~35 uczniów).
- Ważne dane (konta, klasy, zestawy, XP) w darmowym **Supabase**.
- Domena: **darmowa subdomena** hosta (np. `nazwa.koyeb.app` / `nazwa.vercel.app`). Własną domenę można dokupić i podpiąć później bez przenosin.

## 4. Dlaczego NIE „bez zmian na Vercel" (krótko)

Vercel = platforma **serverless** (funkcje bezstanowe), a ClassQuest to **jeden długo żyjący proces**:

1. Gra trzyma pokoje i pozycje w **pamięci procesu** i pcha ruch przez **Socket.io** (długie połączenia). Serverless nie ma „procesu w tle", a natywne WebSockets na Vercel nie działają w serverless — potrzebny zewnętrzny kanał realtime.
2. Funkcje serverless mają **limity czasu wykonania** (na darmowym planie rzędu 10–60 s) — lekcja trwa 45 minut.
3. Plik SQLite **nie istnieje między wywołaniami** (dysk efemeryczny), a `node:sqlite` (Node 22+) tam nie zadziała.

**Wniosek:** Vercel wymaga przebudowy (Next.js + Postgres + osobny realtime) — to *więcej* kombinowania, nie mniej. Node.js nie jest przeszkodą; przeszkodą jest model serverless. Alternatywa „mały, zawsze żyjący serwer Node" wymaga **najmniej** zmian.

## 5. Warianty docelowe

### A) Koyeb free + Supabase — rekomendowany (najmniej zmian)
- Node/Express/Socket.io startuje bez przebudowy (obraz Node ≥ 22; `npm run build && npm start`).
- Free Instance: 512 MB RAM, 0.1 vCPU — dla jednej klasy w zupełności wystarczy.
- **Uśpienie po ~1 h bez ruchu, przebudzenie 1–5 s** (nie do wyłączenia na free; opcjonalnie ping co 5–10 min w godzinach lekcyjnych trzyma instancję na nogach).
- Domena: `…koyeb.app`. Brak trwałego dysku na free → baza musi być w Supabase (i tak planowana).
- WebSockets: Koyeb trzyma połączenia długo (przy keep-alive nawet do 12 h).

### B) Render free + Supabase
- To samo co A, ale: uśpienie po **15 min** bez ruchu, przebudzenie **~1 min** (zimny start).
- Domena: `…onrender.com`. Free Postgres Renderu wygasa po 30 dniach → i tak Supabase/Neon.
- Sensowne tylko, jeśli ktoś „budzi" aplikację przed lekcją.

### C) Vercel (przebudowa) — świadomy wybór, duży koszt pracy
- Frontend: Next.js (albo statyczny Vite) na Vercel.
- API: serverless funkcje (bezstanowe).
- Baza: Supabase/Neon (REST lub `pg`).
- Realtime: przepięcie na **Supabase Realtime / Ably / Pusher** — pokoje i logika gry do przepisania (dziś stan w pamięci Mapy).
- Ryzyko: limity darmowych kanałów realtime i wolumen wiadomości przy 35 graczach; 2–3 usługi zamiast 1; więcej ruchomych części.
- **Nie rekomendowane przy skali 5 h/mies.** — zarezerwowane na wypadek, gdyby właściciel konkretnie chciał Vercel.

### Porównanie

| Kryterium | A: Koyeb + Supabase | B: Render + Supabase | C: Vercel (przebudowa) |
|---|---|---|---|
| Zmiany w kodzie | baza → Postgres + env | baza → Postgres + env | gruntowna przebudowa |
| Koszt | 0 zł, bez karty | 0 zł, bez karty | 0 zł, bez karty |
| Gra na żywo | ✔ Socket.io jak dziś | ✔ Socket.io jak dziś | wymaga osobnego realtime |
| Uśpienie | po 1 h, budzenie 1–5 s | po 15 min, budzenie ~1 min | b.d. (serverless) |
| Ryzyko | małe | średnie (zimne starty) | duże (nowa architektura) |

## 6. Migracja bazy SQLite → Postgres (Supabase free)

Cel: te same dane i zachowanie, inny silnik. Kolejność prac z testami po każdym kroku.

### 6.1 Typy i różnice składni (mapowanie)
| SQLite (dziś) | Postgres (Supabase) |
|---|---|
| `?` placeholdery | `$1, $2…` |
| `lastInsertRowid` | `INSERT … RETURNING id` |
| `datetime('now')` | `now()` |
| INTEGER PK / AUTOINCREMENT | `SERIAL` / `GENERATED ALWAYS AS IDENTITY` |
| INTEGER 0/1 (`auto`, flagi) | `boolean` (albo zostawić `smallint` dla minimalnej zmiany kodu) |
| `avatar_json`/teksty JSON | `jsonb` lub `text` (mniejsza zmiana: `text`) |
| `TEXT` daty ISO | `timestamptz` |
| kod sesji TEXT PK | `text primary key` (bez zmian) |
| `PRAGMA foreign_keys = ON` | domyślnie włączone |

### 6.2 Plan prac (do wykonania PO zatwierdzeniu wariantu)
1. **Dodać `pg`** (`node-postgres`) do `server/package.json` + `DATABASE_URL` z Supabase.
2. **Nowy moduł dostępu** (np. `server/src/pg.js`): pool + pomocnicze `q(sql, params)` z mapowaniem `? → $1`; małe funkcje `insertId` przez `RETURNING`.
3. **Kolejność przenoszenia zapytań** (najmniejsze → największe):
   1. `db.js` — schemat + seed (skrypt SQL uruchamiany w Supabase SQL Editor zamiast `CREATE TABLE IF NOT EXISTS`; seed konta demo z rolą `admin`),
   2. `rooms.js` (4 zapytania — walidacja klasy/zestawu),
   3. `game.js` (7 — zapis sesji, wyników, XP, logów),
   4. `routes.js` (57 — reszta REST).
4. **Synchronizacja**: kod dziś woła bazę **synchronicznie** (`prepare().get()`); Postgres przez `pg` jest **asynchroniczny** → handlery w `routes.js`/`game.js` przechodzą na `async/await` (zmiana mechaniczna, ale obejmuje wiele funkcji — największy koszt migracji).
5. **Sekret JWT**: `secret.js` ma czytać najpierw `process.env.JWT_SECRET`, a plik `.secret` zostawić tylko jako fallback lokalny.
6. **Migracja danych**: w dniu wdrożenia wyeksportować stare dane przez `/api/admin/eksport` (albo skrypt SQL) i zaimportować do Supabase; zweryfikować liczniki (nauczyciele/klasy/uczniowie/zestawy/sesje/XP).
7. **Testy regresji po każdym kroku**: logowanie, klasy/uczniowie, zestawy/pytania, pokój „4 pola" z 2 graczami (E2E), tryb „Szaleni budowlańcy", rozdawanie XP, panel `/admin` (podsumowanie, role, usuwanie konta z kaskadami, eksport).

### 6.3 Utrzymanie bazy (Supabase free)
- **Pauza po 7 dniach bez zapytań** (projekt może zostać skasowany po długiej pauzie) → **1 ping dziennie** (darmowy `cron-job.org` lub GitHub Action), żeby baza była aktywna.
- Backup: ręczny `GET /api/admin/eksport` + opcjonalny automat (codzienny zapis JSON do repo/chmury).

## 7. Wdrożenie aplikacji (wariant A lub B) — kroki po zatwierdzeniu

1. Zmienne środowiskowe u hosta: `PORT`, `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (długi losowy ciąg).
2. Build w deployu: `npm install && npm run build` (produkuje `web/dist`), start: `npm start`.
3. Podpięcie repozytorium GitHub → auto-deploy z gałęzi (ustalić: `main` = produkcja).
4. Test akceptacyjny na żywo (checklista):
   - [ ] logowanie demo (`nauczyciel@demo.pl / demo1234`) — konto admina,
   - [ ] założenie klasy + uczniów, zestawu + pytań,
   - [ ] pokój „4 pola": 2 urządzenia, ruch awatarów na żywo, pytanie, XP,
   - [ ] tryb „Szaleni budowlańcy" (2–5 ekip),
   - [ ] panel `/admin`: liczby, rola konta, usunięcie testowego konta, eksport JSON,
   - [ ] ponowne wejście po 30 min (sprawdzić budzenie/uśpienie wg wariantu).
5. Domena: zostaje subdomena hosta (decyzja właściciela); ewentualną własną domenę podpiąć przez DNS.

## 8. Ryzyka i mitygacje

| Ryzyko | Mitygacja |
|---|---|
| `node:sqlite` (eksperymentalne API) — znika po migracji | migracja do `pg` |
| Zmiana sync → async może wnieść regresje | testy E2E po każdym kroku (§6.2.7) |
| Supabase pauza po 7 dniach bez ruchu | codzienny ping |
| Uśpienie instancji Koyeb po 1 h | budzenie 1–5 s; opcjonalny ping w godzinach lekcyjnych |
| Ruch gry (ramki 20/s) przez WebSocket | idzie przez serwer gry, **nie** przez Supabase (limit 5 GB/mies. dotyczy tylko zapytań REST) |
| Własna domena = dodatkowy koszt | na start darmowa subdomena; podpięcie później bez przenosin |

## 9. Otwarte pytania do właściciela (kiedy będzie gotowy zdecydować)

1. Wariant hostingu: **A (Koyeb)**, B (Render) czy C (Vercel-przebudowa)?
2. Konto na Supabase: zakłada właściciel (e-mail) — potrzebny będzie `DATABASE_URL` (hasło bazy) i `JWT_SECRET`.
3. Konto na Koyeb/Render: zakłada właściciel; deploy przez GitHub.
4. Czy seed demo (konto `nauczyciel@demo.pl`) ma być w bazie produkcyjnej, czy start od czysta z pierwszym kontem = admin (mechanizm już działa).
