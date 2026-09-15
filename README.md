# ClassQuest 🎲

Interaktywna platforma lekcyjna: nauczyciel rzuca kod, klasa gra na telefonach lub laptopach,
a punkty XP, rankingi i raporty liczą się same.

Bez frameworków, bez budowania, bez konta w chmurze. Pliki HTML + jeden moduł danych + opcjonalny
serwer synchronizacji w czystym Node.

---

## Szybki start

```bash
node server.js          # http://localhost:8123  (podgląd + synchronizacja na żywo)
```

Albo zupełnie bez serwera — otwórz `index.html` w przeglądarce. Wtedy aplikacja pracuje w
**trybie lokalnym** (dane w `localStorage`, synchronizacja kart tej samej przeglądarki).

**Konta demonstracyjne**

| Rola | Login | Hasło |
|---|---|---|
| Nauczyciel | `Anna Kowalczyk` (lub `anna.kowalczyk@szkola.pl`) | `demo123` |
| Administrator | `admin@classquest.pl` | `admin123` |

**Pierwsza gra w 60 sekund:** logowanie nauczyciela → w panelu wybierz klasę `5A` i zestaw
„Matma: ułamki i działania” → *Uruchom grę* → otwórz **Tablicę** w drugiej karcie → w trzeciej karcie
`gra.html` (kod `246810` czeka w lobby na danych demo) → **Start**.

---

## Co tu działa (lista kontrolna)

| Obszar | Strona | Stan |
|---|---|---|
| Wybór profilu, motyw jasny/ciemny | `index.html` | ✅ |
| Logowanie i rejestracja nauczyciela (hash + salt, bez hasła w jawnej postaci) | `logowanie.html` | ✅ |
| Panel prowadzenia lekcji: kod pokoju, fazy gry, lista graczy, auto-przejście | `nauczyciel.html` | ✅ |
| Widok na projektor: kod, pytanie, licznik, rozkład odpowiedzi, podium + konfetti | `tablica.html` | ✅ |
| Ekran ucznia: dołączanie kodem, odpowiedź, omówienie, wynik, zgłoszenie pracy | `gra.html` | ✅ |
| Trening solo (bez licznika i rankingu) | `gra.html?trening=…` | ✅ |
| Klasy, listy uczniów (wklejanie z dziennika), księga XP, poziomy, CSV | `klasy.html` | ✅ |
| Bank pytań: A/B/C/D, prawda/fałsz, otwarte, kolejność, JSON, wklejanie pytań | `zestawy.html` | ✅ |
| Raporty: klasyfikacja, statystyki pytań, rozkład odpowiedzi, CSV, wydruk | `wyniki.html` | ✅ |
| Obieg zgłoszeń: uczeń prosi o XP → nauczyciel zatwierdza/odrzuca | panel + `uczen.html` | ✅ |
| Strefa ucznia: awatar, poziom, historia gier, trening, zgłoszenia | `uczen.html` | ✅ |
| Ustawienia: tryb danych, parametry punktacji, diagnostyka, kopia/reset | `ustawienia.html` | ✅ |
| Administracja: konta, role, reset haseł, sesje, konserwacja, dziennik zapisów | `admin.html` | ✅ |
| Instrukcja w środku aplikacji (tryby, awarie, skróty, Supabase) | `pomoc.html` | ✅ |
| Galeria komponentów design systemu | `przyklad-wygladu.html` | ✅ |

Testy, które to potwierdzają:

```bash
node tools/sprawdz.js       # WSZYSTKO poniżej jednym poleceniem

node tools/test-store.js    # 81 testów logiki (auth, klasy, bank pytań, gra, XP, raporty)
node tools/test-flows.js    # 41 asercji: zapytania, które wykonują strony, na danych demo
node tools/test-server.js   # 11 testów synchronizacji na żywo + trwałość po restarcie serwera
node tools/test-pages.js    # startowe renderowanie 14 stron + wszystkie handlery zdarzeń (atrapa DOM)
node tools/check-html.js    # składnia JS, istnienie zasobów, identyfikatory, klasy CSS, podwójne id
node tools/check-refs.js    # każde CQ.* i ui.* użyte na stronie faktycznie istnieje
node tools/check-calls.js   # brak wołań do nieistniejących funkcji; klucze danych bez ogonków
```

