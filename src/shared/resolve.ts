import type { GroupEntry, NormalizedConfig } from "./config";

/**
 * Decides which media a shopper sees for a selected variant. Shared by the
 * storefront script and the admin preview so both always agree.
 */

export type ResolveMode = "group" | "fallback" | "all";

export interface ResolveResult {
  /** Media ids to show, in product media order. */
  visible: number[];
  /** Keys of the groups that matched the variant. */
  matched: string[];
  /** The variant's main media (first media of the best group), if any. */
  main: number | null;
  /**
   * group    = a group matched the variant
   * fallback = no group matched: shared + unassigned media are shown
   * all      = nothing to filter (no config, no selection, or it would leave the gallery empty)
   */
  mode: ResolveMode;
}

export interface ResolveOptions {
  /** Shop-wide default, overridden by the product's own setting when present. */
  hideUnassigned: boolean;
}

/** Groups whose option values are all part of the variant, most specific first. */
export function matchingGroups(config: NormalizedConfig, variantValueIds: readonly number[]): GroupEntry[] {
  const values = new Set(variantValueIds);
  let best: GroupEntry[] = [];
  let bestSize = 0;
  for (const group of config.groups) {
    if (!group.valueIds.length || !group.media.length) continue;
    if (!group.valueIds.every((id) => values.has(id))) continue;
    const size = group.valueIds.length;
    if (size > bestSize) {
      best = [group];
      bestSize = size;
    } else if (size === bestSize) {
      best.push(group);
    }
  }
  return best;
}

export function resolveVisibleMedia(
  config: NormalizedConfig,
  allMedia: readonly number[],
  variantValueIds: readonly number[] | null,
  options: ResolveOptions,
): ResolveResult {
  const all = [...allMedia];
  const everything: ResolveResult = { visible: all, matched: [], main: null, mode: "all" };
  const groups = config.groups.filter((group) => group.media.length && group.valueIds.length);
  if (!groups.length || !variantValueIds || !all.length) return everything;

  const existing = new Set(all);
  const assigned = new Set<number>();
  for (const group of groups) for (const id of group.media) assigned.add(id);
  const shared = new Set(config.shared.filter((id) => existing.has(id)));
  const hideUnassigned = config.hideUnassigned ?? options.hideUnassigned;

  const show = new Set<number>(shared);
  if (!hideUnassigned) {
    for (const id of all) if (!assigned.has(id)) show.add(id);
  }

  const best = matchingGroups({ ...config, groups }, variantValueIds);
  let main: number | null = null;
  if (best.length) {
    const position = new Map(all.map((id, index) => [id, index]));
    let mainPosition = Infinity;
    for (const group of best) {
      const first = group.media.find((id) => existing.has(id));
      for (const id of group.media) if (existing.has(id)) show.add(id);
      if (first !== undefined) {
        const pos = position.get(first) ?? Infinity;
        if (pos < mainPosition) {
          mainPosition = pos;
          main = first;
        }
      }
    }
  }

  const visible = all.filter((id) => show.has(id));
  if (!visible.length) return everything;
  return {
    visible,
    matched: best.map((group) => group.key),
    main,
    mode: best.length ? "group" : "fallback",
  };
}

/** Main media per variant, used to sync Shopify's native variant image. */
export function variantMainMedia(
  config: NormalizedConfig,
  allMedia: readonly number[],
  variants: readonly { id: number; valueIds: readonly number[] }[],
): Map<number, number | null> {
  const result = new Map<number, number | null>();
  for (const variant of variants) {
    const resolved = resolveVisibleMedia(config, allMedia, variant.valueIds, { hideUnassigned: false });
    result.set(variant.id, resolved.mode === "group" ? resolved.main : null);
  }
  return result;
}
