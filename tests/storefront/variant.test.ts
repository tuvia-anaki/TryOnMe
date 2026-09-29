// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeProduct, variantForOptions } from "../../src/storefront/data";
import { findNativeOptions } from "../../src/storefront/picker";
import { VariantWatcher } from "../../src/storefront/variant";

const raw = {
  id: 1,
  handle: "tee",
  options: [
    { name: "Color", position: 1, values: [{ id: 1, name: "Red" }, { id: 2, name: "Blue" }] },
    { name: "Size", position: 2, values: [{ id: 3, name: "S" }, { id: 4, name: "M" }] },
  ],
  variants: [
    [11, 1, "Red", "S", null, null],
    [12, 1, "Red", "M", null, null],
    [13, 0, "Blue", "S", null, null],
    [14, 1, "Blue", "M", null, null],
  ] as [number, number, string, string, null, null][],
  media: [],
  selected: null,
  first: 11,
  config: null,
};

afterEach(() => vi.useRealTimers());

describe("variantForOptions", () => {
  it("finds exact and partial matches", () => {
    const p = normalizeProduct(raw);
    expect(variantForOptions(p, ["Blue", "M"])?.id).toBe(14);
    // Partial: prefers an available variant.
    expect(variantForOptions(p, ["Blue", null])?.id).toBe(14);
    expect(variantForOptions(p, ["Green", "S"])).toBeNull();
  });
});

describe("VariantWatcher", () => {
  it("reacts to the shopper's selection before the theme updates the form", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<form action="/cart/add">
      <input type="radio" name="Color" value="Red" checked><input type="radio" name="Color" value="Blue">
      <input type="radio" name="Size" value="S" checked><input type="radio" name="Size" value="M">
      <input type="hidden" name="id" value="11"></form>`;
    const p = normalizeProduct(raw);
    const native = findNativeOptions(document.body, p);
    const seen: number[] = [];
    const watcher = new VariantWatcher(document.body, p, () => native, (id) => seen.push(id));
    expect(watcher.current).toBe(11);

    (document.querySelector("input[value=Blue]") as HTMLInputElement).click();
    (document.querySelector("input[value=M]") as HTMLInputElement).click();
    vi.advanceTimersByTime(10);
    expect(watcher.current).toBe(14);

    // Theme catches up later: no duplicate notifications.
    (document.querySelector("[name=id]") as HTMLInputElement).value = "14";
    vi.advanceTimersByTime(500);
    expect(seen).toEqual([13, 14].filter((id) => seen.includes(id)));
    expect(seen[seen.length - 1]).toBe(14);
  });

  it("follows the ?variant= URL when the form doesn't change", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div></div>`;
    const p = normalizeProduct(raw);
    const seen: number[] = [];
    const watcher = new VariantWatcher(document.body, p, () => [], (id) => seen.push(id));
    history.replaceState({}, "", "?variant=12");
    vi.advanceTimersByTime(10);
    expect(watcher.current).toBe(12);
    expect(seen).toEqual([12]);
    history.replaceState({}, "", "?");
  });
});