---

## Trzy tryby danych

Wybór: **Ustawienia → Gdzie mieszkają dane** (domyślnie „automatycznie”).

| Tryb | Gdzie mieszka stan | Dla kogo |
|---|---|---|
| **lokalny** | `localStorage` przeglądarki; karty tego samego urządzenia synchronizują się przez `BroadcastChannel` | próbujesz platformy, jedna maszyna przy tablicy |
| **serwer klasy** | plik `.data/cq-db.json` na `server.js`, rozgłaszanie przez SSE | cała klasa gra na swoich telefonach w sieci Wi-Fi szkoły |
| **Supabase** | Twoja baza Postgres (PostgREST) | dane między budynkami, praca po zamknięciu przeglądarki |

Supabase jest **opcjonalny** — aplikacja nie wysypuje się, gdy chmura nie odpowiada: diagnostyka w
Ustawieniach pokaże status, a wrócić można jednym kliknięciem. Pełny schemat (tabele, indeksy, widok
raportowy, polityki RLS i uwagi o bezpieczeństwie) leży w [`supabase/schema.sql`](supabase/schema.sql).

Plik `supabase.js` został zachowany: dawniej był jedyną warstwą danych i to przez niego panel
nauczyciela wołał funkcji, których nie było. Teraz to cienka warstwa zgodności — stare wywołania
(`loginTeacher`, `createGameSession`, `joinRoomAsStudent`, `updateStudentScore`…) działają, ale
przekazują robotę do `CQ.store`.

---

## Struktura

```
index.html              wybór profilu
logowanie.html          logowanie/rejestracja nauczyciela
admin-logowanie.html    logowanie administratora
nauczyciel.html         panel prowadzenia lekcji  ← tu się gra uruchamia
tablica.html            widok na projektor
gra.html                ekran ucznia (gra + trening solo)
uczen.html              strefa ucznia (profil, XP, zgłoszenia)
klasy.html              klasy, listy, księga XP
zestawy.html            bank pytań
wyniki.html             raporty po grach
ustawienia.html         tryb danych, punktacja, kopia, diagnostyka
admin.html              administracja instalacją
pomoc.html              instrukcja i rozwiązywanie problemów
przyklad-wygladu.html   galeria komponentów

assets/css/base.css     design system (neumorfizm, jasny/ciemny motyw)
assets/js/store.js      modele danych, 3 backendy, punktacja, poziomy, raporty, diagnostyka
assets/js/ui.js         nagłówek, motyw, modale, toasty, licznik, konfetti, `live()`
server.js               statyka + API synchronizacji (zero zależności)
supabase.js             warstwa zgodności ze starym kodem
supabase/schema.sql     tabele Supabase + RLS
tools/                  testy logiki, testy serwera, statyczne kontrole
```

---

## Zasady punktacji

```
punkty = (bazowe × trudność/100 + bonus za pozostały czas) × (1 + 0,08 × seria)   → zaokrąglenie do 10
```

* tryb **klasyczny**: pełny zestaw, czas z ustawienia pytania;
* **ekspres**: do 10 pytań po 8 s, bonus 700, premia za serię 0,12;
* **drużynowy**: to samo, ale tablica liczy wynik 4 drużyn;
* **trening solo**: informacja zwrotna natychmiast, bez punktów i rankingu.

Na koniec gry `punkty / 1000 → XP` + bonus za podium (15/10/5) i za zwycięską drużynę (+5).
Poziom: co 400 XP (`CQ.poziomZxp`). Wartości bazowe zmienia się w Ustawieniach.

---

## Uwagi o bezpieczeństwie

Hasła nauczycieli są solone i hashowane (SHA-256 przez `crypto.subtle`) po stronie klienta i trzymane
w tym samym magazynie co reszta danych — to wystarczy do pracy klasowej i demonstracji, ale **nie**
zastępuje uwierzytelniania po stronie serwera. Do wdrożenia szkolnego: Supabase Auth + RLS wg
komentarzy w `supabase/schema.sql`, a klucz `anon` nigdy nie powinien pozwalać na zapis administracji.
