import { Routes, Route } from 'react-router-dom';
import Start from './pages/Start.jsx';
import Logowanie from './pages/Logowanie.jsx';
import Nauczyciel from './pages/Nauczyciel.jsx';
import NauczycielGra from './pages/NauczycielGra.jsx';
import Zestawy from './pages/Zestawy.jsx';
import Uczen from './pages/Uczen.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Start />} />
      <Route path="/logowanie" element={<Logowanie />} />
      <Route path="/nauczyciel" element={<Nauczyciel />} />
      <Route path="/nauczyciel/zestawy" element={<Zestawy />} />
      <Route path="/nauczyciel/gra/:kod" element={<NauczycielGra />} />
      <Route path="/uczen" element={<Uczen />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}
