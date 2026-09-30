// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listProducts, type ProductRow } from "../../src/admin/api/products";
import { canSetUp, matchesFilter } from "../../src/admin/components/ProductTable";
import { availableLanguages, currentLanguage, initI18n, languageName, onLanguageChange, setLanguage, t } from "../../src/admin/i18n";

const row = (overrides: Partial<ProductRow>): ProductRow => ({
  id: 1,
  gid: "gid://shopify/Product/1",
  title: "Tee",
  handle: "tee",
  status: "ACTIVE",
  image: null,
  mediaCount: 6,
  variantsCount: 4,
  options: ["Color"],
  configured: false,
  groups: 0,
  updatedAt: null,
  ...overrides,
});

describe("product filters", () => {
  it("lists only products that can be set up under 'Not set up'", () => {
    expect(matchesFilter(row({}), "todo")).toBe(true);
    expect(matchesFilter(row({ configured: true, groups: 3 }), "todo")).toBe(false);
    expect(matchesFilter(row({ variantsCount: 1 }), "todo")).toBe(false);
    expect(matchesFilter(row({ mediaCount: 1 }), "todo")).toBe(false);
    expect(matchesFilter(row({ configured: true, groups: 3 }), "configured")).toBe(true);
    expect(matchesFilter(row({ variantsCount: 1 }), "all")).toBe(true);
    expect(canSetUp(row({ variantsCount: 2, mediaCount: 2 }))).toBe(true);
  });
});

describe("language picker", () => {
  beforeEach(() => localStorage.clear());

  it("follows the admin language until the merchant picks another one", async () => {
    await initI18n("de-DE");
    expect(currentLanguage()).toBe("de");
    expect(t("Settings")).toBe("Einstellungen");

    let changes = 0;
    const stop = onLanguageChange(() => changes++);
    await setLanguage("fr");
    expect(currentLanguage()).toBe("fr");
    expect(localStorage.getItem("pvi:language")).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");

    // A reload keeps the choice…
    await initI18n("de-DE");
    expect(currentLanguage()).toBe("fr");

    // …and choosing the admin's language again means "follow the admin".
    await setLanguage("de");
    expect(localStorage.getItem("pvi:language")).toBeNull();
    await setLanguage("en");
    expect(t("Settings")).toBe("Settings");
    expect(changes).toBe(3);
    stop();
  });

  it("offers every translation, named in its own language", () => {
    const languages = availableLanguages();
    expect(languages[0]).toBe("en");
    expect(languages).toEqual(expect.arrayContaining(["de", "ja", "pt-BR", "zh-TW"]));
    expect(languageName("de")).toBe("Deutsch");
    expect(languageName("ja")).toBe("日本語");
  });
});

describe("product list query", () => {
  it("asks Shopify only for products with real variants when the list needs them", async () => {
    const sent: { query: string | null; sortKey: string; reverse: boolean }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)).variables);
      const products = { pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }, nodes: [] };
      return new Response(JSON.stringify({ data: { products } }), { headers: { "Content-Type": "application/json" } });
    });
    await listProducts({ withVariants: true, sort: "updated" });
    await listProducts({ withVariants: true, search: 'red "tee"' });
    await listProducts({ search: "mug" });
    expect(sent[0]).toMatchObject({ query: "has_only_default_variant:false", sortKey: "UPDATED_AT", reverse: true });
    expect(sent[1].query).toBe('has_only_default_variant:false "red  tee "');
    expect(sent[2]).toMatchObject({ query: '"mug"', sortKey: "TITLE", reverse: false });
    vi.unstubAllGlobals();
  });
});
