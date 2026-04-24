/**
 * Shared theme tokens used across client-facing pages.
 *
 * Plan B architecture: these palettes are the source of truth, but they're
 * applied at runtime via CSS custom properties on <html>. Components can
 * keep their local `const t = {...}` blocks — they just reference
 * `var(--teal)` etc. instead of literal hex values. Theme flip = one
 * className change on <body>.
 *
 * Dark is byte-identical to the palette that used to live inline in
 * client/page.tsx and siblings (before any light-mode work). Adding
 * these keys: blue, accent, accentDim (from progress + workout pages).
 *
 * Light palette keeps accent colors consistent (teal reads as teal in
 * both modes) but darkens them slightly where needed for contrast on
 * white, and inverts surface/text.
 */

export type ThemeTokens = {
  bg: string
  surface: string
  surfaceUp: string
  surfaceHigh: string
  border: string
  teal: string
  tealDim: string
  orange: string
  orangeDim: string
  purple: string
  purpleDim: string
  red: string
  redDim: string
  yellow: string
  yellowDim: string
  green: string
  greenDim: string
  pink: string
  pinkDim: string
  blue: string
  accent: string
  accentDim: string
  text: string
  textMuted: string
  textDim: string
}

export const themeDark: ThemeTokens = {
  bg: '#080810',
  surface: '#0f0f1a',
  surfaceUp: '#161624',
  surfaceHigh: '#1d1d2e',
  border: '#252538',
  teal: '#00c9b1',      tealDim: '#00c9b115',
  orange: '#f5a623',    orangeDim: '#f5a62315',
  purple: '#8b5cf6',    purpleDim: '#8b5cf615',
  red: '#ef4444',       redDim: '#ef444415',
  yellow: '#eab308',    yellowDim: '#eab30815',
  green: '#22c55e',     greenDim: '#22c55e15',
  pink: '#f472b6',      pinkDim: '#f472b615',
  blue: '#60a5fa',
  accent: '#c8f545',    accentDim: '#c8f54515',
  text: '#eeeef8',
  textMuted: '#5a5a78',
  textDim: '#8888a8',
}

export const themeLight: ThemeTokens = {
  bg: '#f7f7fb',
  surface: '#ffffff',
  surfaceUp: '#f2f2f8',
  surfaceHigh: '#e8e8f0',
  border: '#d8d8e4',
  teal: '#00a896',      tealDim: '#00a89618',
  orange: '#d97706',    orangeDim: '#d9770618',
  purple: '#7c3aed',    purpleDim: '#7c3aed18',
  red: '#dc2626',       redDim: '#dc262618',
  yellow: '#ca8a04',    yellowDim: '#ca8a0418',
  green: '#16a34a',     greenDim: '#16a34a18',
  pink: '#db2777',      pinkDim: '#db277718',
  blue: '#2563eb',
  accent: '#65a30d',    accentDim: '#65a30d18',
  text: '#0f0f1a',
  textMuted: '#8888a0',
  textDim: '#5a5a78',
}

export type ThemePreference = 'dark' | 'light' | 'system'

/**
 * Generate a CSS string that defines every theme token as a custom
 * property, scoped to a selector. Used to inject theme vars globally
 * without relying on a React context.
 *
 * Returns something like:
 *   :root {
 *     --bg: #080810;
 *     --surface: #0f0f1a;
 *     ...
 *   }
 */
export function themeToCss(selector: string, tokens: ThemeTokens): string {
  const lines = Object.entries(tokens).map(([k, v]) => {
    // camelCase -> kebab-case for CSS var names
    const name = k.replace(/([A-Z])/g, '-$1').toLowerCase()
    return `  --${name}: ${v};`
  })
  return `${selector} {\n${lines.join('\n')}\n}`
}

/**
 * Build the full CSS block injected into the client-side layout.
 * :root holds the dark palette (default — matches current production).
 * [data-theme="light"] overrides with the light palette.
 * Toggling theme = setting data-theme attribute on <html>.
 */
export function buildThemeCss(): string {
  return [
    themeToCss(':root', themeDark),
    themeToCss('[data-theme="light"]', themeLight),
  ].join('\n\n')
}
