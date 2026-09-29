import { emptyConfig, groupKey, type GroupEntry, type NormalizedConfig } from "./config";
import { groupingCombinations, type Combination, type PMedia, type ProductModel } from "./product";
import { containsPhrase, normalizeText } from "./text";

/**
 * Automatic image assignment. Everything here is deterministic and runs in
 * the merchant's browser — no paid AI calls, so it can stay free.
 */

export type StrategyId = "variant-images" | "alt-text" | "filename" | "smart";

export interface AutoAssignOptions {
  /** Option ids to group by (usually just the color option). */
  groupBy: number[];
  /**
   * variant-images strategy: what to do with media placed before the first
   * variant image. "shared" shows them for every variant.
   */
  leading?: "shared" | "first" | "none";
}

export interface AutoAssignResult {
  config: NormalizedConfig;
  /** Media that ended up in at least one group. */
  assignedMedia: number;
  /** Groups (combinations) that received at least one media. */
  groupsFilled: number;
  groupsTotal: number;
  /** Labels of combinations nothing could be assigned to. */
  unmatched: string[];
}

function finish(combos: Combination[], groups: Map<string, number[]>, shared: number[], media: PMedia[]): AutoAssignResult {
  const order = new Map(media.map((m) => [m.id, m.position]));
  const entries: GroupEntry[] = [];
  const assigned = new Set<number>();
  const unmatched: string[] = [];
  for (const combo of combos) {
    const ids = [...new Set(groups.get(combo.key) ?? [])];
    if (!ids.length) {
      unmatched.push(combo.label);
      continue;
    }
    // The first element is the group's "main" image; keep it, sort the rest by product order.
    const [main, ...rest] = ids;
    rest.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const sorted = [main, ...rest];
    sorted.forEach((id) => assigned.add(id));
    entries.push({ key: groupKey(combo.valueIds), valueIds: [...combo.valueIds], media: sorted });
  }
  const config = emptyConfig();
  config.groups = entries;
  config.shared = [...new Set(shared)]
    .filter((id) => !assigned.has(id))
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return {
    config,
    assignedMedia: assigned.size,
    groupsFilled: entries.length,
    groupsTotal: combos.length,
    unmatched,
  };
}

/** Sort media by position and pick the earliest of a list of ids. */
function earliest(ids: Iterable<number>, position: Map<number, number>): number | null {
  let best: number | null = null;
  let bestPos = Infinity;
  for (const id of ids) {
    const pos = position.get(id);
    if (pos !== undefined && pos < bestPos) {
      bestPos = pos;
      best = id;
    }
  }
  return best;
}

const GENERIC_MEDIA = /\b(size|sizes|sizing|chart|guide|measure|measurements?|dimensions?|care|instructions?|table|fit|specs?|packaging|box|label)\b/;

/**
 * Classic "variant image order" grouping: each variant's native image starts
 * a run of media that lasts until the next variant image.
 *   [red1, red2, blue1, blue2, blue3] with Red→red1, Blue→blue1
 *   => Red: red1, red2 · Blue: blue1, blue2, blue3
 */
