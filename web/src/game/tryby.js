// Definicje trybów gry (wspólne dla ekranów nauczyciela i ucznia).

export const TRYBY = {
  '4pola': {
    id: '4pola',
    nazwa: 'Przetrwanie (4 pola)',
    ikona: '🎯',
    opis: 'Każdy na własną rękę — dobiegnij do właściwego pola, zanim czas minie.'
  },
  'budowlanci': {
    id: 'budowlanci',
    nazwa: 'Szaleni budowlańcy',
    ikona: '🏗️',
    opis: 'Ekipy budują wieżowiec — szybkie odpowiedzi = cegły, karty = chaos.'
  }
};

export const EKIPA_PALETA = ['#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];

export const KARTY_INFO = {
  bomba: { ikona: '💣', nazwa: 'Bomba', opis: 'Zdejmuje 2 cegły z wieży wybranej ekipy (tarcza może ją zatrzymać).' },
  tarcza: { ikona: '🛡️', nazwa: 'Tarcza', opis: 'Twoja ekipa odbija następną bombę.' },
  podwojna: { ikona: '⚡', nazwa: 'Podwójna cegła', opis: 'Twoja następna dobra odpowiedź daje 2 cegły.' },
  cegla: { ikona: '🧱', nazwa: 'Cegła', opis: 'Natychmiast +1 cegła do wieży Twojej ekipy.' }
};

export const trybInfo = (id) => TRYBY[id] || TRYBY['4pola'];
