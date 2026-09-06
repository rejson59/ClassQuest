# ClassQuest — Schemat bazy danych (SQLite)

Plik bazy: `server/data/classquest.db` (tworzony automatycznie przy starcie).
Struktura odpowiada koncepcji z prototypu (Supabase), ale jest uproszczona i działa lokalnie.

## Tabele

### `teachers` — nauczyciele (konta)
| kolumna | typ | opis |
|---|---|---|
| id | INTEGER PK | |
| imie_nazwisko | TEXT | np. „Jan Kowalski" |
| email | TEXT UNIQUE | login nauczyciela |
| haslo_hash | TEXT | hash hasła (bcrypt) |
| rola | TEXT | `admin` (pełny dostęp, panel /admin) lub `nauczyciel` |
| created_at | TEXT | ISO data utworzenia |

### `klasy` — klasy (grupy uczniów)
| kolumna | typ | opis |
|---|---|---|
| id | INTEGER PK | |
| teacher_id | INTEGER FK → teachers | właściciel klasy |
| nazwa | TEXT | np. „8B" |
| created_at | TEXT | |

### `uczniowie` — uczniowie w klasach (odpowiednik dziennika)
| kolumna | typ | opis |
|---|---|---|
| id | INTEGER PK | |
| klasa_id | INTEGER FK → klasy | |
| numer_dziennika | INTEGER | numer w dzienniku (1..n) |
| imie_nazwisko | TEXT | np. „Anna Nowak" |
| avatar_json | TEXT | zapamiętany awatar (kolor, oczy, buzia, akcesorium) |
| xp | INTEGER | łączna liczba XP ucznia |
| created_at | TEXT | |

UNIQUE(klasa_id, numer_dziennika) — jeden numer w klasie.

### `zestawy_pytan` — zestawy pytań nauczyciela
| kolumna | typ | opis |
|---|---|---|
| id | INTEGER PK | |
| teacher_id | INTEGER FK → teachers | |
| nazwa | TEXT | np. „Matematyka — ułamki" |
| created_at | TEXT | |

### `pytania` — pytania w zestawie
| kolumna | typ | opis |
|---|---|---|
| id | INTEGER PK | |
| zestaw_id | INTEGER FK → zestawy_pytan | |
| tresc | TEXT | treść pytania |
| opcja_a / opcja_b / opcja_c / opcja_d | TEXT | odpowiedzi |
| poprawna | TEXT CHECK('A','B','C','D') | poprawna opcja |
| czas_sek | INTEGER | ile sekund na odpowiedź (0 = domyślny, np. 15) |

### `sesje` — rozegrane gry (pokoje)
| kolumna | typ | opis |
|---|---|---|
| kod | TEXT PK | kod PIN pokoju (np. „482910") |
| teacher_id | INTEGER FK | |
| klasa_id | INTEGER FK | która klasa grała |
| zestaw_id | INTEGER FK | który zestaw pytań |
| tryb | TEXT | tryb gry: `4pola` (Przetrwanie) lub `budowlanci` (Szaleni budowlańcy) |
| status | TEXT | lobby / active / finished |
| auto | INTEGER 0/1 | tryb automatyczny |
| utworzona_at / zakonczona_at | TEXT | |

### `wyniki_gier` — wyniki końcowe graczy w sesji
| kolumna | typ | opis |
|---|---|---|
| id | INTEGER PK | |
| sesja_kod | TEXT FK → sesje | |
| uczen_id | INTEGER FK → uczniowie | |
| pozycja | INTEGER | miejsce (1 = najlepszy) |
| xp_zdobyte | INTEGER | XP zdobyte w tej grze |
| poprawne | INTEGER | liczba poprawnych odpowiedzi |
| zycia_zostalo | INTEGER | |

### `xp_logi` — historia przyznawania XP
| kolumna | typ | opis |
|---|---|---|
| id | INTEGER PK | |
| uczen_id | INTEGER FK | |
| zrodlo | TEXT | 'gra' / 'reczne' |
| kwota | INTEGER | +/– |
| opis | TEXT | np. „Wygrana w grze", „Aktywność na lekcji" |
| sesja_kod | TEXT NULL | jeśli z gry |
| created_at | TEXT | |

## Uwagi
- XP ucznia jest **denormalizowane** w `uczniowie.xp` (szybki ranking);
  `xp_logi` służy jako historia/audyt.
- Ranking klasy = `SELECT ... FROM uczniowie WHERE klasa_id=? ORDER BY xp DESC`.
- W przyszłości (jeśli zajdzie potrzeba chmury) można tę samą strukturę odtworzyć
  w Supabase — schemat SQL jest 1:1 przenośny.
