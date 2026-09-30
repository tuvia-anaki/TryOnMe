import type { Texts } from "../shared/settings";
import type { VariantCard } from "../shared/split";
import { UI_ATTR } from "./cards";
import type { RenderedCard } from "./engine";
import { insertionPoint, withVariant } from "./patch";

/**
 * "Add to cart" on cards. Cards that stand for several variants (a color in
 * several sizes) get "Choose options", which opens the product with the
 * card's variant selected.
 */

const BUTTON_CSS = `
:host{display:block;margin:.6rem 0 0;position:relative;z-index:2}
button,a{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;min-height:2.6em;padding:.5em 1em;border:1px solid currentColor;border-radius:var(--vc-btn-radius,6px);background:transparent;color:inherit;font:inherit;font-size:.85em;line-height:1.2;text-decoration:none;cursor:pointer;transition:background .15s,color .15s}
button:hover:not(:disabled),a:hover{background:currentColor}
button:hover:not(:disabled) span,a:hover span{color:var(--vc-bg,#fff);mix-blend-mode:normal}
button:disabled{opacity:.5;cursor:default}
button:focus-visible,a:focus-visible{outline:2px solid currentColor;outline-offset:2px}
`;

let toastTimer: number | undefined;

export function toast(message: string, link: { href: string; text: string } | null): void {
  let el = document.querySelector<HTMLElement>(".vc-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "vc-toast";
    el.setAttribute(UI_ATTR, "toast");
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.append(el);
  }
  el.replaceChildren(document.createTextNode(message));
  if (link) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.text;
    el.append(a);
  }
  el.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove("is-visible"), 4000);
}

/** Tell the theme the cart changed (cart drawers and counters listen to different events). */
async function announce(item: unknown, root: string): Promise<void> {
  const detail = { item, product: item };
  for (const name of ["cart:refresh", "cart:updated", "cart:change", "theme:cart:refresh", "ajaxProduct:added", "vc:cart-add"]) {
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }
  // Dawn-family counters.
  const bubble = document.getElementById("cart-icon-bubble");
  if (bubble) {
    try {
      const res = await fetch(`${root}?sections=cart-icon-bubble`);
      const html = (await res.json())["cart-icon-bubble"];
      const fresh = html && new DOMParser().parseFromString(html, "text/html").getElementById("cart-icon-bubble");
      if (fresh) bubble.innerHTML = fresh.innerHTML;
    } catch {
      /* the next page load shows the right count */
    }
  }
}

export async function addToCart(variantId: number, root: string, texts: Pick<Texts, "added" | "viewCart">): Promise<boolean> {
  try {
    const res = await fetch(`${root}cart/add.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast(body?.description || body?.message || "Couldn't add to cart", null);
      return false;
    }
    toast(texts.added || "Added to cart", { href: `${root}cart`, text: texts.viewCart || "View cart" });
    void announce(body?.items?.[0] ?? body, root);
    return true;
  } catch {
    toast("Couldn't add to cart", null);
    return false;
  }
}

function productHref(card: VariantCard, root: string): string {
  return withVariant(`${root}products/${encodeURIComponent(card.product.handle)}`, card.variant.id);
}

export function renderAddToCart(rendered: RenderedCard, texts: Texts, root: string): void {
  const { el, card } = rendered;
  if (el.querySelector(`[${UI_ATTR}='cart']`)) return;
  // A custom tag: themes hide empty divs (div:empty), and ours only has shadow content.
  const host = el.ownerDocument.createElement("vc-cart-button");
  host.setAttribute(UI_ATTR, "cart");
  const shadow = host.attachShadow({ mode: "open" });
  const style = el.ownerDocument.createElement("style");
  style.textContent = BUTTON_CSS;
  shadow.append(style);
  const label = el.ownerDocument.createElement("span");
  if (card.variants.length > 1 && card.available) {
    const link = el.ownerDocument.createElement("a");
    link.href = productHref(card, root);
    label.textContent = texts.addToCart ? `${texts.addToCart}…` : "Choose options";
    link.append(label);
    shadow.append(link);
  } else {
    const button = el.ownerDocument.createElement("button");
    button.type = "button";
    button.disabled = !card.variant.available;
    label.textContent = card.variant.available ? texts.addToCart || "Add to cart" : texts.soldOut || "Sold out";
    button.append(label);
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      const ok = await addToCart(card.variant.id, root, texts);
      label.textContent = ok ? texts.added || "Added" : texts.addToCart || "Add to cart";
      window.setTimeout(() => {
        label.textContent = texts.addToCart || "Add to cart";
        button.disabled = false;
      }, 1800);
    });
    shadow.append(button);
  }
  const { parent, before } = insertionPoint(el);
  // After any swatches.
  const swatches = el.querySelector(`[${UI_ATTR}='swatches']`);
  if (swatches?.parentElement) swatches.after(host);
  else parent.insertBefore(host, before);
}
