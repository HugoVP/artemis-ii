// A classic external head script: runs before the body can paint, with no CSP exception.
(() => {
  const root = document.documentElement;
  const read = (key: string) => {
    try { return localStorage.getItem(`artemis-${key}`); } catch { return null; }
  };
  const write = (key: string, value: string) => {
    try { localStorage.setItem(`artemis-${key}`, value); } catch { /* Storage is optional. */ }
  };
  const savedTheme = read('theme');
  const theme = savedTheme === 'light' || savedTheme === 'system' ? savedTheme : 'dark';
  const savedDensity = read('density');
  root.dataset.density = savedDensity === 'compact' || savedDensity === 'spacious' ? savedDensity : 'comfortable';
  const savedView = read('view');
  root.dataset.view = savedView === 'mosaic' || savedView === 'immersive' ? savedView : 'gallery';
  root.dataset.themePreference = theme;
  const system = matchMedia('(prefers-color-scheme: light)');
  const applyTheme = () => {
    root.dataset.theme = root.dataset.themePreference === 'system' ? (system.matches ? 'light' : 'dark') : root.dataset.themePreference;
  };
  applyTheme();
  system.addEventListener('change', applyTheme);
  if (location.pathname === '/') {
    const saved = read('language');
    const browser = navigator.language.toLowerCase().split('-')[0];
    const language = saved === 'es' || saved === 'en' ? saved : browser === 'en' ? 'en' : 'es';
    write('language', language);
    location.replace(`/${language}/`);
  } else if (root.lang === 'es' || root.lang === 'en') {
    // An explicit localized URL is also a language choice; never redirect deep links.
    write('language', root.lang);
  }
})();
