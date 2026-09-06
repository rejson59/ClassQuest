// Pomocnik do wywołań API.
// Autoryzacja: token JWT wysyłany nagłówkiem Authorization (prócz cookie),
// dzięki czemu sesja działa też tam, gdzie przeglądarka blokuje ciasteczka.
// Token trzymamy w 3 miejscach (localStorage → sessionStorage → pamięć),
// żeby logowanie działało nawet przy całkowicie zablokowanym przechowywaniu.

const TOKEN_KEY = 'cq_token';
let tokenWpamieci = ''; // awaryjne: wystarczy na czas sesji (bez przeładowania)

function zapiszWszystkie(key, value) {
  try { localStorage.setItem(key, value); } catch { /* zablokowane */ }
  try { sessionStorage.setItem(key, value); } catch { /* zablokowane */ }
}
function usunWszystkie(key) {
  try { localStorage.removeItem(key); } catch { /* zablokowane */ }
  try { sessionStorage.removeItem(key); } catch { /* zablokowane */ }
}

export function getToken() {
  if (tokenWpamieci) return tokenWpamieci;
  try {
    const t = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
    if (t) tokenWpamieci = t;
    return t;
  } catch {
    return tokenWpamieci;
  }
}

function setToken(t) {
  tokenWpamieci = t || '';
  if (t) zapiszWszystkie(TOKEN_KEY, t);
  else usunWszystkie(TOKEN_KEY);
}

// Awaryjne logowanie demo: serwer przekierowuje na /nauczyciel#cq=<token>.
// Odczytujemy token z adresu przy starcie — działa nawet, gdy przeglądarka
// blokuje ciasteczka i całe przechowywanie (osadzony podgląd), i przetrwa
// pełne przeładowanie strony. Fragment zaraz po odczycie usuwamy z adresu.
(function przechwycTokenZAdresu() {
  try {
    const m = window.location.hash.match(/[#&]cq=([^&]+)/);
    if (m && m[1]) {
      setToken(decodeURIComponent(m[1]));
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch { /* brak window (testy) */ }
})();

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'same-origin'
  });

  let data = {};
  try { data = await res.json(); } catch { /* pusta odpowiedź */ }

  // logowanie/rejestracja zwracają token — zapamiętujemy go
  if (data && typeof data.token === 'string' && data.token) setToken(data.token);
  // wylogowanie czyści token
  if (path === '/auth/wyloguj' && res.ok) setToken('');

  if (!res.ok) {
    const err = new Error(data.error || `Błąd ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const apiGet = (p) => api(p);
export const apiPost = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
export const apiPatch = (p, body) => api(p, { method: 'PATCH', body: JSON.stringify(body) });
export const apiDelete = (p) => api(p, { method: 'DELETE' });

export function poziomZxp(xp) {
  return Math.floor((xp || 0) / 100) + 1;
}
