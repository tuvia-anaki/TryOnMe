import { describe, expect, it } from "vitest";
import { LANGUAGES, isRtl, isValidLanguage } from "../app/lib/i18n/languages";
import { TRANSLATIONS, t } from "../app/lib/i18n/translations";

describe("i18n", () => {
  it("ships 21 languages (top Shopify markets + Hebrew)", () => {
    expect(LANGUAGES).toHaveLength(21);
    expect(LANGUAGES.map((l) => l.code)).toContain("he");
    expect(isRtl("he")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(isValidLanguage("de")).toBe(true);
    expect(isValidLanguage("xx")).toBe(false);
  });

  it("every language has a dictionary covering every key", () => {
    const englishKeys = Object.keys(TRANSLATIONS.en);
    for (const lang of LANGUAGES) {
      const dict = TRANSLATIONS[lang.code];
      expect(dict, `missing dictionary for ${lang.code}`).toBeTruthy();
      const missing = englishKeys.filter((k) => !(k in dict));
      expect(missing, `missing keys in ${lang.code}`).toEqual([]);
    }
  });

  it("translates with interpolation and falls back to English", () => {
    expect(t("he", "navHome")).toBe("בית");
    expect(t("fr", "productsSelected", { n: 3 })).toContain("3");
    expect(t("unknown-lang", "navHome")).toBe("Home");
  });
});
