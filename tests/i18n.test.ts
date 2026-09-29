import { describe, expect, it } from "vitest";
import { localeFileFor } from "../src/admin/i18n";

const files = ["./locales/de.json", "./locales/pt-BR.json", "./locales/pt-PT.json", "./locales/zh-CN.json", "./locales/zh-TW.json", "./locales/nb.json"];

describe("admin locale lookup", () => {
  it("matches Shopify admin locales case-insensitively", () => {
    expect(localeFileFor("zh-CN", files)).toBe("./locales/zh-CN.json");
    expect(localeFileFor("zh-tw", files)).toBe("./locales/zh-TW.json");
    expect(localeFileFor("pt-BR", files)).toBe("./locales/pt-BR.json");
    expect(localeFileFor("de-AT", files)).toBe("./locales/de.json");
    expect(localeFileFor("pt", files)).toBe("./locales/pt-BR.json");
    expect(localeFileFor("nb", files)).toBe("./locales/nb.json");
  });
  it("falls back to English (no file) for unknown locales", () => {
    expect(localeFileFor("en", files)).toBeNull();
    expect(localeFileFor(undefined, files)).toBeNull();
    expect(localeFileFor("xx-YY", files)).toBeNull();
  });
});
