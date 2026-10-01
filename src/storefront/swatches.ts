import { isVeryLight, RAINBOW } from "../shared/colors";
import type { SwatchSettings } from "../shared/settings";
import { SWATCH_SIZES, swatchVisual, type Swatch, type SwatchSet } from "../shared/swatches";
import { UI_ATTR } from "./cards";
import { insertionPoint, sizedImage } from "./patch";

/**
 * Swatches under a card, drawn the way the shop chose (color or photo, round or square, small to
 * large). Picking one shows that variant on the same card: its photo, title, price and link.
 * The admin's preview draws them with this same code.
 */

const MAX = 6;

const CSS = `
:host{display:block;margin:.6em 0 0;position:relative;z-index:2}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;justify-content:var(--vc-justify,flex-start)}
button{margin:0;font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.sw{box-sizing:border-box;display:inline-flex;width:var(--vc-size);height:var(--vc-size);padding:2px;border:1.5px solid transparent;border-radius:var(--vc-radius);background:none}
.sw>span{display:block;width:100%;height:100%;border-radius:var(--vc-inner-radius);background-position:center;background-size:cover;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}
.sw.light>span{box-shadow:inset 0 0 0 1px rgba(0,0,0,.3)}
.sw:hover{border-color:rgba(127,127,127,.6)}
.sw[aria-pressed=true]{border-color:currentColor}
.chip{box-sizing:border-box;min-height:var(--vc-size);padding:0 .75em;border:1px solid rgba(127,127,127,.45);border-radius:var(--vc-chip-radius);background:none;font-size:.8em;line-height:1;white-space:nowrap}
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

export type SwatchStyle = Pick<SwatchSettings, "look" | "shape" | "size">;

export interface SwatchRow {
  /** The element to put in a card. */
  host: HTMLElement;
  /** Mark the value the card shows now. */
  select(value: string): void;
}

/** The swatches for one card; `onPick` shows a value on the card. */
export function buildSwatches(doc: Document, set: SwatchSet, productUrl: string, style: SwatchStyle, onPick: (swatch: Swatch) => void): SwatchRow {
  // A custom tag with its own styles: themes can't restyle it, and they hide empty divs.
  const host = doc.createElement("vc-swatches");
  host.setAttribute(UI_ATTR, "swatches");
  const size = SWATCH_SIZES[style.size];
  const square = style.shape === "square";
  host.style.setProperty("--vc-size", `${size}px`);
  host.style.setProperty("--vc-radius", square ? `${Math.round(size / 4)}px` : "50%");
  host.style.setProperty("--vc-inner-radius", square ? `${Math.round(size / 4) - 2}px` : "50%");
  host.style.setProperty("--vc-chip-radius", square ? `${Math.round(size / 4)}px` : "999px");
  const shadow = host.attachShadow({ mode: "open" });
  const css = doc.createElement("style");
  css.textContent = CSS;
  const row = doc.createElement("div");
  row.className = "row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", set.option);
  shadow.append(css, row);

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
    const visual = swatchVisual(swatch, style.look);
    if (visual) {
      button.className = "sw";
      const chip = doc.createElement("span");
      if ("colors" in visual) {
        chip.style.background = background(visual.colors);
        if (visual.colors.length === 1 && isVeryLight(visual.colors[0])) button.classList.add("light");
      } else {
        chip.style.backgroundImage = `url("${sizedImage(visual.image, size * 3).replace(/"/g, "%22")}")`;
      }
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
  return { host, select };
}

/** Put the swatches in a card: after its price (and our "Sold out" badge), never inside a link. */
export function renderSwatches(el: Element, set: SwatchSet, productUrl: string, style: SwatchStyle, onPick: (swatch: Swatch) => void): SwatchRow {
  const row = buildSwatches(el.ownerDocument, set, productUrl, style, onPick);
  const { parent, before } = insertionPoint(el);
  let next = before;
  while (next instanceof Element && next.getAttribute(UI_ATTR) === "badge") next = next.nextSibling;
  parent.insertBefore(row.host, next);
  // Centered cards get centered swatches.
  const align = el.ownerDocument.defaultView?.getComputedStyle(parent).textAlign;
  if (align === "center") row.host.style.setProperty("--vc-justify", "center");
  else if (align === "right" || align === "end") row.host.style.setProperty("--vc-justify", "flex-end");
  return row;
}
