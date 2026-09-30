import { describe, expect, it } from "vitest";
import { testedThemeFor } from "../src/shared/themes";
import { embedStateFromSettings, sectionsInFile } from "../src/admin/api/theme";

const APP = "tryon-69";
const block = (app: string, handle: string, extra: Record<string, unknown> = {}) => ({ type: `shopify://apps/${app}/blocks/${handle}/9827b57a-d8a6-43e3-9ddb-91a8f657d85a`, settings: {}, ...extra });

describe("theme status", () => {
  it("reads the app embed state from settings_data.json", () => {
    const data = (blocks: Record<string, unknown>) => `/* banner */ ${JSON.stringify({ current: { blocks } })}`;
    expect(embedStateFromSettings(data({ a: block(APP, "app-embed") }), APP)).toBe("enabled");
    expect(embedStateFromSettings(data({ a: block(APP, "app-embed", { disabled: true }) }), APP)).toBe("disabled");
    expect(embedStateFromSettings(data({}), APP)).toBe("missing");
    // Another app's embed with the same block name doesn't count.
    expect(embedStateFromSettings(data({ a: block("other-app", "app-embed") }), APP)).toBe("missing");
    expect(embedStateFromSettings("not json", APP)).toBe("missing");
  });

  it("finds the app's sections in templates", () => {
    const template = JSON.stringify({
      sections: {
        hero: { type: "image-banner", blocks: {} },
        apps: { type: "apps", blocks: { x: block(APP, "best-sellers"), y: block(APP, "promo-card", { disabled: true }), z: block("other-app", "hand-picked") } },
        off: { type: "apps", disabled: true, blocks: { w: block(APP, "featured-collection") } },
      },
    });
    expect(sectionsInFile(template, APP)).toEqual(["best-sellers"]);
  });

  it("recognizes tested themes, also renamed copies", () => {
    expect(testedThemeFor("Savor")).toBe("Savor");
    expect(testedThemeFor("Copy of Savor - Sept")).toBe("Savor");
    expect(testedThemeFor("Be Yours 8.5")).toBe("Be Yours");
    expect(testedThemeFor("Dawnlight custom")).toBeNull();
  });
});
