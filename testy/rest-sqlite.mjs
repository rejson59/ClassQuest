import { DatabaseSync } from 'node:sqlite';
const BASE = process.env.BASE || 'http://localhost:4001';
const DB = '/home/user/ClassQuest/server/data/classquest.db';
let ok = true;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) ok = false;
};
const j = (r) => r.json().catch(() => ({}));
const api = async (path, method = 'GET', body, cookie) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { res, data: await j(res) };
};

// ---------- logowanie demo (admin) ----------
let r = await api('/api/auth/logowanie', 'POST', { email: 'nauczyciel@demo.pl', haslo: 'demo1234' });
const admin = r.res.headers.get('set-cookie').split(';')[0];
check('login demo → admin', r.data.teacher?.rola === 'admin');

// ---------- rejestracja nowego (nauczyciel) ----------
r = await api('/api/auth/rejestracja', 'POST', { imieNazwisko: 'Testowa Nauczycielka', email: 'test@test.pl', haslo: 'tajne123' });
const nCookie = r.res.headers.get('set-cookie').split(';')[0];
const nId = r.data.teacher.id;
check('rejestracja → rola nauczyciel (jest już admin demo)', r.data.teacher?.rola === 'nauczyciel', `id=${nId}`);

// ---------- brak dostępu nie-admina do /api/admin ----------
r = await api('/api/admin/podsumowanie', 'GET', null, nCookie);
check('nauczyciel dostaje 403 na /admin', r.res.status === 403);

// ---------- klasy + uczniowie (nowy nauczyciel) ----------
r = await api('/api/klasy', 'POST', { nazwa: '7A' }, nCookie);
const klasaId = r.data.klasa.id;
check('utworzenie klasy', r.res.ok && klasaId);
for (const [nr, imie] of [[1, 'Ala Nowak'], [2, 'Ola Kowal']]) {
  r = await api(`/api/klasy/${klasaId}/uczniowie`, 'POST', { numerDziennika: nr, imieNazwisko: imie }, nCookie);
  check(`dodanie ucznia nr ${nr}`, r.res.ok && r.data.uczen?.id);
}
r = await api(`/api/klasy/${klasaId}/uczniowie`, 'GET', null, nCookie);
check('lista uczniów (2)', r.data.uczniowie?.length === 2);
const uczenId = r.data.uczniowie[0].id;

// duplikat ucznia → 409
r = await api(`/api/klasy/${klasaId}/uczniowie`, 'POST', { numerDziennika: 1, imieNazwisko: 'Ktoś' }, nCookie);
check('duplikat numeru → 409', r.res.status === 409);

// ---------- XP ręczne ----------
r = await api(`/api/uczniowie/${uczenId}/xp`, 'POST', { kwota: 15, opis: 'Aktywność' }, nCookie);
check('ręczne XP +15', r.data.xp === 15);
r = await api(`/api/klasy/${klasaId}/uczniowie`, 'GET', null, nCookie);
check('uczeń ma xp=15 i 1 log', r.data.uczniowie[0].xp === 15 && r.data.uczniowie[0].logow === 1);

// ---------- zestawy + pytania ----------
r = await api('/api/zestawy', 'POST', { nazwa: 'Historia — test' }, nCookie);
const zestawId = r.data.zestaw.id;
check('utworzenie zestawu', r.res.ok && zestawId);
r = await api(`/api/zestawy/${zestawId}/pytania`, 'POST', {
  tresc: 'W którym roku był Potop szwedzki?', opcja_a: '1600', opcja_b: '1655', opcja_c: '1700', opcja_d: '1795', poprawna: 'B', czas_sek: 20
}, nCookie);
check('dodanie pytania', r.res.ok && r.data.pytanie?.id);
r = await api(`/api/zestawy/${zestawId}/pytania`, 'GET', null, nCookie);
check('lista pytań (1)', r.data.pytania?.length === 1);

