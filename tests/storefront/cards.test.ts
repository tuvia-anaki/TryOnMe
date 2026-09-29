// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

const product = (handle: string) => ({
  id: 1,
  handle,
  url: `/products/${handle}`,
  options: [
    { name: "Color", position: 1, values: ["Red", "Blue", "Green"] },
    { name: "Size", position: 2, values: ["S"] },
  ],
  variants: ["Red", "Blue", "Green"].map((color, i) => ({
    id: 900 + i,
    options: [color, "S"],
    option1: color,
    option2: "S",
    available: color !== "Green",
    featured_image: { src: `/cdn/shop/files/${handle}-${color.toLowerCase()}.jpg?v=1` },
  })),
});

async function setup(settings: object) {
  document.head.innerHTML = `<script type="application/json" id="pvi-settings">${JSON.stringify({ cards: { enabled: true, max: 2, ...settings } })}</script>`;
  document.body.innerHTML = `<ul class="grid">${["shirt", "scarf"]
    .map(
      (h) => `<li class="card"><img class="card-img" src="data:image/gif;base64,R0" data-src="/cdn/shop/files/${h}-red.jpg"><h3><a href="/products/${h}">${h}</a></h3><div class="price">$10</div></li>`,
    )
    .join("")}</ul>`;
  sessionStorage.clear();
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => new Response(JSON.stringify(product(/products\/([^.]+)\.js/.exec(url)![1])), { status: 200 })),
  );
  await import("../../src/storefront/cards-entry");
  await vi.waitFor(() => expect(document.querySelectorAll("[data-pvi-ui=card]")).toHaveLength(2));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  document.body.innerHTML = "";
});

describe("collection card swatches", () => {
  it("renders swatches after the price, with a +N link and sold-out marks", async () => {
    await setup({});
    const host = document.querySelector("[data-pvi-ui=card]") as HTMLElement;
    expect(host.previousElementSibling?.className).toBe("price");
    const buttons = Array.from(host.shadowRoot!.querySelectorAll("button"));
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Red", "Blue"]);
    expect(host.shadowRoot!.querySelector(".more")?.textContent).toBe("+1");
  });

  it("hover swaps the image and restores what was showing at hover time", async () => {
    await setup({ trigger: "hover" });
    const img = document.querySelector(".card-img") as HTMLImageElement;
    // The theme's lazy loader has replaced the placeholder by the time the shopper hovers.
    img.setAttribute("src", "/cdn/shop/files/shirt-red.jpg?width=533");
    img.setAttribute("srcset", "/cdn/shop/files/shirt-red.jpg?width=533 533w");
    const host = document.querySelector("[data-pvi-ui=card]") as HTMLElement;
    const blue = host.shadowRoot!.querySelectorAll("button")[1];
    blue.dispatchEvent(new MouseEvent("mouseenter"));
    expect(img.getAttribute("src")).toContain("shirt-blue.jpg");
    host.shadowRoot!.querySelector(".row")!.dispatchEvent(new MouseEvent("mouseleave"));
    expect(img.getAttribute("src")).toBe("/cdn/shop/files/shirt-red.jpg?width=533");
    expect(img.getAttribute("srcset")).toBe("/cdn/shop/files/shirt-red.jpg?width=533 533w");
  });

  it("click mode updates the card links to the chosen variant", async () => {
    await setup({ trigger: "click" });
    const host = document.querySelector("[data-pvi-ui=card]") as HTMLElement;
    host.shadowRoot!.querySelectorAll("button")[1].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(document.querySelector("a")!.getAttribute("href")).toBe("/products/shirt?variant=901");
  });
});
