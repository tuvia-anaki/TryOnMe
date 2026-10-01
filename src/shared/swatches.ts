import { colorsForName } from "./colors";
import { isColorOptionName } from "./product";
import type { EffectiveSettings, SwatchLook } from "./settings";
import { productCards, splitIndexes, styleOptionIndex, type VariantCard } from "./split";

/**
 * Which swatches a card gets (pure logic, shared by the storefront script and the admin's
 * preview): the values of the option the card is about, each with the card it leads to.
 */

export interface Swatch {
  value: string;
  /** The card to show when it's picked. */
  card: VariantCard;
  available: boolean;
  /** Named colors (up to 3 for "Black/White"), for color options. */
  colors: string[] | null;
  /** The value's own photo. */
  image: string | null;
}

export interface SwatchSet {
  /** The option's name ("Color"), for screen readers. */
  option: string;
  /** The value the card shows now. */
  current: string;
  swatches: Swatch[];
}

type Rules = Pick<EffectiveSettings, "by" | "hideSoldOut" | "hidden">;

/** The swatches for a card, or null when there's nothing to pick from. */
export function swatchSet(card: VariantCard, rules: Rules): SwatchSet | null {
  const product = card.product;
  const split = card.split ? splitIndexes(product, rules.by) : null;
  // A card split by one option picks among that option's values; any other card, among its styles.
  const index = Array.isArray(split) && split.length === 1 ? split[0] : styleOptionIndex(product);
  if (index < 0) return null;
  const option = product.options[index];
  const cards = productCards(product, { split: true, by: split === "each" ? "all" : `option:${option}`, hideSoldOut: false, hideNoImage: false });
  const current = card.split ? card.variant.options[index] : shownValue(card, index);

  const byValue = new Map<string, VariantCard[]>();
  for (const c of cards) {
    const value = c.variant.options[index];
    const list = byValue.get(value);
    if (list) list.push(c);
    else byValue.set(value, [c]);
  }
  // Keep the card's other choices when possible (a "Red / S" card goes to "Blue / S").
  const keeps = (c: VariantCard) => c.variant.options.every((value, i) => i === index || value === card.variant.options[i]);
  const color = isColorOptionName(option);
  const swatches: Swatch[] = [];
  for (const [value, list] of byValue) {
    const target = list.find(keeps) ?? list[0];
    const available = list.some((c) => c.available);
    if (value !== current && ((rules.hideSoldOut && !available) || (card.split && rules.hidden.includes(target.key)))) continue;
    swatches.push({ value, card: target, available, colors: color ? colorsForName(value) : null, image: target.ownImage ? target.image : null });
  }
  return swatches.length > 1 ? { option, current, swatches } : null;
}

/** The value a whole-product card shows: the one whose photo is the product's, else its first. */
function shownValue(card: VariantCard, index: number): string {
  const variant = card.product.variants.find((v) => v.image && v.image === card.product.image) ?? card.variant;
  return variant.options[index];
}

/** What a swatch shows: the variant's photo, or the color in its name (each falls back to the other, then to the name). */
export function swatchVisual(swatch: Swatch, look: SwatchLook): { colors: string[] } | { image: string } | null {
  const color = swatch.colors ? { colors: swatch.colors } : null;
  const photo = swatch.image ? { image: swatch.image } : null;
  return look === "photo" ? (photo ?? color) : (color ?? photo);
}

/** Swatch sizes in pixels. */
export const SWATCH_SIZES = { small: 22, medium: 28, large: 36 } as const;
