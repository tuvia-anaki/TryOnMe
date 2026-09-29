/**
 * Per-product variant image configuration.
 *
 * Stored as a JSON metafield on the product in the app-reserved namespace, so
 * the storefront reads it straight from Liquid — no app server involved.
 *
 * Compact stored shape (v1):
 * {
 *   "v": 1,
 *   "g": { "<optionValueId>[.<optionValueId>...]": [<mediaId>, ...] },
 *   "s": [<mediaId>, ...],   // shared: always visible
 *   "h": 0 | 1               // optional per-product "hide unassigned" override
 * }
 *
 * Group keys are option-value ids (numeric, sorted ascending, "."-joined), so
 * renaming an option value never breaks a product. A group applies to every
 * variant that has all of the key's option values; the most specific
 * matching group(s) win. The first media id of a group is its "main" image.
 */

export const PRODUCT_CONFIG_NAMESPACE = "$app:variant_images";
export const PRODUCT_CONFIG_KEY = "data";
export const SETTINGS_NAMESPACE = "variant_images";
export const SETTINGS_KEY = "settings";
export const CONFIG_VERSION = 1;

export interface StoredConfig {
  v: 1;
  g: Record<string, number[]>;
  s?: number[];
  h?: 0 | 1;
}

export interface GroupEntry {
  key: string;
  valueIds: number[];
  media: number[];
}

export interface NormalizedConfig {
  groups: GroupEntry[];
  shared: number[];
  /** null = follow the shop-wide setting */
  hideUnassigned: boolean | null;
}

export function emptyConfig(): NormalizedConfig {
  return { groups: [], shared: [], hideUnassigned: null };
}

export function groupKey(valueIds: readonly number[]): string {
  return [...new Set(valueIds)].sort((a, b) => a - b).join(".");
}

export function parseGroupKey(key: string): number[] {
  const ids = String(key)
    .split(".")
    .map((part) => Number(part))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  return [...new Set(ids)].sort((a, b) => a - b);
}

function toIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    const n = typeof item === "string" ? Number(item) : item;
    if (typeof n === "number" && Number.isSafeInteger(n) && n > 0 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * Defensive parse of a stored config (object or JSON string). Unknown or
 * malformed parts are dropped. Returns an empty config for garbage input.
 */
export function parseStoredConfig(raw: unknown): NormalizedConfig {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return emptyConfig();
    }
  }
  if (!value || typeof value !== "object") return emptyConfig();
  const obj = value as Record<string, unknown>;
  if (obj.v !== undefined && obj.v !== CONFIG_VERSION) return emptyConfig();

  const groups: GroupEntry[] = [];
  const g = obj.g;
  if (g && typeof g === "object" && !Array.isArray(g)) {
    const byKey = new Map<string, GroupEntry>();
    for (const [rawKey, rawMedia] of Object.entries(g as Record<string, unknown>)) {
      const valueIds = parseGroupKey(rawKey);
      const media = toIdList(rawMedia);
      if (!valueIds.length || !media.length) continue;
      const key = groupKey(valueIds);
      const existing = byKey.get(key);
      if (existing) {
        for (const id of media) if (!existing.media.includes(id)) existing.media.push(id);
      } else {
        byKey.set(key, { key, valueIds, media });
      }
    }
    groups.push(...byKey.values());
  }

  const shared = toIdList(obj.s);
  const hideUnassigned = obj.h === 1 ? true : obj.h === 0 ? false : null;
  return { groups, shared, hideUnassigned };
}

/** True when the config would not change anything on the storefront (no groups). */
export function isEmptyConfig(config: NormalizedConfig): boolean {
  return config.groups.every((group) => group.media.length === 0 || group.valueIds.length === 0);
}

/** Serialize to the compact stored shape. Returns null when empty (delete the metafield). */
export function toStoredConfig(config: NormalizedConfig): StoredConfig | null {
  const g: Record<string, number[]> = {};
  for (const group of config.groups) {
    const media = toIdList(group.media);
    const valueIds = parseGroupKey(groupKey(group.valueIds));
    if (!media.length || !valueIds.length) continue;
    const key = groupKey(valueIds);
    g[key] = g[key] ? [...g[key], ...media.filter((id) => !g[key].includes(id))] : media;
  }
  if (!Object.keys(g).length) return null;
  const stored: StoredConfig = { v: 1, g };
  const shared = toIdList(config.shared);
  if (shared.length) stored.s = shared;
  if (config.hideUnassigned !== null) stored.h = config.hideUnassigned ? 1 : 0;
  return stored;
}

/**
 * Drop references to media or option values that no longer exist on the
 * product (deleted images, removed colors). Returns a new config.
 */
export function pruneConfig(
  config: NormalizedConfig,
  existingMedia: Iterable<number>,
  existingValueIds: Iterable<number>,
): NormalizedConfig {
  const media = new Set(existingMedia);
  const values = new Set(existingValueIds);
  const groups: GroupEntry[] = [];
  for (const group of config.groups) {
    if (!group.valueIds.every((id) => values.has(id))) continue;
    const kept = group.media.filter((id) => media.has(id));
    if (kept.length) groups.push({ ...group, media: kept });
  }
  return {
    groups,
    shared: config.shared.filter((id) => media.has(id)),
    hideUnassigned: config.hideUnassigned,
  };
}

export function cloneConfig(config: NormalizedConfig): NormalizedConfig {
  return {
    groups: config.groups.map((group) => ({
      key: group.key,
      valueIds: [...group.valueIds],
      media: [...group.media],
    })),
    shared: [...config.shared],
    hideUnassigned: config.hideUnassigned,
  };
}

/** Stable comparison used for "unsaved changes" detection. */
export function configsEqual(a: NormalizedConfig, b: NormalizedConfig): boolean {
  return JSON.stringify(toStoredConfig(a)) === JSON.stringify(toStoredConfig(b));
}
