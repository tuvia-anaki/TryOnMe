/**
 * Shop-wide settings. Stored as JSON in an app-data metafield (on the app
 * installation) so the theme app extension can read them from Liquid via
 * `app.metafields.variant_images.settings` — again, no app server needed.
 */

export type Shape = "circle" | "rounded" | "square";

export interface GallerySettings {
  /** Filter the product gallery by the selected variant. */
  enabled: boolean;
  /** Hide media that isn't assigned to any variant (shared media always shows). */
  hideUnassigned: boolean;
  /** When a product page opens without a selected variant. */
  noSelection: "first" | "all";
  /** After a variant change, jump to that variant's main image. */
  showMainFirst: boolean;
  /** Hide other variants' media with CSS before the script runs (reduces flicker). */
  preventFlash: boolean;
  /** Advanced: CSS selector for gallery items when auto-detection fails. */
  itemSelector: string;
}

export interface PillStyle {
  radius: number;
  background: string;
  text: string;
  border: string;
  selectedBackground: string;
  selectedText: string;
  selectedBorder: string;
}

export interface SwatchSettings {
  /** Replace the theme's picker for matching options with visual swatches. */
  enabled: boolean;
  /** Which options get image/color swatches. */
  applyTo: "color" | "all" | "custom";
  /** Option names when applyTo = custom (case-insensitive). */
  customOptions: string[];
  /** Options that don't get visual swatches: keep the theme's picker or show buttons. */
  otherOptions: "native" | "pills";
  /** What visual swatches show. */
  source: "auto" | "color" | "image";
  shape: Shape;
  size: number;
  gap: number;
  borderWidth: number;
  borderColor: string;
  selectedColor: string;
  ringOffset: number;
  showLabel: boolean;
  tooltip: boolean;
  soldOut: "cross" | "fade" | "hide";
  pill: PillStyle;
  /** normalized value name -> CSS color, or "color1/color2" for split swatches. */
  colorMap: Record<string, string>;
  /** normalized value name -> image URL. */
  imageMap: Record<string, string>;
}

export interface CardSettings {
  /** Show color swatches on product cards (collections, search, home). */
  enabled: boolean;
  size: number;
  max: number;
  shape: Shape;
  trigger: "hover" | "click";
  align: "left" | "center" | "right";
}

export interface AdminSettings {
  /** When saving, also set each variant's native Shopify image to its main image. */
  syncVariantImages: boolean;
  /** Auto-assign: what to do with images before the first variant image. */
  leading: "shared" | "first" | "none";
}

export interface AppSettings {
  v: 1;
  gallery: GallerySettings;
  swatches: SwatchSettings;
  cards: CardSettings;
  admin: AdminSettings;
  customCss: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  v: 1,
  gallery: {
    enabled: true,
    hideUnassigned: false,
    noSelection: "first",
    showMainFirst: true,
    preventFlash: true,
    itemSelector: "",
  },
  swatches: {
    enabled: false,
    applyTo: "color",
    customOptions: [],
    otherOptions: "native",
    source: "auto",
    shape: "circle",
    size: 36,
    gap: 10,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    selectedColor: "#1a1a1a",
    ringOffset: 2,
    showLabel: true,
    tooltip: true,
    soldOut: "cross",
    pill: {
      radius: 6,
      background: "#ffffff",
      text: "#1a1a1a",
      border: "#d4d4d4",
      selectedBackground: "#1a1a1a",
      selectedText: "#ffffff",
      selectedBorder: "#1a1a1a",
    },
    colorMap: {},
    imageMap: {},
  },
  cards: {
    enabled: false,
    size: 20,
    max: 5,
    shape: "circle",
    trigger: "hover",
    align: "left",
  },
  admin: {
    syncVariantImages: true,
    leading: "shared",
  },
  customCss: "",
};

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([^()]{3,40}\)|hsla?\([^()]{3,40}\)|[a-z]{3,20})$/i;

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && COLOR_RE.test(value.trim()) ? value.trim() : fallback;
}

function text(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function stringMap(value: unknown, validate: (v: string) => boolean, maxEntries: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  let count = 0;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (count >= maxEntries) break;
    if (typeof raw !== "string") continue;
    const k = key.trim().toLowerCase().replace(/[<>]/g, "").slice(0, 80);
    const v = raw.trim();
    if (!k || !validate(v)) continue;
    out[k] = v;
    count += 1;
  }
  return out;
}

