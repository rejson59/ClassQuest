-- ==========================================================================
--  ClassQuest — schemat bazy dla Supabase (PostgreSQL / PostgREST)
--  Uruchom w: Supabase Dashboard → SQL Editor → New query → Run
-- ==========================================================================
--  Nazwy tabel zgadzają się z mapowaniem w assets/js/store.js
--  (nauczyciele, cq_klasy, cq_uczniowie, zestaw_pytan, pytania, sesje_gier,
--   cq_gracze, cq_odpowiedzi, cq_zgloszenia, cq_wpisy_xp, cq_meta).
--
--  Polityki RLS poniżej są zaprojektowane dla PRACY KLASOWEJ z kluczem
--  publicznym (anon): każdy z kodem pokoju może dołączyć i odpowiedzieć.
--  Przed wystawieniem tego do internetu „na całą szkołę” przeczytaj sekcję
--  BEZPIECZEŃSTWO na końcu pliku.
-- ==========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- nauczyciele
create table if not exists public.nauczyciele (
  id              uuid primary key default gen_random_uuid(),
  imie_nazwisko   text not null unique,
  email           text,
  haslo_hash      text not null,           -- SHA-256(hasło + sol), liczone w przeglądarce
  sol             text not null,
  rola            text not null default 'nauczyciel',   -- 'nauczyciel' | 'admin'
  przedmiot       text,
  ost_logowanie   timestamptz,
  utworzono       timestamptz not null default now(),
  updated_at      timestamptz
);

