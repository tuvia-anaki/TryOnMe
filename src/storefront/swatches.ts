import { colorsForName, isVeryLight, RAINBOW } from "../shared/colors";
import { isColorOptionName } from "../shared/product";
import type { EffectiveSettings } from "../shared/settings";
import { productCards, splitIndexes, styleOptionIndex, type VariantCard } from "../shared/split";
import { UI_ATTR } from "./cards";
import { insertionPoint, sizedImage } from "./patch";

/**
 * Swatches under a card: the values of the option the card is about (its color or style).
 * Picking one shows that variant on the same card: its photo, title, price and link.
 */

export interface Swatch {
  value: string;
  /** The card to show when it's picked. */
  card: VariantCard;
  available: boolean;
  /** Named colors (up to 3 for "Black/White"), for color options. */
  colors: string[] | null;
  /** The value's own photo. */
  image: string | null;
}

export interface SwatchSet {
  /** The option's name ("Color"), for screen readers. */
  option: string;
  /** The value the card shows now. */
  current: string;
  swatches: Swatch[];
}

type Rules = Pick<EffectiveSettings, "by" | "hideSoldOut" | "hidden">;

/** The swatches for a card, or null when there's nothing to pick from. */
export function swatchSet(card: VariantCard, rules: Rules): SwatchSet | null {
  const product = card.product;
  const split = card.split ? splitIndexes(product, rules.by) : null;
  // A card split by one option picks among that option's values; any other card, among its styles.
  const index = Array.isArray(split) && split.length === 1 ? split[0] : styleOptionIndex(product);
  if (index < 0) return null;
  const option = product.options[index];
  const cards = productCards(product, { split: true, by: split === "each" ? "all" : `option:${option}`, hideSoldOut: false, hideNoImage: false });
  const current = card.split ? card.variant.options[index] : shownValue(card, index);

  const byValue = new Map<string, VariantCard[]>();
  for (const c of cards) {
    const value = c.variant.options[index];
    const list = byValue.get(value);
    if (list) list.push(c);
    else byValue.set(value, [c]);
  }
  // Keep the card's other choices when possible (a "Red / S" card goes to "Blue / S").
  const keeps = (c: VariantCard) => c.variant.options.every((value, i) => i === index || value === card.variant.options[i]);
  const color = isColorOptionName(option);
  const swatches: Swatch[] = [];
  for (const [value, list] of byValue) {
    const target = list.find(keeps) ?? list[0];
    const available = list.some((c) => c.available);
    if (value !== current && ((rules.hideSoldOut && !available) || (card.split && rules.hidden.includes(target.key)))) continue;
    swatches.push({ value, card: target, available, colors: color ? colorsForName(value) : null, image: target.ownImage ? target.image : null });
  }
  return swatches.length > 1 ? { option, current, swatches } : null;
}

/** The value a whole-product card shows: the one whose photo is the product's, else its first. */
function shownValue(card: VariantCard, index: number): string {
  const variant = card.product.variants.find((v) => v.image && v.image === card.product.image) ?? card.variant;
  return variant.options[index];
}

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

const MAX = 6;

const CSS = `
:host{display:block;margin:.6em 0 0;position:relative;z-index:2}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;justify-content:var(--vc-justify,flex-start)}
button{margin:0;font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.sw{box-sizing:border-box;display:inline-flex;width:28px;height:28px;padding:3px;border:1.5px solid transparent;border-radius:50%;background:none}
.sw>span{display:block;width:100%;height:100%;border-radius:50%;background-position:center;background-size:cover;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}
.sw.light>span{box-shadow:inset 0 0 0 1px rgba(0,0,0,.3)}
.sw:hover{border-color:rgba(127,127,127,.6)}
.sw[aria-pressed=true]{border-color:currentColor}
.chip{box-sizing:border-box;min-height:28px;padding:0 .75em;border:1px solid rgba(127,127,127,.45);border-radius:999px;background:none;font-size:.8em;line-height:1;white-space:nowrap}
.chip:hover{border-color:currentColor}
.chip[aria-pressed=true]{border-color:currentColor;box-shadow:inset 0 0 0 1px currentColor}
.sold{opacity:.45}
button:focus-visible,.more:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.more{padding:0 2px;color:inherit;font-size:.8em;text-decoration:none;opacity:.75}
.more:hover{opacity:1;text-decoration:underline}
`;

