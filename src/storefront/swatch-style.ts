import { colorsForName, isVeryLight, RAINBOW } from "../shared/colors";
import type { AppSettings, Shape } from "../shared/settings";
import { normalizeText } from "../shared/text";

/**
 * Pure swatch rendering helpers shared by the storefront and the admin's
 * live preview, so what merchants design is exactly what shoppers get.
 */

export interface SwatchVisual {
  kind: "color" | "image" | "text";
  /** CSS background for color swatches. */
  background?: string;
  image?: string;
  light?: boolean;
}

export function radiusFor(shape: Shape, size: number): string {
  if (shape === "circle") return "50%";
  if (shape === "rounded") return `${Math.max(3, Math.round(size / 5))}px`;
  return "0";
}

export function backgroundFor(colors: string[]): string {
  if (colors.length === 1 && colors[0] === RAINBOW) {
    return "conic-gradient(#e53935, #fb8c00, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)";
  }
  const list = colors.filter((c) => c !== RAINBOW);
  if (!list.length) return "#ccc";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `linear-gradient(135deg, ${list[0]} 50%, ${list[1]} 50%)`;
  return `linear-gradient(135deg, ${list[0]} 33.3%, ${list[1]} 33.3% 66.6%, ${list[2]} 66.6%)`;
}

export interface VisualInput {
  name: string;
  /** Shopify native swatch color / image. */
  nativeColor?: string | null;
  nativeImage?: string | null;
  /** Image of the value's variant(s), from the app config or the variant image. */
  variantImage?: string | null;
}

/** Decide how a value is drawn, honoring merchant overrides first. */
export function visualFor(input: VisualInput, settings: AppSettings): SwatchVisual {
  const key = normalizeText(input.name);
  const source = settings.swatches.source;
  const mapped = settings.swatches.colorMap[key];
  const mappedImage = settings.swatches.imageMap[key];

  const color = (): SwatchVisual | null => {
    if (mapped) {
      const parts = mapped.split("/").map((s) => s.trim()).filter(Boolean);
      return { kind: "color", background: backgroundFor(parts), light: parts.length === 1 && isVeryLight(parts[0]) };
    }
    if (input.nativeColor) return { kind: "color", background: input.nativeColor, light: isVeryLight(input.nativeColor) };
    const named = colorsForName(input.name);
    if (named) return { kind: "color", background: backgroundFor(named), light: named.length === 1 && isVeryLight(named[0]) };
    return null;
  };
  const image = (): SwatchVisual | null => {
    if (mappedImage) return { kind: "image", image: mappedImage };
    if (input.nativeImage) return { kind: "image", image: input.nativeImage };
    if (input.variantImage) return { kind: "image", image: input.variantImage };
    return null;
  };

  if (source === "image") return image() ?? color() ?? { kind: "text" };
  if (source === "color") return color() ?? image() ?? { kind: "text" };
  // auto: explicit merchant choices, then named colors, then variant photos.
  if (mappedImage) return { kind: "image", image: mappedImage };
  if (mapped || input.nativeColor) return color()!;
  if (input.nativeImage) return { kind: "image", image: input.nativeImage };
  return color() ?? image() ?? { kind: "text" };
}

/** CSS custom properties for a swatch group, from settings. */
export function cssVars(settings: AppSettings): string {
  const s = settings.swatches;
  return [
    `--pvi-size:${s.size}px`,
    `--pvi-gap:${s.gap}px`,
    `--pvi-radius:${radiusFor(s.shape, s.size)}`,
    `--pvi-border-width:${s.borderWidth}px`,
    `--pvi-border-color:${s.borderColor}`,
    `--pvi-ring:${s.selectedColor}`,
    `--pvi-ring-offset:${s.ringOffset}px`,
    `--pvi-pill-radius:${s.pill.radius}px`,
    `--pvi-pill-bg:${s.pill.background}`,
    `--pvi-pill-text:${s.pill.text}`,
    `--pvi-pill-border:${s.pill.border}`,
    `--pvi-pill-sel-bg:${s.pill.selectedBackground}`,
    `--pvi-pill-sel-text:${s.pill.selectedText}`,
    `--pvi-pill-sel-border:${s.pill.selectedBorder}`,
  ].join(";");
}

/** Styles inside each swatch group's shadow root. */
export const SWATCH_CSS = `
:host{display:block;margin:0 0 1rem;font:inherit;color:inherit}
.label{margin:0 0 .5rem;font-size:.95em;line-height:1.4}
.label b{font-weight:600}
.list{display:flex;flex-wrap:wrap;gap:var(--pvi-gap,10px);align-items:center;margin:0;padding:0}
.sw{all:unset;box-sizing:border-box;position:relative;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}
.sw:focus-visible{outline:2px solid var(--pvi-ring,#1a1a1a);outline-offset:3px}
.vis{width:var(--pvi-size,36px);height:var(--pvi-size,36px);border-radius:var(--pvi-radius,50%);padding:var(--pvi-ring-offset,2px);border:2px solid transparent;transition:border-color .15s}
.vis .fill{display:block;width:100%;height:100%;border-radius:inherit;background-size:cover;background-position:center;box-shadow:inset 0 0 0 var(--pvi-border-width,1px) var(--pvi-border-color,#d4d4d4)}
.vis.light .fill{box-shadow:inset 0 0 0 max(1px,var(--pvi-border-width,1px)) #cfcfcf}
.vis[aria-checked=true]{border-color:var(--pvi-ring,#1a1a1a)}
.vis:hover:not([aria-checked=true]){border-color:color-mix(in srgb,var(--pvi-ring,#1a1a1a) 35%,transparent)}
.pill{min-height:2.5em;min-width:2.75em;padding:.45em 1em;border-radius:var(--pvi-pill-radius,6px);background:var(--pvi-pill-bg,#fff);color:var(--pvi-pill-text,#1a1a1a);border:1px solid var(--pvi-pill-border,#d4d4d4);font-size:.95em;line-height:1.2;text-align:center;transition:background .15s,color .15s,border-color .15s}
.pill:hover{border-color:var(--pvi-pill-sel-border,#1a1a1a)}
.pill[aria-checked=true]{background:var(--pvi-pill-sel-bg,#1a1a1a);color:var(--pvi-pill-sel-text,#fff);border-color:var(--pvi-pill-sel-border,#1a1a1a)}
.sold.cross.vis::after{content:"";position:absolute;left:12%;right:12%;top:50%;border-top:1.5px solid rgba(0,0,0,.55);transform:rotate(-45deg);pointer-events:none}
.sold.cross.pill{text-decoration:line-through;opacity:.6}
.sold.fade{opacity:.4}
.sold.hide{display:none}
.tip{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;font-size:12px;line-height:1.3;padding:4px 8px;border-radius:4px;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .12s;z-index:5}
.sw:hover .tip,.sw:focus-visible .tip{opacity:1}
.sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.vis,.pill,.tip{transition:none}}
`;
