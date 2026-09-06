# ClassQuest — Specyfikacja (wersja 2.0)

Nowa, w pełni działająca wersja ClassQuest. Na podstawie ustaleń z właścicielem projektu.

---

## 1. Cel

Platforma do prowadzenia lekcji przez **nauczyciela** z użyciem **gry 2D na żywo**,
w której **uczniowie** sterują swoimi awatarami (telefon/tablet/komputer) i rywalizują
odpowiadając na pytania. Całość ma być darmowa w utrzymaniu i prosta w uruchomieniu.

## 2. Ustalone założenia (od właściciela)

| Temat | Decyzja |
|---|---|
| Pokój gry | **Plansza 2D** (inspiracja Among Us, ale własny design, nie kopia) |
| Awatary | Każdy uczeń ma swojego **awatara** (nazwa „ludzik" → oficjalnie „awatar") |
| Dołączanie ucznia | Wpisuje **kod PIN** → wybiera **siebie z listy klasy** (numer z dziennika + imię i nazwisko) |
| Klasy | **Nauczyciel zakłada klasy** i wpisuje uczniów (jak dziennik) |
| Awatar | **Zapamiętywany** między lekcjami: kolor + akcesoria, można później zmienić |
| Sterowanie | Na telefonie **wirtualny joystick**; na komputerze klawiatura (WASD/strzałki) |
| Ekran nauczyciela | Plansza 2D z awatarami na żywo (np. rzutnik) + panel prowadzenia gry |
| Główny tryb gry | Nad planszą **pytanie + odpowiedzi A–D**; na planszy 4 pola; **dobiegnij do poprawnego pola** |
| Błędna odpowiedź | „Podłoga się zapada" — gracz odpada z rundy i traci **życie** |
| Życia | **3 życia na grę**; przy 0 życia gracz ogląda do końca |
| Zwycięstwo | Ostatni z życiami; jeśli pytania się skończą — wygrywa najlepszy wg punktów |
| Tempo gry | Nauczyciel może prowadzić **ręcznie** (pokaz pytania, koniec czasu) **albo włączyć tryb automatyczny** |
| Telefon ucznia | Joystick **+ pytanie i odpowiedzi A–D** (odpowiedź = dobiegnięcie do pola!) |
| Pytania | **Edytor zestawów pytań** w nauczycielskim panelu (od pierwszej wersji) |
| Liczba graczy | 26–35 uczniów na jednej planszy (duża mapa) |
| Liczba plansz | Jedna plansza = cała klasa (na start) |
| Punkty/XP | System zaprojektowany przez nas (patrz niżej) |
| Przyszłość | Architektura ma pozwolić na **dodawanie kolejnych trybów gry** |
| Styl | Neomorfizm, jasny/ciemny motyw, font Plus Jakarta Sans (kontynuacja stylu z prototypu) |

## 3. Przepływy użytkownika

