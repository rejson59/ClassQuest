# ClassQuest

Interaktywna platforma lekcyjna: nauczyciel prowadzi klasę przez **grę 2D na żywo**,
w której uczniowie sterują awatarami (telefon/komputer) i odpowiadają na pytania,
dobiegając do właściwych pól na wspólnej planszy (tryb „4 pola") albo budując
wieżowiec w ekipach (tryb „Szaleni budowlańcy").

## Struktura

```
server/   API + gra na żywo (Node, Express, Socket.io)
web/      frontend (React + Vite)
supabase/ schemat bazy PostgreSQL (używany przy starcie na Supabase)
testy/    testy akceptacyjne (REST + pełna gra E2E)
docs/     dokumentacja (specyfikacja, schemat, plan wdrożenia)
```

Serwer działa na dwóch silnikach baz danych — wybiera je zmienna `DATABASE_URL`:
bez niej używa lokalnego **SQLite** (`server/data/`), z nią łączy się z
**PostgreSQL** (Supabase). Ten sam kod, zero zmian przy wdrożeniu.

## Uruchomienie (rozwój)

```bash
npm install
npm run dev
```

- Aplikacja: http://localhost:5173
- API: http://localhost:4001

Konto demo: **nauczyciel@demo.pl** / **demo1234** — pojawia się tylko w lokalnej
bazie SQLite (przycisk „Użyj demo" na ekranie logowania znika, gdy konta nie ma).

## Uruchomienie produkcyjne (jeden proces, jeden port)

```bash
npm run build
npm start
```

Serwer serwuje wtedy zbudowany frontend + API + WebSocket. Zmienne środowiskowe
(przy wdrożeniu na Koyeb/Render): `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`.
Pierwsze zarejestrowane konto automatycznie zostaje administratorem (panel `/admin`).

## Wdrożenie

Instrukcja krok po kroku: [`docs/WDROZENIE-KROK-PO-KROKU.md`](docs/WDROZENIE-KROK-PO-KROKU.md)
(szczegóły techniczne: [`docs/WDROZENIE.md`](docs/WDROZENIE.md)).

## Testy

Wymagany działający serwer (domyślnie `http://localhost:4001`):

```bash
node testy/rest-sqlite.mjs    # pełny REST na bazie SQLite z seedem demo
node testy/rest-pg.mjs        # REST na PostgreSQL (czysta baza)
node testy/e2e-gra.mjs        # pełna gra 4pola przez sockety (2 uczniów, auto)
```
