import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';

import db from './db.js';
import { mountRoutes } from './routes.js';
import { initGame } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '4001', 10);

const app = express();
app.use(cookieParser());

// Health check (dla monitoringu / „budzików" trzymających darmowy hosting na nogach)
app.get('/health', (_req, res) => {
  res.json({ ok: true, czas: new Date().toISOString(), uptimeSek: Math.round(process.uptime()) });
});

// API
mountRoutes(app, db);

// Produkcja: serwowanie zbudowanego frontendu (web/dist)
const distDir = path.join(__dirname, '..', '..', 'web', 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/|socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const httpServer = http.createServer(app);
initGame(httpServer);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ClassQuest serwer działa na http://0.0.0.0:${PORT}`);
});
