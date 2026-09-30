import { colorsForName, isVeryLight, RAINBOW } from "../shared/colors";
import { isColorOptionName } from "../shared/product";
import type { AppSettings, Shape } from "../shared/settings";
import type { VariantCard, VcVariant } from "../shared/split";
import { normalizeText } from "../shared/text";
import { UI_ATTR } from "./cards";
import type { RenderedCard } from "./engine";
import { insertionPoint, linkCardTo, productImages, swapImage, withVariant } from "./patch";

/**
 * Swatches under product cards. On a split card they list the product's
 * other colors (links to those variants); on a regular card hovering (or
 * tapping) a swatch previews that variant's image and link.
 */

export function radiusFor(shape: Shape, size: number): string {
  if (shape === "circle") return "50%";
  if (shape === "rounded") return `${Math.max(3, Math.round(size / 5))}px`;
  return "0";
}

export function backgroundFor(colors: string[]): string {
  if (colors.length === 1 && colors[0] === RAINBOW) return "conic-gradient(#e53935, #fb8c00, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)";
  const list = colors.filter((c) => c !== RAINBOW);
  if (!list.length) return "#ccc";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `linear-gradient(135deg, ${list[0]} 50%, ${list[1]} 50%)`;
  return `linear-gradient(135deg, ${list[0]} 33.3%, ${list[1]} 33.3% 66.6%, ${list[2]} 66.6%)`;
}

/** Color for a value name: the merchant's own mapping first, then known color names. */
export function colorsFor(name: string, settings: AppSettings): string[] | null {
  const mapped = settings.swatches.colorMap[normalizeText(name)];
  if (mapped) return mapped.split("/").map((c) => c.trim());
  return colorsForName(name);
}

export const SWATCH_CSS = `
:host{display:block;margin:.5rem 0 0;position:relative;z-index:2}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--vc-gap,6px);justify-content:var(--vc-align,flex-start)}
.row+.row{margin-top:6px}
.sw{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:var(--vc-size,20px);height:var(--vc-size,20px);padding:2px;border-radius:var(--vc-radius,50%);border:1.5px solid transparent;background:none;cursor:pointer;text-decoration:none;color:inherit;position:relative}
.sw>span{display:block;width:100%;height:100%;border-radius:inherit;background-size:cover;background-position:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}
.sw.light>span{box-shadow:inset 0 0 0 1px rgba(0,0,0,.28)}
.sw:hover,.sw[aria-current=true]{border-color:currentColor}
.sw:focus-visible,.btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.btn{box-sizing:border-box;display:inline-flex;align-items:center;min-height:calc(var(--vc-size,20px) + 4px);padding:0 .55em;border:1px solid rgba(0,0,0,.2);border-radius:var(--vc-btn-radius,6px);font:inherit;font-size:.8em;line-height:1;color:inherit;text-decoration:none;background:none;cursor:pointer;white-space:nowrap}
.btn:hover,.btn[aria-current=true]{border-color:currentColor}
.sold{opacity:.45}
.cross>span::after,.btn.cross::after{content:"";position:absolute;inset:50% 2px auto;border-top:1.5px solid currentColor;transform:rotate(-45deg)}
.more{font-size:.8em;color:inherit;text-decoration:none;opacity:.8;padding:0 2px}
.more:hover{text-decoration:underline}
`;

interface Value {
  name: string;
  variant: VcVariant;
  available: boolean;
  image: string | null;
}

/** Values of one option, each with the variant a shopper gets when picking it. */
function valuesOf(card: VariantCard, index: number): Value[] {
  const byValue = new Map<string, VcVariant[]>();
  for (const variant of card.product.variants) {
    const name = variant.options[index];
    if (name == null) continue;
    const list = byValue.get(name);
    if (list) list.push(variant);
    else byValue.set(name, [variant]);
  }
  // Keep the card's other choices when possible (this color's sizes, this size's colors).
  const keeps = (v: VcVariant) => card.variant.options.every((value, i) => i === index || v.options[i] === value);
  return [...byValue].map(([name, list]) => {
    const same = list.filter(keeps);
    const pool = same.length ? same : list;
    const variant = pool.find((v) => v.available) ?? pool[0];
    return { name, variant, available: pool.some((v) => v.available), image: variant.image ?? list.find((v) => v.image)?.image ?? null };
  });
}

function productUrl(card: VariantCard, root: string): string {
  return `${root}products/${encodeURIComponent(card.product.handle)}`;
}

