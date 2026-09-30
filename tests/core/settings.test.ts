import { describe, expect, it } from "vitest";
import { sanitizeCollectionSettings, sanitizeSettings, splitOptionName } from "../../src/shared/settings";

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
    expect(sanitizeCollectionSettings({ by: "option:Material" }).by).toBe("option:Material");
    expect(sanitizeCollectionSettings({ by: "nonsense" }).by).toBeNull();
    expect(splitOptionName("option:Scent")).toBe("Scent");
    expect(splitOptionName("auto")).toBeNull();
  });
});
