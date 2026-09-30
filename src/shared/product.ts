import { containsPhrase, normalizeText } from "./text";

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

/** Option names that mean "size" in common store languages. */
export const SIZE_OPTION_NAMES = [
  "size", "sizes", "sizing", "taille", "tailles", "große", "grosse", "groesse", "talla", "tallas", "tamano",
  "tamanho", "tamanhos", "taglia", "taglie", "maat", "maten", "storlek", "størrelse", "storrelse", "koko",
  "rozmiar", "velikost", "beden", "numara", "marime", "meret", "ukuran", "kich thuoc", "kich co", "размер",
  "розмір", "מידה", "مقاس", "サイズ", "尺码", "尺碼", "尺寸", "사이즈", "크기", "ขนาด",
];

const SIZE_WORDS = SIZE_OPTION_NAMES.map(normalizeText);

/** Heuristic: is this option about size ("Size", "Shoe size", "Taille", "サイズ")? */
export function isSizeOptionName(name: string): boolean {
  const n = normalizeText(name);
  return !!n && SIZE_WORDS.some((word) => containsPhrase(n, word));
}

/** Option names of amounts (gift card "Denominations") in common store languages. */
export const AMOUNT_OPTION_NAMES = [
  "denomination", "denominations", "amount", "gift card", "gift card value", "betrag", "montant", "importo",
  "bedrag", "monto", "belopp", "beløb", "beløp", "kwota", "tutar", "summa", "castka", "面额", "面額", "金额",
  "金額", "額面", "금액", "액면가",
];
const AMOUNT_WORDS = AMOUNT_OPTION_NAMES.map(normalizeText);

/** Heuristic: is this option an amount ("Denominations", "Amount", "Betrag")? */
export function isAmountOptionName(name: string): boolean {
  const n = normalizeText(name);
  return !!n && AMOUNT_WORDS.some((word) => containsPhrase(n, word));
}
