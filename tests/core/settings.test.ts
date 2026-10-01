import { describe, expect, it } from "vitest";
import { effectiveSettings, isDefaultCollectionSettings, sanitizeCollectionSettings, sanitizeSettings, splitOptionName } from "../../src/shared/settings";

describe("settings", () => {
  it("reads what gets its own card", () => {
    const by = (value: unknown) => sanitizeSettings({ split: { by: value } }).split.by;
    expect(by("auto")).toBe("auto");
    expect(by("all")).toBe("all");
    expect(by("option: Scent ")).toBe("option:Scent");
    expect(by("option:<b>")).toBe("option:b");
    expect(by("option:")).toBe("auto");
    // Older versions split by option position.
    expect(by("option2")).toBe("auto");
    expect(by("combined")).toBe("auto");
    expect(by(42)).toBe("auto");
    expect(splitOptionName("option:Scent")).toBe("Scent");
    expect(splitOptionName("auto")).toBeNull();
  });

  it("keeps a collection's on/off, order and hidden cards, and drops older overrides", () => {
    const stored = { enabled: false, by: "option:Material", title: "{value}", price: "range", mix: true, order: ["1:Red", "2"], hidden: ["3:Blue", "<x>"] };
    expect(sanitizeCollectionSettings(stored)).toEqual({ v: 1, enabled: false, order: ["1:Red", "2"], hidden: ["3:Blue"] });
    const shop = sanitizeSettings({ split: { by: "all", title: "{product} / {value}" }, price: { format: "from" } });
    const e = effectiveSettings(shop, sanitizeCollectionSettings(stored));
    expect(e).toMatchObject({ enabled: false, by: "all", title: "{product} / {value}", price: "from", mix: false, order: ["1:Red", "2"] });
    expect(isDefaultCollectionSettings(sanitizeCollectionSettings({ by: "all" }))).toBe(true);
  });

  it("swatches are off until turned on; removed options are dropped", () => {
    expect(sanitizeSettings({}).swatches).toEqual({ enabled: false, look: "color", shape: "round", size: "medium" });
    expect(sanitizeSettings({ swatches: { enabled: true, look: "photo", shape: "square", size: "large" } }).swatches).toEqual({ enabled: true, look: "photo", shape: "square", size: "large" });
    expect(sanitizeSettings({ swatches: { enabled: true, look: "glitter", size: 99 } }).swatches).toMatchObject({ look: "color", size: "medium" });
    expect(sanitizeSettings({ card: { secondImage: true, hideThemeSwatches: false, soldOutBadge: false } }).card).toEqual({ soldOutBadge: false });
  });
});