// ---------- pokój 4pola: utwórz, podgląd klasy, zamknij ----------
r = await api('/api/pokoje', 'POST', { klasaId, zestawId, auto: false, tryb: '4pola' }, nCookie);
const kod = r.data.kod;
check('utworzenie pokoju (4pola)', r.res.ok && /^\d{6}$/.test(kod || ''), `kod=${kod}`);
r = await api(`/api/pokoje/${kod}/uczniowie`, 'GET');
check('lista klasy w pokoju (2 uczniów)', r.data.uczniowie?.length === 2 && r.data.nazwaKlasy === '7A');
r = await api(`/api/pokoje/${kod}`, 'GET', null, nCookie);
check('podgląd pokoju (nauczyciel)', r.data.pokoj?.status === 'lobby');

// ---------- admin: historia po zamknięciu pokoju ----------
r = await api(`/api/pokoje/${kod}`, 'DELETE', null, nCookie);
check('zamknięcie pokoju', r.res.ok);
r = await api('/api/admin/sesje?limit=50', 'GET', null, admin);
const sesja = r.data.sesje?.find((s) => s.kod === kod);
check('sesja w historii admina', !!sesja && sesja.nauczyciel === 'Testowa Nauczycielka' && sesja.status === 'finished');

// ---------- admin: eksport zawiera wszystko ----------
r = await api('/api/admin/eksport', 'GET', null, admin);
const d = r.data.dane || {};
check('eksport: tabele i rekordy', d.teachers?.length >= 2 && d.klasy?.length >= 2 && d.uczniowie?.length >= 2 && d.pytania?.length >= 1 && d.xp_logi?.length === 1, `xp_logi=${d.xp_logi?.length}`);

// ---------- admin: podsumowanie ----------
r = await api('/api/admin/podsumowanie', 'GET', null, admin);
check('podsumowanie: system i liczby', r.data.system?.pamiecMB > 0 && r.data.liczby?.nauczyciele === 2);

// ---------- role: promocja → degradacja ----------
r = await api(`/api/admin/nauczyciele/${nId}/rola`, 'PATCH', { rola: 'admin' }, admin);
check('promocja do admina', r.res.ok);
r = await api('/api/admin/podsumowanie', 'GET', null, nCookie);
check('promowany ma dostęp do /admin', r.res.status === 200);
r = await api(`/api/admin/nauczyciele/${nId}/rola`, 'PATCH', { rola: 'nauczyciel' }, admin);
check('degradacja z powrotem', r.res.ok);
r = await api(`/api/admin/nauczyciele/1/rola`, 'PATCH', { rola: 'nauczyciel' }, admin);
check('samo-degradacja admina → 400', r.res.status === 400);

// ---------- usunięcie nauczyciela z pełnym dorobkiem (kaskady) ----------
r = await api(`/api/admin/nauczyciele/${nId}`, 'DELETE', null, admin);
check('usunięcie konta nauczyciela', r.res.ok);
const db = new DatabaseSync(DB);
const cnt = (sql, ...p) => db.prepare(sql).get(...p).c;
const zostalo = {
  teachers: cnt('SELECT COUNT(*) c FROM teachers WHERE id = ?', nId),
  klasy: cnt('SELECT COUNT(*) c FROM klasy WHERE teacher_id = ?', nId),
  uczniowie: cnt('SELECT COUNT(*) c FROM uczniowie WHERE klasa_id = ?', klasaId),
  zestawy: cnt('SELECT COUNT(*) c FROM zestawy_pytan WHERE teacher_id = ?', nId),
  pytania: cnt('SELECT COUNT(*) c FROM pytania WHERE zestaw_id = ?', zestawId),
  sesje: cnt('SELECT COUNT(*) c FROM sesje WHERE teacher_id = ?', nId)
};
db.close();
check('kaskady: zero sierot po usunięciu', Object.values(zostalo).every((v) => v === 0), JSON.stringify(zostalo));

// ---------- baseline demo nietknięty ----------
r = await api('/api/admin/podsumowanie', 'GET', null, admin);
check('baseline demo: 1 nauczyciel / 12 uczniów / 9 pytań', r.data.liczby.nauczyciele === 1 && r.data.liczby.uczniowie === 12 && r.data.liczby.pytania === 9);

console.log(ok ? '\n🎉 PEŁNY TEST PO MIGRACJI ZALICZONY' : '\n⚠️ SĄ BŁĘDY');
process.exit(ok ? 0 : 1);
