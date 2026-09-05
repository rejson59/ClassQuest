// 1. Inicjalizacja Supabase SDK z CDN (jeśli brak w dokumentach HTML)
(function loadSupabaseSDK() {
  if (!window.supabase) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = false;
    document.head.appendChild(script);
  }
})();

// 2. Parametry połączeniowe Supabase
const SUPABASE_URL = 'https://tvigygkvhiljepzvyuyw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_GtGlG0aG9J5784cLhnIR7w_dFFFHu4D';

let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient) {
    if (window.supabase) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      console.error('Biblioteka Supabase nie została jeszcze załadowana.');
    }
  }
  return supabaseClient;
}

/* ==========================================================================
   NAUCZYCIELE & AUTORYZACJA (Tabela: nauczyciele)
   ========================================================================== */

// Logowanie po imie_nazwisko i haslo
async function loginTeacher(imieNazwisko, haslo) {
  const db = getSupabase();
  const { data, error } = await db
    .from('nauczyciele')
    .select('id, imie_nazwisko')
    .eq('imie_nazwisko', imieNazwisko)
    .eq('haslo', haslo)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Nieprawidłowe dane logowania.' };

  // Zapisujemy zalogowanego nauczyciela w localStorage
  localStorage.setItem('cq_teacher', JSON.stringify(data));
  return { teacher: data };
}

// Rejestracja nowego nauczyciela
async function registerTeacher(imieNazwisko, haslo) {
  const db = getSupabase();
  const { data, error } = await db
    .from('nauczyciele')
    .insert([{ imie_nazwisko: imieNazwisko, haslo: haslo }])
    .select('id, imie_nazwisko')
    .single();

  if (error) return { error: error.message };

  localStorage.setItem('cq_teacher', JSON.stringify(data));
  return { teacher: data };
}

// Pobieranie aktywnego nauczyciela z pamięci
function getCurrentTeacher() {
  const teacher = localStorage.getItem('cq_teacher');
  return teacher ? JSON.parse(teacher) : null;
}

// Weryfikacja zalogowania (Wymagane w nauczyciel.html)
function requireTeacherAuth() {
  const teacher = getCurrentTeacher();
  if (!teacher) {
    window.location.href = 'logowanie.html';
  }
  return teacher;
}

// Wylogowanie
function logoutTeacher() {
  localStorage.removeItem('cq_teacher');
  window.location.href = 'logowanie.html';
}

/* ==========================================================================
   ZESTAWY PYTAŃ I PYTANIA (Tabele: zestaw_pytan, pytania)
   ========================================================================== */

// Pobiera wszystkie zestawy pytań danego nauczyciela
async function getTeacherSets(nauczycielId) {
  const db = getSupabase();
  return await db
    .from('zestaw_pytan')
    .select('*')
    .eq('nauczyciel_id', nauczycielId)
    .order('created_at', { ascending: false });
}

// Tworzy nowy zestaw pytań
async function createQuestionSet(nauczycielId, nazwaZestawu) {
  const db = getSupabase();
  return await db
    .from('zestaw_pytan')
    .insert([{ nauczyciel_id: nauczycielId, nazwa_zestawu: nazwaZestawu }])
    .select()
    .single();
}

// Pobiera pytania należące do konkretnego zestawu
async function getQuestionsFromSet(zestawId) {
  const db = getSupabase();
  return await db
    .from('pytania')
    .select('*')
    .eq('zestaw_id', zestawId);
}

// Dodaje pytanie do zestawu
async function addQuestion(zestawId, pytanieData) {
  const db = getSupabase();
  return await db
    .from('pytania')
    .insert([{
      zestaw_id: zestawId,
      pytanie: pytanieData.pytanie,
      opcja_a: pytanieData.opcja_a,
      opcja_b: pytanieData.opcja_b,
      opcja_c: pytanieData.opcja_c,
      opcja_d: pytanieData.opcja_d,
      poprawna_opcja: pytanieData.poprawna_opcja
    }])
    .select()
    .single();
}

/* ==========================================================================
   SESJE GIER (Tabela: sesje_gier)
   ========================================================================== */

// Tworzy nową sesję gry z kodem pokoju
async function createGameSession(zestawId, kodPokoju, typGry = 'standard') {
  const db = getSupabase();
  return await db
    .from('sesje_gier')
    .insert([{
      kod: kodPokoju,
      zestaw_id: zestawId,
      gra: typGry,
      status: 'waiting'
    }])
    .select()
    .single();
}

// Zmienia status gry (np. z 'waiting' na 'active' lub 'finished')
async function updateGameStatus(sessionId, status) {
  const db = getSupabase();
  return await db
    .from('sesje_gier')
    .update({ status: status })
    .eq('id', sessionId);
}

/* ==========================================================================
   UCZNIOWIE (Tabela: uczniowie)
   ========================================================================== */

// Dołączenie ucznia do pokoju
async function joinRoomAsStudent(kodPokoju, nickname, numerDziennika = null) {
  const db = getSupabase();
  return await db
    .from('uczniowie')
    .insert([{
      kod_pokoju: kodPokoju,
      nickname: nickname,
      numer_dziennika: numerDziennika,
      wynik: 0
    }])
    .select()
    .single();
}

// Pobieranie obecnej listy uczniów w pokoju
async function getStudentsInRoom(kodPokoju) {
  const db = getSupabase();
  return await db
    .from('uczniowie')
    .select('*')
    .eq('kod_pokoju', kodPokoju);
}

// Aktualizacja wyniku ucznia
async function updateStudentScore(studentId, newScore) {
  const db = getSupabase();
  return await db
    .from('uczniowie')
    .update({ wynik: newScore })
    .eq('id', studentId);
}
