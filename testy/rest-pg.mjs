const BASE = process.env.BASE || 'http://localhost:4001';
let ok = true;
const check = (n, c, x = '') => { console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`); if (!c) ok = false; };
const api = async (path, method = 'GET', body, cookie) => {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { res, data: await res.json().catch(() => ({})) };
};

let r = await api('/api/auth/rejestracja', 'POST', { imieNazwisko: 'PG Admin', email: 'admin@pg.pl', haslo: 'tajne123' });
const ac = r.res.headers.get('set-cookie').split(';')[0];
check('1. rejestracja pierwszego konta → ADMIN', r.data.teacher?.rola === 'admin', r.data.teacher?.rola);

r = await api('/api/auth/rejestracja', 'POST', { imieNazwisko: 'PG Nauczyciel', email: 'n2@pg.pl', haslo: 'tajne123' });
const nc = r.res.headers.get('set-cookie').split(';')[0];
const nId = r.data.teacher.id;
check('2. drugie konto → nauczyciel', r.data.teacher?.rola === 'nauczyciel');
r = await api('/api/admin/podsumowanie', 'GET', null, nc);
check('3. nauczyciel → 403 na /admin', r.res.status === 403);

r = await api('/api/klasy', 'POST', { nazwa: 'PG Klasa' }, nc);
const kId = r.data.klasa.id;
check('4. klasa (INSERT RETURNING id)', r.res.ok && !!kId, `id=${kId}`);
r = await api(`/api/klasy/${kId}/uczniowie`, 'POST', { numerDziennika: 1, imieNazwisko: 'PG Uczeń' }, nc);
const uId = r.data.uczen.id;
r = await api(`/api/klasy/${kId}/uczniowie`, 'POST', { numerDziennika: 2, imieNazwisko: 'PG Uczeń 2' }, nc);
const u2Id = r.data.uczen.id;
check('5. uczniowie (2× INSERT RETURNING id)', !!uId && !!u2Id);

r = await api(`/api/uczniowie/${uId}/xp`, 'POST', { kwota: 10, opis: 'test' }, nc);
check('6. ręczne XP +10', r.data.xp === 10, `xp=${r.data.xp}`);
r = await api(`/api/uczniowie/${u2Id}/xp`, 'POST', { kwota: 5, opis: 'test' }, nc);
check('6b. ręczne XP +5', r.data.xp === 5);

r = await api('/api/zestawy', 'POST', { nazwa: 'PG Zestaw' }, nc);
const zId = r.data.zestaw.id;
r = await api(`/api/zestawy/${zId}/pytania`, 'POST', { tresc: 'P?', opcja_a: '1', opcja_b: '2', opcja_c: '3', opcja_d: '4', poprawna: 'A', czas_sek: 15 }, nc);
const pId = r.data.pytanie.id;
check('7. zestaw + pytanie (INSERT RETURNING id)', !!zId && !!pId);

r = await api('/api/pokoje', 'POST', { klasaId: kId, zestawId: zId, auto: false, tryb: '4pola' }, nc);
const kod = r.data.kod;
check('8. pokój (INSERT sesje bez id)', !!kod, `kod=${kod}`);
r = await api(`/api/pokoje/${kod}/uczniowie`, 'GET');
check('9. lista klasy w pokoju', r.data.uczniowie?.length === 2);
r = await api(`/api/pokoje/${kod}`, 'DELETE', null, nc);
check('10. zamknięcie pokoju (UPDATE datetime now)', r.res.ok);

r = await api('/api/admin/nauczyciele', 'GET', null, ac);
const n2 = r.data.nauczyciele?.find((t) => t.id === nId);
check('11. lista nauczycieli (COUNT podzapytania)', r.data.nauczyciele?.length === 2 && n2?.uczniowie === 2 && n2?.suma_xp === 15, JSON.stringify(n2 ? { uczniowie: n2.uczniowie, xp: n2.suma_xp, sesje: n2.sesje } : null));

r = await api(`/api/admin/nauczyciele/${nId}/rola`, 'PATCH', { rola: 'admin' }, ac);
check('12. promocja do admina', r.res.ok);
r = await api(`/api/admin/nauczyciele/${nId}/rola`, 'PATCH', { rola: 'nauczyciel' }, ac);
check('13. degradacja', r.res.ok);

r = await api('/api/admin/sesje?limit=10', 'GET', null, ac);
check('14. historia sesji z nazwami', r.data.sesje?.length === 1 && r.data.sesje[0].nauczyciel === 'PG Nauczyciel' && r.data.sesje[0].klasa === 'PG Klasa', JSON.stringify(r.data.sesje?.[0] ? { n: r.data.sesje[0].nauczyciel, k: r.data.sesje[0].klasa, s: r.data.sesje[0].status } : null));
r = await api(`/api/admin/sesje/${kod}/wyniki`, 'GET', null, ac);
check('15. wyniki sesji (puste)', r.data.wyniki?.length === 0);

r = await api('/api/admin/eksport', 'GET', null, ac);
const d = r.data.dane || {};
check('16. eksport pełnej bazy', d.teachers?.length === 2 && d.xp_logi?.length === 2 && d.uczniowie?.length === 2, `xp_logi=${d.xp_logi?.length}`);

r = await api(`/api/admin/nauczyciele/${nId}`, 'DELETE', null, ac);
check('17. usunięcie nauczyciela (withTx + kaskady)', r.res.ok);
r = await api('/api/admin/podsumowanie', 'GET', null, ac);
check('18. po sprzątaniu: 1 nauczyciel, 0 klas/uczniów, 0 XP', r.data.liczby.nauczyciele === 1 && r.data.liczby.klasy === 0 && r.data.liczby.uczniowie === 0 && Number(r.data.liczby.sumaXp) === 0, JSON.stringify(r.data.liczby));

console.log(ok ? '\n🎉 PG REST ZALICZONY' : '\n⚠️ SĄ BŁĘDY');
process.exit(ok ? 0 : 1);
