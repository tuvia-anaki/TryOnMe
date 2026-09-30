import { isColorOptionName } from "./product";
import type { SplitBy } from "./settings";

/**
 * Turning products into variant cards: which variants share a card, what the
 * card shows (image, price, title), which cards are hidden and their order.
 * Pure logic, shared by the storefront script, the app's sections and the admin.
 */

export interface VcVariant {
  id: number;
  title: string;
  /** Option values in option order. */
  options: string[];
  available: boolean;
  /** Prices in cents of the shopper's currency. */
  price: number;
  compareAtPrice: number | null;
  /** The variant's own image (Shopify's variant image), if any. */
  image: string | null;
  mediaId: number | null;
}

export interface VcProduct {
  id: number;
  handle: string;
  title: string;
  vendor: string;
  type: string;
  /** Option names in order. */
  options: string[];
  variants: VcVariant[];
  /** Featured image. */
  image: string | null;
  available: boolean;
}

export interface VariantCard {
  /** Stable key: "<productId>" for the whole product, "<productId>:<value>" for a split card. */
  key: string;
  product: VcProduct;
  /** The variant the card opens and adds to cart: the first available one of its group. */
  variant: VcVariant;
  /** Every variant the card stands for. */
  variants: VcVariant[];
  /** The split value(s), e.g. "Red" or "Red / S"; null for a whole-product card. */
  label: string | null;
  available: boolean;
  image: string | null;
  mediaId: number | null;
  /** The image belongs to this card's variants (not the product's fallback image). */
  ownImage: boolean;
  minPrice: number;
  maxPrice: number;
  split: boolean;
}

export interface SplitOptions {
  split: boolean;
  by: SplitBy;
  hideSoldOut: boolean;
  hideNoImage: boolean;
}

/** Option positions that define a card, or null when the product stays one card. "all" = each variant. */
export function splitIndexes(product: VcProduct, by: SplitBy): number[] | "each" | null {
  const count = product.options.length;
  if (product.variants.length < 2 || !count) return null;
  switch (by) {
    case "all":
      return "each";
    case "combined":
      return count > 1 ? [0, 1] : [0];
    case "option1":
      return [0];
    case "option2":
      return count > 1 ? [1] : null;
    case "option3":
      return count > 2 ? [2] : null;
    default: {
      // Automatic: the color option. Products without one stay a single card
      // (sizes of one color would all show the same image).
      const color = product.options.findIndex((name) => isColorOptionName(name));
      return color >= 0 ? [color] : null;
    }
  }
}

function makeCard(product: VcProduct, variants: VcVariant[], label: string | null, key: string, split: boolean): VariantCard {
  const representative = variants.find((v) => v.available) ?? variants[0];
  const withImage = representative.image ? representative : variants.find((v) => v.image);
  const prices = variants.map((v) => v.price);
  return {
    key,
    product,
    variant: representative,
    variants,
    label,
    available: variants.some((v) => v.available),
    image: withImage?.image ?? product.image,
    mediaId: withImage?.mediaId ?? null,
    ownImage: split ? !!withImage : true,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    split,
  };
}

/** The whole product as one card. */
export function productCard(product: VcProduct): VariantCard {
  return makeCard(product, product.variants.length ? product.variants : [], null, String(product.id), false);
}

/**
 * The cards for one product. Hide rules only remove split cards: when every
 * split card would be hidden, the product keeps a single card instead of
 * disappearing from the collection.
 */
export function productCards(product: VcProduct, options: SplitOptions): VariantCard[] {
  if (!product.variants.length) return [];
  const indexes = options.split ? splitIndexes(product, options.by) : null;
  if (!indexes) return [productCard(product)];

  const groups = new Map<string, VcVariant[]>();
  for (const variant of product.variants) {
    const label = indexes === "each" ? variant.options.join(" / ") || variant.title : indexes.map((i) => variant.options[i] ?? "").join(" / ");
    const list = groups.get(label);
    if (list) list.push(variant);
    else groups.set(label, [variant]);
  }
  if (groups.size < 2) return [productCard(product)];

  const cards = [...groups].map(([label, variants]) => makeCard(product, variants, label, `${product.id}:${label}`, true));
  let visible = cards;
  if (options.hideSoldOut) visible = visible.filter((card) => card.available);
  if (options.hideNoImage) visible = visible.filter((card) => card.ownImage);
  return visible.length ? visible : [productCard(product)];
}

