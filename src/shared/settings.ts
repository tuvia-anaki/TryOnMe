/**
 * Shop-wide settings, stored as JSON in an app-data metafield on the app
 * installation. The theme app extension reads them in Liquid
 * (`app.metafields.variant_cards.settings`), so no app server is involved.
 * Per-collection overrides live on each collection (CollectionSettings).
 */

export type Shape = "circle" | "rounded" | "square";
/**
 * What gets its own card: "auto" = each color (the color option, found in any language),
 * "all" = each variant, "option:<name>" = each value of the option with that name
 * (e.g. "option:Scent"). Products without that option stay one card.
 */
export type SplitBy = "auto" | "all" | `option:${string}`;
/** How a card writes its price when its variants cost different amounts. */
export type PriceFormat = "theme" | "from" | "range";
export type PagingMode = "theme" | "load-more" | "infinite";

export interface SwatchSettings {
  /** Swatches under product cards. */
  enabled: boolean;
  /** Only the color option, or every option (one row each, up to 3). */
  options: "color" | "all";
  /** color / image chips for color options and buttons for the rest, or buttons everywhere. */
  style: "auto" | "button";
  /** For color chips: Shopify's swatch/named color, or the variant's image. */
  source: "color" | "image";
  shape: Shape;
  size: number;
  /** Swatches per row before "+N". */
  max: number;
  align: "left" | "center" | "right";
  /** Cards that aren't split: change the card image on hover or on click. */
  trigger: "hover" | "click";
  soldOut: "fade" | "cross" | "hide";
  /** normalized value name -> CSS color, or "color1/color2" for split swatches. */
  colorMap: Record<string, string>;
}

export interface Texts {
  /** Empty = the default for the store's language (theme extension locales). */
  from: string;
  soldOut: string;
  sale: string;
  addToCart: string;
  added: string;
  viewCart: string;
  loadMore: string;
  loading: string;
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
  card: {
    /** Hide the theme's own color swatches on split cards (they'd list every color). */
    hideThemeSwatches: boolean;
    /** Keep the theme's hover (second) image on split cards. */
    secondImage: boolean;
    soldOutBadge: boolean;
    addToCart: boolean;
  };
  paging: { mode: PagingMode; scrollTop: boolean };
  swatches: SwatchSettings;
  texts: Texts;
  advanced: {
    /** Hide the product grid until cards are split, to avoid a flash of the original cards. */
    preventFlash: boolean;
    gridSelector: string;
    cardSelector: string;
    customCss: string;
    customJs: string;
  };
  admin: {
    /** Setup guide progress. */
    settingsSaved: boolean;
    previewed: boolean;
  };
}

export interface CollectionSettings {
  v: 1;
  /** null = use the shop-wide setting. */
  enabled: boolean | null;
  split: boolean | null;
  by: SplitBy | null;
  title: string | null;
  price: PriceFormat | null;
  hideSoldOut: boolean | null;
  hideNoImage: boolean | null;
  mix: boolean | null;
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
  card: { hideThemeSwatches: true, secondImage: false, soldOutBadge: true, addToCart: false },
  paging: { mode: "theme", scrollTop: false },
  swatches: {
    enabled: false,
    options: "color",
    style: "auto",
    source: "color",
    shape: "circle",
    size: 20,
    max: 6,
    align: "left",
    trigger: "hover",
    soldOut: "fade",
    colorMap: {},
  },
  texts: { from: "", soldOut: "", sale: "", addToCart: "", added: "", viewCart: "", loadMore: "", loading: "" },
  advanced: { preventFlash: true, gridSelector: "", cardSelector: "", customCss: "", customJs: "" },
  admin: { settingsSaved: false, previewed: false },
};

export const EMPTY_COLLECTION_SETTINGS: CollectionSettings = {
  v: 1,
  enabled: null,
  split: null,
  by: null,
  title: null,
  price: null,
  hideSoldOut: null,
  hideNoImage: null,
  mix: null,
  order: [],
  hidden: [],
};

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i;
const PRICE_FORMATS = ["theme", "from", "range"] as const;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
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

function colorMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object") return out;
  for (const [key, value] of Object.entries(v as Record<string, unknown>).slice(0, 1000)) {
    if (typeof value !== "string") continue;
    const k = key.replace(/[<>]/g, "").trim().toLowerCase().slice(0, 60);
    const ok = value.length <= 120 && value.split("/").every((part) => COLOR_RE.test(part.trim()));
    if (k && ok) out[k] = value;
  }
  return out;
}

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
  const pa = src.paging ?? {};
  const s = src.swatches ?? {};
  const tx = src.texts ?? {};
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
    card: {
      hideThemeSwatches: bool(cd.hideThemeSwatches, d.card.hideThemeSwatches),
      secondImage: bool(cd.secondImage, d.card.secondImage),
      soldOutBadge: bool(cd.soldOutBadge, d.card.soldOutBadge),
      addToCart: bool(cd.addToCart, d.card.addToCart),
    },
    paging: {
      mode: oneOf(pa.mode, ["theme", "load-more", "infinite"] as const, d.paging.mode),
      scrollTop: bool(pa.scrollTop, d.paging.scrollTop),
    },
    swatches: {
      enabled: bool(s.enabled, d.swatches.enabled),
      options: oneOf(s.options, ["color", "all"] as const, d.swatches.options),
      style: oneOf(s.style, ["auto", "button"] as const, d.swatches.style),
      source: oneOf(s.source, ["color", "image"] as const, d.swatches.source),
      shape: oneOf(s.shape, ["circle", "rounded", "square"] as const, d.swatches.shape),
      size: num(s.size, d.swatches.size, 12, 48),
      max: num(s.max, d.swatches.max, 1, 20),
      align: oneOf(s.align, ["left", "center", "right"] as const, d.swatches.align),
      trigger: oneOf(s.trigger, ["hover", "click"] as const, d.swatches.trigger),
      soldOut: oneOf(s.soldOut, ["fade", "cross", "hide"] as const, d.swatches.soldOut),
      colorMap: colorMap(s.colorMap),
    },
    texts: {
      from: plain(tx.from, ""),
      soldOut: plain(tx.soldOut, ""),
      sale: plain(tx.sale, ""),
      addToCart: plain(tx.addToCart, ""),
      added: plain(tx.added, ""),
      viewCart: plain(tx.viewCart, ""),
      loadMore: plain(tx.loadMore, ""),
      loading: plain(tx.loading, ""),
    },
    advanced: {
      preventFlash: bool(a.preventFlash, d.advanced.preventFlash),
      gridSelector: selector(a.gridSelector),
      cardSelector: selector(a.cardSelector),
      // "<" is never needed in CSS and would let the value break out of its <style> tag.
      customCss: text(a.customCss, "", 10000).replace(/</g, ""),
      // Runs as the merchant's own code on their storefront; "</" would end the script tag.
      customJs: text(a.customJs, "", 10000).replace(/<\//g, "<\\/"),
    },
    admin: {
      settingsSaved: bool(ad.settingsSaved, d.admin.settingsSaved),
      previewed: bool(ad.previewed, d.admin.previewed),
    },
  };
}

const nullableBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

export function sanitizeCollectionSettings(raw: unknown): CollectionSettings {
  const src = parse(raw);
  return {
    v: 1,
    enabled: nullableBool(src.enabled),
    split: nullableBool(src.split),
    by: splitBy(src.by),
    title: typeof src.title === "string" && src.title.trim() ? plain(src.title, "", 120) : null,
    price: typeof src.price === "string" && (PRICE_FORMATS as readonly string[]).includes(src.price) ? (src.price as PriceFormat) : null,
    hideSoldOut: nullableBool(src.hideSoldOut),
    hideNoImage: nullableBool(src.hideNoImage),
    mix: nullableBool(src.mix),
    order: keyList(src.order, 1000),
    hidden: keyList(src.hidden, 1000),
  };
}

/** True when a collection has no overrides at all (its metafield can be deleted). */
export function isDefaultCollectionSettings(settings: CollectionSettings): boolean {
  const { v: _v, order, hidden, ...rest } = settings;
  return !order.length && !hidden.length && Object.values(rest).every((value) => value === null);
}

/** What actually applies on a collection page: collection overrides over the shop settings. */
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
    split: c.split ?? shop.split.enabled,
    by: c.by ?? shop.split.by,
    title: c.title ?? shop.split.title,
    price: c.price ?? shop.price.format,
    hideSoldOut: c.hideSoldOut ?? shop.hide.soldOut,
    hideNoImage: c.hideNoImage ?? shop.hide.noImage,
    mix: c.mix ?? shop.order.mix,
    soldOutLast: shop.order.soldOutLast,
    order: c.order,
    hidden: c.hidden,
  };
}
