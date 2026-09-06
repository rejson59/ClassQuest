# ClassQuest — wersja 2.0

Interaktywna platforma lekcyjna: nauczyciel prowadzi klasę przez **grę 2D na żywo**,
w której uczniowie sterują awatarami (telefon/komputer) i odpowiadają na pytania,
dobiegając do właściwych pól na wspólnej planszy.

Dokumenty:
- `docs/SPECYFIKACJA.md` — pełna specyfikacja funkcjonalna,
- `docs/SCHEMAT-BAZY.md` — schemat bazy danych,
- `prototyp-html/` — stary prototyp (HTML+Supabase) zachowany dla porównania.

## Uruchomienie (tryb deweloperski)

```bash
npm install
npm run dev
```

- Aplikacja (frontend): http://localhost:5173
- Serwer API: http://localhost:4001

Konto demo: **nauczyciel@demo.pl** / hasło **demo1234**
(baza startowa zawiera klasę „8B" z przykładowymi uczniami oraz przykładowe zestawy pytań).

## Uruchomienie produkcyjne (jeden proces, jeden port 4001)

```bash
npm run build
npm start
```

Serwer Express serwuje wtedy gotowy frontend + API + WebSocket na porcie 4001.
Wystarczy uruchomić na dowolnym serwerze z Node.js (komputer w szkole, darmowy Render.com itd.).
