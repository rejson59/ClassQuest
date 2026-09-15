/**
 * Statyczna checka skryptów stron i modułów:
 *   1) każde wywołanie `nazwa(` musi mieć deklarację w pliku (funkcja, zmienna,
 *      parametr, skrót z destrukturyzacji) albo być znanym globallem;
 *   2) klucze/pola danych nie mogą zawierać polskich znaków (idiomy typu
 *      `dokładnosc` w obiekcie i `dokladnosc` przy odczycie to klasyczne
 *      źródło „undefined” w interfejsie).
 *
 * Żeby nie mylić kodu z treścią stringów, plik jest najpierw tokenizowany:
 * wycinamy komentarze, stringi i fragmenty literałów szablonu, zostawiając
 * wyrażenia w ${…} (z obsługą zagnieżdżeń).
 *
 *   node tools/check-calls.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const ZNANE = new Set(('if for while switch catch return typeof function new await async yield delete void in of do else case break continue ' +
  'JSON Math Object Array String Number Boolean Promise Symbol Reflect Proxy Error TypeError RangeError parseInt parseFloat isNaN isFinite ' +
  'setTimeout setInterval clearTimeout clearInterval requestAnimationFrame cancelAnimationFrame queueMicrotask structuredClone ' +
  'fetch document window globalThis console location navigator localStorage sessionStorage CustomEvent Event Blob File FileReader FormData ' +
  'URL URLSearchParams Date RegExp Set Map WeakMap WeakSet Uint8Array Uint32Array ArrayBuffer TextEncoder TextDecoder Intl Intl ' +
  'alert confirm prompt encodeURIComponent decodeURIComponent require process module exports supabase ' +
  'Infinity NaN undefined null true false this arguments super').split(/\s+/));

/* --------------------------------------------------------------- tokenizator */
function regexMoze(txt) {
  const t = txt.trimEnd();
  if (!t) return true;
  const last = t[t.length - 1];
  if (last === ')' || last === ']' || /[\w$]/.test(last)) return /\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/.test(t);
  return true;
}

function kod(src) {
  let out = '';
  const st = [{ t: 'code' }];
  let i = 0;
  const top = () => st[st.length - 1];
  while (i < src.length) {
    const ch = src[i], f = top();
    if (f.t === 'sq' || f.t === 'dq' || f.t === 'bt') {
      const domyk = f.t === 'sq' ? "'" : f.t === 'dq' ? '"' : '`';
      if (ch === '\\') { i += 2; out += '  '; continue; }
      if (ch === domyk) { st.pop(); out += ' '; i++; continue; }
      if (f.t === 'bt' && ch === '$' && src[i + 1] === '{') { st.push({ t: 'code', zTpl: true }); out += ' '; i += 2; continue; }
      if (f.t !== 'bt' && ch === '\n') { st.pop(); continue; }        // string bez zamknięcia — wracaj do kodu
      out += ch === '\n' ? '\n' : ' ';
      i++; continue;
    }
    if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (ch === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; out += ' '; continue; }
    if (ch === '/' && regexMoze(out)) {
      let j = i + 1, klasa = false, trafiony = false;
      while (j < src.length) {
        const r = src[j];
        if (r === '\n') break;
        if (r === '\\') { j += 2; continue; }
        if (r === '[') klasa = true;
        else if (r === ']') klasa = false;
        else if (r === '/' && !klasa) { trafiony = true; j++; break; }
        j++;
      }
      if (trafiony) {
        while (j < src.length && /[gimsuyvd]/.test(src[j])) j++;
        out += ' 0'; i = j; continue;
      }
    }
    if (ch === "'") { st.push({ t: 'sq' }); out += ' '; i++; continue; }
    if (ch === '"') { st.push({ t: 'dq' }); out += ' '; i++; continue; }
    if (ch === '`') { st.push({ t: 'bt' }); out += ' '; i++; continue; }
    if (ch === '}' && f.zTpl) { st.pop(); out += ' '; i++; continue; }
    out += ch; i++;
  }
  return out;
}

/* ------------------------------------------------------------------ zbieranie */
function skryptyW(plik) {
  const src = fs.readFileSync(plik, 'utf8');
  if (plik.endsWith('.js')) return src;
  return [...src.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
}

const PL = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
let bad = 0;
const err = (f, t) => { console.log(`  \x1b[31m✗\x1b[0m ${f}: ${t}`); bad++; };

const pliki = [...fs.readdirSync(root).filter((f) => f.endsWith('.html')).sort().map((f) => [f, path.join(root, f)]),
  ['assets/js/store.js', path.join(root, 'assets/js/store.js')],
  ['assets/js/ui.js', path.join(root, 'assets/js/ui.js')],
  ['server.js', path.join(root, 'server.js')]];

for (const [nazwa, plik] of pliki) {
  const src = kod(skryptyW(plik));

  // --- deklaracje: nazwy funkcji, zmiennych, parametrów i skrótów z destrukturyzacji
  const dec = new Set();
  const parametry = (tekst) => (tekst.match(/[A-Za-z_$][\w$]*/g) || []);
  for (const m of src.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) dec.add(m[1]);
  for (const m of src.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=/g)) parametry(m[1]).forEach((p) => dec.add(p));   // destrukturyzacja
  for (const m of src.matchAll(/(?:const|let)\s*\[([^\]]*)\]\s*=/g)) parametry(m[1]).forEach((p) => dec.add(p));
  for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*\(([^()]*)\)\s*\{/g)) {           // function / metoda
    dec.add(m[1]);
    parametry(m[2]).forEach((p) => dec.add(p));
  }
  for (const m of src.matchAll(/\(([^()]*)\)\s*=>/g)) parametry(m[1]).forEach((p) => dec.add(p));                 // (a, b) => …
  for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) dec.add(m[1]);                                        // a => …
  for (const m of src.matchAll(/\{([^}]*)\}\s*=>/g)) parametry(m[1]).forEach((p) => dec.add(p));                  // ({ a, b }) => …
  for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?(?:function|\(|[A-Za-z_$][\w$]*\s*=>)/g)) dec.add(m[1]);
  for (const m of src.matchAll(/\bfor\s*\(\s*(?:const|let|var)?\s*\[?([A-Za-z_$][\w$]*)\]?\s+(?:of|in)\b/g)) dec.add(m[1]);
  for (const m of src.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) dec.add(m[1]);

  // --- 1) wywołania bez deklaracji
  for (const m of src.matchAll(/(?<![.\w$'"])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const n = m[1];
    if (ZNANE.has(n) || dec.has(n)) continue;
    if (/^[A-Z][\w$]*$/.test(n)) continue;                       // konstruktory
    err(nazwa, `wywołanie ${n}() bez deklaracji w pliku`);
  }

  // --- 2) polskie znaki w kluczach i polach
  for (const m of src.matchAll(/[,{]\s*([A-Za-z_$][\w$]*)\s*:/g)) if (PL.test(m[1])) err(nazwa, `klucz „${m[1]}” z polskim znakiem`);
  for (const m of src.matchAll(/\.([A-Za-z_$][\w$]*)/g)) if (PL.test(m[1])) err(nazwa, `pole .${m[1]} z polskim znakiem`);
  for (const m of src.matchAll(/(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)) if (PL.test(m[1])) err(nazwa, `nazwa „${m[1]}” z polskim znakiem`);
}

console.log(bad ? `\n\x1b[31m${bad} problemów\x1b[0m` : `\n\x1b[32m✓ skrypty bez wiszących wywołań i bez kluczy z polskimi znakami\x1b[0m`);
process.exit(bad ? 1 : 0);
