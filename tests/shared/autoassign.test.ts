import { describe, expect, it } from "vitest";
import {
  assignByAltText,
  assignByFilename,
  assignBySimilarity,
  assignByVariantImages,
  bestInstantStrategy,
  histogramSimilarity,
  type ImageSignature,
} from "../../src/shared/autoassign";
import { groupingCombinations, isColorOptionName, suggestGroupingOptions } from "../../src/shared/product";
import { COLOR, MEDIA, SIZE, tshirt } from "../fixtures";

const byKey = (result: { config: { groups: { key: string; media: number[] }[] } }) =>
  Object.fromEntries(result.config.groups.map((g) => [g.key, g.media]));

describe("grouping helpers", () => {
  it("detects color options across languages", () => {
    for (const name of ["Color", "Colour", "Farbe", "Couleur", "Kleur", "Färg", "צבע", "カラー", "Frame color"]) {
      expect(isColorOptionName(name)).toBe(true);
    }
    for (const name of ["Size", "Material", "Style"]) expect(isColorOptionName(name)).toBe(false);
  });

  it("suggests the option that lines up with variant images", () => {
    const product = tshirt();
    expect(suggestGroupingOptions(product)).toEqual([1]);
    // Even when the color option is named oddly, the variant images decide.
    product.options[0].name = "Finish";
    expect(suggestGroupingOptions(product)).toEqual([1]);
  });

  it("lists combinations in option value order", () => {
    const combos = groupingCombinations(tshirt(), [1]);
    expect(combos.map((c) => c.label)).toEqual(["Red", "Blue", "Green"]);
    expect(combos[0].variants).toHaveLength(2);
    const both = groupingCombinations(tshirt(), [1, 2]);
    expect(both.map((c) => c.label)).toEqual(["Red / S", "Red / M", "Blue / S", "Blue / M", "Green / S", "Green / M"]);
  });
});

describe("assignByVariantImages", () => {
  it("assigns runs of media starting at each variant image", () => {
    const result = assignByVariantImages(tshirt(), { groupBy: [1] });
    expect(byKey(result)).toEqual({
      [COLOR.red]: [MEDIA.red1, MEDIA.red2],
      [COLOR.blue]: [MEDIA.blue1, MEDIA.blue2],
      [COLOR.green]: [MEDIA.green1, MEDIA.chart],
    });
    // The hero image sits before the first variant image -> shared.
    expect(result.config.shared).toEqual([MEDIA.hero]);
    expect(result.groupsFilled).toBe(3);
    expect(result.unmatched).toEqual([]);
  });

  it("moves a trailing size chart to shared when runs are otherwise uniform", () => {
    const product = tshirt();
    // green gets a second photo so every color has two images; the chart trails them.
    product.media.splice(6, 0, { ...product.media[5], id: 999, alt: "Green back", fileKey: "tee-green-back", position: 6 });
    product.media.forEach((m, i) => (m.position = i));
    const result = assignByVariantImages(product, { groupBy: [1] });
    expect(byKey(result)[COLOR.green]).toEqual([MEDIA.green1, 999]);
    expect(result.config.shared).toEqual([MEDIA.hero, MEDIA.chart]);
  });

  it("keeps a longer last run when the extra image isn't generic", () => {
    const product = tshirt();
    product.media[6].alt = "Green model shot";
    product.media[6].fileKey = "tee-green-model";
    product.media.splice(5, 0, { ...product.media[5], id: 998, alt: "Green front", fileKey: "tee-green-front2", position: 5 });
    product.media.forEach((m, i) => (m.position = i));
    const result = assignByVariantImages(product, { groupBy: [1] });
    expect(byKey(result)[COLOR.green]).toContain(MEDIA.chart);
  });

  it("can give leading media to the first color instead", () => {
    const result = assignByVariantImages(tshirt(), { groupBy: [1], leading: "first" });
    expect(byKey(result)[COLOR.red]).toEqual([MEDIA.red1, MEDIA.hero, MEDIA.red2]);
    expect(result.config.shared).toEqual([]);
  });

  it("needs at least two distinct variant images", () => {
    const product = tshirt();
    product.variants.forEach((v) => (v.mediaId = MEDIA.red1));
    const result = assignByVariantImages(product, { groupBy: [1] });
    expect(result.groupsFilled).toBe(0);
    expect(result.unmatched).toEqual(["Red", "Blue", "Green"]);
  });

  it("reports colors without a variant image", () => {
    const product = tshirt();
    product.variants.filter((v) => v.valueIds[0] === COLOR.green).forEach((v) => (v.mediaId = null));
    const result = assignByVariantImages(product, { groupBy: [1] });
    expect(result.unmatched).toEqual(["Green"]);
    // Blue's run swallows the green photo (nothing marks where green starts), but the size chart goes to shared.
    expect(byKey(result)[COLOR.blue]).toEqual([MEDIA.blue1, MEDIA.blue2, MEDIA.green1]);
    expect(result.config.shared).toEqual([MEDIA.hero, MEDIA.chart]);
  });
});

