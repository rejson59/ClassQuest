/**
 * Symulacja przeglądarki: uruchamia PRAWDZIWY kod każdej strony (inline skrypty)
 * na atrapie DOM, żeby wykonać pełną ścieżkę startowego renderowania.
 * Nie zastępuje klikania po interfejsie, ale wyłapuje wszystko, co wywala stronę
 * w pierwszych 100 ms: brakujące zmienne, złe pola danych, pętle, literówki.
 *
 *   node tools/test-pages.js
 */
'use strict';
const vm = require('node:vm');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

let licznikHTML = 0;
let REJESTR = null;
let ostrzezeniaStrony = 0;
let ZAPADNIJ = null;              // podpinane per strona, żeby błędy z timerów trafiały do raportu                 // wszystkie węzły strony — po to, by klikać ich handlerów
let zapisanyMarkup = '';   // wszystko, co strony faktycznie wstawiły do DOM

/* ------------------------------------------------------------------ atrap DOM */
class Atrybuty { constructor() { this.map = new Map(); } }
class Node {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this._attrs = new Atrybuty();
    this._cls = new Set();
    this.style = new Proxy({ set() {}, get() { return ''; } }, { get: (t, k) => (k in t ? t[k] : ''), set: (t, k, v) => ((t[k] = v), true) });
    this.dataset = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.scrollTop = 0; this.scrollHeight = 400; this.offsetHeight = 40; this.offsetWidth = 300;
    this.scrollTop = 0;
    this.files = [];
    this._html = '';
    this._text = '';
    this._events = {};
  }
  get classList() {
    const self = this;
    return {
      add: (...c) => c.forEach((x) => x && self._cls.add(x)),
      remove: (...c) => c.forEach((x) => self._cls.delete(x)),
      toggle: (c, stan) => { if (stan === undefined) stan = !self._cls.has(c); stan ? self._cls.add(c) : self._cls.delete(c); return stan; },
      contains: (c) => self._cls.has(c),
      replace: (a, b) => { self._cls.delete(a); self._cls.add(b); },
    };
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; licznikHTML++; zapisanyMarkup += this._html; }
  get outerHTML() { return `<${this.tagName.toLowerCase()}>${this._html}</${this.tagName.toLowerCase()}>`; }
  set outerHTML(v) { this.innerHTML = v; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); licznikHTML++; zapisanyMarkup += this._text; }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get parentNode() { return this._parent || null; }
  get parentElement() { return this._parent || null; }
  get nextSibling() { return null; }
  setAttribute(k, v) { this._attrs.map.set(k, String(v)); if (k === 'class') this.className = v; }
  getAttribute(k) { return this._attrs.map.has(k) ? this._attrs.map.get(k) : null; }
  removeAttribute(k) { this._attrs.map.delete(k); }
  hasAttribute(k) { return this._attrs.map.has(k); }
  appendChild(c) { if (c) { c._parent = this; this.children.push(c); } return c; }
  prepend(c) { if (c) { c._parent = this; this.children.unshift(c); } return c; }
  append(...c) { c.forEach((x) => this.appendChild(x)); }
  insertBefore(c) { if (c) { c._parent = this; this.children.unshift(c); } return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  replaceChildren(...c) { this.children = []; c.forEach((x) => this.appendChild(x)); }
  remove() { if (this._parent) this._parent.removeChild(this); }
  insertAdjacentHTML(_, html) { this._html += html; licznikHTML++; zapisanyMarkup += html; }
  querySelector(sel) { return this._szukaj(sel, true); }
  querySelectorAll(sel) { return this._szukaj(sel, false) || []; }
  _szukaj(sel, pojedynczo) {
    if (!this._kids) this._kids = new Map();
    if (!this._kids.has(sel)) this._kids.set(sel, pojedynczo ? new Node('div') : []);
    return this._kids.get(sel);
  }
  closest(sel) {
    if (!this._closestDla || !sel || sel !== this._closestDla) return null;
    return elementZDataset(sel);
  }
  matches() { return false; }
  contains() { return false; }
  addEventListener(t, fn) { (this._events[t] = this._events[t] || []).push(fn); }
  removeEventListener() {}
  dispatchEvent() { return true; }
  focus() {} blur() {} click() { (this._events.click || []).forEach((f) => f({ target: this, preventDefault() {}, stopPropagation() {} })); }
  select() {} submit() {} reset() {}
  reportValidity() { return true; } checkValidity() { return true; }
  animate() { return { finished: Promise.resolve(), cancel() {}, onfinish: null }; }
  scrollTo() {} scrollIntoView() {}
  getBoundingClientRect() { return { top: 0, left: 0, width: 300, height: 40, right: 300, bottom: 40, x: 0, y: 0 }; }
}

