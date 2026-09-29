import { mediaFileKey, normalizeText } from "./text";

/**
 * Normalized product model used by the admin editor and auto-assign logic.
 * Ids are Shopify legacy numeric ids (the number at the end of a GID), which
 * are also what Liquid exposes on the storefront.
 */

export type MediaType = "IMAGE" | "VIDEO" | "EXTERNAL_VIDEO" | "MODEL_3D";

export interface PMedia {
  id: number;
  type: MediaType;
  alt: string;
  /** Preview image URL (full size, Shopify CDN) or null when not ready. */
  url: string | null;
  width: number | null;
  height: number | null;
  position: number;
  /** Lowercased filename without extension. */
  fileKey: string;
}

export interface POptionValue {
  id: number;
  name: string;
  /** Shopify native swatch color (CSS color) if the merchant set one. */
  color: string | null;
  /** Shopify native swatch image URL if the merchant set one. */
  imageUrl: string | null;
  hasVariants: boolean;
}

export interface POption {
  id: number;
  name: string;
  position: number;
  values: POptionValue[];
}

export interface PVariant {
  id: number;
  title: string;
  available: boolean;
  /** Option value ids in option position order. */
  valueIds: number[];
  /** Shopify's native variant image (media id), if set. */
  mediaId: number | null;
  sku: string | null;
}

export interface ProductModel {
  id: number;
  title: string;
  handle: string;
  status: string;
  onlineStoreUrl: string | null;
  previewUrl: string | null;
  options: POption[];
  variants: PVariant[];
  media: PMedia[];
}

export function makeMedia(partial: Omit<PMedia, "fileKey"> & { fileKey?: string }): PMedia {
  return { ...partial, fileKey: partial.fileKey ?? mediaFileKey(partial.url) };
}

/** Option lookup for every option value id. */
export function optionByValueId(product: ProductModel): Map<number, POption> {
  const map = new Map<number, POption>();
  for (const option of product.options) for (const value of option.values) map.set(value.id, option);
  return map;
}

export function valueById(product: ProductModel): Map<number, POptionValue> {
  const map = new Map<number, POptionValue>();
  for (const option of product.options) for (const value of option.values) map.set(value.id, value);
  return map;
}

const COLOR_OPTION_NAMES = [
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

/**
 * Suggest which option(s) images should be grouped by:
 * 1. an option whose values line up with distinct native variant images,
 * 2. otherwise a color-like option,
 * 3. otherwise the first option.
 */
export function suggestGroupingOptions(product: ProductModel): number[] {
  const options = product.options.filter((option) => option.values.length > 1);
  if (!options.length) return product.options[0] ? [product.options[0].id] : [];

  let bestId: number | null = null;
  let bestScore = 0;
  for (const option of options) {
    const index = product.options.indexOf(option);
    const mediaByValue = new Map<number, Set<number>>();
    for (const variant of product.variants) {
      if (variant.mediaId == null) continue;
      const valueId = variant.valueIds[index];
      if (valueId == null) continue;
      if (!mediaByValue.has(valueId)) mediaByValue.set(valueId, new Set());
      mediaByValue.get(valueId)!.add(variant.mediaId);
    }
    const distinctMedia = new Set<number>();
    let consistent = 0;
    for (const media of mediaByValue.values()) {
      for (const id of media) distinctMedia.add(id);
      if (media.size === 1) consistent += 1;
    }
    // Values that each map to their own image score highest.
    const score = Math.min(distinctMedia.size, mediaByValue.size) + consistent * 0.5;
    if (distinctMedia.size >= 2 && score > bestScore) {
      bestScore = score;
      bestId = option.id;
    }
  }
  if (bestId != null) return [bestId];

  const color = options.find((option) => isColorOptionName(option.name));
  if (color) return [color.id];
  return [options[0].id];
}

export interface Combination {
  key: string;
  valueIds: number[];
  /** Human label, e.g. "Red" or "Red / Leather". */
  label: string;
  variants: PVariant[];
}

/**
 * Every combination of the grouping options' values that exists on at least
 * one variant, in the order shoppers would see them (option value order).
 */
export function groupingCombinations(product: ProductModel, groupBy: readonly number[]): Combination[] {
  const positions = product.options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => groupBy.includes(option.id));
  if (!positions.length) return [];

  const valueOrder = new Map<number, number>();
  for (const { option } of positions) option.values.forEach((value, i) => valueOrder.set(value.id, i));
  const names = valueById(product);

  const combos = new Map<string, Combination>();
  for (const variant of product.variants) {
    const ids = positions.map(({ index }) => variant.valueIds[index]).filter((id): id is number => id != null);
    if (ids.length !== positions.length) continue;
    const key = [...ids].sort((a, b) => a - b).join(".");
    let combo = combos.get(key);
    if (!combo) {
      combo = {
        key,
        valueIds: [...ids].sort((a, b) => a - b),
        label: ids.map((id) => names.get(id)?.name ?? String(id)).join(" / "),
        variants: [],
      };
      combos.set(key, combo);
    }
    combo.variants.push(variant);
  }

  const orderOf = (combo: Combination) => {
    // Sort by the grouping options' value positions, first option most significant.
    const byPosition = positions.map(({ index }) => combo.variants[0].valueIds[index]);
    return byPosition.map((id) => valueOrder.get(id) ?? 0);
  };
  return [...combos.values()].sort((a, b) => {
    const oa = orderOf(a);
    const ob = orderOf(b);
    for (let i = 0; i < oa.length; i++) if (oa[i] !== ob[i]) return oa[i] - ob[i];
    return 0;
  });
}
