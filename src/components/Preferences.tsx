import { useEffect, useState } from 'react';
import type { Lang } from '../i18n/routes';

type Labels = { theme: string; language: string; density: string; dark: string; light: string; system: string; compact: string; comfortable: string; spacious: string; view: string; mosaic: string; gallery: string; immersive: string };
interface Props { lang: Lang; alternate: string; labels: Labels; gallery: boolean }

function remember(key: string, value: string) {
  try { localStorage.setItem(`artemis-${key}`, value); } catch { /* All controls work without persistence. */ }
}

function Choices({ label, values, selected, onChange }: { label: string; values: [string, string][]; selected: string; onChange: (value: string) => void }) {
  return <fieldset className="preference-group">
    <legend>{label}</legend>
    <div className="preference-options">{values.map(([value, name]) =>
      <button type="button" className="preference-chip" key={value} aria-pressed={selected === value} onClick={() => onChange(value)}>{name}</button>
    )}</div>
  </fieldset>;
}

export default function Preferences({ lang, alternate, labels: t, gallery }: Props) {
  const [theme, setTheme] = useState('dark');
  const [density, setDensity] = useState('comfortable');
  const [view, setView] = useState('gallery');
  useEffect(() => {
    const data = document.documentElement.dataset;
    setTheme(data.themePreference ?? 'dark');
    setDensity(data.density ?? 'comfortable');
    setView(data.view ?? 'gallery');
  }, []);
  return <div className="preferences" data-preferences-ready>
    <Choices label={t.theme} values={['dark', 'light', 'system'].map(v => [v, t[v as 'dark' | 'light' | 'system']])} selected={theme} onChange={value => {
      setTheme(value);
      const root = document.documentElement;
      root.dataset.themePreference = value;
      root.dataset.theme = value === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : value;
      remember('theme', value);
    }} />
    <fieldset className="preference-group">
      <legend>{t.language}</legend>
      <div className="preference-options">{(['es', 'en'] as const).map(language =>
        <a className="preference-chip" key={language} lang={language} hrefLang={language} aria-current={language === lang ? 'true' : undefined}
          href={language === lang ? undefined : alternate}
          onClick={() => remember('language', language)}>{language === 'es' ? 'Español' : 'English'}</a>
      )}</div>
    </fieldset>
    <Choices label={t.density} values={['compact', 'comfortable', 'spacious'].map(v => [v, t[v as 'compact' | 'comfortable' | 'spacious']])} selected={density} onChange={value => {
      setDensity(value); document.documentElement.dataset.density = value; remember('density', value);
    }} />
    {gallery && <Choices label={t.view} values={['mosaic', 'gallery', 'immersive'].map(v => [v, t[v as 'mosaic' | 'gallery' | 'immersive']])} selected={view} onChange={value => {
      setView(value); document.documentElement.dataset.view = value; remember('view', value);
    }} />}
  </div>;
}
