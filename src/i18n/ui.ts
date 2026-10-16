import type { Lang, Section } from './routes';

// UI strings. Placeholder copy until the approved texts arrive (Stages 08 and 09).
type Ui = {
  siteName: string;
  skip: string;
  nav: Record<Section, string>;
  navLabel: string;
  settings: string;
  menu: string;
  preferences: { title: string; theme: string; language: string; density: string; later: string; dark: string; light: string; compact: string; comfortable: string; spacious: string };
  footer: { credit: string; creditLink: string; independence: string; ai: string; aiLink: string };
  pages: Record<Section, { title: string; intro: string }>;
  home: { welcome: string; featured: string; explore: string };
  about: { aiTitle: string; aiPlaceholder: string };
  gallery: { chapters: string; photos: string; none: string; viewPhoto: string };
  chapters: Record<string, string>;
  photo: { credit: string; original: string; download: string; nasaId: string; date: string; camera: string; tbc: string; back: string };
  placeholder: string;
};

export const ui: Record<Lang, Ui> = {
  es: {
    siteName: 'Artemis II',
    skip: 'Saltar al contenido',
    nav: { home: 'Inicio', launch: 'El despegue', mission: 'La misión', 'why-it-matters': 'Por qué importa', gallery: 'Galería', about: 'Acerca' },
    navLabel: 'Principal',
    settings: 'Ajustes',
    menu: 'Menú',
    preferences: { title: 'Preferencias', theme: 'Tema', language: 'Idioma', density: 'Densidad', later: 'Disponible en una etapa posterior.', dark: 'Oscuro', light: 'Claro', compact: 'Compacta', comfortable: 'Cómoda', spacious: 'Amplia' },
    footer: {
      credit: 'Crédito: NASA',
      creditLink: 'https://www.nasa.gov/',
      independence: 'Sitio independiente, sin relación oficial con NASA ni respaldo de NASA.',
      ai: 'Este sitio fue creado con ayuda de inteligencia artificial.',
      aiLink: 'Más información',
    },
    pages: {
      home: { title: 'Artemis II', intro: 'Texto de bienvenida (marcador de posición).' },
      launch: { title: 'El despegue', intro: 'Resumen del despegue (marcador de posición).' },
      mission: { title: 'La misión', intro: 'Cronología, tripulación e hitos (marcador de posición).' },
      'why-it-matters': { title: 'Por qué importa', intro: 'El significado de volver a la Luna (marcador de posición).' },
      gallery: { title: 'Galería', intro: 'Fotos de la misión, por capítulos.' },
      about: { title: 'Acerca', intro: 'Fuentes, créditos y aviso sobre el uso de IA (marcador de posición).' },
    },
    home: { welcome: 'Bienvenido a Artemis II', featured: 'Foto o video destacado (marcador de posición)', explore: 'Explora el sitio' },
    gallery: { chapters: 'Capítulos', photos: 'Fotos', none: 'Aún no hay fotos en este capítulo.', viewPhoto: 'Ver foto' },
    about: { aiTitle: 'Aviso sobre el uso de IA', aiPlaceholder: 'El aviso completo llegará en una etapa posterior (marcador de posición).' },
    chapters: { launch: 'El despegue', outbound: 'Rumbo a la Luna', 'far-side': 'Lado oculto', eclipse: 'Eclipse', return: 'Regreso' },
    photo: { credit: 'Crédito: NASA', original: 'Ver original', download: 'Descargar', nasaId: 'ID de NASA', date: 'Fecha', camera: 'Cámara', tbc: 'Por confirmar', back: 'Volver al capítulo' },
    placeholder: 'Marcador de posición',
  },
  en: {
    siteName: 'Artemis II',
    skip: 'Skip to content',
    nav: { home: 'Home', launch: 'The launch', mission: 'The mission', 'why-it-matters': 'Why it matters', gallery: 'Gallery', about: 'About' },
    navLabel: 'Main',
    settings: 'Settings',
    menu: 'Menu',
    preferences: { title: 'Preferences', theme: 'Theme', language: 'Language', density: 'Density', later: 'Available in a later stage.', dark: 'Dark', light: 'Light', compact: 'Compact', comfortable: 'Comfortable', spacious: 'Spacious' },
    footer: {
      credit: 'Credit: NASA',
      creditLink: 'https://www.nasa.gov/',
      independence: 'Independent site, not officially affiliated with or endorsed by NASA.',
      ai: 'This site was created with the help of artificial intelligence.',
      aiLink: 'Learn more',
    },
    pages: {
      home: { title: 'Artemis II', intro: 'Welcome text (placeholder).' },
      launch: { title: 'The launch', intro: 'Summary of the liftoff (placeholder).' },
      mission: { title: 'The mission', intro: 'Timeline, crew and milestones (placeholder).' },
      'why-it-matters': { title: 'Why it matters', intro: 'What returning to the Moon means (placeholder).' },
      gallery: { title: 'Gallery', intro: 'Photos from the mission, by chapter.' },
      about: { title: 'About', intro: 'Sources, credits and the AI notice (placeholder).' },
    },
    home: { welcome: 'Welcome to Artemis II', featured: 'Featured photo or video (placeholder)', explore: 'Explore the site' },
    gallery: { chapters: 'Chapters', photos: 'Photos', none: 'No photos in this chapter yet.', viewPhoto: 'View photo' },
    about: { aiTitle: 'AI notice', aiPlaceholder: 'The full notice will arrive in a later stage (placeholder).' },
    chapters: { launch: 'The launch', outbound: 'Outbound', 'far-side': 'Far side', eclipse: 'Eclipse', return: 'Return' },
    photo: { credit: 'Credit: NASA', original: 'View original', download: 'Download', nasaId: 'NASA ID', date: 'Date', camera: 'Camera', tbc: 'To be confirmed', back: 'Back to chapter' },
    placeholder: 'Placeholder',
  },
};