/** Card title from a template: {product} {value} {variant} {option1} {option2} {option3} {vendor} {type}. */
export function formatTitle(template: string, card: VariantCard): string {
  if (!card.label) return card.product.title;
  const tokens: Record<string, string> = {
    product: card.product.title,
    "product.title": card.product.title,
    value: card.label,
    variant: card.variant.title,
    "variant.title": card.variant.title,
    option1: card.variant.options[0] ?? "",
    option2: card.variant.options[1] ?? "",
    option3: card.variant.options[2] ?? "",
    vendor: card.product.vendor,
    type: card.product.type,
  };
  const out = template.replace(/\{\s*([\w.]+)\s*\}/g, (match, name: string) => (name in tokens ? tokens[name] : match));
  // Drop separators left dangling by empty tokens ("Tee - " → "Tee").
  return out.replace(/\s*[-–—/|,:]\s*$/, "").replace(/^\s*[-–—/|,:]\s*/, "").replace(/\s{2,}/g, " ").trim() || card.product.title;
}

export interface ArrangeOptions {
  /** Interleave products: every product's first card, then every second card… */
  mix: boolean;
  soldOutLast: boolean;
  /** Keys shown first, in this order. */
  order: string[];
  /** Keys never shown. */
  hidden: string[];
}

/** Final order of the cards on a page (per-product lists in the theme's order). */
export function arrangeCards(perProduct: VariantCard[][], options: ArrangeOptions): VariantCard[] {
  const hidden = new Set(options.hidden);
  const lists = perProduct.map((cards) => cards.filter((card) => !hidden.has(card.key) && !hidden.has(String(card.product.id))));
  let cards: VariantCard[] = [];
  if (options.mix) {
    const longest = Math.max(0, ...lists.map((list) => list.length));
    for (let i = 0; i < longest; i++) for (const list of lists) if (list[i]) cards.push(list[i]);
  } else {
    cards = lists.flat();
  }
  if (options.soldOutLast) cards = [...cards.filter((c) => c.available), ...cards.filter((c) => !c.available)];
  if (options.order.length) {
    const rank = new Map(options.order.map((key, i) => [key, i]));
    const pinned = cards.filter((c) => rank.has(c.key) || rank.has(String(c.product.id)));
    const rankOf = (c: VariantCard) => rank.get(c.key) ?? rank.get(String(c.product.id)) ?? 0;
    pinned.sort((a, b) => rankOf(a) - rankOf(b));
    cards = [...pinned, ...cards.filter((c) => !pinned.includes(c))];
  }
  return cards;
}

/* ------------------------------------------------------------------ */
/* Shopify's storefront product JSON (/products/<handle>.js)           */
/* ------------------------------------------------------------------ */

export interface AjaxVariant {
  id: number;
  title: string;
  options?: string[];
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  available: boolean;
  price: number;
  compare_at_price?: number | null;
  featured_image?: { src: string; id?: number } | null;
  featured_media?: { id: number; preview_image?: { src: string } } | null;
}

export interface AjaxProduct {
  id: number;
  handle: string;
  title: string;
  vendor?: string;
  type?: string;
  available?: boolean;
  options: ({ name: string; position?: number; values?: string[] } | string)[];
  variants: AjaxVariant[];
  featured_image?: string | null;
  images?: string[];
}

const https = (src: string | null | undefined): string | null => (src ? (src.startsWith("//") ? `https:${src}` : src) : null);

export function fromAjaxProduct(raw: AjaxProduct): VcProduct {
  const variants: VcVariant[] = (raw.variants ?? []).map((v) => ({
    id: v.id,
    title: v.title,
    options: v.options ?? [v.option1, v.option2, v.option3].filter((o): o is string => o != null),
    available: !!v.available,
    price: v.price,
    compareAtPrice: v.compare_at_price && v.compare_at_price > v.price ? v.compare_at_price : null,
    image: https(v.featured_media?.preview_image?.src ?? v.featured_image?.src),
    mediaId: v.featured_media?.id ?? null,
  }));
  return {
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    vendor: raw.vendor ?? "",
    type: raw.type ?? "",
    options: (raw.options ?? []).map((o) => (typeof o === "string" ? o : o.name)),
    variants,
    image: https(raw.featured_image ?? raw.images?.[0]),
    available: raw.available ?? variants.some((v) => v.available),
  };
}