export function assignByVariantImages(product: ProductModel, options: AutoAssignOptions): AutoAssignResult {
  const combos = groupingCombinations(product, options.groupBy);
  const media = [...product.media].sort((a, b) => a.position - b.position);
  const position = new Map(media.map((m, index) => [m.id, index]));

  const anchorOf = new Map<string, number>();
  for (const combo of combos) {
    const anchor = earliest(
      combo.variants.map((v) => v.mediaId).filter((id): id is number => id != null),
      position,
    );
    if (anchor != null) anchorOf.set(combo.key, anchor);
  }

  const anchorPositions = [...new Set([...anchorOf.values()].map((id) => position.get(id)!))].sort((a, b) => a - b);
  const groups = new Map<string, number[]>();
  const shared: number[] = [];
  if (anchorPositions.length < 2) {
    // One shared variant image (or none) can't tell colors apart.
    return finish(combos, groups, shared, media);
  }

  for (const combo of combos) {
    const anchor = anchorOf.get(combo.key);
    if (anchor == null) continue;
    const start = position.get(anchor)!;
    const next = anchorPositions.find((p) => p > start) ?? media.length;
    const ids = media.slice(start, next).map((m) => m.id);
    // Other native variant images of this combination belong to it too.
    for (const variant of combo.variants) {
      if (variant.mediaId != null && !ids.includes(variant.mediaId)) ids.push(variant.mediaId);
    }
    groups.set(combo.key, ids);
  }

  // A size chart or care guide at the very end would otherwise join the last color.
  // When every other run has the same length and the last run is longer, move
  // extra trailing images that look generic to "shared".
  const lastStart = anchorPositions[anchorPositions.length - 1];
  const runLengths = anchorPositions.map((p, i) => (anchorPositions[i + 1] ?? media.length) - p);
  const others = runLengths.slice(0, -1);
  const usual = others[0];
  if (others.length && others.every((len) => len === usual) && runLengths[runLengths.length - 1] > usual) {
    const extra = media.slice(lastStart + usual).filter((m) => GENERIC_MEDIA.test(normalizeText(`${m.alt} ${m.fileKey}`)));
    if (extra.length) {
      const extraIds = new Set(extra.map((m) => m.id));
      for (const [key, ids] of groups) {
        if (ids.some((id) => extraIds.has(id))) groups.set(key, ids.filter((id) => !extraIds.has(id)));
      }
      shared.push(...extraIds);
    }
  }

  const leading = media.slice(0, anchorPositions[0]).map((m) => m.id);
  if (leading.length) {
    const policy = options.leading ?? "shared";
    if (policy === "shared") shared.push(...leading);
    else if (policy === "first") {
      const firstCombo = combos.find((combo) => position.get(anchorOf.get(combo.key) ?? -1) === anchorPositions[0]);
      if (firstCombo) groups.set(firstCombo.key, [...(groups.get(firstCombo.key) ?? []), ...leading]);
    }
  }
  return finish(combos, groups, shared, media);
}

interface ValueMatcher {
  valueId: number;
  optionIndex: number;
  phrase: string;
  /** "size xl" style phrase used for very short values. */
  qualified: string;
  short: boolean;
}

function buildMatchers(product: ProductModel, groupBy: readonly number[]): ValueMatcher[] {
  const matchers: ValueMatcher[] = [];
  product.options.forEach((option, optionIndex) => {
    if (!groupBy.includes(option.id)) return;
    const optionName = normalizeText(option.name);
    for (const value of option.values) {
      const phrase = normalizeText(value.name);
      if (!phrase) continue;
      matchers.push({
        valueId: value.id,
        optionIndex,
        phrase,
        qualified: optionName ? `${optionName} ${phrase}` : phrase,
        short: phrase.replace(/ /g, "").length <= 2,
      });
    }
  });
  // Longest phrases first so "light blue" wins over "blue".
  return matchers.sort((a, b) => b.phrase.length - a.phrase.length);
}

/** Option values (per grouping option index) mentioned in a text. */
function matchText(text: string, matchers: ValueMatcher[]): Map<number, Set<number>> {
  const found = new Map<number, Set<number>>();
  if (!text) return found;
  let remaining = ` ${text} `;
  for (const matcher of matchers) {
    const hit = matcher.short
      ? text === matcher.phrase || containsPhrase(remaining.trim(), matcher.qualified)
      : containsPhrase(remaining.trim(), matcher.phrase);
    if (!hit) continue;
    if (!found.has(matcher.optionIndex)) found.set(matcher.optionIndex, new Set());
    found.get(matcher.optionIndex)!.add(matcher.valueId);
    // Consume the phrase so "light blue" doesn't also count as "blue".
    remaining = remaining.replace(` ${matcher.short ? matcher.qualified : matcher.phrase} `, " ");
  }
  return found;
}

