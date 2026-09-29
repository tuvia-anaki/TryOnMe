import { describe, expect, it } from "vitest";
import { groupKey, isEmptyConfig, parseStoredConfig, pruneConfig, toStoredConfig } from "../../src/shared/config";

describe("stored config", () => {
  it("round-trips through the compact stored shape", () => {
    const config = parseStoredConfig({ v: 1, g: { "12": [5, 6], "11": [3, 4] }, s: [1], h: 1 });
    expect(config.groups.map((g) => g.key).sort()).toEqual(["11", "12"]);
    expect(config.shared).toEqual([1]);
    expect(config.hideUnassigned).toBe(true);
    expect(toStoredConfig(config)).toEqual({ v: 1, g: { "12": [5, 6], "11": [3, 4] }, s: [1], h: 1 });
  });

  it("normalizes group keys and merges duplicates", () => {
    const config = parseStoredConfig({ v: 1, g: { "22.11": [1], "11.22": [2, 1] } });
    expect(config.groups).toEqual([{ key: "11.22", valueIds: [11, 22], media: [1, 2] }]);
    expect(groupKey([22, 11, 11])).toBe("11.22");
  });

  it("drops malformed data instead of throwing", () => {
    expect(parseStoredConfig("not json")).toEqual({ groups: [], shared: [], hideUnassigned: null });
    expect(parseStoredConfig({ v: 99, g: { "1": [1] } }).groups).toEqual([]);
    const messy = parseStoredConfig({ v: 1, g: { abc: [1], "5": ["7", -1, "x", 7], "6": [] }, s: "nope" });
    expect(messy.groups).toEqual([{ key: "5", valueIds: [5], media: [7] }]);
    expect(messy.shared).toEqual([]);
  });

  it("accepts JSON strings (metafield values)", () => {
    const config = parseStoredConfig(JSON.stringify({ v: 1, g: { "1": [9] } }));
    expect(config.groups[0].media).toEqual([9]);
  });

  it("serializes an empty config to null (delete the metafield)", () => {
    const config = parseStoredConfig({ v: 1, g: {}, s: [1], h: 1 });
    expect(isEmptyConfig(config)).toBe(true);
    expect(toStoredConfig(config)).toBeNull();
  });

  it("prunes deleted media and option values", () => {
    const config = parseStoredConfig({ v: 1, g: { "1": [10, 11], "2": [12], "1.3": [13] }, s: [10, 99] });
    const pruned = pruneConfig(config, [10, 12, 13], [1, 2]);
    expect(pruned.groups).toEqual([
      { key: "1", valueIds: [1], media: [10] },
      { key: "2", valueIds: [2], media: [12] },
    ]);
    expect(pruned.shared).toEqual([10]);
  });
});