/** atrapa elementu [data-x] z datasetem zwracającym sensowne wartości */
function elementZDataset(sel) {
  const nazwa = (sel.match(/\[data-([\w-]+)\]/) || [])[1] || '';
  const e = new Node('button');
  const key = nazwa.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const wartosci = { default: '__test__', id: '__test__' };
  e.dataset = new Proxy({ [key]: wartosci.default }, { get: (t, k) => (k in t ? t[k] : wartosci.default), set: (t, k, v) => ((t[k] = v), true) });
  e._closestDla = sel;
  return e;
}

function dokument() {
  const doc = new Node('#document');
  doc.body = new Node('body');
  doc.head = new Node('head');
  doc.documentElement = new Node('html');
  doc.readyState = 'complete';
  doc.hidden = false;
  doc.visibilityState = 'visible';
  doc.activeElement = doc.body;
  doc.createElement = (t) => new Node(t);
  doc.createElementNS = (_, t) => new Node(t);
  doc.createTextNode = (t) => ({ nodeType: 3, textContent: String(t), _parent: null });
  doc.createDocumentFragment = () => new Node('fragment');
  doc.querySelector = (sel) => doc._szukaj(sel, true);
  doc.querySelectorAll = (sel) => doc._szukaj(sel, false) || [];
  doc.getElementById = (id) => doc._szukaj('#' + id, true);
  doc.execCommand = () => true;
  doc._events = {};
  doc.addEventListener = (t, fn) => { (doc._events[t] = doc._events[t] || []).push(fn); };
  doc.removeEventListener = () => {};
  doc.dispatchEvent = () => true;
  return doc;
}

/* ------------------------------------------------------------------ ustawienia */
const nauczyciel = `
  await CQ.store.ready();
  const _t = CQ.store.table('nauczyciele').find((n) => n.rola !== 'admin');
  const _k = CQ.store.table('klasy')[0];
  const _z = CQ.store.table('zestawy').find((z) => z.nauczyciel_id === _t.id);
  const _u = CQ.store.where('uczniowie', (u) => u.klasa_id === _k.id)[0];
  await CQ.Auth._setSession({ ..._t, token: 'test', czas: CQ.nowISO() });
`;
const graSetup = `
  ${nauczyciel}
  const _sesja = await CQ.Gra.createSession({ nauczycielId: _t.id, klasaId: _k.id, zestawId: _z.id, tryb: 'klasyczny' });
  const _join = await CQ.Gra.join(_sesja.kod, { nazwa: _u.nazwa, uczenId: _u.id });
  await CQ.Gra.start(_sesja.id);
  localStorage.setItem('cq_gracz_v1', JSON.stringify({ gracz_id: _join.gracz.id, sesja_id: _sesja.id, kod: _sesja.kod, nazwa: _u.nazwa }));
`;
/* ile markupu strona MUSI wygenerować i jakie słowa się w nim muszą pojawić */
const WYMAGANE = {
  'index.html': { min: 2, slowa: ['tryb danych'] },
  'logowanie.html': { min: 1, slowa: [] },
  'admin-logowanie.html': { min: 0, slowa: [] },
  'pomoc.html': { min: 1, slowa: [] },
  'przyklad-wygladu.html': { min: 5, slowa: ['answer-grid', 'podium'] },
  'nauczyciel.html': { min: 12, slowa: ['Kod do gry', '\\d{6}', 'Anna'] },
  'tablica.html': { min: 2, slowa: ['\\d{6}', 'Odpowiedzi'] },
  'gra.html': { min: 4, slowa: ['answer-grid'] },
  'uczen.html': { min: 1, slowa: ['XP'] },
  'klasy.html': { min: 3, slowa: ['5A'] },
  'zestawy.html': { min: 3, slowa: ['pyta'] },
  'wyniki.html': { min: 3, slowa: ['Dok\u0142adno\u015b\u0107'] },
  'ustawienia.html': { min: 4, slowa: ['Spos\u00f3b przechowywania danych', 'Dane lokalne'] },
  'admin.html': { min: 12, slowa: ['administrator', 'Sesje'] },
};

