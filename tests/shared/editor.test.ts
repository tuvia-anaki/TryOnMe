import { describe, expect, it } from "vitest";
import { emptyConfig, parseStoredConfig } from "../../src/shared/config";
import { inferGroupBy, membership, regroup, setMain, SHARED_KEY, toggleMedia } from "../../src/admin/lib/editor";
import { COLOR, MEDIA, SIZE, tshirt } from "../fixtures";

describe("editor helpers", () => {
  it("toggles media in product order and keeps the main image first", () => {
    const product = tshirt();
    let config = emptyConfig();
    const key = String(COLOR.red);
    config = toggleMedia(config, product, key, [COLOR.red], MEDIA.red2);
    config = toggleMedia(config, product, key, [COLOR.red], MEDIA.red1);
    config = toggleMedia(config, product, key, [COLOR.red], MEDIA.hero);
    // red2 was added first, so it is the main image; the rest follow product order.
    expect(config.groups[0].media).toEqual([MEDIA.red2, MEDIA.hero, MEDIA.red1]);
    config = setMain(config, key, [COLOR.red], MEDIA.red1);
    expect(config.groups[0].media).toEqual([MEDIA.red1, MEDIA.red2, MEDIA.hero]);
    config = toggleMedia(config, product, key, [COLOR.red], MEDIA.red1);
    expect(config.groups[0].media).toEqual([MEDIA.red2, MEDIA.hero]);
    config = toggleMedia(config, product, key, [COLOR.red], MEDIA.red2);
    config = toggleMedia(config, product, key, [COLOR.red], MEDIA.hero);
    expect(config.groups).toEqual([]);
  });

  it("edits the shared pseudo-group", () => {
    const product = tshirt();
    const config = toggleMedia(emptyConfig(), product, SHARED_KEY, [], MEDIA.hero);
    expect(config.shared).toEqual([MEDIA.hero]);
    expect(membership(config).get(MEDIA.hero)).toEqual([SHARED_KEY]);
  });

  it("infers the grouping from existing groups", () => {
    const product = tshirt();
    expect(inferGroupBy(emptyConfig(), product)).toEqual([1]);
    const bySize = parseStoredConfig({ v: 1, g: { [SIZE.s]: [MEDIA.red1], [SIZE.m]: [MEDIA.blue1] } });
    expect(inferGroupBy(bySize, product)).toEqual([2]);
  });

  it("regroups Color → Color+Size → Color", () => {
    const product = tshirt();
    const byColor = parseStoredConfig({ v: 1, g: { [COLOR.red]: [MEDIA.red1, MEDIA.red2], [COLOR.blue]: [MEDIA.blue1] }, s: [MEDIA.hero] });
    const both = regroup(byColor, product, [1, 2]);
    const keys = Object.fromEntries(both.groups.map((g) => [g.key, g.media]));
    expect(keys[`${COLOR.red}.${SIZE.s}`]).toEqual([MEDIA.red1, MEDIA.red2]);
    expect(keys[`${COLOR.red}.${SIZE.m}`]).toEqual([MEDIA.red1, MEDIA.red2]);
    expect(keys[`${COLOR.blue}.${SIZE.m}`]).toEqual([MEDIA.blue1]);
    expect(both.shared).toEqual([MEDIA.hero]);
    const back = regroup(both, product, [1]);
    expect(Object.fromEntries(back.groups.map((g) => [g.key, g.media]))).toEqual({
      [COLOR.red]: [MEDIA.red1, MEDIA.red2],
      [COLOR.blue]: [MEDIA.blue1],
    });
    // Color groups don't map onto a Size grouping.
    expect(regroup(byColor, product, [2]).groups).toEqual([]);
  });
});
