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
let adminLocale: string | undefined;
const listeners = new Set<() => void>();
const PREFERENCE_KEY = "pvi:language";

const codeOf = (path: string): string => path.replace(/^.*\//, "").replace(/\.json$/, "");

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

/** Language code of the locale file used for a Shopify locale ("en" when there is none). */
function resolve(locale: string | undefined): string {
  const path = localeFileFor(locale, Object.keys(loaders));
  return path ? codeOf(path) : "en";
}

async function load(locale: string | undefined): Promise<void> {
  const path = localeFileFor(locale, Object.keys(loaders));
  let next: Dict = {};
  let code = "en";
  if (path) {
    try {
      next = (await loaders[path]()).default;
      code = codeOf(path);
    } catch {
      /* fall back to English */
    }
  }
  dict = next;
  lang = code;
  document.documentElement.lang = lang;
}

/** Starts in the merchant's Shopify admin language, unless they picked another one in the app. */
export async function initI18n(locale: string | undefined): Promise<void> {
  adminLocale = locale;
  await load(languagePreference() ?? locale);
}

function languagePreference(): string | null {
  try {
    return localStorage.getItem(PREFERENCE_KEY);
  } catch {
    return null;
  }
}

/** Languages the admin is translated into ("en" first). */
export function availableLanguages(): string[] {
  return ["en", ...Object.keys(loaders).map(codeOf)];
}

/**
 * Switch the app's language (remembered in this browser). Choosing the Shopify
 * admin's own language clears the choice, so the app follows the admin again.
 */
export async function setLanguage(code: string): Promise<void> {
  try {
    if (code === resolve(adminLocale)) localStorage.removeItem(PREFERENCE_KEY);
    else localStorage.setItem(PREFERENCE_KEY, code);
  } catch {
    /* storage blocked: the choice lasts until the app reloads */
  }
  await load(code);
  listeners.forEach((fn) => fn());
}

export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Each language in its own words: "Deutsch", "Português (Brasil)", "日本語". */
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    if (name) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    /* old browsers */
  }
  return code;
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
