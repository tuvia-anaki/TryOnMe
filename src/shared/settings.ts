/**
 * Shop-wide settings, stored as JSON in an app-data metafield on the app
 * installation. The theme app extension reads them in Liquid
 * (`app.metafields.variant_cards.settings`), so no app server is involved.
 * Each collection can turn cards off and order or hide them (CollectionSettings).
 */

/**
 * What gets its own card: "auto" = each style (the color option, found in any language, or
 * else the option whose values have their own photos, like Material or Scent; never sizes),
 * "all" = each variant, "option:<name>" = each value of the option with that name
 * (e.g. "option:Scent"). Products without that option stay one card.
 */
export type SplitBy = "auto" | "all" | `option:${string}`;
/** How a card writes its price when its variants cost different amounts. */
export type PriceFormat = "theme" | "from" | "range";

/** What a swatch shows (each falls back to the other): the color in the variant's name, or its photo. */
export type SwatchLook = "color" | "photo";
export type SwatchShape = "round" | "square";
export type SwatchSize = "small" | "medium" | "large";
export interface SwatchSettings {
  enabled: boolean;
  look: SwatchLook;
  shape: SwatchShape;
  size: SwatchSize;
}

/** Storefront texts, in the store's language (from the theme app extension's locales). */
export interface Texts {
  /** "From {price}" */
  from: string;
  soldOut: string;
}

export interface AppSettings {
  v: 2;
  /** Emergency switch: false = the storefront script does nothing. */
  enabled: boolean;
  /** Which collection pages get variant cards. */
  collections: { mode: "all" | "selected"; handles: string[] };
  /** Other pages with product grids. */
  pages: { allProducts: boolean; search: boolean; home: boolean };
  split: { enabled: boolean; by: SplitBy; title: string };
  price: { format: PriceFormat };
  hide: { soldOut: boolean; noImage: boolean };
  order: { mix: boolean; soldOutLast: boolean };
  card: { soldOutBadge: boolean };
  /** Swatches under each card: shoppers pick a variant right on the card. */
  swatches: SwatchSettings;
  advanced: {
    /** Hide the product grid until cards are split, to avoid a flash of the original cards. */
    preventFlash: boolean;
    gridSelector: string;
    cardSelector: string;
    customCss: string;
  };
  admin: {
    /** Setup guide progress. */
    settingsSaved: boolean;
    previewed: boolean;
  };
}

export interface CollectionSettings {
  v: 1;
  /** false = no variant cards on this collection's page; null = like the shop settings. */
  enabled: boolean | null;
  /** Card keys ("<productId>" or "<productId>:<value>") shown first, in this order. */
  order: string[];
  /** Card keys never shown in this collection. */
  hidden: string[];
}

export const TITLE_PRESETS = ["{product} - {value}", "{product} / {value}", "{value} {product}", "{product} ({value})", "{product}"] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  v: 2,
  enabled: true,
  collections: { mode: "all", handles: [] },
  pages: { allProducts: true, search: true, home: false },
  split: { enabled: true, by: "auto", title: "{product} - {value}" },
  price: { format: "theme" },
  hide: { soldOut: false, noImage: false },
  order: { mix: false, soldOutLast: false },
  card: { soldOutBadge: true },
  swatches: { enabled: false, look: "color", shape: "round", size: "medium" },
  advanced: { preventFlash: true, gridSelector: "", cardSelector: "", customCss: "" },
  admin: { settingsSaved: false, previewed: false },
};

export const EMPTY_COLLECTION_SETTINGS: CollectionSettings = { v: 1, enabled: null, order: [], hidden: [] };

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const PRICE_FORMATS = ["theme", "from", "range"] as const;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}
const text = (v: unknown, fallback: string, max: number): string => (typeof v === "string" ? v.slice(0, max) : fallback);
/** Short storefront texts and templates: no markup. */
const plain = (v: unknown, fallback: string, max = 80): string => text(v, fallback, max).replace(/[<>]/g, "");
/** CSS selectors: no markup or Liquid. */
const selector = (v: unknown): string => text(v, "", 300).replace(/[<>{}]/g, "");
/** The option name of an "option:<name>" split, else null. */
export function splitOptionName(by: SplitBy): string | null {
  return by.startsWith("option:") ? by.slice(7) : null;
}

/** A valid SplitBy, or null. (Older versions split by option position; those become colors.) */
function splitBy(v: unknown): SplitBy | null {
  if (v === "auto" || v === "all") return v;
  if (v === "option1" || v === "option2" || v === "option3" || v === "combined") return "auto";
  if (typeof v === "string" && v.startsWith("option:")) {
    const name = v.slice(7).replace(/[<>]/g, "").trim().slice(0, 60);
    return name ? `option:${name}` : null;
  }
  return null;
}

