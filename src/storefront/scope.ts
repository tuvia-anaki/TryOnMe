import type { SFProduct } from "./data";
import { mediaIdOf } from "./gallery";

/**
 * Finds the product's main add-to-cart form and the page region that holds
 * both its gallery and its variant picker.
 *
 * Careful: many themes put `data-section-id` on small wrappers (Dawn's
 * <product-form data-section-id>), so the region is the enclosing Shopify
 * section, or the nearest ancestor of the form that also contains product
 * media.
 */

export interface ProductScope {
  scope: Element;
  form: HTMLFormElement | null;
}

function mainForm(product: SFProduct): HTMLFormElement | null {
  const ids = new Set(product.variants.map((v) => String(v.id)));
  const fields = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    "form[action*='/cart/add'] [name='id'], [name='id'][form]",
  );
  for (const field of Array.from(fields)) {
    if (!ids.has(field.value) || field.closest("template")) continue;
    const form = (field.closest("form") ?? (field as HTMLInputElement).form) as HTMLFormElement | null;
    if (form) return form;
  }
  return null;
}

function containsProductMedia(el: Element, product: SFProduct): boolean {
  const candidates = el.querySelectorAll("img, [data-media-id], [data-image-id], [data-src], [data-srcset]");
  let hits = 0;
  for (const candidate of Array.from(candidates)) {
    if (mediaIdOf(candidate, product) != null && ++hits >= 2) return true;
  }
  return false;
}

export function findProductScope(product: SFProduct): ProductScope {
  const form = mainForm(product);
  const fallback = document.querySelector("main, #MainContent, [role='main']") ?? document.body;
  if (!form) return { scope: fallback, form: null };

  const section = form.closest(".shopify-section");
  if (section && containsProductMedia(section, product)) return { scope: section, form };

  // No Shopify section wrapper (page builders, custom layouts): climb until the gallery is included.
  let node: Element | null = form.parentElement;
  while (node && node !== document.body) {
    if (containsProductMedia(node, product)) return { scope: node, form };
    node = node.parentElement;
  }
  return { scope: section ?? fallback, form };
}
