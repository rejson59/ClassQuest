import { useEffect, useState } from 'react';

export function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem('cq_theme') === 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('cq_theme', dark ? 'dark' : 'light');
  }, [dark]);
  return [dark, setDark];
}

export function useCurrentTeacher() {
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/auth/ja', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setTeacher(d.teacher))
      .catch(() => setTeacher(null))
      .finally(() => setLoading(false));
  }, []);
  return { teacher, loading };
}