const handleList = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((h): h is string => typeof h === "string" && /^[\p{L}\p{N}_-][\p{L}\p{N}_.-]{0,254}$/u.test(h)))].slice(0, max)
    : [];
const keyList = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((k): k is string => typeof k === "string" && /^\d{1,20}(:[^<>]{1,120})?$/.test(k)))].slice(0, max) : [];

function parse(raw: unknown): Record<string, any> {
  let input = raw;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      input = null;
    }
  }
  return input && typeof input === "object" ? (input as Record<string, any>) : {};
}

/** Merge stored (possibly partial or older) settings over the defaults, validating every field. */
export function sanitizeSettings(raw: unknown): AppSettings {
  const src = parse(raw);
  const d = DEFAULT_SETTINGS;
  const c = src.collections ?? {};
  const pg = src.pages ?? {};
  const sp = src.split ?? {};
  const h = src.hide ?? {};
  const o = src.order ?? {};
  const cd = src.card ?? {};
  const sw = src.swatches ?? {};
  const a = src.advanced ?? {};
  const ad = src.admin ?? {};
  return {
    v: 2,
    enabled: bool(src.enabled, d.enabled),
    collections: { mode: oneOf(c.mode, ["all", "selected"] as const, d.collections.mode), handles: handleList(c.handles, 250) },
    pages: {
      allProducts: bool(pg.allProducts, d.pages.allProducts),
      search: bool(pg.search, d.pages.search),
      home: bool(pg.home, d.pages.home),
    },
    split: {
      enabled: bool(sp.enabled, d.split.enabled),
      by: splitBy(sp.by) ?? d.split.by,
      title: plain(sp.title, d.split.title, 120) || d.split.title,
    },
    price: { format: oneOf(src.price?.format, PRICE_FORMATS, d.price.format) },
    hide: { soldOut: bool(h.soldOut, d.hide.soldOut), noImage: bool(h.noImage, d.hide.noImage) },
    order: { mix: bool(o.mix, d.order.mix), soldOutLast: bool(o.soldOutLast, d.order.soldOutLast) },
    card: { soldOutBadge: bool(cd.soldOutBadge, d.card.soldOutBadge) },
    swatches: {
      enabled: bool(sw.enabled, d.swatches.enabled),
      look: oneOf(sw.look, ["color", "photo"] as const, d.swatches.look),
      shape: oneOf(sw.shape, ["round", "square"] as const, d.swatches.shape),
      size: oneOf(sw.size, ["small", "medium", "large"] as const, d.swatches.size),
    },
    advanced: {
      preventFlash: bool(a.preventFlash, d.advanced.preventFlash),
      gridSelector: selector(a.gridSelector),
      cardSelector: selector(a.cardSelector),
      // "<" is never needed in CSS and would let the value break out of its <style> tag.
      customCss: text(a.customCss, "", 10000).replace(/</g, ""),
    },
    admin: {
      settingsSaved: bool(ad.settingsSaved, d.admin.settingsSaved),
      previewed: bool(ad.previewed, d.admin.previewed),
    },
  };
}

const nullableBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** A collection's settings. (Older versions also stored other overrides there; they're dropped.) */
export function sanitizeCollectionSettings(raw: unknown): CollectionSettings {
  const src = parse(raw);
  return { v: 1, enabled: nullableBool(src.enabled), order: keyList(src.order, 1000), hidden: keyList(src.hidden, 1000) };
}

/** True when a collection has nothing of its own (its metafield can be deleted). */
export function isDefaultCollectionSettings(settings: CollectionSettings): boolean {
  return settings.enabled === null && !settings.order.length && !settings.hidden.length;
}

/** What applies on a page: the shop settings, with the collection's own on/off, order and hidden cards. */
export interface EffectiveSettings {
  enabled: boolean;
  split: boolean;
  by: SplitBy;
  title: string;
  price: PriceFormat;
  hideSoldOut: boolean;
  hideNoImage: boolean;
  mix: boolean;
  soldOutLast: boolean;
  order: string[];
  hidden: string[];
}

export function effectiveSettings(shop: AppSettings, collection: CollectionSettings | null): EffectiveSettings {
  const c = collection ?? EMPTY_COLLECTION_SETTINGS;
  return {
    enabled: c.enabled ?? true,
    split: shop.split.enabled,
    by: shop.split.by,
    title: shop.split.title,
    price: shop.price.format,
    hideSoldOut: shop.hide.soldOut,
    hideNoImage: shop.hide.noImage,
    mix: shop.order.mix,
    soldOutLast: shop.order.soldOutLast,
    order: c.order,
    hidden: c.hidden,
  };
}