/** warianty uruchomienia: ten sam plik, inny ?query (id znane dopiero po secie) */
const WARIANTY = {
  'gra.html': [{ nazwa: 'trening', setup: `\n  globalThis.__zestaw_trening = _z.id;`, search: (ctx) => '?trening=' + ctx.__zestaw_trening, slowa: ['answer-grid', 'Trening'] }],
};

const strony = {
  'index.html': '',
  'logowanie.html': '',
  'admin-logowanie.html': '',
  'pomoc.html': nauczyciel,
  'przyklad-wygladu.html': '',
  'nauczyciel.html': `
  ${nauczyciel}
  const _s2 = await CQ.Gra.createSession({ nauczycielId: _t.id, klasaId: _k.id, zestawId: _z.id });
  await CQ.Gra.join(_s2.kod, { nazwa: _u.nazwa, uczenId: _u.id });
  await CQ.Gra.start(_s2.id);
  localStorage.setItem('cq_aktywna_sesja', _s2.id);`,
  'tablica.html': `
  ${nauczyciel}
  const _s3 = await CQ.Gra.createSession({ nauczycielId: _t.id, klasaId: _k.id, zestawId: _z.id });
  const _j3 = await CQ.Gra.join(_s3.kod, { nazwa: _u.nazwa, uczenId: _u.id });
  await CQ.Gra.start(_s3.id);
  const _q3 = CQ.Gra.aktualnePytanie(CQ.store.byId('sesje', _s3.id));
  await CQ.Gra.answer({ sesjaId: _s3.id, graczId: _j3.gracz.id, pytanieId: _q3.id, tresc: _q3.typ === 'otwarte' ? _q3.poprawna_odp.split(';')[0] : _q3.poprawna_opcja });
  localStorage.setItem('cq_tablica_sesja', _s3.id);`,
  'gra.html': graSetup,
  'uczen.html': `
  ${nauczyciel}
  CQ.Student.save({ uczen_id: _u.id, nazwa: _u.nazwa, klasa_id: _k.id, kolor: _u.kolor, nakrycie: _u.nakrycie });`,
  'klasy.html': `
  ${nauczyciel}
  localStorage.setItem('cq_klasa', _k.id);`,
  'zestawy.html': `
  ${nauczyciel}
  localStorage.setItem('cq_zestaw', _z.id);`,
  'wyniki.html': `
  ${nauczyciel}
  const _s4 = await CQ.Gra.createSession({ nauczycielId: _t.id, klasaId: _k.id, zestawId: _z.id });
  const _j4 = await CQ.Gra.join(_s4.kod, { nazwa: _u.nazwa, uczenId: _u.id });
  await CQ.Gra.start(_s4.id);
  for (let i = 0; i < 3; i++) {
    const s = CQ.store.byId('sesje', _s4.id);
    const q = CQ.Gra.aktualnePytanie(s);
    if (!q) break;
    await CQ.Gra.answer({ sesjaId: _s4.id, graczId: _j4.gracz.id, pytanieId: q.id, tresc: q.typ === 'otwarte' ? q.poprawna_odp.split(';')[0] : q.poprawna_opcja });
    await CQ.Gra.next(_s4.id);
  }
  await CQ.Gra.finish(_s4.id);
  localStorage.setItem('cq_raport_sesja', _s4.id);`,
  'ustawienia.html': nauczyciel,
  'admin.html': `
  await CQ.store.ready();
  const _admin = CQ.store.table('nauczyciele').find((n) => n.rola === 'admin') || CQ.store.table('nauczyciele')[0];
  await CQ.Auth._setSession({ ..._admin, rola: 'admin', token: 'test', czas: CQ.nowISO() });`,
};

const flushPred = async () => { for (let r = 0; r < 4; r++) await new Promise((res) => setTimeout(res, 6)); };

/* ---------------------------------------------------------------------- uruchom */
/** zwraca {moduly, inline} — moduły muszą wykonać się PRZED kodem strony */
function skryptyStrony(html) {
  const moduly = [], inline = [];
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = (m[1].match(/src="([^"]+)"/) || [])[1];
    if (src) { if (!/^https?:/.test(src)) moduly.push(fs.readFileSync(path.join(root, src), 'utf8')); continue; }
    if (m[2].trim()) inline.push(m[2]);
  }
  return { moduly, inline };
}

