import { cloneConfig, groupKey, type GroupEntry, type NormalizedConfig } from "../../shared/config";
import { groupingCombinations, optionByValueId, suggestGroupingOptions, type ProductModel } from "../../shared/product";

/** Pure editing helpers for the product editor (unit-tested). */

export const SHARED_KEY = "__shared__";

/** Which options the existing groups use (most common option set), else a suggestion. */
export function inferGroupBy(config: NormalizedConfig, product: ProductModel): number[] {
  if (config.groups.length) {
    const owner = optionByValueId(product);
    const counts = new Map<string, { ids: number[]; count: number }>();
    for (const group of config.groups) {
      const ids = [...new Set(group.valueIds.map((v) => owner.get(v)?.id).filter((id): id is number => id != null))].sort(
        (a, b) => a - b,
      );
      if (!ids.length) continue;
      const key = ids.join(",");
      const entry = counts.get(key) ?? { ids, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
    const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
    if (best) return product.options.filter((o) => best.ids.includes(o.id)).map((o) => o.id);
  }
  return suggestGroupingOptions(product);
}

function position(product: ProductModel): Map<number, number> {
  return new Map(product.media.map((m) => [m.id, m.position]));
}

function sortKeepingMain(ids: number[], order: Map<number, number>): number[] {
  if (ids.length < 2) return ids;
  const [main, ...rest] = ids;
  return [main, ...rest.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))];
}

export function mediaOf(config: NormalizedConfig, key: string): number[] {
  if (key === SHARED_KEY) return config.shared;
  return config.groups.find((g) => g.key === key)?.media ?? [];
}

function withGroup(config: NormalizedConfig, key: string, valueIds: number[], media: number[]): NormalizedConfig {
  const next = cloneConfig(config);
  if (key === SHARED_KEY) {
    next.shared = media;
    return next;
  }
  const index = next.groups.findIndex((g) => g.key === key);
  if (!media.length) {
    if (index >= 0) next.groups.splice(index, 1);
    return next;
  }
  if (index >= 0) next.groups[index] = { ...next.groups[index], media };
  else next.groups.push({ key, valueIds: [...valueIds].sort((a, b) => a - b), media });
  return next;
}

/** Add or remove a media from a group (keeps product order, main image stays first). */
export function toggleMedia(
  config: NormalizedConfig,
  product: ProductModel,
  key: string,
  valueIds: number[],
  mediaId: number,
  force?: boolean,
): NormalizedConfig {
  const current = mediaOf(config, key);
  const has = current.includes(mediaId);
  const add = force ?? !has;
  if (add === has) return config;
  const order = position(product);
  const next = add ? sortKeepingMain([...current, mediaId], order) : current.filter((id) => id !== mediaId);
  return withGroup(config, key, valueIds, next);
}

export function setMain(config: NormalizedConfig, key: string, valueIds: number[], mediaId: number): NormalizedConfig {
  const current = mediaOf(config, key);
  if (!current.includes(mediaId) || current[0] === mediaId) return config;
  return withGroup(config, key, valueIds, [mediaId, ...current.filter((id) => id !== mediaId)]);
}

export function setGroupMedia(
  config: NormalizedConfig,
  product: ProductModel,
  key: string,
  valueIds: number[],
  media: number[],
): NormalizedConfig {
  return withGroup(config, key, valueIds, sortKeepingMain([...new Set(media)], position(product)));
}

/** Every group (and "shared") each media belongs to. */
export function membership(config: NormalizedConfig): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const add = (id: number, key: string) => {
    const list = map.get(id) ?? [];
    list.push(key);
    map.set(id, list);
  };
  for (const group of config.groups) for (const id of group.media) add(id, group.key);
  for (const id of config.shared) add(id, SHARED_KEY);
  return map;
}

/**
 * Convert groups to a different grouping (e.g. Color → Color + Size): each
 * new combination collects the media of every old group that agrees with it
 * on the options they share (and shares at least one option).
 */
export function regroup(config: NormalizedConfig, product: ProductModel, groupBy: number[]): NormalizedConfig {
  const combos = groupingCombinations(product, groupBy);
  const order = position(product);
  const owner = optionByValueId(product);
  const byOption = (ids: number[]) => new Map(ids.map((v) => [owner.get(v)?.id ?? -1, v]));
  const groups: GroupEntry[] = [];
  for (const combo of combos) {
    const comboValues = byOption(combo.valueIds);
    const media: number[] = [];
    for (const group of config.groups) {
      const groupValues = byOption(group.valueIds);
      let shared = 0;
      let agrees = true;
      for (const [optionId, valueId] of groupValues) {
        if (!comboValues.has(optionId)) continue;
        shared += 1;
        if (comboValues.get(optionId) !== valueId) agrees = false;
      }
      if (shared && agrees) for (const id of group.media) if (!media.includes(id)) media.push(id);
    }
    if (media.length) groups.push({ key: groupKey(combo.valueIds), valueIds: [...combo.valueIds], media: sortKeepingMain(media, order) });
  }
  return { groups, shared: [...config.shared], hideUnassigned: config.hideUnassigned };
}

/** Groups in the config that don't belong to the current grouping. */
export function foreignGroups(config: NormalizedConfig, product: ProductModel, groupBy: number[]): GroupEntry[] {
  const keys = new Set(groupingCombinations(product, groupBy).map((c) => c.key));
  return config.groups.filter((g) => !keys.has(g.key));
}
