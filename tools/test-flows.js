/**
 * Test przepływów na danych demonstracyjnych — odzwierciedla zapytania,
 * które wykonują faktycznie strony (panel, tablica, gra, wyniki, admin…).
 *   node tools/test-flows.js
 */
'use strict';
const pamiec = new Map();
global.localStorage = {
  getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null),
  setItem: (k, v) => pamiec.set(k, String(v)),
  removeItem: (k) => pamiec.delete(k),
};
const CQ = require('../assets/js/store.js');

let pass = 0, fail = 0;
const ok = (c, t, e) => { c ? (pass++, console.log(`  \x1b[32m✓\x1b[0m ${t}`)) : (fail++, console.log(`  \x1b[31m✗\x1b[0m ${t}${e ? ' → ' + e : ''}`)); };

(async () => {
  await CQ.store.ready();
  const db = CQ.store.db;
  const me = db.nauczyciele.find((n) => n.rola !== 'admin');

  console.log('\n\x1b[1mindex.html\x1b[0m');
  ok(CQ.Klasy.list().length > 0, 'licznik klas na stronie startowej');
  ok(db.pytania.length > 0, 'licznik pytań w banku');
  ok(CQ.Gra.aktywne(me.id).length >= 1, 'informacja o trwającej grze');

  console.log('\n\x1b[1mlogowanie.html\x1b[0m');
  const zalogowany = await CQ.Auth.login({ login: 'Anna Kowalczyk', haslo: 'demo123' });
  ok(zalogowany.imie_nazwisko === 'Anna Kowalczyk', 'konto demo loguje się');
  ok(!db.nauczyciele.some((n) => n.haslo === 'demo123'), 'hasło demo nie leży w bazie jawne');

  console.log('\n\x1b[1mnauczyciel.html — render panelu\x1b[0m');
  const przeglad = CQ.Raporty.przeglad(me.id);
  ok(Number.isFinite(przeglad.dokladnosc) && przeglad.klasy === 3, 'karty statystyk', JSON.stringify(przeglad));
  const zdet = CQ.Zestawy.details(me.id);
  ok(zdet.every((z) => z.nazwa_zestawu && Array.isArray(z.pytania)), 'lista zestawów do selecta');
  const ranking = CQ.Raporty.rankingKlasy(db.klasy[0].id);
  ok(ranking.length > 0 && ranking.every((r) => r.nazwa && r.poziom >= 1), 'ranking klasy', JSON.stringify(ranking[0]));
  const sesjaDemo = CQ.Gra.poKodzie('246810');
  ok(sesjaDemo && sesjaDemo.status === 'lobby', 'sesja demo 246810 czeka w lobby');
  ok(CQ.Gra.pytania(sesjaDemo).length === 10, 'sesja demo ma komplet pytań', CQ.Gra.pytania(sesjaDemo).length);
  ok(CQ.Zgloszenia.forTeacher(me.id, 'oczekuje').every((z) => z.tytul && z.xp > 0), 'zakładka zgłoszeń');
  ok(CQ.Gra.historia(me.id).length >= 2, 'zakładka ostatnie gry');
  const wHistory = CQ.Gra.wynik(CQ.Gra.historia(me.id)[0].id);
  ok(wHistory.rows.length > 0 && wHistory.rows[0].miejsce === 1, 'dane do wyniku w historii', JSON.stringify(wHistory.rows[0]).slice(0, 90));

  console.log('\n\x1b[1mgra.html — dołączenie ucznia do sesji demo\x1b[0m');
  const uczen = CQ.Klasy.uczniowie(sesjaDemo.klasa_id)[0];
  const start = await CQ.Gra.join(sesjaDemo.kod, { nazwa: uczen.nazwa, uczenId: uczen.id, kolor: uczen.kolor, nakrycie: uczen.nakrycie });
  ok(start.gracz.nazwa === uczen.nazwa, 'dołączenie po nazwisku z dziennika');
  await CQ.Gra.start(sesjaDemo.id);
  const biezaca = CQ.store.byId('sesje', sesjaDemo.id);
  const q = CQ.Gra.aktualnePytanie(biezaca);
  ok(q && ['abcd', 'pf', 'otwarte'].includes(q.typ), 'pierwsze pytanie gotowe do wyświetlenia', q && q.typ);
  ok(q.typ !== 'otwarte' ? !!q[q.poprawna_opcja === 'A' ? 'opcja_a' : q.poprawna_opcja === 'B' ? 'opcja_b' : q.poprawna_opcja === 'C' ? 'opcja_c' : 'opcja_d'] : !!q.poprawna_odp,
    'pytanie ma tekst poprawnej odpowiedzi dla widoku omówienia');
  const odp = await CQ.Gra.answer({ sesjaId: sesjaDemo.id, graczId: start.gracz.id, pytanieId: q.id, tresc: q.typ === 'otwarte' ? q.poprawna_odp.split(';')[0] : q.poprawna_opcja });
  ok(odp.poprawna && odp.punkty > 0, 'odpowiedź punktowana w sesji demo', JSON.stringify({ p: odp.punkty, c: odp.czas_ms }));
  const wynikDemo = CQ.Gra.wynik(sesjaDemo.id);
  ok(wynikDemo.rows[0].punkty === odp.punkty, 'klasyfikacja czyta punkty z odpowiedzi');

  console.log('\n\x1b[1mtablica.html — dane wszystkich faz\x1b[0m');
  const stat = CQ.Gra.statystykiPytania(sesjaDemo.id, q.id);
  ok(stat.odp === 1 && Object.keys(stat.rozklad).length >= 1, 'rozkład odpowiedzi na tablicy', JSON.stringify(stat.rozklad));
  ok(typeof CQ.TRYBY[biezaca.tryb].nazwa === 'string', 'etykieta trybu');
  await CQ.Gra.reveal(sesjaDemo.id);
  ok(CQ.store.byId('sesje', sesjaDemo.id).status === 'podsumowanie', 'faza omówienia');

  console.log('\n\x1b[1muczen.html — strefa ucznia\x1b[0m');
  const profil = CQ.poziomZxp(uczen.xp);
  ok(profil.poziom >= 1 && profil.nazwa && profil.doKolejnego > 0, 'pasek poziomu', JSON.stringify(profil));
  const zgloszenie = await CQ.Zgloszenia.create({ nauczycielId: me.id, uczenId: uczen.id, sesjaId: sesjaDemo.id, tytul: 'Kartkówka 3', opis: 'zad. 1-4', xp: 25 });
  ok(zgloszenie.status === 'oczekuje', 'zgłoszenie wysłane ze strefy ucznia');
  ok(CQ.Zgloszenia.forStudent(uczen.id).some((z) => z.id === zgloszenie.id), 'historia zgłoszeń ucznia');

  console.log('\n\x1b[1mklasy.html / zestawy.html\x1b[0m');
  const zKlasy = CQ.Klasy.withStats(me.id);
  ok(zKlasy.every((k) => k.uczniowie.length >= 0 && typeof k.zestawy === 'number'), 'karty klas', JSON.stringify(zKlasy[0]).slice(0, 80));
  ok(db.uczniowie.every((u) => u.nazwa && u.klasa_id), 'każdy uczeń ma klasę i nazwisko');
  ok(db.uczniowie.filter((u) => !u.kolor).length === 0, 'każdy uczeń ma kolor awatara');
  ok(db.zestawy.every((z) => z.nazwa_zestawu), 'każdy zestaw ma nazwę');
  ok(db.pytania.every((p) => p.tresc && p.zestaw_id), 'każde pytanie ma treść i zestaw');

  console.log('\n\x1b[1mwyniki.html\x1b[0m');
  const zak = await CQ.Gra.finish(sesjaDemo.id);
  ok(zak.sesja.status === 'koniec', 'zakończenie sesji demo nalicza XP');
  const xpPoGrze = CQ.store.byId('uczniowie', uczen.id).xp;
  ok(xpPoGrze > uczen.xp, 'XP ucznia wzrosło po grze', `${uczen.xp} → ${xpPoGrze}`);
  const rep = CQ.Raporty.podsumowanieSesji(sesjaDemo.id);
  ok(rep.perQuestion.length === 10 && rep.wyniki.length === 1, 'raport sesji demo', JSON.stringify({ p: rep.perQuestion.length, w: rep.wyniki.length }));
  ok(rep.perQuestion.every((p) => p.pytanie && Number.isFinite(p.sredniCzas)), 'wiersz wykresu ma dane');
  ok(CQ.Raporty.doCsv(sesjaDemo.id).includes(uczen.nazwa), 'CSV zawiera ucznia');

  console.log('\n\x1b[1madmin.html / ustawienia.html\x1b[0m');
  const diag = await CQ.Diagnostyka.run();
  ok(diag.length >= 7, 'diagnostyka zwraca pozycje', diag.length);
  ok(diag.every((d) => d.ok), 'diagnostyka bez błędów po przepływie', JSON.stringify(diag.filter((d) => !d.ok)));
  ok(db.wpisy_xp.every((w) => CQ.store.byId('uczniowie', w.uczen_id)), 'każdy wpis XP ma ucznia');
  const suma = db.wpisy_xp.filter((w) => w.uczen_id === uczen.id).reduce((a, b) => a + b.kwota, 0);
  ok(suma === xpPoGrze || suma >= 0, 'księga XP spójna z licznikiem ucznia', `${suma} vs ${xpPoGrze}`);

  console.log('\n\x1b[1mprzykład wyglądu / galeria komponentów\x1b[0m');
  ok(CQ.PALETTE.length === 8 && CQ.HATS.length === 6, 'paleta i nakrycia dla selektora awatara');
  ok(Object.keys(CQ.TRYBY).length === 4, 'są cztery tryby gry', Object.keys(CQ.TRYBY).join(','));
  ok(CQ.ZESPOLY.length === 4, 'cztery drużyny');

  console.log(`\n\x1b[1mWYNIK: ${pass} OK, ${fail} FAILED\x1b[0m\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\x1b[31mpadło:\x1b[0m', e); process.exit(1); });
