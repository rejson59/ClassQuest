# ClassQuest — testy akceptacyjne

Uruchamiane z katalogu głównego repo (potrzebują modułów: `pg`, `socket.io-client`).

Wymagany działający serwer (domyślnie `http://localhost:4001`, można zmienić zmienną `BASE`).

| Plik | Co testuje | Użycie |
|---|---|---|
| `rest-sqlite.mjs` | pełny REST na czystej bazie z seedem demo (1 admin, 12 uczniów, 9 pytań) | `node testy/rest-sqlite.mjs` |
| `rest-pg.mjs` | REST na **Postgresie**: pierwsze konto=admin, CRUD, XP, role, kaskady, eksport | `node testy/rest-pg.mjs` |
| `e2e-gra.mjs` | pełna gra 4pola przez sockety (nauczyciel + 2 uczniów, auto), zapis wyników/XP | `node testy/e2e-gra.mjs` |

Wskazówki:

- `rest-pg.mjs` zakłada **czystą bazę** (bez kont) — pierwsza rejestracja ma zostać adminem.
  Jeśli baza nie jest pusta: `node testy/rest-pg.mjs` może nie przejść kontroli ról.
- `e2e-gra.mjs` rejestruje nowe losowe konto. Na bazie z seedem demo konto nie będzie adminem
  (weryfikacja przez `/api/admin` zostanie pominięta — test gry i tak przechodzi). Na czystej
  bazie Postgres pierwsze konto jest adminem i weryfikacja obejmie też panel.
- Po wdrożeniu na żywo: `BASE=https://twoja-aplikacja.koyeb.app node testy/e2e-gra.mjs`
  (wymaga, by aplikacja pozwalała na rejestrację nowych kont).