-- ----------------------------------------------------------------------- klasy
create table if not exists public.cq_klasy (
  id              uuid primary key default gen_random_uuid(),
  nauczyciel_id   uuid references public.nauczyciele(id) on delete cascade,
  nazwa           text not null,
  opis            text,
  kod             text,                    -- 4 cyfry, do zgłoszeń i list
  kolor           text,
  utworzono       timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists cq_klasy_naucz_idx on public.cq_klasy (nauczyciel_id);

-- ------------------------------------------------------------------ uczniowie
create table if not exists public.cq_uczniowie (
  id              uuid primary key default gen_random_uuid(),
  klasa_id        uuid references public.cq_klasy(id) on delete cascade,
  nazwa           text not null,
  numer           integer,
  kolor           text,
  nakrycie        text,
  xp              integer not null default 0,
  utworzono       timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists cq_uczniowie_klasa_idx on public.cq_uczniowie (klasa_id);
create unique index if not exists cq_uczniowie_uniq on public.cq_uczniowie (klasa_id, lower(nazwa));

-- ------------------------------------------------------------ bank pytań
create table if not exists public.zestaw_pytan (
  id              uuid primary key default gen_random_uuid(),
  nauczyciel_id   uuid references public.nauczyciele(id) on delete cascade,
  klasa_id        uuid references public.cq_klasy(id) on delete set null,
  nazwa_zestawu   text not null,
  przedmiot       text,
  opis            text,
  utworzono       timestamptz not null default now(),
  updated_at      timestamptz
);

create table if not exists public.pytania (
  id              uuid primary key default gen_random_uuid(),
  zestaw_id       uuid references public.zestaw_pytan(id) on delete cascade,
  tresc           text not null,
  typ             text not null default 'abcd',       -- 'abcd' | 'pf' | 'otwarte'
  opcja_a         text,
  opcja_b         text,
  opcja_c         text,
  opcja_d         text,
  poprawna_opcja  text,                    -- 'A'..'D' dla abcd, 'A'/'B' dla pf
  poprawna_odp    text,                    -- alternatywy po ';' dla otwartych
  punkty          integer not null default 100,
  czas            integer not null default 20,
  wytlumaczenie   text,
  kolejnosc       integer not null default 1,
  utworzono       timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists pytania_zestaw_idx on public.pytania (zestaw_id, kolejnosc);

-- ------------------------------------------------------------------ sesje_gier
create table if not exists public.sesje_gier (
  id                    uuid primary key default gen_random_uuid(),
  kod                   text not null,
  nauczyciel_id         uuid references public.nauczyciele(id) on delete cascade,
  klasa_id              uuid references public.cq_klasy(id) on delete set null,
  zestaw_id             uuid references public.zestaw_pytan(id) on delete cascade,
  tryb                  text not null default 'klasyczny',  -- klasyczny|ekspres|druzyny|trening
  status                text not null default 'lobby',      -- lobby|pytanie|podsumowanie|przerwa|koniec
  indeks                integer not null default 0,
  limit_s               integer not null default 20,
  start_od              timestamptz,
  punkty_bazowe         integer not null default 1000,
  bonus_max             integer not null default 500,
  nagroda_xp            boolean not null default true,
  zakonczono_przerwa    timestamptz,
  nota                  text,
  zakonczo              timestamptz,
  utworzono             timestamptz not null default now(),
  updated_at            timestamptz
);
create unique index if not exists sesje_kod_open_idx on public.sesje_gier (kod) where status <> 'koniec';
create index if not exists sesje_naucz_idx on public.sesje_gier (nauczyciel_id, utworzono desc);

-- ------------------------------------------------------------------- gracze
create table if not exists public.cq_gracze (
  id              uuid primary key default gen_random_uuid(),
  sesja_id        uuid references public.sesje_gier(id) on delete cascade,
  uczen_id        uuid references public.cq_uczniowie(id) on delete set null,
  nazwa           text not null,
  kolor           text,
  nakrycie        text,
  zespol          integer not null default 0,
  utworzono       timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists cq_gracze_sesja_idx on public.cq_gracze (sesja_id);

-- --------------------------------------------------------------- odpowiedzi
create table if not exists public.cq_odpowiedzi (
  id              uuid primary key default gen_random_uuid(),
  sesja_id        uuid references public.sesje_gier(id) on delete cascade,
  gracz_id        uuid references public.cq_gracze(id) on delete cascade,
  pytanie_id      uuid references public.pytania(id) on delete cascade,
  tresc           text,
  poprawna        boolean not null default false,
  punkty          integer not null default 0,
  czas_ms         integer not null default 0,
  utworzono       timestamptz not null default now(),
  updated_at      timestamptz
);
create unique index if not exists cq_odp_uniq on public.cq_odpowiedzi (gracz_id, pytanie_id);
create index if not exists cq_odp_sesja_idx on public.cq_odpowiedzi (sesja_id);

-- --------------------------------------------------- zgłoszenia o dodatkowe XP
create table if not exists public.cq_zgloszenia (
  id              uuid primary key default gen_random_uuid(),
  nauczyciel_id   uuid references public.nauczyciele(id) on delete cascade,
  uczen_id        uuid references public.cq_uczniowie(id) on delete cascade,
  sesja_id        uuid references public.sesje_gier(id) on delete set null,
  tytul           text not null,
  opis            text,
  xp              integer not null default 10,
  status          text not null default 'oczekuje',   -- oczekuje|zatwierdzone|odrzucone
  komentarz       text,
  rozstrzygnieto  timestamptz,
  utworzono       timestamptz not null default now(),
  updated_at      timestamptz
);

-- ------------------------------------------------------------- księga XP
create table if not exists public.cq_wpisy_xp (
  id              uuid primary key default gen_random_uuid(),
  uczen_id        uuid references public.cq_uczniowie(id) on delete cascade,
  kwota           integer not null,
  powod            text,
  typ             text not null default 'manualne',   -- manualne|gra|wniosek|bonus
  sesja_id        uuid references public.sesje_gier(id) on delete set null,
  utworzono       timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists cq_xp_uczen_idx on public.cq_wpisy_xp (uczen_id, utworzono desc);

-- ------------------------------------------------------------------ meta
create table if not exists public.cq_meta (
  id              text primary key,
  key             text,
  wersja          integer,
  note            text,
  utworzono       timestamptz not null default now(),
  updated_at      timestamptz
);

-- ==========================================================================
--  Widok pomocniczy: ranking klasy wg sumy XP (do raportów poza aplikacją)
-- ==========================================================================
create or replace view public.cq_ranking_klasy as
select  k.nazwa               as klasa,
        u.id                  as uczen_id,
        u.nazwa               as uczen,
        u.numer               as numer,
        u.xp                  as xp,
        (u.xp / 400) + 1      as poziom,
        (select count(*) from public.cq_odpowiedzi o
           join public.cq_gracze g on g.id = o.gracz_id
          where g.uczen_id = u.id and o.poprawna) as odpowiedzi_poprawne
from public.cq_uczniowie u
join public.cq_klasy k on k.id = u.klasa_id
order by k.nazwa, u.xp desc;

-- ==========================================================================
--  Bezpieczeństwo poziomu klasy:anon (klucz publiczny)
--  Supabase: włącz RLS i daj zapis tylko przez te polityki.
-- ==========================================================================
alter table public.nauczyciele   enable row level security;
alter table public.cq_klasy      enable row level security;
alter table public.cq_uczniowie  enable row level security;
alter table public.zestaw_pytan  enable row level security;
alter table public.pytania       enable row level security;
alter table public.sesje_gier    enable row level security;
alter table public.cq_gracze     enable row level security;
alter table public.cq_odpowiedzi enable row level security;
alter table public.cq_zgloszenia enable row level security;
alter table public.cq_wpisy_xp   enable row level security;
alter table public.cq_meta       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['nauczyciele','cq_klasy','cq_uczniowie','zestaw_pytan','pytania','sesje_gier','cq_gracze','cq_odpowiedzi','cq_zgloszenia','cq_wpisy_xp','cq_meta']
  loop
    execute format('drop policy if exists "%s_anon_all" on public.%I', t, t);
    execute format('create policy "%s_anon_all" on public.%I for all to anon, authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant select on public.cq_ranking_klasy to anon, authenticated;

-- ==========================================================================
--  BEZPIECZEŃSTWO — przeczytaj przed wystawieniem poza sieć klasy
-- --------------------------------------------------------------------------
--  1. Polityki powyżej dają kluczowi publicznemu (anon) pełny zapis. To celowy
--     kompromis dla demonstracji i pracy przy jednym komputerze/serwerze.
--  2. Do wdrożenia szkolnego:
--       • załóż Supabase Auth (auth.users) i połącz nauczycieli przez
--         nauczyciele.id ↔ auth.users.id (auth.uid()),
--       • zamień polityki na:
--             using ( nauczyciel_id = auth.uid() )
--         dla zasobów nauczyciela oraz
--             using ( exists (select 1 from sesje_gier s
--                     where s.id = sesja_id and s.status <> 'koniec') )
--         dla cq_gracze / cq_odpowiedzi (dostęp tylko do otwartej gry),
--       • przenieś hashowanie haseł na serwer (Edge Function) — hashowanie
--         w przeglądarce NIE zastępuje uwierzytelniania po stronie backendu.
--  3. Kolumny `haslo_hash` / `sol` trzymamy wyłącznie dla zgodności z
--     obecnym klientem; w produkcji ich tu nie potrzeba.
-- ==========================================================================