function assignByText(
  product: ProductModel,
  options: AutoAssignOptions,
  textOf: (media: PMedia) => string,
): AutoAssignResult {
  const combos = groupingCombinations(product, options.groupBy);
  const media = [...product.media].sort((a, b) => a.position - b.position);
  const matchers = buildMatchers(product, options.groupBy);
  const optionIndexes = product.options
    .map((option, index) => (options.groupBy.includes(option.id) ? index : -1))
    .filter((index) => index >= 0);
  const groups = new Map<string, number[]>();

  for (const item of media) {
    const found = matchText(normalizeText(textOf(item)), matchers);
    if (!found.size) continue;
    for (const combo of combos) {
      const variant = combo.variants[0];
      // Every grouping option either matches this combination's value or wasn't mentioned.
      const fits = optionIndexes.every((index) => {
        const mentioned = found.get(index);
        return !mentioned || mentioned.has(variant.valueIds[index]);
      });
      if (!fits) continue;
      if (!groups.has(combo.key)) groups.set(combo.key, []);
      groups.get(combo.key)!.push(item.id);
    }
  }

  // Prefer the native variant image as each group's main image when it's part of the group.
  for (const combo of combos) {
    const ids = groups.get(combo.key);
    if (!ids) continue;
    const native = combo.variants.map((v) => v.mediaId).find((id) => id != null && ids.includes(id));
    if (native != null) groups.set(combo.key, [native, ...ids.filter((id) => id !== native)]);
  }
  return finish(combos, groups, [], media);
}

/** Match option values mentioned in each image's alt text ("Red shirt – back"). */
export function assignByAltText(product: ProductModel, options: AutoAssignOptions): AutoAssignResult {
  return assignByText(product, options, (m) => m.alt);
}

/** Match option values mentioned in each file name ("tee-red-back.jpg"). */
export function assignByFilename(product: ProductModel, options: AutoAssignOptions): AutoAssignResult {
  return assignByText(product, options, (m) => m.fileKey);
}

/* ------------------------------------------------------------------ */
/* Visual matching (signatures are computed in the browser by the admin) */
/* ------------------------------------------------------------------ */

export interface ImageSignature {
  /** Normalized color histogram over foreground pixels (sums to 1). */
  hist: number[];
  /** Dominant foreground colors in CIELAB with weights (sum to 1). */
  colors: { lab: [number, number, number]; weight: number }[];
}

/** Bhattacharyya coefficient between two normalized histograms (0..1). */
export function histogramSimilarity(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.sqrt(Math.max(0, a[i]) * Math.max(0, b[i]));
  return Math.max(0, Math.min(1, sum));
}

