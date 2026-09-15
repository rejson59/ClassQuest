/**
 * Test synchronizacji w trybie serwerowym (dwa „urządzenia" → ten sam stan).
 *   node tools/test-server.js
 * Podnosi server.js na porcie 8199 i odpala dwie niezależne instancje store.js.
 */
'use strict';
const cp = require('child_process'), path = require('path'), fs = require('fs');
const root = path.join(__dirname, '..');
const PORT = 8199;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = '.data/test-serwer.json';   // odizolowany stan testów — nie ruszamy .data/cq-db.json

let pass = 0, fail = 0;
const ok = (c, t, e) => { c ? (pass++, console.log(`  \x1b[32m✓\x1b[0m ${t}`)) : (fail++, console.log(`  \x1b[31m✗\x1b[0m ${t}${e ? ' → ' + e : ''}`)); };

function instancjaCQ(nazwa) {
  const pamiec = new Map();
  global.localStorage = {
    getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null),
    setItem: (k, v) => pamiec.set(k, String(v)),
    removeItem: (k) => pamiec.delete(k),
  };
  pamiec.set('cq_config_v1', JSON.stringify({ mode: 'serwer', serwerUrl: BASE }));
  const sciezka = path.join(root, 'assets/js/store.js');
  delete require.cache[sciezka];
  const mod = require(sciezka);
  return mod;
}

(async () => {
  if (fs.existsSync(DATA)) fs.unlinkSync(DATA);
  const serwer = cp.spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root, env: { ...process.env, PORT, CQ_DATA_FILE: DATA }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buf = '';
  serwer.stdout.on('data', (d) => { buf += d; });
  serwer.stderr.on('data', (d) => { buf += d; });

  // czekamy na port
  let health = null;
  for (let i = 0; i < 60 && !health; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try { health = await (await fetch(BASE + '/api/health')).json(); } catch (e) {}
  }
  if (!health) { console.error('serwer nie wstał:\n' + buf); process.exit(1); }
  console.log('\n\x1b[1mSerwer\x1b[0m');
  ok(health.ok && health.service === 'classquest', 'health /api/health odpowiada', JSON.stringify(health));

  console.log('\n\x1b[1mDwie instancje aplikacji\x1b[0m');
  const A = instancjaCQ('A');
  await A.store.ready();
  ok(A.store.mode === 'serwer', 'instancja A w trybie serwerowym', A.store.mode);
  ok(A.store.db.uczniowie.length > 0, 'A zasila dane demo', A.store.db.uczniowie.length);

  const B = instancjaCQ('B');
  await B.store.ready();
  ok(B.store.db.uczniowie.length === A.store.db.uczniowie.length, 'B widzi te same dane demo', B.store.db.uczniowie.length);

  const uczen = B.store.table('uczniowie')[0];
  const nauczyciel = B.store.table('nauczyciele').find((n) => n.rola !== 'admin');
  const zestaw = B.store.table('zestawy')[0];

  console.log('\n\x1b[1mPrzepływ: nauczyciel (A) uruchomia grę, uczeń (B) dołącza\x1b[0m');
  const sesja = await A.Gra.createSession({ nauczycielId: nauczyciel.id, klasaId: uczen.klasa_id, zestawId: zestaw.id, tryb: 'klasyczny' });
  await B.store.reloadAll();
  const poStronie = B.Gra.poKodzie(sesja.kod);
  ok(poStronie && poStronie.id === sesja.id, 'kod pokoju widoczny w drugim oknie', sesja.kod);
  const dolaczenie = await B.Gra.join(sesja.kod, { nazwa: uczen.nazwa, uczenId: uczen.id });
  ok(dolaczenie.gracz && dolaczenie.gracz.nazwa === uczen.nazwa, 'uczestnik zapisany po stronie B');
  await A.store.reloadAll();
  ok(A.Gra.gracze(sesja.id).length === 1, 'A widzi gracza dopisanego przez B', A.Gra.gracze(sesja.id).length);

  await A.Gra.start(sesja.id);
  await B.store.reloadAll();
  const sesjaB = B.Gra.poKodzie(sesja.kod);
  ok(sesjaB.status === 'pytanie' && sesjaB.indeks === 0, 'start fazy „pytanie" propaguje się do B', sesjaB.status);

  const pytanie = B.Gra.aktualnePytanie(sesjaB);
  const odp = await B.Gra.answer({ sesjaId: sesjaB.id, graczId: dolaczenie.gracz.id, pytanieId: pytanie.id, tresc: pytanie.typ === 'otwarte' ? pytanie.poprawna_odp.split(';')[0] : pytanie.poprawna_opcja });
  await A.store.reloadAll();
  const statA = A.Gra.statystykiPytania(sesja.id, pytanie.id);
  ok(statA.odp === 1 && odp.poprawna, 'odpowiedź ucznia dotarła do nauczyciela', JSON.stringify(statA));

  console.log('\n\x1b[1mZapis do pliku po restarcie serwera\x1b[0m');
  const plikDane = path.join(root, DATA);
  for (let i = 0; i < 40 && !fs.existsSync(plikDane); i++) await new Promise((r) => setTimeout(r, 100));
  const naDysku = JSON.parse(fs.readFileSync(plikDane, 'utf8'));
  ok(naDysku.db.sesje.some((s) => s.id === sesja.id), 'sesja zserializowana do pliku', Object.keys(naDysku.db).join(','));

  serwer.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 400));
  const serwer2 = cp.spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, env: { ...process.env, PORT, CQ_DATA_FILE: DATA }, stdio: ['ignore', 'pipe', 'ignore'] });
  let ok2 = false;
  for (let i = 0; i < 60 && !ok2; i++) { await new Promise((r) => setTimeout(r, 100)); try { ok2 = (await (await fetch(BASE + '/api/health')).json()).ok; } catch (e) {} }
  const C = instancjaCQ('C');
  await C.store.ready().catch(() => {});
  ok(ok2 && C.Gra.poKodzie(sesja.kod), 'po restarcie serwera gra nadal istnieje (trwałość danych)');

  serwer2.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 250));
  console.log(`\n\x1b[1mWYNIK: ${pass} OK, ${fail} FAILED\x1b[0m\n`);
  if (fail) console.log('log serwera:\n' + buf.slice(-2000));
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('\x1b[31mtest padł:\x1b[0m', e); process.exit(1); });
