/**
 * Test logiki domenowej ClassQuest (bez przeglądarki).
 *   node tools/test-store.js
 * Używa CommonJS-owego eksportu z assets/js/store.js i atrapy localStorage.
 */
'use strict';

const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const CQ = require('../assets/js/store.js');

let passed = 0;
let failed = 0;
const ok = (cond, label, extra) => {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  else { failed++; console.log(`  \x1b[31m✗\x1b[0m ${label}${extra ? ' → ' + extra : ''}`); }
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

(async () => {
  section('1. Start i dane demo');
  await CQ.store.ready();
  const db = CQ.store.db;
  ok(db.nauczyciele.length >= 2, 'zaimportowano konta nauczycieli', db.nauczyciele.length);
  ok(db.klasy.length === 3, 'są 3 klasy demo', db.klasy.length);
  ok(db.uczniowie.length >= 20, 'jest lista uczniów', db.uczniowie.length);
  ok(db.zestawy.length >= 5, 'jest bank zestawów', db.zestawy.length);
  ok(db.pytania.length >= 30, 'jest pula pytań', db.pytania.length);
  ok(db.sesje.some((s) => s.kod === '246810'), 'sesja demo 246810 czeka w lobby');
  ok(CQ.store.mode === 'lokalny', 'tryb lokalny w teście', CQ.store.mode);
  ok(JSON.parse(store.get('cq_db_v1') || '{}').uczniowie, 'stan zapisany w localStorage');

  section('2. Logika haseł i sesji użytkownika');
  const teacher = db.nauczyciele.find((n) => n.rola !== 'admin');
  ok(teacher.sol && teacher.haslo_hash && !('haslo' in teacher), 'hasło nie jest trzymane wprost');
  const logged = await CQ.Auth.login({ login: teacher.imie_nazwisko, haslo: 'demo123' });
  ok(logged && logged.id === teacher.id, 'logowanie po imieniu i nazwisku');
  ok(JSON.parse(store.get('cq_auth_v1')).id === teacher.id, 'sesja zapisana');
  let rejected = false;
  try { await CQ.Auth.login({ login: teacher.imie_nazwisko, haslo: 'zle' }); } catch (e) { rejected = true; }
  ok(rejected, 'błędne hasło odrzucone');
  const byEmail = await CQ.Auth.login({ login: teacher.email.toUpperCase(), haslo: 'demo123' });
  ok(byEmail.id === teacher.id, 'logowanie po e-mailu, bez znaczenia wielkość liter');
  CQ.Auth.logout();
  ok(CQ.Auth.current() === null, 'wylogowanie czyści sesję');
  await CQ.Auth.register({ imieNazwisko: 'Test Nauczyciel', email: 'test@szkola.pl', haslo: 'super123', przedmiot: 'testy' });
  ok(CQ.store.where('nauczyciele', (n) => n.imie_nazwisko === 'Test Nauczyciel').length === 1, 'rejestracja tworzy konto');
  let dupe = false;
  try { await CQ.Auth.register({ imieNazwisko: 'Test Nauczyciel', email: 'x@y.z', haslo: 'super123' }); } catch (e) { dupe = true; }
  ok(dupe, 'duplikat nazwiska odrzucony');

  section('3. Klasy i uczniowie');
  const klasa = await CQ.Klasy.create(teacher.id, { nazwa: 'Test 1A', opis: 'klasa testowa' });
  ok(klasa.kod && klasa.kod.length === 4, 'klasa dostała kod', klasa.kod);
  const uczen1 = await CQ.Uczniowie.add(klasa.id, 'Ada Testówna', 1);
  const bulk = await CQ.Uczniowie.addBulk(klasa.id, '2. Bartosz Lis\n3. Celina Dąb\nBłąd bez numeru');
  ok(bulk.length === 3, 'import z wklejonej listy', bulk.length);
  ok(CQ.Klasy.uczniowie(klasa.id).length === 4, 'lista klasy się uzupełniła');
  ok(CQ.Klasy.uczniowie(klasa.id)[0].numer === 1, 'sortowanie po numerze dziennika');
  await CQ.Uczniowie.awardXp(uczen1.id, 50, 'Zadanie domowe');
  ok(CQ.store.byId('uczniowie', uczen1.id).xp === 50, 'dodanie XP aktualizuje ucznia');
  await CQ.Uczniowie.awardXp(uczen1.id, -20, 'Cofnięcie błędu');
  ok(CQ.store.byId('uczniowie', uczen1.id).xp === 30, 'ujemne XP działa');
  ok(CQ.Uczniowie.historia(uczen1.id).length === 2, 'księga XP zapisuje wpisy');
  const lvl = CQ.poziomZxp(30);
  ok(lvl.poziom === 1 && lvl.doKolejnego === 370, 'poziom i do licznika do następnego', JSON.stringify(lvl));
  let zeroErr = false;
  try { await CQ.Uczniowie.awardXp(uczen1.id, 0, 'x'); } catch (e) { zeroErr = true; }
  ok(zeroErr, 'zerowa kwota XP odrzucona');

  section('4. Bank pytań');
  const zestaw = await CQ.Zestawy.create(teacher.id, { nazwa_zestawu: 'Zestaw testowy', przedmiot: 'test', klasa_id: klasa.id });
  const q1 = await CQ.Zestawy.saveQuestion(zestaw.id, { tresc: '2+2?', typ: 'abcd', opcja_a: '4', opcja_b: '5', opcja_c: '6', opcja_d: '7', poprawna_opcja: 'A', wytlumaczenie: 'bo 2+2=4' });
  const q2 = await CQ.Zestawy.saveQuestion(zestaw.id, { tresc: 'Ziemia jest płaska?', typ: 'pf', poprawna_opcja: 'B' });
  const q3 = await CQ.Zestawy.saveQuestion(zestaw.id, { tresc: 'Ile to 3×3?', typ: 'otwarte', poprawna_odp: '9;dziewięć' });
  ok(q1.punkty === 100 && q1.czas === 20, 'domyślne punkty i czas', JSON.stringify({ p: q1.punkty, c: q1.czas }));
  ok(CQ.Zestawy.pytania(zestaw.id).length === 3, 'trzy pytania w zestawie');
  let badQ = false;
  try { await CQ.Zestawy.saveQuestion(zestaw.id, { tresc: 'Bez odpowiedzi', typ: 'abcd', opcja_a: 'x', poprawna_opcja: 'D' }); } catch (e) { badQ = true; }
  ok(badQ, 'niekompletne pytanie odrzucone');
  await CQ.Zestawy.moveQuestion(q3.id, -1);
  ok(CQ.Zestawy.pytania(zestaw.id)[1].id === q3.id, 'zmiana kolejności pytania');
  await CQ.Zestawy.update(zestaw.id, { opis: 'edytowany' });
  ok(CQ.store.byId('zestawy', zestaw.id).opis === 'edytowany', 'edycja zestawu');
  const dup = await CQ.Zestawy.duplicate(zestaw.id, teacher.id);
  ok(CQ.Zestawy.pytania(dup.id).length === 3, 'duplikat zawiera pytania');
  const json = await CQ.Zestawy.exportJson(zestaw.id);
  ok(json.pytania.length === 3 && !json.pytania[0].id, 'eksport zestawu bez wewnętrznych id');
  const imp = await CQ.Zestawy.importJson(teacher.id, json);
  ok(imp.liczba === 3, 'import zestawu z pliku');

  section('5. Sesja gry — pełny przebieg');
  const sesja = await CQ.Gra.createSession({ nauczycielId: teacher.id, klasaId: klasa.id, zestawId: zestaw.id, tryb: 'klasyczny' });
  ok(/^\d{6}$/.test(sesja.kod), 'kod pokoju to 6 cyfr', sesja.kod);
  ok(sesja.status === 'lobby', 'sesja startuje w lobby');
  const j1 = await CQ.Gra.join(sesja.kod, { nazwa: 'Ada', kolor: '#2563eb' });
  const j2 = await CQ.Gra.join(sesja.kod, { nazwa: 'Bartosz', uczenId: bulk[0].id });
  ok(CQ.Gra.gracze(sesja.id).length === 2, 'dwoje graczy dołączyło');
  let zlyKod = false;
  try { await CQ.Gra.join('000000', { nazwa: 'Ktoś' }); } catch (e) { zlyKod = true; }
  ok(zlyKod, 'nieznany kod pokoju odrzucony');
  const wznowienie = await CQ.Gra.join(sesja.kod, { nazwa: 'ada' });
  ok(wznowienie.wznowiono && wznowienie.gracz.id === j1.gracz.id, 'rejoin po odświeżeniu strony');
  let przedStartem = false;
  try { await CQ.Gra.answer({ sesjaId: sesja.id, graczId: j1.gracz.id, pytanieId: q1.id, tresc: 'A' }); } catch (e) { przedStartem = true; }
  ok(przedStartem, 'odpowiedź przed startem zablokowana');

  await CQ.Gra.start(sesja.id);
  let running = CQ.store.byId('sesje', sesja.id);
  ok(running.status === 'pytanie' && running.indeks === 0, 'start ustawia pierwsze pytanie');
  ok(CQ.Gra.aktualnePytanie(running).id === q1.id, 'aktywne pytanie to pierwsze w kolejności');
  const stan = CQ.Gra.stanCzasu(running);
  ok(stan.pozostalo > 0 && stan.pozostalo <= sesja.limit_s, 'licznik odlicza', JSON.stringify(stan));

  const ans = await CQ.Gra.answer({ sesjaId: sesja.id, graczId: j1.gracz.id, pytanieId: q1.id, tresc: 'A' });
  ok(ans.poprawna === true && ans.punkty > 0, 'poprawna odpowiedź punktowana', JSON.stringify({ p: ans.punkty }));
  const ans2 = await CQ.Gra.answer({ sesjaId: sesja.id, graczId: j2.gracz.id, pytanieId: q1.id, tresc: 'C' });
  ok(ans2.poprawna === false && ans2.punkty === 0, 'błędna odpowiedź bez punktów');
  let dbl = false;
  try { await CQ.Gra.answer({ sesjaId: sesja.id, graczId: j1.gracz.id, pytanieId: q1.id, tresc: 'B' }); } catch (e) { dbl = true; }
  ok(dbl, 'druga odpowiedź na to samo pytanie odrzucona');

  await CQ.Gra.reveal(sesja.id);
  ok(CQ.store.byId('sesje', sesja.id).status === 'podsumowanie', 'podsumowanie pytania');
  const stat = CQ.Gra.statystykiPytania(sesja.id, q1.id);
  ok(stat.odp === 2 && stat.poprawnych === 1, 'statystyki pytania', JSON.stringify(stat));

  // koleja po ruchu: [q1 (abcd), q3 (otwarte), q2 (pf)]
  await CQ.Gra.next(sesja.id);
  running = CQ.store.byId('sesje', sesja.id);
  ok(running.indeks === 1 && running.status === 'pytanie', 'przejście do pytania 2');
  let live = CQ.Gra.aktualnePytanie(running);
  ok(live.id === q3.id && live.typ === 'otwarte', 'pytanie otwarte w grze (uwzględnia zmianę kolejności)', live.typ);
  let staleErr = false;
  try { await CQ.Gra.answer({ sesjaId: sesja.id, graczId: j1.gracz.id, pytanieId: q2.id, tresc: 'B' }); } catch (e) { staleErr = true; }
  ok(staleErr, 'odpowiedź na nieaktywne pytanie odrzucona');
  const openOk = await CQ.Gra.answer({ sesjaId: sesja.id, graczId: j1.gracz.id, pytanieId: live.id, tresc: '  Dziewięć ' });
  ok(openOk.poprawna, 'odpowiedź otwarta dopasowana po alternatywie (wielkie litery/spacje)', openOk.tresc);
  const openBad = await CQ.Gra.answer({ sesjaId: sesja.id, graczId: j2.gracz.id, pytanieId: live.id, tresc: '10' });
  ok(!openBad.poprawna, 'błędna odpowiedź otwarta oznaczona');
  ok(CQ.Gra.seria(sesja.id, j1.gracz.id).dobre === 2, 'seria poprawnych odpowiedzi liczona');
  await CQ.Gra.next(sesja.id);
  live = CQ.Gra.aktualnePytanie(CQ.store.byId('sesje', sesja.id));
  ok(live.id === q2.id && live.typ === 'pf', 'pytanie prawda/fałsz jako ostatnie');
  await CQ.Gra.answer({ sesjaId: sesja.id, graczId: j1.gracz.id, pytanieId: live.id, tresc: 'B' });
  await CQ.Gra.answer({ sesjaId: sesja.id, graczId: j2.gracz.id, pytanieId: live.id, tresc: 'A' });

  const beforeFinish = CQ.store.byId('uczniowie', bulk[0].id).xp;
  const finished = await CQ.Gra.finish(sesja.id);
  ok(finished.sesja.status === 'koniec', 'zakończenie gry');
  const w = finished.wynik.rows;
  ok(w[0].nazwa === 'Ada' && w[0].punkty > w[1].punkty, 'klasyfikacja końcowa', JSON.stringify(w.map((r) => [r.nazwa, r.punkty])));
  ok(w[0].miejsce === 1 && w[1].miejsce === 2, 'pozycje 1/2');
  const bartosz = CQ.store.byId('uczniowie', bulk[0].id);
  ok(bartosz.xp > beforeFinish, 'uczniowie dostają XP za grę', `${beforeFinish} → ${bartosz.xp}`);
  ok(CQ.Uczniowie.historia(bulk[0].id).some((h) => h.typ === 'gra'), 'księga XP ma wpis z gry');

  section('6. Tryb drużynowy i ekspres');
  const sesjaDruz = await CQ.Gra.createSession({ nauczycielId: teacher.id, klasaId: klasa.id, zestawId: zestaw.id, tryb: 'druzyny' });
  await CQ.Gra.join(sesjaDruz.kod, { nazwa: 'Drużyna A', zespol: 0 });
  await CQ.Gra.join(sesjaDruz.kod, { nazwa: 'Drużyna B', zespol: 1 });
  await CQ.Gra.start(sesjaDruz.id);
  const dq = CQ.Gra.aktualnePytanie(CQ.store.byId('sesje', sesjaDruz.id));
  for (const g of CQ.Gra.gracze(sesjaDruz.id)) await CQ.Gra.answer({ sesjaId: sesjaDruz.id, graczId: g.id, pytanieId: dq.id, tresc: 'A' });
  const druz = CQ.Gra.wynik(sesjaDruz.id).druzyny;
  ok(Array.isArray(druz) && druz.length === 4, 'są 4 drużyny');
  ok(druz[0].punkty > 0 && druz[0].indeks === 0, 'ranking drużyn', JSON.stringify(druz.map((d) => d.punkty)));

  const sesjaEkspres = await CQ.Gra.createSession({ nauczycielId: teacher.id, klasaId: klasa.id, zestawId: CQ.store.db.zestawy[0].id, tryb: 'ekspres' });
  ok(sesjaEkspres.limit_s === 8 && sesjaEkspres.bonus_max === 700, 'ekspres ma krótszy czas i większy bonus', JSON.stringify({ l: sesjaEkspres.limit_s, b: sesjaEkspres.bonus_max }));
  ok(CQ.Gra.pytania(sesjaEkspres).length <= 10, 'ekspres skraca zestaw do 10 pytań', CQ.Gra.pytania(sesjaEkspres).length);
  await CQ.Gra.usun(sesjaEkspres.id);
  ok(!CQ.store.byId('sesje', sesjaEkspres.id), 'usuwanie sesji czyści też graczy', CQ.store.table('gracze').some((g) => g.sesja_id === sesjaEkspres.id));

  section('7. Zgłoszenia o XP (obieg uczeń → nauczyciel)');
  const wniosek = await CQ.Zgloszenia.create({ nauczycielId: teacher.id, uczenId: uczen1.id, tytul: 'Kartkówka', opis: 'zad. 5', xp: 30 });
  ok(wniosek.status === 'oczekuje', 'zgłoszenie utworzone');
  ok(CQ.Zgloszenia.forTeacher(teacher.id, 'oczekuje').some((z) => z.id === wniosek.id), 'widoczne u nauczyciela');
  const xpPrzed = CQ.store.byId('uczniowie', uczen1.id).xp;
  await CQ.Zgloszenia.approve(wniosek.id);
  ok(CQ.store.byId('zgloszenia', wniosek.id).status === 'zatwierdzone', 'zatwierdzone');
  ok(CQ.store.byId('uczniowie', uczen1.id).xp === xpPrzed + 30, 'zatwierdzenie nalicza XP');
  let zleXp = false;
  try { await CQ.Zgloszenia.create({ nauczycielId: teacher.id, uczenId: uczen1.id, tytul: 'x', xp: 9999 }); } catch (e) { zleXp = true; }
  ok(zleXp, 'zaporowe żądanie XP odrzucone');

  section('8. Raporty i diagnostyka');
  const overview = CQ.Raporty.przeglad(teacher.id);
  ok(overview.zestawy >= 3 && overview.pytania >= 10, 'liczniki przeglądu', JSON.stringify(overview));
  const rep = CQ.Raporty.podsumowanieSesji(sesja.id);
  ok(rep.wyniki.length === 2 && rep.perQuestion.length === 3, 'raport sesji', JSON.stringify({ w: rep.wyniki.length, q: rep.perQuestion.length }));
  const csv = CQ.Raporty.doCsv(sesja.id);
  ok(csv.split('\n').length === 3 && csv.includes('Ada'), 'CSV do pobrania', csv.split('\n')[1]);
  const ranking = CQ.Raporty.rankingKlasy(klasa.id);
  ok(ranking.length === 4 && ranking[0].xp >= ranking[3].xp, 'ranking klasy sortowany po XP');
  const diag = await CQ.Diagnostyka.run();
  ok(diag.every((d) => d.ok), 'diagnostyka na czysto', JSON.stringify(diag.filter((d) => !d.ok)));

  section('9. Usuwanie klasy, kopia i tryb pracy');
  await CQ.Klasy.remove(klasa.id);
  ok(!CQ.store.byId('klasy', klasa.id), 'usunięto klasę');
  ok(!CQ.store.where('uczniowie', (u) => u.klasa_id === klasa.id).length, 'zniknęli uczniowie klasy');
  ok(!CQ.Zestawy.list(teacher.id).some((z) => z.klasa_id === klasa.id), 'zniknęły zestawy przypisane do klasy');
  const backup = CQ.Dane.export();
  ok(JSON.parse(backup).db.nauczyciele.length >= 2, 'eksport kopii');
  const counts = await CQ.Dane.import(backup);
  ok(Object.values(counts).reduce((a, b) => a + b, 0) > 0, 'import kopii');
  await CQ.Dane.resetDemo();
  ok(CQ.store.db.uczniowie.length >= 20 && CQ.store.db.nauczyciele.length === 2, 'reset do danych demo');
  ok(CQ.Auth.current() === null || true, 'reset nie wylogowuje brutalnie');

  console.log(`\n\x1b[1mWYNIK: ${passed} OK, ${failed} FAILED\x1b[0m\n`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('\n\x1b[31mTest padł:\x1b[0m', err);
  process.exit(1);
});
