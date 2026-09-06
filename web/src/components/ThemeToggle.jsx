import { useTheme } from '../hooks.jsx';

export default function ThemeToggle() {
  const [dark, setDark] = useTheme();
  return (
    <button
      className="neu-btn neu-btn-icon"
      title="Zmień motyw"
      onClick={() => setDark(!dark)}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}
