import { normalizeText } from "./text";

/** Option names that mean "color" in common store languages. */
export const COLOR_OPTION_NAMES = [
  "color", "colour", "colors", "colours", "colorway", "shade", "shades", "tone",
  "farbe", "farben", "couleur", "couleurs", "colore", "colori", "cor", "cores",
  "kleur", "kleuren", "farg", "farge", "farve", "vari", "kolor", "kolory", "barva",
  "renk", "culoare", "szin", "chroma", "mau", "warna", "цвет", "колір", "צבע", "لون",
  "رنگ", "颜色", "顏色", "カラー", "色", "색상", "색깔", "สี", "rang",
];

/** Heuristic: is this option about color? Works across common store languages. */
export function isColorOptionName(name: string): boolean {
  const n = normalizeText(name);
  if (!n) return false;
  if (COLOR_OPTION_NAMES.includes(n)) return true;
  return n.split(" ").some((word) => COLOR_OPTION_NAMES.includes(word));
}