describe("text strategies", () => {
  it("matches alt text", () => {
    const result = assignByAltText(tshirt(), { groupBy: [1] });
    expect(byKey(result)).toEqual({
      [COLOR.red]: [MEDIA.red1, MEDIA.red2],
      [COLOR.blue]: [MEDIA.blue1, MEDIA.blue2],
      [COLOR.green]: [MEDIA.green1],
    });
  });

  it("matches file names", () => {
    const result = assignByFilename(tshirt(), { groupBy: [1] });
    expect(byKey(result)[COLOR.green]).toEqual([MEDIA.green1]);
    expect(result.assignedMedia).toBe(5);
  });

  it("prefers longer phrases and never matches inside words", () => {
    const product = tshirt();
    product.options[0].values[1].name = "Light Blue";
    product.media[3].alt = "Light blue tee";
    product.media[4].alt = "Blueberry print"; // must not match "blue"
    const result = assignByAltText(product, { groupBy: [1] });
    expect(byKey(result)[COLOR.blue]).toEqual([MEDIA.blue1]);
  });

  it("only matches very short values when qualified", () => {
    const product = tshirt();
    product.media[1].alt = "size s model shot";
    product.media[2].alt = "s";
    product.media[3].alt = "shirts on a rack";
    const result = assignByAltText(product, { groupBy: [2] });
    expect(byKey(result)[SIZE.s]).toEqual([MEDIA.red1, MEDIA.red2]);
  });

  it("uses wildcards for unmentioned options when grouping by several", () => {
    const result = assignByAltText(tshirt(), { groupBy: [1, 2] });
    const groups = byKey(result);
    expect(groups[`${COLOR.red}.${SIZE.s}`]).toEqual([MEDIA.red1, MEDIA.red2]);
    expect(groups[`${COLOR.red}.${SIZE.m}`]).toEqual([MEDIA.red1, MEDIA.red2]);
  });

  it("puts the native variant image first", () => {
    const product = tshirt();
    product.media[1].alt = "Red detail";
    product.media[2].alt = "Red tee back";
    product.variants.filter((v) => v.valueIds[0] === COLOR.red).forEach((v) => (v.mediaId = MEDIA.red2));
    expect(byKey(assignByAltText(product, { groupBy: [1] }))[COLOR.red]).toEqual([MEDIA.red2, MEDIA.red1]);
  });
});

describe("bestInstantStrategy", () => {
  it("picks the strategy that fills the most groups", () => {
    const product = tshirt();
    product.media.forEach((m) => (m.alt = ""));
    product.media.forEach((m) => (m.fileKey = `img-${m.id}`));
    expect(bestInstantStrategy(product, { groupBy: [1] }).strategy).toBe("variant-images");
  });
});

describe("assignBySimilarity", () => {
  const sig = (hist: number[], lab: [number, number, number]): ImageSignature => ({ hist, colors: [{ lab, weight: 0.8 }] });
  const RED_LAB: [number, number, number] = [50, 70, 50];
  const BLUE_LAB: [number, number, number] = [35, 20, -70];
  const GREEN_LAB: [number, number, number] = [50, -60, 50];

  it("matches images to the closest variant image", () => {
    const signatures = new Map<number, ImageSignature>([
      [MEDIA.hero, sig([0.34, 0.33, 0.33], [60, 0, 0])],
      [MEDIA.red1, sig([0.9, 0.05, 0.05], RED_LAB)],
      [MEDIA.red2, sig([0.85, 0.1, 0.05], RED_LAB)],
      [MEDIA.blue1, sig([0.05, 0.9, 0.05], BLUE_LAB)],
      [MEDIA.blue2, sig([0.1, 0.85, 0.05], BLUE_LAB)],
      [MEDIA.green1, sig([0.05, 0.05, 0.9], GREEN_LAB)],
      [MEDIA.chart, sig([0.4, 0.3, 0.3], [95, 0, 0])],
    ]);
    const result = assignBySimilarity(tshirt(), { groupBy: [1], signatures });
    expect(byKey(result)).toEqual({
      [COLOR.red]: [MEDIA.red1, MEDIA.red2],
      [COLOR.blue]: [MEDIA.blue1, MEDIA.blue2],
      [COLOR.green]: [MEDIA.green1],
    });
  });

  it("uses option colors when a color has no variant image", () => {
    const product = tshirt();
    product.variants.forEach((v) => (v.mediaId = null));
    const signatures = new Map<number, ImageSignature>([
      [MEDIA.red1, sig([1, 0, 0], RED_LAB)],
      [MEDIA.blue1, sig([0, 1, 0], BLUE_LAB)],
      [MEDIA.green1, sig([0, 0, 1], GREEN_LAB)],
    ]);
    const colors: Record<number, [number, number, number]> = {
      [COLOR.red]: RED_LAB,
      [COLOR.blue]: BLUE_LAB,
      [COLOR.green]: GREEN_LAB,
    };
    const result = assignBySimilarity(product, { groupBy: [1], signatures, colorOf: (id) => colors[id] ?? null });
    expect(byKey(result)).toEqual({
      [COLOR.red]: [MEDIA.red1],
      [COLOR.blue]: [MEDIA.blue1],
      [COLOR.green]: [MEDIA.green1],
    });
  });

  it("computes the Bhattacharyya coefficient", () => {
    expect(histogramSimilarity([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(1);
    expect(histogramSimilarity([1, 0], [0, 1])).toBe(0);
  });
});
