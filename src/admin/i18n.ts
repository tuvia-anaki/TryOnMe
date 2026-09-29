/**
 * Minimal gettext-style i18n: the English text is the key, so a missing
 * translation simply falls back to English.
 */

type Dict = Record<string, string>;

const loaders: Record<string, () => Promise<{ default: Dict }>> = import.meta.glob([
  "./locales/*.json",
  "!./locales/_catalog.json",
]) as any;

let dict: Dict = {};
let lang = "en";

/** Locale file for a Shopify admin locale ("zh-CN", "pt-BR", "de", "pt"…), matched case-insensitively. */
export function localeFileFor(locale: string | undefined, available: string[]): string | null {
  const byCode = new Map(available.map((path) => [path.replace(/^.*\//, "").replace(/\.json$/, "").toLowerCase(), path]));
  const wanted = (locale || "en").toLowerCase().replace("_", "-");
  const language = wanted.split("-")[0];
  return (
    byCode.get(wanted) ??
    byCode.get(language) ??
    [...byCode.entries()].find(([code]) => code.startsWith(`${language}-`))?.[1] ??
    null
  );
}

export async function initI18n(locale: string | undefined): Promise<void> {
  const path = localeFileFor(locale, Object.keys(loaders));
  if (!path) return;
  try {
    dict = (await loaders[path]()).default;
    lang = path.replace(/^.*\//, "").replace(/\.json$/, "");
    document.documentElement.lang = lang;
  } catch {
    /* fall back to English */
  }
}

/** Marks a string for translation where it is stored before being passed to t(). */
export const msg = (text: string): string => text;

export function t(text: string, vars?: Record<string, string | number>): string {
  const template = dict[text] ?? text;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

/** Pick singular/plural by count ("{count} image" / "{count} images"). */
export function tn(count: number, one: string, other: string, vars: Record<string, string | number> = {}): string {
  return t(count === 1 ? one : other, { count, ...vars });
}

export function currentLanguage(): string {
  return lang;
}

export function formatNumber(n: number): string {
  try {
    return new Intl.NumberFormat(lang).format(n);
  } catch {
    return String(n);
  }
}
