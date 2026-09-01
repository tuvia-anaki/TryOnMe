/**
 * Admin languages: the primary languages of the top-20 Shopify markets,
 * plus Hebrew. Names are written in their own language (endonyms).
 */

export interface Language {
  code: string;
  nativeName: string;
  flag: string;
  rtl?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: "en", nativeName: "English", flag: "🇺🇸" },
  { code: "es", nativeName: "Español", flag: "🇪🇸" },
  { code: "fr", nativeName: "Français", flag: "🇫🇷" },
  { code: "de", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "it", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "pt", nativeName: "Português", flag: "🇧🇷" },
  { code: "nl", nativeName: "Nederlands", flag: "🇳🇱" },
  { code: "ja", nativeName: "日本語", flag: "🇯🇵" },
  { code: "zh", nativeName: "中文", flag: "🇨🇳" },
  { code: "ko", nativeName: "한국어", flag: "🇰🇷" },
  { code: "hi", nativeName: "हिन्दी", flag: "🇮🇳" },
  { code: "tr", nativeName: "Türkçe", flag: "🇹🇷" },
  { code: "pl", nativeName: "Polski", flag: "🇵🇱" },
  { code: "sv", nativeName: "Svenska", flag: "🇸🇪" },
  { code: "da", nativeName: "Dansk", flag: "🇩🇰" },
  { code: "no", nativeName: "Norsk", flag: "🇳🇴" },
  { code: "fi", nativeName: "Suomi", flag: "🇫🇮" },
  { code: "id", nativeName: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "th", nativeName: "ไทย", flag: "🇹🇭" },
  { code: "vi", nativeName: "Tiếng Việt", flag: "🇻🇳" },
  { code: "he", nativeName: "עברית", flag: "🇮🇱", rtl: true },
];

export function isValidLanguage(code: string): boolean {
  return LANGUAGES.some((l) => l.code === code);
}

export function isRtl(code: string): boolean {
  return LANGUAGES.find((l) => l.code === code)?.rtl === true;
}
