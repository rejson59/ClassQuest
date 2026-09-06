import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiDelete, apiPatch } from '../api.js';
import { useCurrentTeacher } from '../hooks.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import Msg from '../components/Msg.jsx';

export default function Zestawy() {
  const navigate = useNavigate();
  const { teacher, loading } = useCurrentTeacher();

  const [zestawy, setZestawy] = useState([]);
  const [otwarty, setOtwarty] = useState(null);   // id zestawu
  const [pytania, setPytania] = useState([]);
  const [msg, setMsg] = useState({ text: '', type: 'error' });
  const [showModal, setShowModal] = useState(false);
  const [nazwaZestawu, setNazwaZestawu] = useState('');

  // formularz pytania
  const pustyForm = { tresc: '', a: '', b: '', c: '', d: '', poprawna: 'A', czas: 15 };
  const [form, setForm] = useState({ ...pustyForm, zestawId: null });

  async function loadZestawy() {
    try {
      const d = await apiGet('/zestawy');
      setZestawy(d.zestawy);
    } catch (e) { setMsg({ text: e.message, type: 'error' }); }
  }

  useEffect(() => {
    if (!loading && !teacher) navigate('/logowanie');
    if (teacher) loadZestawy();
  }, [loading, teacher]);

  async function otworzZestaw(z) {
    try {
      const d = await apiGet(`/zestawy/${z.id}/pytania`);
      setOtwarty(z.id);
      setPytania(d.pytania);
      setForm({ ...pustyForm, zestawId: z.id });
    } catch (e) { setMsg({ text: e.message, type: 'error' }); }
  }

  async function dodajZestaw(e) {
    e.preventDefault();
    if (!nazwaZestawu.trim()) return;
    try {
      await apiPost('/zestawy', { nazwa: nazwaZestawu });
      setNazwaZestawu('');
      setShowModal(false);
      loadZestawy();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  }

  async function usunZestaw(z) {
    if (!confirm(`Usunąć zestaw „${z.nazwa}" wraz z pytaniami?`)) return;
    try {
      await apiDelete(`/zestawy/${z.id}`);
      if (otwarty === z.id) { setOtwarty(null); setPytania([]); }
      loadZestawy();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  }

  async function dodajPytanie(e) {
    e.preventDefault();
    try {
      await apiPost(`/zestawy/${form.zestawId}/pytania`, {
        tresc: form.tresc, opcja_a: form.a, opcja_b: form.b, opcja_c: form.c, opcja_d: form.d,
        poprawna: form.poprawna, czas_sek: form.czas
      });
      setForm({ ...pustyForm, zestawId: form.zestawId });
      otworzZestaw({ id: form.zestawId });
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  }

  async function usunPytanie(p) {
    if (!confirm('Usunąć to pytanie?')) return;
    try {
      await apiDelete(`/pytania/${p.id}`);
      otworzZestaw({ id: otwarty });
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  }

  if (loading || !teacher) return null;

  const litera = { A: 'opcja_a', B: 'opcja_b', C: 'opcja_c', D: 'opcja_d' };

  return (
    <div className="page">
      <Msg type={msg.type} show={!!msg.text}>{msg.text}</Msg>

      <div className="neu-card neu-card-sm topbar" style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: '1.6rem' }}>📚</span>
          <div>
            <div className="logo" style={{ fontWeight: 800, fontSize: '1.2rem' }}>ClassQuest</div>
            <p className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Zestawy pytań</p>
          </div>
        </div>
        <div className="topbar-links">
          <Link to="/nauczyciel" className="link-btn">👥 Klasy</Link>
          <Link to="/nauczyciel/zestawy" className="link-btn active">📚 Zestawy pytań</Link>
          <ThemeToggle />
          <Link to="/nauczyciel" className="neu-btn neu-btn-sm neu-btn-red">Wróć 🚪</Link>
        </div>
      </div>

      <div className="grid-1-2">
        {/* lista zestawów */}
        <div>
          <div className="neu-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>🗂️ Zestawy pytań</h2>
              <button className="neu-btn neu-btn-sm neu-btn-blue" onClick={() => setShowModal(true)}>+ Nowy zestaw</button>
            </div>
            {zestawy.length === 0 && <div className="empty-state">Brak zestawów. Utwórz pierwszy zestaw pytań.</div>}
            {zestawy.map(z => (
              <div key={z.id} className="row-item" style={{ cursor: 'pointer', border: otwarty === z.id ? '1px solid var(--blue-main)' : '1px solid transparent' }}
                onClick={() => otworzZestaw(z)}>
                <div className="row-main">
                  <span style={{ fontSize: '1.3rem' }}>📖</span>
                  <div>
                    <div className="row-title">{z.nazwa}</div>
                    <div className="row-sub">{z.liczba_pytan} pytań</div>
                  </div>
                </div>
                <div className="row-actions" onClick={e => e.stopPropagation()}>
                  <button className="neu-btn neu-btn-sm neu-btn-red" onClick={() => usunZestaw(z)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* zawartość zestawu */}
        <div>
          {!otwarty ? (
            <div className="neu-card empty-state">Wybierz zestaw, aby edytować pytania (treść + odpowiedzi A–D + poprawna).</div>
          ) : (
            <div className="neu-card">
              <h2 className="section-title">✏️ Pytania w zestawie</h2>

              <form onSubmit={dodajPytanie} style={{ background: 'transparent' }}>
                <div className="field">
                  <label className="neu-label">Treść pytania</label>
                  <textarea className="neu-textarea" rows={2} value={form.tresc}
                    onChange={e => setForm({ ...form, tresc: e.target.value })}
                    placeholder="np. Ile to jest 1/2 + 1/4?" />
                </div>
                <div className="grid-2">
                  {['a', 'b', 'c', 'd'].map(l => (
                    <div className="field" key={l}>
                      <label className="neu-label">Odpowiedź {l.toUpperCase()}</label>
                      <input className="neu-input" value={form[l]}
                        onChange={e => setForm({ ...form, [l]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
                  <div style={{ width: 170 }}>
                    <label className="neu-label">Poprawna odpowiedź</label>
                    <select className="neu-select" value={form.poprawna}
                      onChange={e => setForm({ ...form, poprawna: e.target.value })}>
                      <option value="A">A</option><option value="B">B</option>
                      <option value="C">C</option><option value="D">D</option>
                    </select>
                  </div>
                  <div style={{ width: 170 }}>
                    <label className="neu-label">Czas rundy (s)</label>
                    <input className="neu-input" type="number" min="5" max="120" value={form.czas}
                      onChange={e => setForm({ ...form, czas: e.target.value })} />
                  </div>
                  <button className="neu-btn neu-btn-blue">+ Dodaj pytanie</button>
                </div>
              </form>

              <hr className="sep" />

              {pytania.length === 0 && <div className="empty-state">Brak pytań w tym zestawie.</div>}
              {pytania.map(p => (
                <div key={p.id} className="row-item" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div className="row-title" style={{ marginBottom: 4 }}>{p.tresc}</div>
                    <div className="row-sub">
                      A) {p.opcja_a} • B) {p.opcja_b} • C) {p.opcja_c} • D) {p.opcja_d}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span className="badge badge-green">Poprawna: {p.poprawna}</span>
                      {p.czas_sek > 0 && <span className="badge">⏱ {p.czas_sek}s</span>}
                    </div>
                  </div>
                  <button className="neu-btn neu-btn-sm neu-btn-red" onClick={() => usunPytanie(p)} title="Usuń pytanie">🗑</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Nowy zestaw pytań</div>
            <form onSubmit={dodajZestaw}>
              <div className="field">
                <label className="neu-label">Nazwa zestawu</label>
                <input className="neu-input" autoFocus placeholder="np. Matematyka — ułamki" value={nazwaZestawu}
                  onChange={e => setNazwaZestawu(e.target.value)} />
              </div>
              <div className="modal-actions">
                <button type="button" className="neu-btn" onClick={() => setShowModal(false)}>Anuluj</button>
                <button className="neu-btn neu-btn-blue">Utwórz zestaw</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
