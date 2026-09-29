import { parseStoredConfig, type NormalizedConfig } from "../shared/config";
import { sanitizeSettings, type AppSettings } from "../shared/settings";
import { mediaFileKey } from "../shared/text";

/**
 * Data rendered by the app embed (Liquid) into <script type="application/json">
 * tags. Arrays are used for variants to keep the page payload small.
 */

export interface SFOptionValue {
  id: number;
  name: string;
  /** Native Shopify swatch color, e.g. "rgb(51 79 180 / 1.0)". */
  color?: string | null;
  /** Native Shopify swatch image URL (small). */
  image?: string | null;
}

export interface SFOption {
  name: string;
  position: number;
  values: SFOptionValue[];
}

/** [id, available (1/0), option1, option2, option3, featured media id] */
export type SFVariantTuple = [number, number, string | null, string | null, string | null, number | null];

export interface SFMedia {
  id: number;
  type: string;
  /** Relative or absolute preview image URL. */
  src: string | null;
  alt?: string | null;
  /** Small thumbnail URL for swatches. */
  thumb?: string | null;
}

export interface SFProductRaw {
  id: number;
  handle: string;
  url?: string;
  options: SFOption[];
  variants: SFVariantTuple[];
  media: SFMedia[];
  /** [legacy image id, image url] for themes that reference image ids. */
  images?: [number, string][];
  selected: number | null;
  first: number | null;
  config: unknown;
}

export interface SFVariant {
  id: number;
  available: boolean;
  names: (string | null)[];
  valueIds: number[];
  featuredMediaId: number | null;
}

export interface SFProduct {
  id: number;
  handle: string;
  url: string;
  options: SFOption[];
  variants: SFVariant[];
  variantById: Map<number, SFVariant>;
  media: SFMedia[];
  mediaIds: number[];
  mediaById: Map<number, SFMedia>;
  /** file key -> media id */
  mediaByKey: Map<string, number>;
  /** legacy image id -> media id */
  mediaByImageId: Map<number, number>;
  selected: number | null;
  first: number | null;
  config: NormalizedConfig;
}

export function readJson<T>(id: string, root: Document = document): T | null {
  const el = root.getElementById(id);
  if (!el || !el.textContent) return null;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return null;
  }
}

export function readSettings(root: Document = document): AppSettings {
  return sanitizeSettings(readJson<unknown>("pvi-settings", root));
}

export function normalizeProduct(raw: SFProductRaw): SFProduct {
  const options = (raw.options ?? []).slice(0, 3);
  const nameToId = options.map((option) => {
    const map = new Map<string, number>();
    for (const value of option.values ?? []) map.set(value.name, value.id);
    return map;
  });

  const variants: SFVariant[] = [];
  for (const tuple of raw.variants ?? []) {
    if (!Array.isArray(tuple)) continue;
    const [id, available, o1, o2, o3, featured] = tuple;
    const names = [o1, o2, o3].slice(0, Math.max(1, options.length));
    const valueIds: number[] = [];
    names.forEach((name, index) => {
      if (name == null) return;
      const valueId = nameToId[index]?.get(name);
      if (valueId != null) valueIds.push(valueId);
    });
    variants.push({ id, available: !!available, names, valueIds, featuredMediaId: featured || null });
  }

  const media = (raw.media ?? []).filter((m) => m && typeof m.id === "number");
  const mediaByKey = new Map<string, number>();
  for (const m of media) {
    const key = mediaFileKey(m.src);
    if (key && !mediaByKey.has(key)) mediaByKey.set(key, m.id);
  }
  const mediaByImageId = new Map<number, number>();
  for (const [imageId, url] of raw.images ?? []) {
    const mediaId = mediaByKey.get(mediaFileKey(url));
    if (mediaId != null) mediaByImageId.set(imageId, mediaId);
  }

  return {
    id: raw.id,
    handle: raw.handle,
    url: raw.url || `/products/${raw.handle}`,
    options,
    variants,
    variantById: new Map(variants.map((v) => [v.id, v])),
    media,
    mediaIds: media.map((m) => m.id),
    mediaById: new Map(media.map((m) => [m.id, m])),
    mediaByKey,
    mediaByImageId,
    selected: raw.selected ?? null,
    first: raw.first ?? null,
    config: parseStoredConfig(raw.config),
  };
}

export function readProduct(root: Document = document): SFProduct | null {
  const raw = readJson<SFProductRaw>("pvi-product", root);
  if (!raw || typeof raw.id !== "number") return null;
  return normalizeProduct(raw);
}

/** Find the variant matching selected option value names (null entries = unknown). */
export function variantForOptions(product: SFProduct, names: (string | null)[]): SFVariant | null {
  let partial: SFVariant | null = null;
  for (const variant of product.variants) {
    let ok = true;
    for (let i = 0; i < names.length; i++) {
      const wanted = names[i];
      if (wanted != null && variant.names[i] !== wanted) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (names.every((n) => n != null)) return variant;
    if (!partial || (!partial.available && variant.available)) partial = variant;
  }
  return partial;
}
