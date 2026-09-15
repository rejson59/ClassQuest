/* ==========================================================================
   ClassQuest — wspólne elementy interfejsu (nagłówek, motyw, okna, powiadomienia)
   Każda strona doładowuje ten plik po store.js i wywołuje CQ.ui.boot({...}).
   ========================================================================== */
(function (global) {
  'use strict';

  const CQ = global.CQ;
  const LS_THEME = 'theme';

  /* ---- 1. podstawowe pomoce -------------------------------------------- */

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return node;
  }

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const param = (name) => new URLSearchParams(global.location.search).get(name);

  const fmtPts = (n) => (Number(n) || 0).toLocaleString('pl-PL');
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pl-PL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  function fmtAgo(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.round(diff / 60000);
    if (min < 1) return 'przed chwilą';
    if (min < 60) return `${min} min temu`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} godz. temu`;
    return `${Math.round(h / 24)} dni temu`;
  }
  const fmtSec = (ms) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;

  function download(name, content, type = 'application/json') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = el('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) {}
      ta.remove();
      return ok;
    }
  }

  /* ---- 2. motyw --------------------------------------------------------- */

  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem(LS_THEME, dark ? 'dark' : 'light'); } catch (e) {}
    qsa('[data-theme-toggle]').forEach((b) => { b.textContent = dark ? '☀️' : '🌙'; });
    global.dispatchEvent(new CustomEvent('cq:theme', { detail: { dark } }));
  }
  const isDark = () => {
    try { return localStorage.getItem(LS_THEME) === 'dark'; } catch (e) { return false; }
  };
  // ustawiamy motyw jak najwcześniej, żeby nie było błysku
  applyTheme(isDark());

  /* ---- 3. powiadomienia -------------------------------------------------- */

  let toastStack = null;
  function toast(msg, type = 'info', ms = 3800) {
    if (!document.body) return;
    if (!toastStack) {
      toastStack = el('div', { class: 'toast-stack' });
      document.body.appendChild(toastStack);
    }
    const icons = { ok: '✅', err: '⛔', warn: '⚠️', info: 'ℹ️' };
    const node = el('div', { class: `toast ${type}` }, [
      el('span', { text: icons[type] || icons.info }),
      el('div', { class: 'grow', text: msg }),
    ]);
    toastStack.appendChild(node);
    setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 350);
    }, ms);
    return node;
  }

  /* ---- 4. modal + formularze -------------------------------------------- */

  let backdrop = null;
  function ensureBackdrop() {
    if (!backdrop) {
      backdrop = el('div', { class: 'modal-backdrop' });
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    }
    return backdrop;
  }

  function openModal({ title, body, actions = [], size = '', onClose }) {
    const bd = ensureBackdrop();
    bd.innerHTML = '';
    const box = el('div', { class: `modal ${size}` });
    if (title) box.appendChild(el('h3', { text: title }));
    box.appendChild(el('div', { class: 'modal-body' }, [typeof body === 'string' ? el('div', { html: body }) : body]));
    if (actions.length) {
      box.appendChild(el('div', { class: 'modal-actions' }, actions.map((a) => {
        const btn = el('button', { class: `neu-btn ${a.class || ''}`, text: a.label });
        btn.addEventListener('click', () => a.onClick ? a.onClick({ close: closeModal, box }) : closeModal());
        return btn;
      })));
    }
    bd.appendChild(box);
    bd.classList.add('open');
    bd._onClose = onClose;
    document.body.style.overflow = 'hidden';
    setTimeout(() => { const f = qs('input,textarea,select', box); if (f) f.focus(); }, 60);
    return box;
  }

  function closeModal() {
    if (!backdrop) return;
    backdrop.classList.remove('open');
    const cb = backdrop._onClose;
    backdrop._onClose = null;
    setTimeout(() => { backdrop.innerHTML = ''; }, 200);
    document.body.style.overflow = '';
    if (cb) cb();
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && backdrop && backdrop.classList.contains('open')) closeModal(); });

  /**
   * Szybki formularz w modalu.
   * fields: [{name,label,type,options,value,placeholder,hint,required,rows}]
   * Zwraca obiekt wartości albo null (anulowane).
   */
  /** Wiersz po id — z komunikatem, jeśli ktoś zdążył go usunąć w innej karcie. */
  function wiersz(tabela, id, nazwa = 'rekord') {
    const r = id ? CQ.store.byId(tabela, id) : null;
    if (!r) toast(`Ten ${nazwa} już nie istnieje — pewnie usunął go ktoś w innej karcie. Odśwież listę.`, 'warn');
    return r;
  }

  function formModal(title, fields, opts = {}) {
    return new Promise((resolve) => {
      const form = el('form', { class: 'stack stack-12' });
      const inputs = {};
      for (const f of fields) {
        if (f.type === 'static') { form.appendChild(el('div', { class: 'muted small semi', html: f.html || f.value || '' })); continue; }
        const wrap = el('div', { class: 'field' });
        wrap.appendChild(el('label', { class: 'neu-label', text: f.label, for: 'fm_' + f.name }));
        let input;
        if (f.type === 'select') {
          input = el('select', { class: 'neu-select', id: 'fm_' + f.name, name: f.name });
          (f.options || []).forEach((o) => {
            const val = typeof o === 'string' ? o : o.value;
            const lab = typeof o === 'string' ? o : o.label;
            input.appendChild(el('option', { value: val, text: lab, selected: String(val) === String(f.value) }));
          });
        } else if (f.type === 'textarea') {
          input = el('textarea', { class: 'neu-textarea', id: 'fm_' + f.name, name: f.name, rows: f.rows || 3, placeholder: f.placeholder || '' });
          input.value = f.value || '';
        } else {
          input = el('input', {
            class: 'neu-input', id: 'fm_' + f.name, name: f.name, type: f.type || 'text',
            placeholder: f.placeholder || '', step: f.step, min: f.min, max: f.max, required: f.required,
          });
          input.value = f.value == null ? '' : f.value;
        }
        wrap.appendChild(input);
        if (f.hint) wrap.appendChild(el('div', { class: 'tiny muted', text: f.hint, style: 'margin-top:6px' }));
        form.appendChild(wrap);
        inputs[f.name] = input;
      }
      let done = false;
      const finish = (val) => { if (!done) { done = true; resolve(val); } };
      openModal({
        title,
        body: form,
        onClose: () => finish(null),
        actions: [
          { label: opts.cancelLabel || 'Anuluj', class: 'ghost', onClick: ({ close }) => { close(); } },
          {
            label: opts.okLabel || 'Zapisz',
            class: 'primary',
            onClick: ({ close }) => {
              if (!form.reportValidity || form.reportValidity()) {
                const out = {};
                for (const [k, node] of Object.entries(inputs)) out[k] = node.value;
                finish(out);
                close();
              }
            },
          },
        ],
      });
      form.addEventListener('submit', (e) => { e.preventDefault(); qs('.modal-actions .primary').click(); });
    });
  }

  function confirmBox(title, message, opts = {}) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      openModal({
        title,
        body: el('div', { class: 'muted semi', html: message }),
        onClose: () => finish(false),
        actions: [
          { label: opts.cancel || 'Anuluj', class: 'ghost', onClick: ({ close }) => close() },
          { label: opts.ok || 'Potwierdź', class: opts.danger ? 'danger-solid' : 'primary', onClick: ({ close }) => { finish(true); close(); } },
        ],
      });
    });
  }

  /* ---- 5. nagłówek aplikacji -------------------------------------------- */

  const NAV = {
    nauczyciel: { href: 'nauczyciel.html', label: 'Panel', ikona: '🎛️' },
    klasy: { href: 'klasy.html', label: 'Klasy', ikona: '👥' },
    zestawy: { href: 'zestawy.html', label: 'Bank pytań', ikona: '❓' },
    tablica: { href: 'tablica.html', label: 'Tablica', ikona: '📽️' },
    wyniki: { href: 'wyniki.html', label: 'Wyniki', ikona: '📊' },
    ustawienia: { href: 'ustawienia.html', label: 'Ustawienia', ikona: '⚙️' },
    pomoc: { href: 'pomoc.html', label: 'Pomoc', ikona: '📖' },
    admin: { href: 'admin.html', label: 'Administracja', ikona: '🛡️' },
    uczen: { href: 'uczen.html', label: 'Strefa ucznia', ikona: '🎒' },
  };

  function bootHeader({ active = null, links = null, user = null, onLogout } = {}) {
    const here = global.location.pathname.split('/').pop() || 'index.html';
    const items = (links || []).map((key) => ({ key, ...(NAV[key] || {}) }));
    if (!items.length) return null;

    const nav = el('nav', { class: 'nav-tabs' }, items.map((i) =>
      el('a', { class: `nav-link ${active === i.key || here === i.href ? 'active' : ''}`, href: i.href, text: i.label })));

    const chip = user
      ? el('div', { class: 'user-chip' }, [
        el('span', { class: 'avatar-dot', text: CQ.initials(user.imie_nazwisko || user.nazwa || user.name || '?') }),
        el('span', { text: user.imie_nazwisko || user.nazwa || user.name || '' }),
      ])
      : null;

    const actions = el('div', { class: 'header-actions' }, [
      chip,
      el('button', { class: 'neu-btn square icon-only', 'data-theme-toggle': '', title: 'Zmień motyw (jasny/ciemny)', text: isDark() ? '☀️' : '🌙' }),
      user ? el('button', { class: 'neu-btn sm', text: 'Wyloguj 🚪', title: 'Wyloguj się' }) : null,
    ]);
    if (user) {
      const btn = actions.lastChild;
      btn.addEventListener('click', async () => {
        const yes = await confirmBox('Wylogowanie', 'Na pewno chcesz się wylogować? Bieżąca sesja gry zostanie zamknięta.');
        if (!yes) return;
        if (onLogout) await onLogout();
        CQ.Auth.logout();
        global.location.href = 'logowanie.html';
      });
    }

    const header = el('header', { class: 'app-header' }, [
      el('div', { class: 'container' }, [
        el('a', { class: 'brand', href: 'index.html' }, [
          el('span', { class: 'brand-mark', text: '🎲' }),
          el('span', {}, [el('span', { text: 'ClassQuest' }), el('small', { text: 'nauka przez grę' })]),
        ]),
        nav,
        actions,
      ]),
    ]);
    document.body.prepend(header);
    qs('[data-theme-toggle]', header).addEventListener('click', () => applyTheme(!isDark()));
    return header;
  }

  /* ---- 6. strażnicy dostępu -------------------------------------------- */

  async function bootTeacher({ links = ['nauczyciel', 'klasy', 'zestawy', 'tablica', 'wyniki', 'ustawienia', 'pomoc'], active = null } = {}) {
    await CQ.store.ready();
    let me = CQ.Auth.current();
    if (!me) { global.location.replace('logowanie.html'); return null; }
    if (!qs('.app-header')) bootHeader({ active, links, user: me });
    return me;
  }

  function requireAdmin() {
    const me = CQ.Auth.current();
    if (!me || me.rola !== 'admin') { global.location.replace('admin-logowanie.html'); return null; }
    return me;
  }

  /* ---- 7. kawałki markupu ------------------------------------------------ */

  function avatar(name, color, hat, extraClass = '') {
    return `<span class="avatar ${extraClass}" style="--c:${esc(color || '#2563eb')}">
      <span class="hat">${esc(hat || '')}</span>
      <span class="body"><span class="eyes"><span class="eye"></span><span class="eye"></span></span></span>
    </span>`;
  }

  function empty(emoji, title, sub, actionHtml = '') {
    return `<div class="empty-state"><span class="emoji">${emoji}</span><div>${esc(title)}</div>
      ${sub ? `<small>${sub}</small>` : ''}${actionHtml ? `<div class="mt-16">${actionHtml}</div>` : ''}</div>`;
  }

  function badge(text, cls = '') { return `<span class="badge ${cls}">${esc(text)}</span>`; }

  const STATUS_META = {
    lobby: { label: 'w lobby', cls: 'blue' },
    pytanie: { label: 'pytanie', cls: 'green live' },
    podsumowanie: { label: 'omówienie', cls: 'amber' },
    przerwa: { label: 'przerwa', cls: '' },
    koniec: { label: 'zakończona', cls: '' },
  };
  const statusBadge = (s) => {
    const m = STATUS_META[s] || { label: s, cls: '' };
    return badge(m.label, m.cls);
  };

  function levelBadge(xp) {
    const p = CQ.poziomZxp(xp);
    return `<span class="badge blue" title="Do poziomu ${p.poziom + 1}: ${p.doKolejnego} XP">Poz. ${p.poziom} · ${esc(p.nazwa)}</span>`;
  }

  /** Pasek licznika (SVG ring). Zwraca element do wstawienia. */
  function timerRing(seconds, { big = false } = {}) {
    const r = 42, c = 2 * Math.PI * r;
    const box = el('div', { class: `timer-ring ${big ? 'lg' : ''}` });
    box.innerHTML = `<svg viewBox="0 0 96 96" aria-hidden="true">
      <circle class="bgc" cx="48" cy="48" r="${r}"></circle>
      <circle class="fgc" cx="48" cy="48" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="0" transform="translate(0,0)"></circle>
      <foreignObject x="0" y="0" width="96" height="96"></foreignObject>
    </svg><div class="num">${seconds}</div>`;
    box._circ = c;
    box.setValue = (frac, secs) => {
      const fg = qs('.fgc', box);
      fg.setAttribute('stroke-dashoffset', String(c * (1 - Math.max(0, Math.min(1, frac)))));
      box.classList.toggle('warn', frac <= 0.5 && frac > 0.25);
      box.classList.toggle('danger', frac <= 0.25);
      box.querySelector('.num').textContent = secs;
    };
    return box;
  }

  /* ---- 8. reaktywność ---------------------------------------------------- */

  /**
   * Uruchamia render przy każdej zmianie danych (lokalnie, przez serwer lub co 2 s
   * w trybie Supabase). Zwraca funkcję czyszczącą.
   */
  function live(render, { every = 0 } = {}) {
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; try { render(); } catch (e) { console.error(e); } });
    };
    const off = CQ.store.onChange(schedule);
    let t = null;
    if (every) t = setInterval(schedule, every);
    global.addEventListener('resize', () => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
    if (CQ.store.backend && CQ.store.backend.mode === 'supabase') {
      // w chmurze nie ma nasłuchu — odświeżamy odpytywaniem
      t = t || setInterval(() => CQ.store.reloadAll().then(schedule).catch(() => {}), 2500);
    }
    schedule();
    return () => { off(); if (t) clearInterval(t); };
  }

  /* ---- 9. konfetti ------------------------------------------------------- */

  function confetti(ms = 2600) {
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let canvas = qs('#confetti-canvas');
    if (!canvas) { canvas = el('canvas', { id: 'confetti-canvas' }); document.body.appendChild(canvas); }
    const ctx = canvas.getContext('2d');
    const dpr = global.devicePixelRatio || 1;
    const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
    resize();
    global.addEventListener('resize', resize);
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
    const bits = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width, y: -Math.random() * canvas.height * 0.5,
      w: (5 + Math.random() * 7) * dpr, h: (8 + Math.random() * 10) * dpr,
      vy: (2 + Math.random() * 4) * dpr, vx: (-1.5 + Math.random() * 3) * dpr,
      rot: Math.random() * Math.PI, vr: (-0.12 + Math.random() * 0.24),
      color: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now();
    (function frame(now) {
      const elapsed = now - t0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.rot += b.vr; b.vy += 0.03 * dpr;
        if (b.y > canvas.height + 40) { b.y = -20 * dpr; b.x = Math.random() * canvas.width; b.vy = (2 + Math.random() * 3) * dpr; }
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.color;
        ctx.globalAlpha = elapsed > ms - 500 ? Math.max(0, (ms - elapsed) / 500) : 1;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      if (elapsed < ms) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, canvas.width, canvas.height); global.removeEventListener('resize', resize); }
    })(t0);
  }

  /* ---- 10. animacja liter (spójna ze starymi stronami) ------------------ */

  function animateText(selector, base = 0.2, step = 0.035) {
    const node = typeof selector === 'string' ? qs(selector) : selector;
    if (!node || node.dataset.animated) return;
    node.dataset.animated = '1';
    const text = node.textContent;
    node.innerHTML = '';
    [...text].forEach((ch, i) => {
      const span = el('span', { class: 'char', text: ch === ' ' ? '\u00A0' : ch });
      span.style.animationDelay = `${base + i * step}s`;
      node.appendChild(span);
    });
  }

  /* ---- 11. status trybu danych (widoczny w nagłówku) ------------------- */

  function modeChip() {
    const mode = CQ.store.mode;
    const map = {
      lokalny: { txt: 'Dane lokalne', hint: 'Ten tryb działa tylko w tej przeglądarce. Uruchom `node server.js`, aby grać na wielu urządzeniach.' },
      serwer: { txt: 'Serwer klasy', hint: 'Wszyscy w sieci szkolnej widzą tę samą grę.' },
      supabase: { txt: 'Supabase', hint: 'Dane w chmurze.' },
    };
    const m = map[mode] || { txt: mode, hint: '' };
    return `<span class="badge ${mode === 'lokalny' ? 'amber' : 'green'}" title="${esc(m.hint)}">${m.txt}</span>`;
  }

  /* ---- 12. eksport ------------------------------------------------------- */

  global.CQ = Object.assign(CQ, {
    ui: {
      esc, el, qs, qsa, param, bootHeader, bootTeacher, requireAdmin, applyTheme, isDark,
      toast, openModal, closeModal, wiersz, formModal, confirmBox, avatar, empty, badge, statusBadge,
      levelBadge, timerRing, live, confetti, animateText, modeChip, fmtPts, fmtDate, fmtAgo, fmtSec,
      download, copy, NAV, STATUS_META, ZESPOLY: CQ.ZESPOLY,
    },
  });

  global.addEventListener('unhandledrejection', (e) => {
    const msg = (e.reason && e.reason.message) || String(e.reason);
    if (/AbortError|ResizeObserver/.test(msg)) return;
    console.error('[cq] nieobsłużony błąd:', e.reason);
    global.CQ.ui.toast('Błąd: ' + msg, 'err', 6000);
  });
})(window);