export function deltaE(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** How well an image's dominant colors fit a target color (0..1). */
export function colorFit(signature: ImageSignature, lab: readonly number[]): number {
  let best = 0;
  for (const color of signature.colors) {
    const closeness = Math.max(0, 1 - deltaE(color.lab, lab) / 45);
    best = Math.max(best, closeness * Math.min(1, 0.35 + color.weight));
  }
  return best;
}

export interface SmartAssignOptions extends AutoAssignOptions {
  signatures: Map<number, ImageSignature>;
  /** Target color (CIELAB) for an option value, when known from a swatch or its name. */
  colorOf?: (valueId: number) => [number, number, number] | null;
  /** Minimum similarity to accept a match (0..1). */
  threshold?: number;
  /**
   * How decisively the best match must beat the runner-up, relative to the
   * room left above the runner-up: (best - second) / (1 - second). 0..1.
   */
  confidence?: number;
}

/**
 * Visual matching: compares every image with each combination's native
 * variant image(s); falls back to the option value's color when a
 * combination has no variant image.
 */
export function assignBySimilarity(product: ProductModel, options: SmartAssignOptions): AutoAssignResult {
  const combos = groupingCombinations(product, options.groupBy);
  const media = [...product.media].sort((a, b) => a.position - b.position);
  const threshold = options.threshold ?? 0.6;
  const confidence = options.confidence ?? 0.4;
  const optionIndexes = product.options
    .map((option, index) => (options.groupBy.includes(option.id) ? index : -1))
    .filter((index) => index >= 0);

  const anchors = new Map<string, number[]>();
  const anchorSet = new Set<number>();
  for (const combo of combos) {
    const ids = [...new Set(combo.variants.map((v) => v.mediaId).filter((id): id is number => id != null))].filter(
      (id) => options.signatures.has(id),
    );
    anchors.set(combo.key, ids);
    ids.forEach((id) => anchorSet.add(id));
  }
  const targetColor = new Map<string, [number, number, number] | null>();
  for (const combo of combos) {
    let color: [number, number, number] | null = null;
    if (options.colorOf) {
      for (const index of optionIndexes) {
        color = options.colorOf(combo.variants[0].valueIds[index]);
        if (color) break;
      }
    }
    targetColor.set(combo.key, color);
  }

  const groups = new Map<string, number[]>();
  for (const combo of combos) {
    const own = anchors.get(combo.key) ?? [];
    if (own.length) groups.set(combo.key, [...own]);
  }

  for (const item of media) {
    if (anchorSet.has(item.id)) continue;
    // Size charts, care guides… belong to every variant; leave them unassigned.
    if (GENERIC_MEDIA.test(normalizeText(`${item.alt} ${item.fileKey}`))) continue;
    const signature = options.signatures.get(item.id);
    if (!signature) continue;
    const scores: { key: string; score: number }[] = [];
    for (const combo of combos) {
      const own = anchors.get(combo.key) ?? [];
      let score = 0;
      for (const anchorId of own) {
        score = Math.max(score, histogramSimilarity(signature.hist, options.signatures.get(anchorId)!.hist));
      }
      const color = targetColor.get(combo.key);
      if (color) {
        const fit = colorFit(signature, color);
        score = own.length ? Math.max(score, score * 0.7 + fit * 0.3) : fit;
      }
      scores.push({ key: combo.key, score });
    }
    scores.sort((a, b) => b.score - a.score);
    const [best, second] = scores;
    if (!best || best.score < threshold) continue;
    if (second && (best.score - second.score) / Math.max(1e-6, 1 - second.score) < confidence) continue;
    if (!groups.has(best.key)) groups.set(best.key, []);
    groups.get(best.key)!.push(item.id);
  }
  return finish(combos, groups, [], media);
}

/**
 * Pick the text/order strategy that explains the most media for this product.
 * (The visual strategy needs image downloads, so it is offered separately.)
 */
export function bestInstantStrategy(
  product: ProductModel,
  options: AutoAssignOptions,
): { strategy: Exclude<StrategyId, "smart">; result: AutoAssignResult } {
  const candidates: { strategy: Exclude<StrategyId, "smart">; result: AutoAssignResult }[] = [
    { strategy: "variant-images", result: assignByVariantImages(product, options) },
    { strategy: "alt-text", result: assignByAltText(product, options) },
    { strategy: "filename", result: assignByFilename(product, options) },
  ];
  const score = (r: AutoAssignResult) => r.groupsFilled * 1000 + r.assignedMedia;
  candidates.sort((a, b) => score(b.result) - score(a.result));
  return candidates[0];
}

export function runStrategy(
  strategy: Exclude<StrategyId, "smart">,
  product: ProductModel,
  options: AutoAssignOptions,
): AutoAssignResult {
  switch (strategy) {
    case "variant-images":
      return assignByVariantImages(product, options);
    case "alt-text":
      return assignByAltText(product, options);
    case "filename":
      return assignByFilename(product, options);
  }
}