export function renderSwatches(rendered: RenderedCard, settings: AppSettings, root: string): void {
  const { el, card } = rendered;
  const s = settings.swatches;
  if (!s.enabled || card.product.variants.length < 2 || el.querySelector(`[${UI_ATTR}='swatches']`)) return;
  const names = card.product.options;
  let indexes = names.map((_, i) => i);
  if (s.options === "color") indexes = indexes.filter((i) => isColorOptionName(names[i]));
  indexes = indexes.filter((i) => valuesOf(card, i).length > 1).slice(0, 3);
  if (!indexes.length) return;

  // A custom tag: themes hide empty divs (div:empty), and ours only has shadow content.
  const host = el.ownerDocument.createElement("vc-swatches");
  host.setAttribute(UI_ATTR, "swatches");
  const shadow = host.attachShadow({ mode: "open" });
  const style = el.ownerDocument.createElement("style");
  style.textContent = SWATCH_CSS;
  shadow.append(style);
  host.style.setProperty("--vc-size", `${s.size}px`);
  host.style.setProperty("--vc-radius", radiusFor(s.shape, s.size));
  host.style.setProperty("--vc-align", s.align === "center" ? "center" : s.align === "right" ? "flex-end" : "flex-start");

  const main = productImages(el)[0] ?? null;
  const original = { src: main?.getAttribute("src") ?? null, srcset: main?.getAttribute("srcset") ?? null, variant: card.variant.id };
  const preview = (value: Value | null) => {
    if (!main) return;
    if (value?.image) swapImage(main, value.image);
    else if (original.src) {
      main.setAttribute("src", original.src);
      if (original.srcset) main.setAttribute("srcset", original.srcset);
    }
    linkCardTo(el, card.product.handle, value ? value.variant.id : original.variant);
  };

  for (const index of indexes) {
    const row = el.ownerDocument.createElement("div");
    row.className = "row";
    row.setAttribute("role", "list");
    row.setAttribute("aria-label", names[index]);
    const visual = s.style === "auto" && isColorOptionName(names[index]);
    const all = valuesOf(card, index).filter((v) => s.soldOut !== "hide" || v.available);
    const current = card.variant.options[index];
    for (const value of all.slice(0, s.max)) {
      const link = el.ownerDocument.createElement("a");
      link.href = withVariant(productUrl(card, root), value.variant.id);
      link.setAttribute("role", "listitem");
      link.setAttribute("aria-label", `${names[index]}: ${value.name}`);
      link.title = value.name;
      if (value.name === current) link.setAttribute("aria-current", "true");
      const colors = visual ? colorsFor(value.name, settings) : null;
      const image = visual && (s.source === "image" || !colors) ? value.image : null;
      if (visual && (image || colors)) {
        link.className = "sw";
        const chip = el.ownerDocument.createElement("span");
        if (image) chip.style.backgroundImage = `url("${image.replace(/"/g, "%22")}${image.includes("?") ? "&" : "?"}width=${s.size * 3}")`;
        else chip.style.background = backgroundFor(colors!);
        if (!image && colors?.length === 1 && isVeryLight(colors[0])) link.classList.add("light");
        link.append(chip);
      } else {
        link.className = "btn";
        link.textContent = value.name;
      }
      if (!value.available) link.classList.add("sold", ...(s.soldOut === "cross" ? ["cross"] : []));
      // Split cards already show one color each: their swatches just link. Others preview on hover/tap.
      if (!card.split || !card.label?.includes(value.name)) {
        if (!card.split && s.trigger === "hover") {
          link.addEventListener("mouseenter", () => preview(value));
          link.addEventListener("focus", () => preview(value));
        }
        if (!card.split && s.trigger === "click") {
          link.addEventListener("click", (event) => {
            if (link.getAttribute("aria-current") === "true") return;
            event.preventDefault();
            for (const other of Array.from(row.children)) other.removeAttribute("aria-current");
            link.setAttribute("aria-current", "true");
            preview(value);
          });
        }
      }
      row.append(link);
    }
    if (all.length > s.max) {
      const more = el.ownerDocument.createElement("a");
      more.className = "more";
      more.href = productUrl(card, root);
      more.textContent = `+${all.length - s.max}`;
      row.append(more);
    }
    if (!card.split && s.trigger === "hover") row.addEventListener("mouseleave", () => preview(null));
    shadow.append(row);
  }
  const { parent, before } = insertionPoint(el);
  parent.insertBefore(host, before);
}
