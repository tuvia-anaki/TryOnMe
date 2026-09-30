import { describe, expect, it } from "vitest";
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
    // Automatic only splits by color: a sizes-only product stays one card.
    const sizes = tee();
    sizes.options = ["Size", "Material"];
    expect(splitIndexes(sizes, "auto")).toBeNull();
    expect(productCards(sizes, base)).toHaveLength(1);
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
