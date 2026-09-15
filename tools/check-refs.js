/* Kontrola odwołań: CQ.* i ui.* użyte na stronach muszą istnieć w modułach.
   node tools/check-refs.js                                            */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');

// --- 1. prawdziwy kształt CQ: odpalamy store.js w Node z atrapą localStorage
const shim = path.join(root, '.tmp-refs.js');
fs.writeFileSync(shim, `
const m = new Map();
global.localStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
const CQ = require(${JSON.stringify(path.join(root, 'assets/js/store.js'))});
CQ.store.ready().then(() => {
  const out = {};
  for (const [k, v] of Object.entries(CQ)) out[k] = v && v.constructor === Object ? Object.keys(v) : typeof v;
  console.log(JSON.stringify(out));
  process.exit(0);
});`);
const parsed = JSON.parse(cp.execFileSync(process.execPath, [shim], { encoding: 'utf8' }).trim().split('\n').pop());
fs.unlinkSync(shim);

// --- 2. klucze UI z Object.assign(CQ, { ui: {...} })
const uij = fs.readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8');
const block = uij.slice(uij.lastIndexOf('ui: {'), uij.indexOf('},', uij.lastIndexOf('ui: {')));
const uiKeys = new Set(block.split(/[,\n]/).map((t) => (t.match(/([A-Za-z_$][\w$]*)\s*:?\s*$/) || [])[1]).filter(Boolean));
uiKeys.delete('ui');

let bad = 0;
const files = fs.readdirSync(root).filter((f) => f.endsWith('.html')).sort();
for (const f of files) {
  const html = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of html.matchAll(/CQ\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g)) {
    const [, mod, key] = m;
    if (!(mod in parsed)) { console.log(`  ✗ ${f}: CQ.${mod} — brak takiego modułu`); bad++; continue; }
    if (Array.isArray(parsed[mod]) && !parsed[mod].includes(key)) { console.log(`  ✗ ${f}: CQ.${mod}.${key} — nie istnieje`); bad++; }
  }
  for (const m of html.matchAll(/CQ\.([A-Za-z_$][\w$]*)(?!\s*:)/g)) {
    if (!(m[1] in parsed) && !uiKeys.has(m[1])) { console.log(`  ✗ ${f}: CQ.${m[1]} — nie eksportowane`); bad++; }
  }
  for (const m of html.matchAll(/(?<![\w./-])ui\.([A-Za-z_$][\w$]*)/g)) {
    if (m[1] === 'js') continue;
    if (!uiKeys.has(m[1])) { console.log(`  ✗ ${f}: ui.${m[1]} — nie istnieje w assets/js/ui.js`); bad++; }
  }
}

// --- 3. klucze i pola danych NIE mogą zawierać polskich znaków
//       (to klasyczny powód „undefined” w interfejsie). Przed skanowaniem
//       wycinamy komentarze i treści stringów, żeby nie łapać prozy.
const PL = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
function czystyJs(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}
const plikiDoSkanu = [...files, 'assets/js/store.js', 'assets/js/ui.js'];
for (const f of plikiDoSkanu) {
  let src = fs.readFileSync(path.join(root, f), 'utf8');
  if (f.endsWith('.html')) src = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  src = czystyJs(src);
  for (const m of src.matchAll(/[{,]\s*([A-Za-z_$][\w$]*[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ][\w$]*)\s*:/g)) {
    console.log(`  ✗ ${f}: klucz obiektu z polskim znakiem → ${m[1]}: (użyj ASCII)`); bad++;
  }
  for (const m of src.matchAll(/\.([A-Za-z_$][\w$]*[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ][\w$]*)/g)) {
    console.log(`  ✗ ${f}: odwołanie do pola z polskim znakiem → .${m[1]}`); bad++;
  }
  for (const m of src.matchAll(/\b(const|let|var|function)\s+([A-Za-z_$][\w$]*[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ][\w$]*)/g)) {
    console.log(`  ✗ ${f}: nazwa zmiana z polskim znakiem → ${m[2]} (ryzyko literówki)`); bad++;
  }
}

console.log(bad ? `\n\x1b[31m${bad} błędnych odwołań\x1b[0m` : `\n\x1b[32m✓ wszystkie odwołania CQ.*/ui.* istnieją\x1b[0m\n(moduły: ${Object.keys(parsed).length} kluczy CQ, ${uiKeys.size} elementów ui)`);
process.exit(bad ? 1 : 0);
