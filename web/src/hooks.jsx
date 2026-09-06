import { useEffect, useState } from 'react';
import { apiGet } from './api.js';

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
    let live = true;
    apiGet('/auth/ja')
      .then((d) => { if (live && d.teacher) setTeacher(d.teacher); })
      .catch(() => { if (live) setTeacher(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  return { teacher, loading };
}
