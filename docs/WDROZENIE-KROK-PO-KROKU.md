# ClassQuest — instrukcja wdrożenia dla właściciela (krok po kroku)

> Czytaj z telefonu. Wszystkie kroki są klikane w przeglądarce, bez instalowania czegokolwiek.
> **Nie wysyłaj haseł na czacie** — wpisujesz je bezpośrednio w oknach na stronach (Supabase/Koyeb/Render).
> Do mnie na czacie wklejasz **tylko adres (URL) Twojej aplikacji** — to nie jest tajemnica.

---

## RUNDA 1 — Supabase (baza danych; możesz zrobić od razu, ~15 minut)

Ta runda pomaga mi przygotować i przetestować migrację. Możesz ją zrobić teraz albo poczekać — sama migracja i tak będzie po mojej stronie.

1. Wejdź na **https://supabase.com** → kliknij **Start your project** (niebieski przycisk).
2. Zaloguj się przez **GitHub** (najszybciej) albo e-mail.
3. Po wejściu w panel kliknij **New project**.
4. Ustaw:
   - **Name**: `classquest`
   - **Database Password**: wymyśl i **zapisz gdzieś** (będzie potrzebne później przy podłączaniu). Możesz kliknąć ikonę kłódki, żeby wygenerowali Ci mocne hasło — i skopiuj je do notatek.
   - **Region**: wybierz najbliższy (np. `Frankfurt (fra)`), **Cloud: AWS** (albo co tam domyślnie wybiorą).
5. Kliknij **Create new project** i poczekaj ~2–3 minuty, aż projekt się utworzy.
6. Nic więcej tam nie rób. **Daj mi znać na czacie, że Supabase jest gotowe** — resztą zajmę się ja (a konkretnie powiem Ci dokładnie, co skopiować i gdzie wkleić, żeby hasło nie musiało przechodzić przez czat).

> 💡 Supabase za darmo: baza sama „usypia" po 7 dniach bez żadnych zapytań. Dodamy prosty codzienny „budzik", żeby nigdy nie usnęła — to zrobimy na końcu, bez Twojego udziału.

---

## RUNDA 2 — Koyeb (aplikacja / „radiowęzeł") — MOŻESZ ZROBIĆ TERAZ

Migracja kodu jest gotowa i przetestowana (na lokalnym Postgresie działa pełna gra).
Aplikacja **sama utworzy tabele** w Supabase przy pierwszym starcie — nie musisz
uruchamiać żadnego SQL ręcznie.

1. Wejdź na **https://app.koyeb.com** → **Sign up** przez **GitHub**.
   - Jeśli przy rejestracji poproszą o kartę kredytową → **napisz mi**, przechodzimy na Render (instrukcja niżej; praca ta sama).
2. Kliknij **Create App** → **GitHub** → wybierz repozytorium **rejson59/ClassQuest** i gałąź **arena/01a0734f-classquest**.
3. Ustawienia (jeśli nie uzupełnią się same):
   - **Builder**: Buildpack
   - **Build command**: `npm install && npm run build`
   - **Run command**: `npm start`
   - **Port**: `4001`
4. Rozwiń sekcję **Environment variables** i dodaj trzy zmienne:
   | Nazwa | Wartość |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | skopiuj z Supabase: **Project Settings → Database → Connection string (URI)** — wklejasz ją TUTAJ, nie na czacie |
   | `JWT_SECRET` | podam Ci gotową na czacie (możesz też wymyślić własny długi ciąg znaków) |
5. Kliknij **Deploy** i poczekaj ~3–5 minut na pierwszy build.
6. Gdy aplikacja wstanie, Koyeb pokaże Ci adres, np. `https://classquest--twojlogin.koyeb.app`. **Wklej mi ten adres na czacie** — sprawdzę, czy wszystko gra (logowanie, gry, panel admina).
7. Wejdź na swój adres i **zarejestruj swoje konto** (e-mail + hasło) — pierwsze konto w bazie automatycznie zostaje **administratorem**. (Uwaga: na produkcji NIE ma konta demo — celowo, żeby nikt obcy nie mógł się zalogować.)

---

## RUNDA 2-AWARYJNA — Render (tylko jeśli Koyeb poprosi o kartę)

1. Wejdź na **https://render.com** → **Get started** → zaloguj przez **GitHub** (bez karty).
2. Kliknij **New +** → **Web Service** → wybierz repo **rejson59/ClassQuest**, gałąź **arena/01a0734f-classquest**.
3. Wybierz plan **Free** i ustaw:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
4. Rozwiń **Advanced → Environment Variables** i dodaj te same 3 zmienne co wyżej.
5. **Create Web Service** → poczekaj ~3–5 minut.
6. Adres będzie jak `https://classquest.onrender.com` — **wklej mi go na czacie**.

> 💡 Render po 15 minutach bez ruchu usypia na ~1 minutę. Żeby nie było czekania na starcie lekcji, ustawimy darmowy „budzik" (ping co 10 minut) — to robię ja, bez Twojego udziału.

---

## Czego NIE robić

- ❌ **Nie wysyłaj na czacie**: hasła bazy Supabase, `DATABASE_URL`, kluczy API.
- ❌ Nie kasuj projektu Supabase ani nie zmieniaj regionu po utworzeniu.
- ✅ Możesz wysyłać: adres aplikacji (`*.koyeb.app` / `*.onrender.com`), zrzuty ekranu z błędami.

## Co już jest zrobione (moja robota — 2026-09-06)

1. ✅ Migracja kodu: serwer działa na SQLite **lub** PostgreSQL (Supabase) — jeden kod, wybór przez zmienną `DATABASE_URL`.
2. ✅ Aplikacja sama tworzy tabele w Supabase przy pierwszym starcie (bez ręcznego SQL).
3. ✅ Pierwsze zarejestrowane konto automatycznie zostaje administratorem (bezpieczne na produkcji).
4. ✅ Przetestowane na prawdziwym Postgresie: pełna gra E2E (2 uczniów), cały REST, role, kaskady, eksport — zielone.
5. ✅ Testy w repo (`testy/`), gotowe do odtworzenia po wdrożeniu na żywo.

## Co jeszcze (po Twojej Rundzie 2)

1. Ty robisz Rundę 2 (Koyeb) albo 2-awaryjną (Render) i wklejasz mi adres aplikacji.
2. Ja sprawdzam na żywo (logowanie, rejestracja = admin, gry, panel `/admin`) i odtwarzam testy z `testy/`.
3. Dodaję „budziki" (Supabase 1×/dzień, przy Renderze ping co 10 min), żeby nic nie usypiało na stałe.
4. Doradzam zmianę hasła bazy Supabase (dla czystego sumienia po testach) i zostawiam Cię z działającą platformą.
