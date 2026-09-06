// Pomocnik do wywołań API.
// Autoryzacja: token JWT wysyłany nagłówkiem Authorization (prócz cookie),
// dzięki czemu sesja działa też tam, gdzie przeglądarka blokuje ciasteczka.
const TOKEN_KEY = 'cq_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* tryb bez localStorage — token zostaje tylko na czas sesji */ }
}

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
