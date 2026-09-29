import { describe, expect, it } from "vitest";
import { parseStoredConfig } from "../../src/shared/config";
import { resolveVisibleMedia, variantMainMedia } from "../../src/shared/resolve";

// media: 1 hero, 2 red1, 3 red2, 4 blue1, 5 blue2, 6 chart
const ALL = [1, 2, 3, 4, 5, 6];
const RED = 11;
const BLUE = 12;
const GREEN = 13;
const S = 21;
const M = 22;
const config = parseStoredConfig({ v: 1, g: { [RED]: [2, 3], [BLUE]: [4, 5] }, s: [1] });

describe("resolveVisibleMedia", () => {
  it("shows the matching group plus shared and unassigned media", () => {
    const r = resolveVisibleMedia(config, ALL, [RED, S], { hideUnassigned: false });
    expect(r.visible).toEqual([1, 2, 3, 6]);
    expect(r.mode).toBe("group");
    expect(r.main).toBe(2);
  });

  it("hides unassigned media when requested (shared stays)", () => {
    const r = resolveVisibleMedia(config, ALL, [BLUE, M], { hideUnassigned: true });
    expect(r.visible).toEqual([1, 4, 5]);
  });

  it("per-product override beats the shop default", () => {
    const own = { ...config, hideUnassigned: false };
    expect(resolveVisibleMedia(own, ALL, [BLUE, M], { hideUnassigned: true }).visible).toEqual([1, 4, 5, 6]);
  });

  it("falls back to shared + unassigned for an unassigned color", () => {
    const r = resolveVisibleMedia(config, ALL, [GREEN, S], { hideUnassigned: false });
    expect(r.mode).toBe("fallback");
    expect(r.visible).toEqual([1, 6]);
  });

  it("never returns an empty gallery", () => {
    const tight = parseStoredConfig({ v: 1, g: { [RED]: [2, 3], [BLUE]: [4, 5] } });
    const r = resolveVisibleMedia(tight, [2, 3, 4, 5], [GREEN, S], { hideUnassigned: true });
    expect(r.mode).toBe("all");
    expect(r.visible).toEqual([2, 3, 4, 5]);
  });

  it("prefers the most specific group", () => {
    const specific = parseStoredConfig({ v: 1, g: { [RED]: [2, 3], [`${RED}.${M}`]: [3] } });
    expect(resolveVisibleMedia(specific, ALL, [RED, M], { hideUnassigned: true }).visible).toEqual([3]);
    expect(resolveVisibleMedia(specific, ALL, [RED, S], { hideUnassigned: true }).visible).toEqual([2, 3]);
  });

  it("unions equally specific groups from different options", () => {
    const multi = parseStoredConfig({ v: 1, g: { [RED]: [2], [M]: [6] } });
    const r = resolveVisibleMedia(multi, ALL, [RED, M], { hideUnassigned: true });
    expect(r.visible).toEqual([2, 6]);
    expect(r.main).toBe(2);
  });

  it("shows everything when there is no config or no selection", () => {
    expect(resolveVisibleMedia(parseStoredConfig(null), ALL, [RED], { hideUnassigned: true }).mode).toBe("all");
    expect(resolveVisibleMedia(config, ALL, null, { hideUnassigned: true }).visible).toEqual(ALL);
  });

  it("ignores media that no longer exists", () => {
    const stale = parseStoredConfig({ v: 1, g: { [RED]: [99, 2] } });
    const r = resolveVisibleMedia(stale, ALL, [RED], { hideUnassigned: true });
    expect(r.visible).toEqual([2]);
    expect(r.main).toBe(2);
  });
});

describe("variantMainMedia", () => {
  it("returns each variant's main image, null when unassigned", () => {
    const main = variantMainMedia(config, ALL, [
      { id: 1, valueIds: [RED, S] },
      { id: 2, valueIds: [BLUE, S] },
      { id: 3, valueIds: [GREEN, S] },
    ]);
    expect([...main.entries()]).toEqual([
      [1, 2],
      [2, 4],
      [3, null],
    ]);
  });
});
