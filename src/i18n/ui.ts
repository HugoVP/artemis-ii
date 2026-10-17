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
  home: { heading: string; welcome: string; featured: string; galleryCta: string; missionCta: string; cardDesc: string };
  launch: { dateTbc: string; summary: string; phasesTitle: string; phase: string; phaseName: string; shortDesc: string; videoTitle: string; videoPlaceholder: string; play: string; videoNote: string; photosTitle: string };
  mission: { intro: string; timelineTitle: string; dateTbc: string; events: string[]; shortDesc: string; crewTitle: string; crew: string[]; role: string; milestonesTitle: string; milestones: string };
  why: { p1: string; programTitle: string; p2: string; nextTitle: string; p3: string; sources: string };
  about: { sources: { title: string; text: string }; credits: { title: string; text: string }; nasa: { title: string; text: string }; ai: { title: string; text: string }; contact: { title: string; button: string } };
  gallery: { intro: string; photoCount: (n: number) => string; none: string; viewPhoto: string };
  chapters: Record<string, string>;
  photo: { credit: string; original: string; download: string; nasaId: string; date: string; camera: string; tbc: string; back: string };
  placeholder: string;
  photoPlaceholder: string;
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
      independence: 'Sitio independiente, sin relación oficial con NASA ni respaldo de NASA. Las imágenes y el video pertenecen a NASA y enlazan a su fuente.',
      ai: 'Este sitio fue creado con ayuda de inteligencia artificial.',
      aiLink: 'Más información',
    },
    pages: {
      home: { title: 'Artemis II', intro: 'Texto de bienvenida (marcador de posición).' },
      launch: { title: 'El despegue', intro: 'Resumen del despegue (marcador de posición).' },
      mission: { title: 'La misión', intro: 'Cronología, tripulación e hitos (marcador de posición).' },
      'why-it-matters': { title: 'Por qué importa', intro: 'El significado de volver a la Luna (marcador de posición).' },
      gallery: { title: 'Galería', intro: 'Cinco capítulos para seguir la misión en imágenes.' },
      about: { title: 'Acerca', intro: 'Fuentes, créditos y aviso sobre el uso de IA (marcador de posición).' },
    },
    home: {
      heading: 'Artemis II, de regreso a la Luna',
      welcome: 'Una línea de bienvenida que te invita a explorar la misión a través de fotografías e historias.',
      featured: 'Foto o video destacado (marcador de posición)',
      galleryCta: 'Explorar la galería',
      missionCta: 'La misión',
      cardDesc: 'Descripción breve de la sección.',
    },
    launch: {
      dateTbc: 'Fecha y hora del despegue: por confirmar',
      summary: 'Resumen del despegue, escrito para el público general. Texto de muestra, no es el contenido final.',
      phasesTitle: 'Fases del ascenso',
      phase: 'Fase',
      phaseName: 'Nombre de la fase',
      shortDesc: 'Descripción breve.',
      videoTitle: 'Video oficial',
      videoPlaceholder: 'Marcador de posición del video',
      play: 'Reproducir video',
      videoNote: 'El video solo se solicita a su proveedor cuando presionas Reproducir.',
      photosTitle: 'Fotos del despegue',
    },
    mission: {
      intro: 'Introducción a la misión y su ruta. Texto de muestra.',
      timelineTitle: 'Cronología',
      dateTbc: 'Fecha por confirmar',
      events: ['Despegue', 'Inyección translunar', 'Sobrevuelo del lado oculto', 'Eclipse', 'Regreso', 'Amerizaje'],
      shortDesc: 'Descripción breve.',
      crewTitle: 'Tripulación',
      crew: ['Reid Wiseman', 'Victor Glover', 'Christina Koch', 'Jeremy Hansen'],
      role: 'Función en la misión',
      milestonesTitle: 'Hitos y récords',
      milestones: 'Lista de hitos y récords, cada uno con su fuente. Texto de muestra.',
    },
    why: {
      p1: 'Primer regreso de personas a la Luna desde el Apolo 17 (1972). Párrafo de muestra que explica qué significa la misión.',
      programTitle: 'El programa Artemis',
      p2: 'Texto de muestra sobre el programa y lo que sigue.',
      nextTitle: 'Lo que sigue',
      p3: 'Texto de muestra sobre los próximos pasos.',
      sources: 'Fuentes: lista de enlaces por confirmar.',
    },
    gallery: {
      intro: 'Cinco capítulos para seguir la misión en imágenes.',
      photoCount: (n) => (n === 1 ? '1 foto' : `${n} fotos`),
      none: 'Aún no hay fotos en este capítulo.',
      viewPhoto: 'Ver foto',
    },
    about: {
      sources: { title: 'Fuentes', text: 'Lista de fuentes oficiales y periodísticas, con enlaces.' },
      credits: { title: 'Créditos', text: 'Crédito: NASA, con un enlace al original en cada imagen y video.' },
      nasa: { title: 'Uso de materiales de NASA', text: 'Enlace a las pautas de uso de medios de NASA. Sin logotipos ni insignias, y sin sugerir respaldo.' },
      ai: { title: 'Aviso sobre el uso de IA', text: 'Aviso completo sobre el uso de inteligencia artificial en este sitio. Texto de muestra.' },
      contact: { title: 'Contacto', button: 'Escribir al autor' },
    },
    chapters: { launch: 'El despegue', outbound: 'Rumbo a la Luna', 'far-side': 'Lado oculto', eclipse: 'Eclipse', return: 'Regreso' },
    photo: { credit: 'Crédito: NASA', original: 'Ver original', download: 'Descargar', nasaId: 'ID de NASA', date: 'Fecha', camera: 'Cámara', tbc: 'Por confirmar', back: 'Volver al capítulo' },
    placeholder: 'Marcador de posición',
    photoPlaceholder: 'Marcador de posición de foto',
  },
  en: {
    siteName: 'Artemis II',
    skip: 'Skip to content',
    nav: { home: 'Home', launch: 'Launch', mission: 'The mission', 'why-it-matters': 'Why it matters', gallery: 'Gallery', about: 'About' },
    navLabel: 'Main',
    settings: 'Settings',
    menu: 'Menu',
    preferences: { title: 'Preferences', theme: 'Theme', language: 'Language', density: 'Density', later: 'Available in a later stage.', dark: 'Dark', light: 'Light', compact: 'Compact', comfortable: 'Comfortable', spacious: 'Spacious' },
    footer: {
      credit: 'Credit: NASA',
      creditLink: 'https://www.nasa.gov/',
      independence: 'Independent site, not affiliated with or endorsed by NASA. Images and video belong to NASA and link back to their source.',
      ai: 'This site was created with the help of artificial intelligence.',
      aiLink: 'Learn more',
    },
    pages: {
      home: { title: 'Artemis II', intro: 'Welcome text (placeholder).' },
      launch: { title: 'The launch', intro: 'Summary of the liftoff (placeholder).' },
      mission: { title: 'The mission', intro: 'Timeline, crew and milestones (placeholder).' },
      'why-it-matters': { title: 'Why it matters', intro: 'What returning to the Moon means (placeholder).' },
      gallery: { title: 'Gallery', intro: 'Five chapters to follow the mission in pictures.' },
      about: { title: 'About', intro: 'Sources, credits and the AI notice (placeholder).' },
    },
    home: {
      heading: 'Artemis II, back to the Moon',
      welcome: 'A short welcome line that invites you to explore the mission through photographs and stories.',
      featured: 'Featured photo or video (placeholder)',
      galleryCta: 'Explore the gallery',
      missionCta: 'The mission',
      cardDesc: 'Short description of the section.',
    },
    launch: {
      dateTbc: 'Launch date and time: to be confirmed',
      summary: 'Summary of the launch, written for a general audience. Sample text, not final content.',
      phasesTitle: 'Ascent phases',
      phase: 'Phase',
      phaseName: 'Phase name',
      shortDesc: 'Short description.',
      videoTitle: 'Official video',
      videoPlaceholder: 'Video placeholder',
      play: 'Play video',
      videoNote: 'The video is only requested from its provider when you press Play.',
      photosTitle: 'Launch photos',
    },
    mission: {
      intro: 'Introduction to the mission and its route. Sample text.',
      timelineTitle: 'Timeline',
      dateTbc: 'Date to be confirmed',
      events: ['Launch', 'Translunar injection', 'Far-side flyby', 'Eclipse', 'Return', 'Splashdown'],
      shortDesc: 'Short description.',
      crewTitle: 'Crew',
      crew: ['Reid Wiseman', 'Victor Glover', 'Christina Koch', 'Jeremy Hansen'],
      role: 'Role in the mission',
      milestonesTitle: 'Milestones and records',
      milestones: 'List of milestones and records, each with its source. Sample text.',
    },
    why: {
      p1: 'First return of people to the Moon since Apollo 17 (1972). Sample paragraph explaining what the mission means.',
      programTitle: 'The Artemis program',
      p2: 'Sample text about the program and what comes next for it.',
      nextTitle: 'What comes next',
      p3: 'Sample text about the next steps.',
      sources: 'Sources: list of links to be confirmed.',
    },
    gallery: {
      intro: 'Five chapters to follow the mission in pictures.',
      photoCount: (n) => (n === 1 ? '1 photo' : `${n} photos`),
      none: 'No photos in this chapter yet.',
      viewPhoto: 'View photo',
    },
    about: {
      sources: { title: 'Sources', text: 'List of official and news sources, with links.' },
      credits: { title: 'Credits', text: 'Credit: NASA, with a link to the original on every image and video.' },
      nasa: { title: 'Use of NASA materials', text: "Link to NASA's media usage guidelines. No logos or insignia, and no suggestion of endorsement." },
      ai: { title: 'AI notice', text: 'Full notice about the use of artificial intelligence on this site. Sample text.' },
      contact: { title: 'Contact', button: 'Write to the author' },
    },
    chapters: { launch: 'Launch', outbound: 'Outbound', 'far-side': 'Far side', eclipse: 'Eclipse', return: 'Return' },
    photo: { credit: 'Credit: NASA', original: 'View original', download: 'Download', nasaId: 'NASA ID', date: 'Date', camera: 'Camera', tbc: 'To be confirmed', back: 'Back to chapter' },
    placeholder: 'Placeholder',
    photoPlaceholder: 'Photo placeholder',
  },
};
