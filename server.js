#!/usr/bin/env node
/**
 * ClassQuest — serwer podglądu + serwer synchronizacji (zero zależności).
 *
 *   node server.js              # http://localhost:8123
 *   PORT=3000 node server.js
 *
 * Robi dwie rzeczy:
 *  1. Serwuje pliki statyczne (to samo co `python3 -m http.server`).
 *  2. Wystawia mikro-API synchronizacji (/api/*) + strumień SSE (/api/events),
 *     dzięki czemu panel nauczyciela, tablica i telefony uczniów widzą ten sam
 *     stan gry w czasie rzeczywistym. Stan zapisywany w .data/cq-db.json.
 *
 * Tryb serwerowy jest opcjonalny: bez niego aplikacja działa w trybie lokalnym
 * (localStorage) — patrz assets/js/store.js.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8123);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(ROOT, '.data');
// osobny plik stanu przydaje się w testach i gdy ktoś chce dwa instancje obok siebie
const DATA_FILE = process.env.CQ_DATA_FILE
  ? path.resolve(ROOT, process.env.CQ_DATA_FILE)
  : path.join(DATA_DIR, 'cq-db.json');
const MAX_BODY = 8 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/* ------------------------------------------------------------------ stan */

const state = {
  version: 0,
  db: {},
  startedAt: Date.now(),
  clients: new Set(),
  ops: 0,
};

function loadFromDisk() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.db) {
      state.db = parsed.db;
      state.version = Number(parsed.version) || 0;
      console.log(`[cq] wczytano stan: ${Object.keys(state.db).length} tabel, v${state.version}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[cq] odczyt stanu nieudany:', err.message);
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${DATA_FILE}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify({ version: state.version, savedAt: new Date().toISOString(), db: state.db }));
      await fsp.rename(tmp, DATA_FILE);
    } catch (err) {
      console.warn('[cq] zapis stanu nieudany:', err.message);
    }
  }, 250);
}

function broadcast(payload) {
  const data = `event: change\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of state.clients) {
    res.write(data);
  }
}

/* -------------------------------------------------------------- operacje */

function applyOp(op) {
  const { type, table, id, row, rows } = op || {};
  const db = state.db;

  if (type === 'replace_db') {
    state.db = op.db && typeof op.db === 'object' ? op.db : {};
    return { tables: Object.keys(state.db).length };
  }
  if (type === 'bulk') {
    for (const item of op.ops || []) applyOp(item);
    return { applied: (op.ops || []).length };
  }
  if (!table) throw new Error('Brak nazwy tabeli');
  if (!/^[a-z0-9_]+$/i.test(table)) throw new Error('Nieprawidłowa nazwa tabeli');

  switch (type) {
    case 'insert': {
      const list = (db[table] = Array.isArray(db[table]) ? db[table] : []);
      if (row && list.some((r) => r.id === row.id)) {
        const idx = list.findIndex((r) => r.id === row.id);
        list[idx] = { ...list[idx], ...row };
      } else {
        list.push(row);
      }
      return { table, row };
    }
    case 'update': {
      const list = (db[table] = Array.isArray(db[table]) ? db[table] : []);
      const idx = list.findIndex((r) => r && r.id === id);
      if (idx === -1) throw new Error('Nie znaleziono rekordu');
      list[idx] = { ...list[idx], ...row };
      return { table, row: list[idx] };
    }
    case 'delete': {
      const list = Array.isArray(db[table]) ? db[table] : [];
      db[table] = list.filter((r) => r && r.id !== id);
      return { table, id };
    }
    case 'replace_table': {
      db[table] = Array.isArray(rows) ? rows : [];
      return { table, count: db[table].length };
    }
    default:
      throw new Error(`Nieznany typ operacji: ${type}`);
  }
}

/* --------------------------------------------------------------- helpers */

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Ciało zapytania za duże'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new Error('Nieprawidłowy JSON'));
      }
    });
    req.on('error', reject);
  });
}

function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) out.push(`${name}: ${info.address}`);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- server */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  // CORS - proste, wystarczające dla pracy klasowej i podglądu
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
    });
    return res.end();
  }

  /* ---------------- API ---------------- */
  if (pathname.startsWith('/api/')) {
    try {
      if (pathname === '/api/health') {
        return sendJson(res, 200, {
          ok: true,
          service: 'classquest',
          version: state.version,
          ops: state.ops,
          tables: Object.keys(state.db).length,
          clients: state.clients.size,
          uptime_s: Math.round((Date.now() - state.startedAt) / 1000),
        });
      }

      if (pathname === '/api/db' && req.method === 'GET') {
        return sendJson(res, 200, { version: state.version, db: state.db });
      }

      const tableMatch = pathname.match(/^\/api\/db\/([a-z0-9_]+)$/i);
      if (tableMatch && req.method === 'GET') {
        const table = tableMatch[1];
        return sendJson(res, 200, { version: state.version, rows: state.db[table] || [] });
      }

      if (pathname === '/api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'access-control-allow-origin': '*',
          'x-accel-buffering': 'no',
        });
        res.write(`retry: 2000\nevent: hello\ndata: ${JSON.stringify({ version: state.version })}\n\n`);
        state.clients.add(res);
        const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => {
          clearInterval(keepAlive);
          state.clients.delete(res);
        });
        return;
      }

      if (pathname === '/api/op' && req.method === 'POST') {
        const body = await readBody(req);
        const result = applyOp(body);
        state.version += 1;
        state.ops += 1;
        scheduleSave();
        broadcast({ version: state.version, result });
        return sendJson(res, 200, { ok: true, version: state.version, result });
      }

      return sendJson(res, 404, { error: 'Nie znaleziono zasobu API' });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'Błąd serwera' });
    }
  }

  /* ---------------- pliki ---------------- */
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Metoda niedozwolona' });
  }

  let rel = pathname.replace(/^\/+/, '');
  if (!rel || rel === 'index.html') rel = 'index.html';
  const filePath = path.resolve(ROOT, rel);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Wstęp wzbroniony');
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) throw Object.assign(new Error('katalog'), { code: 'EISDIR' });
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    // Przyjazny 404 - wskazówka, gdzie zajrzeć
    const body = `Nie znaleziono pliku: ${rel}\n\nDostępne strony:\n  /index.html      - wybór profilu\n  /logowanie.html  - logowanie nauczyciela\n  /nauczyciel.html - panel nauczyciela\n  /zestawy.html    - bank pytań\n  /klasy.html      - klasy i uczniowie\n  /tablica.html    - widok na projektor\n  /gra.html        - gra dla ucznia\n  /uczen.html      - strefa ucznia\n  /wyniki.html     - wyniki i raporty\n  /ustawienia.html - ustawienia\n  /admin.html      - panel administratora\n  /pomoc.html      - instrukcja\n`;
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(body);
  }
});

loadFromDisk();

server.listen(PORT, HOST, () => {
  console.log('\n  ClassQuest — serwer pracy klasowej');
  console.log(`  Adresy:\n    lokalnie:   http://localhost:${PORT}`);
  for (const a of lanAddresses()) console.log(`    w sieci:    http://${a.split(': ')[1]}:${PORT}  (${a.split(':')[0]})`);
  console.log(`  Plik stanu:  ${path.relative(ROOT, DATA_FILE)}`);
  console.log('  Ctrl+C aby zatrzymać.\n');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n[cq] zamykam serwer...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 800);
  });
}
