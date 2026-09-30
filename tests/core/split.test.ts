import { describe, expect, it } from "vitest";
import { isSizeOptionName } from "../../src/shared/product";
import { arrangeCards, formatTitle, fromAjaxProduct, productCards, splitIndexes, type VcProduct } from "../../src/shared/split";

const tee = (): VcProduct =>
  fromAjaxProduct({
    id: 1,
    handle: "tee",
    title: "Classic Tee",
    vendor: "Acme",
    options: [{ name: "Size" }, { name: "Color" }],
    variants: [
      { id: 11, title: "S / Red", options: ["S", "Red"], available: false, price: 1000, featured_image: { src: "//cdn/red.jpg" } },
      { id: 12, title: "M / Red", options: ["M", "Red"], available: true, price: 1200, compare_at_price: 1500 },
      { id: 13, title: "S / Blue", options: ["S", "Blue"], available: false, price: 1000, featured_image: { src: "//cdn/blue.jpg" } },
      { id: 14, title: "S / Green", options: ["S", "Green"], available: true, price: 1000 },
    ],
    featured_image: "//cdn/main.jpg",
  });

const base = { split: true, by: "auto" as const, hideSoldOut: false, hideNoImage: false };

describe("splitting products into variant cards", () => {
  it("splits by the color option, in variant order", () => {
    const cards = productCards(tee(), base);
    expect(cards.map((c) => c.label)).toEqual(["Red", "Blue", "Green"]);
    expect(cards[0]).toMatchObject({ key: "1:Red", available: true, minPrice: 1000, maxPrice: 1200, image: "https://cdn/red.jpg", ownImage: true });
    // The card opens the first available variant of its group.
    expect(cards[0].variant.id).toBe(12);
    expect(cards[2]).toMatchObject({ ownImage: false, image: "https://cdn/main.jpg" });
  });

  it("picks the option to split by", () => {
    const p = tee();
    expect(splitIndexes(p, "auto")).toEqual([1]);
    // A named option, whatever its position (names match without case or spaces mattering).
    expect(splitIndexes(p, "option:Size")).toEqual([0]);
    expect(splitIndexes(p, "option: size ")).toEqual([0]);
    expect(splitIndexes(p, "option:Material")).toBeNull();
    expect(splitIndexes(p, "all")).toBe("each");
    expect(productCards(p, { ...base, by: "all" })).toHaveLength(4);
    // "Each style" never splits sizes, nor options whose values have no photos of their own.
    const sizes = tee();
    sizes.options = ["Size", "Fit"];
    sizes.variants.forEach((v) => (v.image = null));
    expect(splitIndexes(sizes, "auto")).toBeNull();
    expect(productCards(sizes, base)).toHaveLength(1);
  });

  it("each style: the color option, or else the option whose values have their own photos", () => {
    const product = (options: string[], variants: [string[], string | null][]): VcProduct =>
      fromAjaxProduct({
        id: 7,
        handle: "p",
        title: "Candle",
        options: options.map((name) => ({ name })),
        variants: variants.map(([values, image], i) => ({ id: 70 + i, title: values.join(" / "), options: values, available: true, price: 1000, featured_image: image ? { src: image } : null })),
        featured_image: "//cdn/main.jpg",
      });
    // A scent with its own photos gets its own card.
    const scents = product(["Scent"], [[["Fig"], "//cdn/fig.jpg"], [["Rose"], "//cdn/rose.jpg"]]);
    expect(splitIndexes(scents, "auto")).toEqual([0]);
    expect(productCards(scents, base).map((c) => c.label)).toEqual(["Fig", "Rose"]);
    // Without photos, or with one photo for all, the product stays one card (gift card amounts, lengths…).
    expect(splitIndexes(product(["Scent"], [[["Fig"], null], [["Rose"], null]]), "auto")).toBeNull();
    expect(splitIndexes(product(["Scent"], [[["Fig"], "//cdn/one.jpg"], [["Rose"], "//cdn/one.jpg"]]), "auto")).toBeNull();
    // Amounts never count, even with a picture each: Shopify's gift cards, or numbers under any name.
    expect(splitIndexes(product(["Denominations"], [[["$10.00"], "//cdn/10.jpg"], [["$25.00"], "//cdn/25.jpg"]]), "auto")).toBeNull();
    expect(splitIndexes(product(["Montant"], [[["10 €"], "//cdn/10.jpg"], [["25 €"], "//cdn/25.jpg"]]), "auto")).toBeNull();
    expect(splitIndexes(product(["EU"], [[["40"], "//cdn/40.jpg"], [["41.5"], "//cdn/41.jpg"]]), "auto")).toBeNull();
    // They still split when picked by name.
    expect(splitIndexes(product(["Denominations"], [[["$10.00"], "//cdn/10.jpg"], [["$25.00"], "//cdn/25.jpg"]]), "option:Denominations")).toEqual([0]);
    // Sizes stay together even when each has a photo.
    expect(splitIndexes(product(["Size"], [[["A4"], "//cdn/a4.jpg"], [["A3"], "//cdn/a3.jpg"]]), "auto")).toBeNull();
    // Size first, material second: the material defines the look.
    const cotton = "//cdn/cotton.jpg";
    const linen = "//cdn/linen.jpg";
    const shirts = product(["Size", "Material"], [[["S", "Cotton"], cotton], [["M", "Cotton"], cotton], [["S", "Linen"], linen], [["M", "Linen"], null]]);
    expect(splitIndexes(shirts, "auto")).toEqual([1]);
    // A color option with a single value doesn't count.
    expect(splitIndexes(product(["Color", "Material"], [[["Black", "Cotton"], cotton], [["Black", "Linen"], linen]]), "auto")).toEqual([1]);
    // A photo per variant (not per value) doesn't tell which option matters: one card.
    expect(splitIndexes(product(["Material", "Size"], [[["Cotton", "S"], "//cdn/1.jpg"], [["Cotton", "M"], "//cdn/2.jpg"], [["Linen", "S"], "//cdn/3.jpg"]]), "auto")).toBeNull();
  });

  it("recognizes size options in common store languages", () => {
    for (const name of ["Size", "Shoe size", "Size (EU)", "Taille", "Größe", "Tamaño", "Størrelse", "サイズ", "尺码", "Kích thước"]) expect(isSizeOptionName(name), name).toBe(true);
    for (const name of ["Color", "Material", "Scent", "Sized pack", "Style"]) expect(isSizeOptionName(name), name).toBe(false);
  });

  it("applies hide rules but never hides the whole product", () => {
    expect(productCards(tee(), { ...base, hideSoldOut: true }).map((c) => c.label)).toEqual(["Red", "Green"]);
    expect(productCards(tee(), { ...base, hideNoImage: true }).map((c) => c.label)).toEqual(["Red", "Blue"]);
    const soldOut = tee();
    soldOut.variants.forEach((v) => (v.available = false));
    const cards = productCards(soldOut, { ...base, hideSoldOut: true });
    expect(cards).toHaveLength(1);
    expect(cards[0].label).toBeNull();
  });

  it("keeps single-variant products and disabled splitting as one card", () => {
    expect(productCards(tee(), { ...base, split: false })).toHaveLength(1);
    const single = tee();
    single.variants = single.variants.slice(0, 1);
    expect(productCards(single, base)[0].key).toBe("1");
  });

  it("formats titles from templates", () => {
    const [red] = productCards(tee(), base);
    expect(formatTitle("{product} - {value}", red)).toBe("Classic Tee - Red");
    expect(formatTitle("{value} {product} by {vendor}", red)).toBe("Red Classic Tee by Acme");
    expect(formatTitle("{product} - {option3}", red)).toBe("Classic Tee");
  });

  it("arranges cards: hidden, mixed, sold out last, manual order", () => {
    const a = productCards(tee(), base);
    const other = tee();
    other.id = 2;
    const b = productCards(other, base).map((c) => ({ ...c, key: c.key.replace("1:", "2:") }));
    const keys = (cards: { key: string }[]) => cards.map((c) => c.key);
    expect(keys(arrangeCards([a, b], { mix: true, soldOutLast: false, order: [], hidden: [] }))).toEqual(["1:Red", "2:Red", "1:Blue", "2:Blue", "1:Green", "2:Green"]);
    expect(keys(arrangeCards([a], { mix: false, soldOutLast: true, order: [], hidden: ["1:Green"] }))).toEqual(["1:Red", "1:Blue"]);
    expect(keys(arrangeCards([a, b], { mix: false, soldOutLast: false, order: ["2:Green", "1:Blue"], hidden: [] })).slice(0, 3)).toEqual(["2:Green", "1:Blue", "1:Red"]);
  });
});
