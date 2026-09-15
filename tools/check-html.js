/**
 * Statyczna kontrola wszystkich stron ClassQuest.
 *   node tools/check-html.js
 * Sprawdza: składnię skryptów (inline i modułów), istnienie localnych
 * zasobów (src/href), balans klamer CSS, istnienie elementów wskazywanych
 * przez $('#id') / getElementById, oraz spójność klas CSS użytych w JS z
 * bazą arkusza.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.join(__dirname, '..');
let fail = 0;
const err = (file, what) => { console.log(`  \x1b[31m✗\x1b[0m ${file}: ${what}`); fail++; };
const files = fs.readdirSync(root).filter((f) => f.endsWith('.html')).sort();
const baseCss = fs.readFileSync(path.join(root, 'assets/css/base.css'), 'utf8');
const baseClasses = new Set([...baseCss.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

for (const f of files) {
  const html = fs.readFileSync(path.join(root, f), 'utf8');

  // 1) lokalne zasoby
  for (const m of html.matchAll(/(?:src|href)="((?!https?:|data:|#|mailto:)[^"]+)"/g)) {
    const pth = m[1].split('?')[0].split('#')[0];
    if (pth && !fs.existsSync(path.join(root, pth))) err(f, `brak pliku: ${pth}`);
  }

  // 2) składnia <script>
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => m[2].trim());
  scripts.forEach((m, i) => {
    const isModule = /type="module"/.test(m[1]);
    const tmp = path.join(root, `.tmp-check-${i}${isModule ? '.mjs' : '.cjs'}`);
    fs.writeFileSync(tmp, m[2]);
    const r = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    fs.unlinkSync(tmp);
    if (r.status !== 0) {
      const line = (r.stderr.match(/\.tmp-check-\d+\.(\w+):(\d+)/) || [])[2];
      err(f, `skrypt #${i + 1} — błąd składni${line ? ` (linia ${line} pliku)` : ''}: ${r.stderr.split('\n').find((l) => l.includes('SyntaxError')) || ''}`);
    }
  });

  // 3) klasa "app" musi ładować store przed ui
  if (html.includes('assets/js/ui.js') && html.indexOf('assets/js/store.js') > html.indexOf('assets/js/ui.js')) {
    err(f, 'ui.js załadowany przed store.js');
  }

  // 4) odwołania do identyfikatorów
  const definicje = new Set([...html.matchAll(/id="([^"{$]+)"/g)].map((m) => m[1]));
  const tworzone = [...html.matchAll(/(?:id=|\.id = |setAttribute\('id', )['"`]?([\w-]+)/g)].map((m) => m[1]);
  tworzone.forEach((id) => definicje.add(id));
  const referencje = new Set();
  for (const m of html.matchAll(/\$\(\s*['"]#([a-zA-Z][\w-]*[a-zA-Z0-9])['"]/g)) referencje.add(m[1]);
  for (const m of html.matchAll(/getElementById\(\s*['"]([a-zA-Z][\w-]*[a-zA-Z0-9])['"]/g)) referencje.add(m[1]);
  for (const m of html.matchAll(/querySelector\w*\(\s*['"]#([a-zA-Z][\w-]*[a-zA-Z0-9])['"]/g)) referencje.add(m[1]);
  for (const id of referencje) {
    if (!definicje.has(id) && !baseClasses.has(id)) err(f, `brak elementu #${id} (użyty w skrypcie)`);
  }

  // 5) CSS inline — klamry
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const o = (css.match(/{/g) || []).length, c = (css.match(/}/g) || []).length;
  if (o !== c) err(f, `CSS: ${o} { kontra ${c} }`);

  // 6) klasy użyte w JS-owych szablonach, których nie ma w CSS
  const used = new Set();
  for (const m of html.matchAll(/class="([^"{$]*?)"/g)) m[1].split(/\s+/).forEach((k) => k && used.add(k));
  const unknown = [...used].filter((k) => !baseClasses.has(k) && !css.includes('.' + k));
  if (unknown.length) err(f, `klasy bez definicji: ${unknown.join(', ')}`);

  // 7) podwójne id w jednym pliku (selector zwróciłby zły element)
  const wszystkie = [...html.matchAll(/\sid="([^"{$]+)"/g)].map((m) => m[1]);
  const dup = [...new Set(wszystkie.filter((x, i) => wszystkie.indexOf(x) !== i))];
  if (dup.length) err(f, `powtórzone id: ${dup.join(', ')}`);

  // 8) deklaracje funkcji o tej samej nazwie w jednym pliku
  const defn = [...html.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
  const dupf = [...new Set(defn.filter((x, i) => defn.indexOf(x) !== i))];
  if (dupf.length) err(f, `podwójna definicja funkcji: ${dupf.join(', ')}`);
}

console.log(fail
  ? `\n\x1b[31mznaleziono ${fail} problemów\x1b[0m`
  : `\n\x1b[32m✓ ${files.length} stron OK:\x1b[0m składnia JS, zasoby, identyfikatory, klasy CSS`);
process.exit(fail ? 1 : 0);
