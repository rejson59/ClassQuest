import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sekret do podpisu tokenów.
// Kolejność: 1) zmienna środowiskowa JWT_SECRET (produkcja/hosting — przetrwa
// restarty i uśpienia), 2) plik .secret obok bazy (rozwój lokalny — generowany raz).
export function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET.trim();
  const file = path.join(__dirname, '..', 'data', '.secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(file, secret);
    return secret;
  }
}