### 3.1 Nauczyciel
1. **Rejestracja / logowanie** (e-mail + hasło, sesja zapamiętana).
2. **Panel nauczyciela**:
   - **Klasy**: zakładanie klas (np. „8B"), dodawanie uczniów z numerami dziennika.
   - **Zestawy pytań**: tworzenie zestawów i pytań (treść + opcje A,B,C,D + poprawna).
   - **Ranking klasy**: lista uczniów wg XP, poziomy.
   - **Przyznawanie XP ręcznie** (np. za aktywność, z wpisaniem powodu).
3. **Panel administratora** (`/admin`, tylko konto z rolą `admin`):
   - Liczniki całego systemu (nauczyciele, klasy, uczniowie, zestawy, gry, XP).
   - Stan serwera (czas pracy, pamięć, rozmiar bazy) i **aktywne pokoje na żywo**.
   - Zarządzanie kontami nauczycieli (nadawanie/degradacja roli admina, usuwanie konta).
   - **Historia wszystkich rozegranych gier** z wynikami graczy.
   - **Kopia zapasowa** całej bazy (plik JSON do pobrania).
4. **Prowadzenie gry**:
   - Wybiera klasę + zestaw pytań → tworzy pokój z **kodem PIN** (np. 482 910).
   - Uczniowie dołączają (widzi ich na planszy w lobby).
   - Start gry → rundy pytań (ręcznie lub auto) → koniec gry → wyniki zapisane, XP rozdane.

### 3.2 Uczeń
1. Ekran: wpisz **PIN**.
2. Wybierz **siebie z listy klasy** (numer + imię i nazwisko).
3. **Awatar**: wybór koloru, oczu, buzi, akcesorium (zapamiętywane).
4. **Ekran gry**: joystick + pytanie + odpowiedzi + życia + XP.
5. Po grze: podsumowanie (miejsce, zdobyte XP).

## 4. Przebieg rundy (tryb „4 pola")

1. **Faza pytania**: serwer pokazuje pytanie i odpowiedzi A–D (na ekranie głównym
   i na telefonach). Na planszy pojawiają się **4 strefy A, B, C, D**.
2. Uczniowie dobierają joystickiem do strefy, którą uważają za poprawną.
3. Koniec czasu (nauczyciel kliknięciem albo automatyczny timer):
   - stojący na **poprawnej** strefie → bezpieczni, dostają **+XP**;
   - stojący na **złej strefie** (lub poza strefami) → **podłoga się zapada**,
     tracą **1 życie**, wracają do gry od następnej rundy (lub oglądają, jeśli 0 żyć);
4. **Faza wyników**: podświetlenie poprawnej strefy, tabela stanu.
5. Następne pytanie, aż do końca zestawu lub zostanie ostatni gracz.

## 5. System XP, poziomów i nagród

Zasady (zaprojektowane; łatwe do zmiany):
- **Poprawna odpowiedź w rundzie** = **+10 XP**.
- **Bonus za wygraną grę** (zostanie ostatnim / najlepszy wynik) = **+25 XP**.
- **Nauczyciel może przyznać XP ręcznie** (np. +50 za aktywność) z wpisaniem powodu.
- **Poziom** = `floor(łączny XP / 100) + 1` (co 100 XP kolejny poziom).
- Ranking klasy sortuje uczniów po łącznym XP.

Uwaga: XP przypisane jest do ucznia w klasie (nie do sesji), więc **zbiera się między lekcjami**.

## 6. Architektura i technologie

- **Jeden proces Node.js**: serwer HTTP (Express) + WebSocket (Socket.io) + API.
- **Frontend**: React + Vite (tryb deweloperski: HMR; produkcja: statyczne pliki serwowane przez Express).
- **Baza danych**: SQLite (plik `data/classquest.db`) — zero konfiguracji, bezpłatna,
  niezawodna w szkole (działa bez internetu). Przy pierwszym uruchomieniu: automatyczna
  migracja + przykładowe dane demo.
- **Sesje**: httpOnly cookie z tokenem (JSON Web Token).
- **Realtime gry**: Socket.io — serwer trzyma stan pokoi w pamięci, rozgłasza stan
  planszy do nauczyciela i fazy gry do uczniów.

### Dlaczego nie Supabase Realtime / Vercel?
- Supabase Realtime (plan darmowy): limit **100 wiadomości/s na projekt** oraz
  200 jednoczesnych połączeń. 35 uczniów sterujących joystickiem wysyła znacznie
  więcej — przekroczenie limitu rozłącza klientów w środku lekcji
  (błąd `tenant_events`).
- Vercel (darmowy) nie pozwala na trwałe połączenia WebSocket (funkcje bezstanowe).
- Własny serwer Socket.io **nie ma tych limitów** i obsłuży z zapasem 35+ graczy.

## 7. Tryby gry (rozszerzalność)

Główny tryb v1: **„4 pola / Przetrwanie"** — dobiegnij do właściwej strefy A–D, zanim czas
minie; złe pole zabiera życie (z 3); wygrywa ostatni (lub najlepszy po wyczerpaniu pytań).

Tryb **„Szaleni budowlańcy\"** (v2): nauczyciel wybiera liczbę ekip (2–5), a serwer
**losuje** skład ekip (wyrównany) przy każdej nowej grze. Odpowiedzi to **szybki quiz
A–D na telefonie** (bez biegania): poprawna odpowiedź dokłada **1 cegłę** wieży ekipy
(z kartą „podwójna cegła\" — 2 cegły), **błąd nic nie kosztuje**. Cegły tworzą piętra
(koszt piętra zależy od wielkości ekipy); wygrywa ekipa, która pierwsza uzbiera
**4 piętra** (albo najlepsza po wyczerpaniu pytań). Najszybsza poprawna odpowiedź
w każdej ekipie dostaje losową kartę (💣 bomba −2 cegły innej ekipy — tarcza ją
zatrzymuje, 🛡️ tarcza, 🧱 dodatkowa cegła, ⚡ podwójna cegła; limit 3 w ręce).
Członkowie zwycięskiej ekipy dostają bonus (+25 XP).


Każdy tryb to osobna logika w `server/src/game.js` (rozdzielana polem `p.tryb`).
Kolejne tryby będą dodawane jako nowe gałęzie/`world` bez zmian w transporcie i UI.

## 8. Zakres prac (kamienie milowe)

- [ ] **M1 — Szkielet**: repo, serwer + baza + auth + UI (start/logowanie/rejestracja).
- [ ] **M2 — Klasy i uczniowie** (CRUD + lista wg dziennika).
- [ ] **M3 — Zestawy pytań** (CRUD, edytor pytań A–D).
- [ ] **M4 — Pokój gry**: PIN, dołączanie ucznia, wybór z listy, awatar (edytor + zapis).
- [ ] **M5 — Plansza 2D i awatary**: ruch (joystick/klawiatura), rendering na ekranie nauczyciela.
- [ ] **M6 — Tryb „4 pola"**: rundy, strefy, życie, zapadanie podłogi, XP, wyniki.
- [ ] **M7 — Ranking i pulpit nauczyciela**: XP ręczne, poziomy, historia.
- [ ] **M8 — Dopieszczenie**: dźwięki, animacje, instrukcja obsługi, hosting.
