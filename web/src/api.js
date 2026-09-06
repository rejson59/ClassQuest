// Pomocnik do wywołań API (same-origin — w dev proxowane przez Vite).
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options
  });
  let data = {};
  try { data = await res.json(); } catch { /* pusta odpowiedź */ }
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
