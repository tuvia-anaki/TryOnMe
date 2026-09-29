// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { sanitizeSettings } from "../../src/shared/settings";
import { normalizeProduct } from "../../src/storefront/data";
import { NativeRegistry } from "../../src/storefront/picker";
import { SwatchController } from "../../src/storefront/swatches";

const product = () =>
  normalizeProduct({
    id: 1,
    handle: "tee",
    options: [
      { name: "Color", position: 1, values: [{ id: 1, name: "Red" }, { id: 2, name: "Navy" }, { id: 3, name: "Black/White" }] },
      { name: "Size", position: 2, values: [{ id: 4, name: "S" }, { id: 5, name: "M" }] },
    ],
    variants: [
      [11, 1, "Red", "S", null, null],
      [12, 1, "Red", "M", null, null],
      [13, 1, "Navy", "S", null, null],
      [14, 0, "Navy", "M", null, null],
      [15, 0, "Black/White", "S", null, null],
      [16, 0, "Black/White", "M", null, null],
    ],
    media: [],
    selected: 11,
    first: 11,
    config: null,
  });

const pickerHtml = (color = "Red", size = "S") => `
  <fieldset class="opt-color"><legend>Color</legend>
    ${["Red", "Navy", "Black/White"].map((v, i) => `<input type="radio" id="c${i}" name="Color" value="${v}" ${v === color ? "checked" : ""}><label for="c${i}">${v}</label>`).join("")}
  </fieldset>
  <fieldset class="opt-size"><legend>Size</legend>
    ${["S", "M"].map((v, i) => `<input type="radio" id="s${i}" name="Size" value="${v}" ${v === size ? "checked" : ""}><label for="s${i}">${v}</label>`).join("")}
  </fieldset>`;

function setup(settingsPatch: Record<string, unknown> = {}) {
  document.body.innerHTML = `<section><form action="/cart/add"><div id="picker">${pickerHtml()}</div><input type="hidden" name="id" value="11"></form></section>`;
  const scope = document.querySelector("section")!;
  const p = product();
  const settings = sanitizeSettings({ swatches: { enabled: true, otherOptions: "pills", ...settingsPatch } });
  let current = 11;
  const registry = new NativeRegistry(scope, p);
  const swatches = new SwatchController(scope, p, settings, { soldOut: "Sold out", unavailable: "Unavailable" }, () => current, registry);
  swatches.start();
  const hosts = () => Array.from(document.querySelectorAll<HTMLElement>(".pvi-swatches"));
  const buttons = (i: number) => Array.from(hosts()[i].shadowRoot!.querySelectorAll<HTMLButtonElement>("button"));
  return { scope, swatches, hosts, buttons, setCurrent: (id: number) => (current = id) };
}

describe("SwatchController", () => {
  it("renders color swatches + size buttons and hides the native picker", () => {
    const { hosts, buttons } = setup();
    expect(hosts()).toHaveLength(2);
    expect(document.querySelectorAll("[data-pvi-native-hidden]")).toHaveLength(2);
    const colors = buttons(0);
    expect(colors.map((b) => b.dataset.value)).toEqual(["Red", "Navy", "Black/White"]);
    expect(colors[0].getAttribute("aria-checked")).toBe("true");
    expect(colors[0].className).toContain("vis");
    // Split color for Black/White.
    expect((colors[2].querySelector(".fill") as HTMLElement).style.background).toContain("linear-gradient");
    expect(buttons(1).map((b) => b.className)).toEqual(["sw pill", "sw pill"]);
  });

  it("drives the native radios and marks sold-out values", () => {
    const { buttons } = setup();
    buttons(0)[1].click(); // Navy
    expect((document.querySelector("input[value=Navy]") as HTMLInputElement).checked).toBe(true);
    // Navy/M is sold out; Black/White is sold out in every size.
    const sizes = buttons(1);
    expect(sizes.find((b) => b.dataset.value === "M")!.classList.contains("sold")).toBe(true);
    expect(buttons(0)[2].classList.contains("sold")).toBe(true);
    expect(buttons(0)[2].querySelector(".sr")!.textContent).toContain("Sold out");
  });

  it("re-mounts after the theme re-renders its picker", async () => {
    const { hosts, buttons } = setup();
    document.getElementById("picker")!.innerHTML = pickerHtml("Navy", "S");
    await new Promise((r) => setTimeout(r, 0));
    expect(hosts()).toHaveLength(2);
    expect(document.querySelectorAll("[data-pvi-native-hidden]")).toHaveLength(2);
    expect(buttons(0).find((b) => b.getAttribute("aria-checked") === "true")!.dataset.value).toBe("Navy");
  });

  it("supports keyboard navigation between swatches", () => {
    const { buttons } = setup();
    buttons(0)[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect((document.querySelector("input[value=Navy]") as HTMLInputElement).checked).toBe(true);
  });

  it("leaves non-color options alone when set to keep the theme picker", () => {
    const { hosts } = setup({ otherOptions: "native" });
    expect(hosts()).toHaveLength(1);
    expect(document.querySelectorAll("[data-pvi-native-hidden]")).toHaveLength(1);
  });
});