const isCssColorList = (v: string) => v.split("/").every((part) => COLOR_RE.test(part.trim())) && v.length <= 120;
const isHttpsUrl = (v: string) => /^https:\/\/[^\s"'<>]+$/i.test(v) && v.length <= 600;

/** Merge stored (possibly partial or older) settings over the defaults, validating every field. */
export function sanitizeSettings(raw: unknown): AppSettings {
  let input: unknown = raw;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      input = null;
    }
  }
  const src = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const d = DEFAULT_SETTINGS;
  const g = (src.gallery ?? {}) as Record<string, unknown>;
  const s = (src.swatches ?? {}) as Record<string, any>;
  const p = (s.pill ?? {}) as Record<string, unknown>;
  const c = (src.cards ?? {}) as Record<string, unknown>;
  const a = (src.admin ?? {}) as Record<string, unknown>;

  return {
    v: 1,
    gallery: {
      enabled: bool(g.enabled, d.gallery.enabled),
      hideUnassigned: bool(g.hideUnassigned, d.gallery.hideUnassigned),
      noSelection: oneOf(g.noSelection, ["first", "all"] as const, d.gallery.noSelection),
      showMainFirst: bool(g.showMainFirst, d.gallery.showMainFirst),
      preventFlash: bool(g.preventFlash, d.gallery.preventFlash),
      itemSelector: text(g.itemSelector, d.gallery.itemSelector, 300).replace(/[<>{}]/g, ""),
    },
    swatches: {
      enabled: bool(s.enabled, d.swatches.enabled),
      applyTo: oneOf(s.applyTo, ["color", "all", "custom"] as const, d.swatches.applyTo),
      customOptions: Array.isArray(s.customOptions)
        ? s.customOptions
            .filter((o: unknown): o is string => typeof o === "string")
            .map((o: string) => o.replace(/[<>]/g, "").slice(0, 60))
            .slice(0, 10)
        : [],
      otherOptions: oneOf(s.otherOptions, ["native", "pills"] as const, d.swatches.otherOptions),
      source: oneOf(s.source, ["auto", "color", "image"] as const, d.swatches.source),
      shape: oneOf(s.shape, ["circle", "rounded", "square"] as const, d.swatches.shape),
      size: num(s.size, d.swatches.size, 16, 120),
      gap: num(s.gap, d.swatches.gap, 0, 40),
      borderWidth: num(s.borderWidth, d.swatches.borderWidth, 0, 6),
      borderColor: color(s.borderColor, d.swatches.borderColor),
      selectedColor: color(s.selectedColor, d.swatches.selectedColor),
      ringOffset: num(s.ringOffset, d.swatches.ringOffset, 0, 8),
      showLabel: bool(s.showLabel, d.swatches.showLabel),
      tooltip: bool(s.tooltip, d.swatches.tooltip),
      soldOut: oneOf(s.soldOut, ["cross", "fade", "hide"] as const, d.swatches.soldOut),
      pill: {
        radius: num(p.radius, d.swatches.pill.radius, 0, 40),
        background: color(p.background, d.swatches.pill.background),
        text: color(p.text, d.swatches.pill.text),
        border: color(p.border, d.swatches.pill.border),
        selectedBackground: color(p.selectedBackground, d.swatches.pill.selectedBackground),
        selectedText: color(p.selectedText, d.swatches.pill.selectedText),
        selectedBorder: color(p.selectedBorder, d.swatches.pill.selectedBorder),
      },
      colorMap: stringMap(s.colorMap, isCssColorList, 1000),
      imageMap: stringMap(s.imageMap, isHttpsUrl, 300),
    },
    cards: {
      enabled: bool(c.enabled, d.cards.enabled),
      size: num(c.size, d.cards.size, 12, 48),
      max: num(c.max, d.cards.max, 1, 20),
      shape: oneOf(c.shape, ["circle", "rounded", "square"] as const, d.cards.shape),
      trigger: oneOf(c.trigger, ["hover", "click"] as const, d.cards.trigger),
      align: oneOf(c.align, ["left", "center", "right"] as const, d.cards.align),
    },
    admin: {
      syncVariantImages: bool(a.syncVariantImages, d.admin.syncVariantImages),
      leading: oneOf(a.leading, ["shared", "first", "none"] as const, d.admin.leading),
    },
    // "<" is never needed in CSS and would let the value break out of its <style> tag.
    customCss: text(src.customCss, d.customCss, 8000).replace(/</g, ""),
  };
}