function background(colors: string[]): string {
  if (colors.includes(RAINBOW)) return "conic-gradient(#e53935, #fb8c00, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)";
  if (colors.length === 1) return colors[0];
  if (colors.length === 2) return `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)`;
  return `linear-gradient(135deg, ${colors[0]} 33.3%, ${colors[1]} 33.3% 66.6%, ${colors[2]} 66.6%)`;
}

export interface SwatchRow {
  /** Mark the value the card shows now. */
  select(value: string): void;
}

/** Put the swatches in a card (after its price); `onPick` shows a value on the card. */
export function renderSwatches(el: Element, set: SwatchSet, productUrl: string, onPick: (swatch: Swatch) => void): SwatchRow {
  const doc = el.ownerDocument;
  // A custom tag with its own styles: themes can't restyle it, and they hide empty divs.
  const host = doc.createElement("vc-swatches");
  host.setAttribute(UI_ATTR, "swatches");
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = CSS;
  const row = doc.createElement("div");
  row.className = "row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", set.option);
  shadow.append(style, row);

  // Too many to fit: the first ones, always with the value the card shows, then "+3".
  let shown = set.swatches;
  if (shown.length > MAX) {
    shown = shown.slice(0, MAX - 1);
    const current = set.swatches.find((s) => s.value === set.current);
    if (current && !shown.includes(current)) shown[shown.length - 1] = current;
  }
  const buttons = new Map<string, HTMLButtonElement>();
  for (const swatch of shown) {
    const button = doc.createElement("button");
    button.type = "button";
    button.title = swatch.value;
    button.setAttribute("aria-label", `${set.option}: ${swatch.value}`);
    if (swatch.colors || swatch.image) {
      button.className = "sw";
      const chip = doc.createElement("span");
      if (swatch.colors) chip.style.background = background(swatch.colors);
      else chip.style.backgroundImage = `url("${sizedImage(swatch.image!, 96).replace(/"/g, "%22")}")`;
      if (swatch.colors?.length === 1 && isVeryLight(swatch.colors[0])) button.classList.add("light");
      button.append(chip);
    } else {
      button.className = "chip";
      button.textContent = swatch.value;
    }
    if (!swatch.available) button.classList.add("sold");
    button.addEventListener("click", (event) => {
      // Cards are often links, or open quick views: a swatch only changes the card.
      event.preventDefault();
      event.stopPropagation();
      onPick(swatch);
    });
    buttons.set(swatch.value, button);
    row.append(button);
  }
  if (set.swatches.length > shown.length) {
    const more = doc.createElement("a");
    more.className = "more";
    more.href = productUrl;
    more.textContent = `+${set.swatches.length - shown.length}`;
    more.addEventListener("click", (event) => event.stopPropagation());
    row.append(more);
  }

  const select = (value: string) => {
    for (const [v, button] of buttons) button.setAttribute("aria-pressed", String(v === value));
  };
  select(set.current);

  // After the price (and our "Sold out" badge), never inside a link.
  const { parent, before } = insertionPoint(el);
  let next = before;
  while (next instanceof Element && next.getAttribute(UI_ATTR) === "badge") next = next.nextSibling;
  parent.insertBefore(host, next);
  // Centered cards get centered swatches.
  const align = doc.defaultView?.getComputedStyle(parent).textAlign;
  if (align === "center") host.style.setProperty("--vc-justify", "center");
  else if (align === "right" || align === "end") host.style.setProperty("--vc-justify", "flex-end");
  return { select };
}
