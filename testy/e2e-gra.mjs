import { io } from 'socket.io-client';

// E2E pełnej gry 4pola: nauczyciel (socket) + 2 uczniów (sockety),
// auto = true → gra sama przechodzi rundy i kończy się → zapis do bazy.
const BASE = process.env.BASE || 'http://localhost:4001';
const EMAIL = process.env.EMAIL || `e2e_${Date.now()}@test.pl`;
const ok = [];
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
  ok.push(cond);
};
const api = async (path, method = 'GET', body, cookie) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { res, data: await res.json().catch(() => ({})) };
};
const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));
const obietnica = (fn, timeoutMs = 70000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    fn(resolve, () => { clearTimeout(t); reject(new Error('rozłączono przed końcem')); });
  });

// ---------- konto ----------
let r = await api('/api/auth/rejestracja', 'POST', { imieNazwisko: 'E2E Nauczyciel', email: EMAIL, haslo: 'tajne123' });
const teacherCookie = r.res.headers.get('set-cookie').split(';')[0];
const ja = r.data.teacher;
check('rejestracja konta E2E', r.res.ok, `${ja.email} rola=${ja.rola}`);

// ---------- dane: klasa, 2 uczniów, zestaw, 1 pytanie ----------
r = await api('/api/klasy', 'POST', { nazwa: 'E2E Klasa' }, teacherCookie);
const klasaId = r.data.klasa.id;
const uczenIds = [];
for (const [nr, imie] of [[1, 'E2E Uczeń A'], [2, 'E2E Uczeń B']]) {
  r = await api(`/api/klasy/${klasaId}/uczniowie`, 'POST', { numerDziennika: nr, imieNazwisko: imie }, teacherCookie);
  uczenIds.push(r.data.uczen.id);
}
r = await api('/api/zestawy', 'POST', { nazwa: 'E2E Zestaw' }, teacherCookie);
const zestawId = r.data.zestaw.id;
r = await api(`/api/zestawy/${zestawId}/pytania`, 'POST', {
  tresc: 'E2E: 2+2?', opcja_a: '3', opcja_b: '4', opcja_c: '5', opcja_d: '6', poprawna: 'B', czas_sek: 10
}, teacherCookie);
check('przygotowanie danych (klasa/uczniowie/zestaw/pytanie)', true);

// ---------- pokój (auto) ----------
r = await api('/api/pokoje', 'POST', { klasaId, zestawId, auto: true, tryb: '4pola' }, teacherCookie);
const kod = r.data.kod;
check('utworzenie pokoju auto', !!kod, `kod=${kod}`);

// ---------- sockety ----------
const teacherSocket = io(BASE, { extraHeaders: { Cookie: teacherCookie }, transports: ['websocket'] });
await obietnica((resolve, reject) => { teacherSocket.on('connect', resolve); teacherSocket.on('connect_error', reject); });
teacherSocket.emit('nauczyciel:pokoj', { kod });

const gracze = [];
const koniecP = obietnica((resolve) => {
  teacherSocket.on('gra:koniec', (payload) => resolve(payload));
});
teacherSocket.on('pokoj:uczniowie', (d) => { if (d.uczniowie?.length) gracze.push(d.uczniowie.length); });

const uczSockety = [];
for (const uid of uczenIds) {
  const s = io(BASE, { transports: ['websocket'] });
  await obietnica((resolve, reject) => { s.on('connect', resolve); s.on('connect_error', reject); });
  uczSockety.push(s);
  s.emit('uczen:dolacz', { kod, uczenId: uid });
}
// poczekaj aż obaj dołączą
await czekaj(1500);
teacherSocket.emit('nauczyciel:start', { kod });
console.log('▶️ start gry, czekam na zakończenie (auto: ~30 s)...');

const wynik = await koniecP;
const finalne = wynik?.finalne || [];
check('gra:koniec z wynikami', wynik?.tryb === '4pola' && finalne.length === 2, `graczy=${finalne.length}`);
check('wyniki mają XP (zwycięzca +25)', finalne.some((f) => f.xp > 0), JSON.stringify(finalne.map((f) => ({ imie: f.imie, xp: f.xp, wygrana: f.wygrana }))));

await czekaj(500); // daj czas na dociągnięcie zapisu do bazy

// ---------- weryfikacja w bazie przez API (admin = pierwsze konto na PG) ----------
if (ja.rola === 'admin') {
  r = await api(`/api/admin/sesje/${kod}/wyniki`, 'GET', null, teacherCookie);
  const wynikiDb = r.data.wyniki || [];
  check('zapis sesji+wyników w bazie (2 rekordy)', wynikiDb.length === 2, `wyników=${wynikiDb.length}`);
  check('wyniki mają xp_zdobyte i pozycje', wynikiDb.every((w) => w.xp_zdobyte >= 0 && w.pozycja >= 1) && wynikiDb.some((w) => w.xp_zdobyte > 0), JSON.stringify(wynikiDb.map((w) => ({ xp: w.xp_zdobyte, poz: w.pozycja }))));
  r = await api(`/api/klasy/${klasaId}/uczniowie`, 'GET', null, teacherCookie);
  const xpSuma = r.data.uczniowie.reduce((a, u) => a + (u.xp || 0), 0);
  check('uczniowie dostali XP w bazie', xpSuma > 0 && r.data.uczniowie.some((u) => u.logow >= 1) && r.data.uczniowie.every((u) => (u.xp > 0) === (u.logow >= 1)), `sumaXP=${xpSuma}`);
  r = await api('/api/admin/podsumowanie', 'GET', null, teacherCookie);
  check('podsumowanie: gryZakonczone >= 1', Number(r.data.liczby?.gryZakonczone) >= 1);
} else {
  console.log('ℹ️ konto nie jest adminem — pomijam weryfikację przez /admin (spróbuj z SEED_DEMO=1).');
}

// ---------- sprzątanie ----------
for (const s of [...uczSockety, teacherSocket]) s.disconnect();
console.log(ok.every(Boolean) ? '\n🎉 GRA E2E ZALICZONA' : '\n⚠️ SĄ BŁĘDY');
process.exit(ok.every(Boolean) ? 0 : 1);
