/** Jeden rozkaz na wszystkie kontrole:  node tools/sprawdz.js  */
'use strict';
const cp = require('child_process'), path = require('path');
const tools = path.join(__dirname);
const kroki = [
  ['test-store.js', 'logika domenowa (auth, klasy, bank pytań, gra, XP, raporty)'],
  ['test-flows.js', 'przepływy danych na zbiorze demonstracyjnym'],
  ['test-server.js', 'synchronizacja przez server.js + trwałość danych'],
  ['check-html.js', 'składnia JS, zasoby, identyfikatory, klasy CSS'],
  ['check-refs.js', 'odwołania CQ.* / ui.* istnieją'],
  ['check-calls.js', 'brak wołań do nieistniejących funkcji, klucze bez ogonków'],
  ['test-pages.js', 'startowe renderowanie 14 stron + handlery zdarzeń (atrapa DOM)'],
];
let zle = 0;
for (const [plik, opis] of kroki) {
  console.log(`\n\x1b[1m▶ ${plik}\x1b[0m  \x1b[2m${opis}\x1b[0m`);
  const r = cp.spawnSync(process.execPath, [path.join(tools, plik)], { stdio: 'inherit' });
  if (r.status !== 0) { zle++; console.log(`  \x1b[31m← ${plik} zakończył się błędem (${r.status})\x1b[0m`); }
}
console.log(zle
  ? `\n\x1b[31m\x1b[1m${zle}/${kroki.length} kontroli zgłasza problemy\x1b[0m`
  : `\n\x1b[32m\x1b[1m✓ wszystkie ${kroki.length} kontrole czyste\x1b[0m`);
process.exit(zle ? 1 : 0);