let fail = 0, pass = 0;
process.on('unhandledRejection', (e) => { console.log('  \x1b[33m⚠ nieobsłużone odrzucenie:', String(e && e.message || e).split('\n')[0]); });

(async () => {
  const warianty = Object.entries(strony);
  for (const [plik, setup] of warianty) {
    const etykiety = [[null]].concat((WARIANTY[plik] || []).map((w, i) => [i]));
    for (const [wariantIdx] of etykiety) {
      const wariant = wariantIdx === null ? {} : WARIANTY[plik][wariantIdx];
      const nazwa = wariant.nazwa || 'bazowo';
      const t0 = Date.now();
      const pamiec = new Map();
      const localStorage = {
        getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null),
        setItem: (k, v) => pamiec.set(k, String(v)),
        removeItem: (k) => pamiec.delete(k),
        clear: () => pamiec.clear(),
        key: (i) => [...pamiec.keys()][i] ?? null,
        get length() { return pamiec.size; },
      };
      const dokumentStub = dokument();
      const before = licznikHTML;
      zapisanyMarkup = '';
      REJESTR = [];
      let bledy = [];
      const zlap = (e, opis) => bledy.push({ ref: e instanceof ReferenceError || /is not defined/.test(String(e && e.message)), opis, e });

      const ctx = {
        document: dokumentStub,
        localStorage,
        location: { href: 'http://localhost:8123/' + plik, pathname: '/' + plik, search: '', origin: 'http://localhost:8123', hash: '', replace() {}, assign() {}, reload() {} },
        navigator: { clipboard: { writeText: async () => {} }, userAgent: 'node-symulacja' },
        console: { log() {}, info() {}, warn() {}, error() {} },
        setTimeout: (fn, ms, ...rest) => setTimeout(() => { try { if (typeof fn === 'function') fn(...rest); } catch (e) { zlap(e, 'setTimeout'); } }, Math.min(Number(ms) || 0, 5)),
        clearTimeout, setInterval: () => 0, clearInterval: () => {},
        requestAnimationFrame: (fn) => setTimeout(() => { try { fn(0); } catch (e) { zlap(e, 'rAF'); } }, 1),
        cancelAnimationFrame: () => {},
        CustomEvent: class { constructor(t, o = {}) { this.type = t; this.detail = o.detail; } },
        Event: class { constructor(t) { this.type = t; } },
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
        addEventListener: (t, fn) => { (ctx._ev = ctx._ev || {}); (ctx._ev[t] = ctx._ev[t] || []).push(fn); },
        removeEventListener() {}, dispatchEvent: () => true,
        fetch: async () => { throw new Error('brak sieci w teście stron'); },
        alert() {}, confirm: () => true, prompt: () => 'test',
        Intl, URL, URLSearchParams, TextEncoder, Blob: require('buffer').Blob,
        getComputedStyle: () => new Proxy({}, { get: () => '' }),
        JSON, Math, Date, Object, Array, String, Number, Boolean, Promise, Error, TypeError, RegExp, Set, Map, WeakMap, isNaN, parseInt, parseFloat,
      };
      ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.top = ctx; ctx.parent = ctx;
      vm.createContext(ctx);

      const odpal = (co, opis) => {
        try {
          const wynik = co();
          if (wynik && typeof wynik.catch === 'function') wynik.then(() => {}, (e) => zlap(e, opis));
        } catch (e) { zlap(e, opis); }
      };
      const flush = async (razy) => { for (let r = 0; r < razy; r++) await new Promise((res) => setTimeout(res, 6)); };

      const { moduly, inline } = skryptyStrony(fs.readFileSync(path.join(root, plik), 'utf8'));
      const run = (czesci, etykieta) => vm.runInNewContext(
        `(async () => { "use strict";\n${czesci.join('\n;\n')}\n})()`, ctx, { filename: plik + (etykieta ? ':' + etykieta : ''), timeout: 15000 });

      try {
        if (wariant.search) {                       // setup osobno, potem ?query z id z bazy
          await run([...moduly, setup, wariant.setup || ''], 'setup');
          await flush(4);
          ctx.location.search = wariant.search(ctx);
          ctx.location.href = 'http://localhost:8123/' + plik + ctx.location.search;
          await run(inline, 'strona');
        } else {
          await run([...moduly, setup, ...inline]);
        }
        await flush(20);

        // --- handlerzy: kliknięcia elementów, [data-*], klawisze, submit, change
        for (const wezel of REJESTR) {
          for (const fn of (wezel._events && wezel._events.click) || []) {
            odpal(() => fn({ type: 'click', target: wezel, currentTarget: wezel, preventDefault() {}, stopPropagation() {} }), 'click elementu');
          }
        }
        const atrybuty = [...new Set([...[...moduly, setup, ...inline].join('\n').matchAll(/\[data-([a-z0-9-]+)\]/gi)].map((m) => '[data-' + m[1] + ']'))];
        for (const sel of atrybuty) {
          const e = elementZDataset(sel);
          for (const fn of (dokumentStub._events.click || [])) odpal(() => fn({ type: 'click', target: e, currentTarget: dokumentStub, preventDefault() {}, stopPropagation() {} }), sel);
          for (const fn of (ctx._ev && ctx._ev.click) || []) odpal(() => fn({ type: 'click', target: e, preventDefault() {}, stopPropagation() {} }), 'window ' + sel);
        }
        for (const k of [' ', 'Enter', 'Escape', 'n', 'N', 'r', 'R', 'f', 'F', 'p', 'P', '1', '2', '3', '4', 'a', 'd']) {
          const zd = { type: 'keydown', key: k, code: k === ' ' ? 'Space' : 'Key' + k.toUpperCase(), target: dokumentStub.body, preventDefault() {}, stopPropagation() {} };
          for (const fn of (dokumentStub._events.keydown || [])) odpal(() => fn(zd), 'klawisz ' + k);
          for (const fn of (ctx._ev && ctx._ev.keydown) || []) odpal(() => fn(zd), 'window klawisz ' + k);
        }
        await flush(6);
        for (const wezel of REJESTR) {
          for (const typ of ['submit', 'change', 'input']) {
            for (const fn of (wezel._events && wezel._events[typ]) || []) odpal(() => fn({ type: typ, target: wezel, value: wezel.value, preventDefault() {} }), typ);
          }
        }
        await flush(6);

        const krytyczne = bledy.filter((b) => b.ref);
        if (krytyczne.length) throw new Error(krytyczne.map((b) => `${b.opis}: ${b.e.message}`).slice(0, 3).join(' | '));
        ostrzezeniaStrony = bledy.length - krytyczne.length;
        if (process.env.CQ_SHOW_WARNINGS) bledy.filter((b) => !b.ref).slice(0, 12).forEach((b) => console.log(`        \x1b[33m⚠ ${b.opis}: ${String(b.e.message).split('\n')[0]}\x1b[0m`));

        const n = licznikHTML - before;
        const wym = WYMAGANE[plik] || { min: 1, slowa: [] };
        if (n < wym.min) throw new Error(`render wyprodukował tylko ${n} zapisów (oczekiwano ≥ ${wym.min}) — strona stoi pusta`);
        for (const wow of (wariant.slowa || wym.slowa)) {
          const re = wow.startsWith('\\d') ? new RegExp(wow) : new RegExp(wow.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === ' ' ? c : '\\' + c)), 'i');
          if (!re.test(zapisanyMarkup)) throw new Error(`w wyrenderowanym markupu brakuje: ${wow} :: ${zapisanyMarkup.slice(0, 300).replace(/\s+/g, ' ')}`);
        }
        console.log(`  \x1b[32m✓\x1b[0m ${plik}${wariantIdx === null ? '' : ' [' + nazwa + ']'} — ${n} zapisów, ${zapisanyMarkup.length} znaków markupu, ${atrybuty.length + 16} zdarzeń, ${Date.now() - t0} ms${ostrzezeniaStrony ? ` \x1b[33m(+${ostrzezeniaStrony} ostrz.)\x1b[0m` : ''}`);
        pass++;
      } catch (e) {
        console.log(`  \x1b[31m✗\x1b[0m ${plik}${wariantIdx === null ? '' : ' [' + nazwa + ']'}: ${String(e.message).split('\n')[0]}`);
        (e.stack || '').split('\n').filter((l) => l.includes(plik)).slice(0, 2).forEach((l) => console.log(`        ${l.trim()}`));
        fail++;
      }
    }
  }
  console.log(fail ? `\n\x1b[31mWYNIK: ${pass} OK, ${fail} FAILED\x1b[0m` : `\n\x1b[32mWYNIK: wszystkie ${pass} uruchomień stron przechodzi startowe renderowanie\x1b[0m`);
  process.exit(fail ? 1 : 0);
})();
