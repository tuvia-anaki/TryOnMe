import { normalizeText } from "./text";

/**
 * Color-name dictionary + color math. Used by storefront swatches (to paint
 * a swatch for "Navy" without any setup) and by the admin's visual matching.
 * Packed as one string to keep the storefront bundle small.
 */

// prettier-ignore
const PACKED =
  // CSS named colors
  "aliceblue:f0f8ff;antiquewhite:faebd7;aqua:00ffff;aquamarine:7fffd4;azure:f0ffff;beige:f5f5dc;bisque:ffe4c4;black:000000;" +
  "blanchedalmond:ffebcd;blue:1f4fd1;blueviolet:8a2be2;brown:7b4a2e;burlywood:deb887;cadetblue:5f9ea0;chartreuse:7fff00;" +
  "chocolate:7b3f00;coral:ff7f50;cornflowerblue:6495ed;cornsilk:fff8dc;crimson:dc143c;cyan:00ffff;darkblue:00008b;" +
  "darkcyan:008b8b;darkgoldenrod:b8860b;darkgray:a9a9a9;darkgreen:006400;darkgrey:a9a9a9;darkkhaki:bdb76b;darkmagenta:8b008b;" +
  "darkolivegreen:556b2f;darkorange:ff8c00;darkorchid:9932cc;darkred:8b0000;darksalmon:e9967a;darkseagreen:8fbc8f;" +
  "darkslateblue:483d8b;darkslategray:2f4f4f;darkslategrey:2f4f4f;darkturquoise:00ced1;darkviolet:9400d3;deeppink:ff1493;" +
  "deepskyblue:00bfff;dimgray:696969;dimgrey:696969;dodgerblue:1e90ff;firebrick:b22222;floralwhite:fffaf0;forestgreen:228b22;" +
  "fuchsia:ff00ff;gainsboro:dcdcdc;ghostwhite:f8f8ff;gold:d4af37;goldenrod:daa520;gray:8e8e8e;grey:8e8e8e;green:2e8b3a;" +
  "greenyellow:adff2f;honeydew:f0fff0;hotpink:ff69b4;indianred:cd5c5c;indigo:3f2b7a;ivory:fffff0;khaki:c3b091;lavender:c7b8e8;" +
  "lavenderblush:fff0f5;lawngreen:7cfc00;lemonchiffon:fffacd;lightblue:add8e6;lightcoral:f08080;lightcyan:e0ffff;" +
  "lightgoldenrodyellow:fafad2;lightgray:d3d3d3;lightgreen:90ee90;lightgrey:d3d3d3;lightpink:ffb6c1;lightsalmon:ffa07a;" +
  "lightseagreen:20b2aa;lightskyblue:87cefa;lightslategray:778899;lightslategrey:778899;lightsteelblue:b0c4de;" +
  "lightyellow:ffffe0;lime:00ff00;limegreen:32cd32;linen:faf0e6;magenta:ff00ff;maroon:800000;mediumaquamarine:66cdaa;" +
  "mediumblue:0000cd;mediumorchid:ba55d3;mediumpurple:9370db;mediumseagreen:3cb371;mediumslateblue:7b68ee;" +
  "mediumspringgreen:00fa9a;mediumturquoise:48d1cc;mediumvioletred:c71585;midnightblue:191970;mintcream:f5fffa;" +
  "mistyrose:ffe4e1;moccasin:ffe4b5;navajowhite:ffdead;navy:1f2a44;oldlace:fdf5e6;olive:6b6b2e;olivedrab:6b8e23;" +
  "orange:f28c28;orangered:ff4500;orchid:da70d6;palegoldenrod:eee8aa;palegreen:98fb98;paleturquoise:afeeee;" +
  "palevioletred:db7093;papayawhip:ffefd5;peachpuff:ffdab9;peru:cd853f;pink:f4a7b9;plum:8e4585;powderblue:b0e0e6;" +
  "purple:6a3d9a;rebeccapurple:663399;red:d0312d;rosybrown:bc8f8f;royalblue:2b50c8;saddlebrown:8b4513;salmon:fa8072;" +
  "sandybrown:f4a460;seagreen:2e8b57;seashell:fff5ee;sienna:a0522d;silver:c0c0c0;skyblue:87ceeb;slateblue:6a5acd;" +
  "slategray:708090;slategrey:708090;snow:fffafa;springgreen:00ff7f;steelblue:4682b4;tan:d2b48c;teal:008080;thistle:d8bfd8;" +
  "tomato:ff6347;turquoise:40e0d0;violet:8f5bd6;wheat:f5deb3;white:ffffff;whitesmoke:f5f5f5;yellow:f5d23b;yellowgreen:9acd32;" +
  // Apparel / product colors
  "offwhite:f4f1e8;off white:f4f1e8;cream:f3ead3;ecru:e8e0cc;natural:e9dfc9;bone:e3dac9;oatmeal:d8cbb1;sand:d6c3a0;stone:bdb4a4;" +
  "taupe:8b7d6b;mushroom:a39686;camel:c19a6b;cognac:9a463d;caramel:b87333;toffee:8b5a2b;mocha:6f4e37;coffee:6f4e37;" +
  "espresso:3c2a21;walnut:5c4033;chestnut:954535;rust:b7410e;terracotta:c65d3b;brick:9c3d2e;burgundy:7a1f2b;wine:722f37;" +
  "bordeaux:5c0120;merlot:73343a;oxblood:4a0404;cherry:a4161a;scarlet:e0301e;ruby:9b111e;raspberry:b3164b;berry:8e2c48;" +
  "rose:e8a5b0;dustyrose:c9a0a0;dusty rose:c9a0a0;blush:f1c6c1;nude:e3bc9a;peach:f9c89b;apricot:f6b38a;salmon pink:ff91a4;" +
  "fuchsia pink:ff77ff;hot pink:ff4fa3;neon pink:ff44cc;magenta pink:cc338b;mauve:b784a7;lilac:c8a2c8;lavender purple:967bb6;" +
  "amethyst:9966cc;grape:6f2da8;eggplant:3b1f2b;aubergine:3b0918;violet purple:7f00ff;mustard:d1a73a;ochre:cc7722;amber:ffbf00;" +
  "honey:e0a526;lemon:f7e35a;butter:f8e8a0;canary:ffef00;neon yellow:e8ff3a;lime green:32cd32;neon green:39ff14;mint:98d7c2;" +
  "sage:9caf88;pistachio:93c572;olive green:708238;army green:4b5320;military green:4b5320;khaki green:8a865d;moss:8a9a5b;" +
  "hunter green:355e3b;forest:2c5f2d;bottle green:006a4e;emerald:1f8a5b;jade:00a86b;kelly green:4cbb17;seafoam:93e9be;" +
  "aqua blue:00b5cc;turquoise blue:00c5cd;teal blue:367588;petrol:1b4f5a;ocean:1d5c8a;cobalt:0047ab;sapphire:0f52ba;" +
  "royal:2b50c8;electric blue:2f6bff;sky:87ceeb;baby blue:a7c7e7;powder:b0e0e6;ice blue:cfe8f3;denim:3b5b92;indigo blue:2e3a87;" +
  "navy blue:1f2a44;dark navy:141b2d;midnight:191970;slate:6d7b8d;charcoal:36454f;graphite:474a51;anthracite:383e42;gunmetal:53565b;" +
  "heather grey:a8a8a8;heather gray:a8a8a8;ash:b2beb5;smoke:9e9e9e;pewter:8e9194;platinum:e5e4e2;silver grey:a9acb6;" +
  "jet black:0a0a0a;onyx:111111;ink:1b1e23;rose gold:b76e79;yellow gold:d4af37;white gold:e8e3d6;bronze:cd7f32;copper:b87333;" +
  "brass:b5a642;champagne:f1ddc4;pearl:eae0c8;clear:e9f2f5;transparent:e9f2f5;tortoise:6b4226;leopard:c58c3c;" +
  "multi:gradient;multicolor:gradient;multicolour:gradient;multi color:gradient;rainbow:gradient;assorted:gradient;" +
  // Basic colors in common store languages
  "schwarz:000000;weiss:ffffff;weiß:ffffff;rot:d0312d;blau:1f4fd1;grun:2e8b3a;gelb:f5d23b;grau:8e8e8e;braun:7b4a2e;rosa:f4a7b9;" +
  "lila:8f5bd6;orangefarben:f28c28;noir:000000;blanc:ffffff;rouge:d0312d;bleu:1f4fd1;vert:2e8b3a;jaune:f5d23b;gris:8e8e8e;" +
  "marron:7b4a2e;rose clair:f8c8d0;violet fonce:4b0082;negro:000000;blanco:ffffff;rojo:d0312d;azul:1f4fd1;verde:2e8b3a;" +
  "amarillo:f5d23b;morado:6a3d9a;naranja:f28c28;marrón:7b4a2e;nero:000000;bianco:ffffff;rosso:d0312d;blu:1f4fd1;giallo:f5d23b;" +
  "grigio:8e8e8e;viola:8f5bd6;arancione:f28c28;preto:000000;branco:ffffff;vermelho:d0312d;amarelo:f5d23b;cinza:8e8e8e;" +
  "zwart:000000;wit:ffffff;rood:d0312d;blauw:1f4fd1;groen:2e8b3a;geel:f5d23b;grijs:8e8e8e;bruin:7b4a2e;paars:6a3d9a;" +
  "svart:000000;vit:ffffff;röd:d0312d;bla:1f4fd1;grön:2e8b3a;czarny:000000;bialy:ffffff;czerwony:d0312d;niebieski:1f4fd1;" +
  "siyah:000000;beyaz:ffffff;kirmizi:d0312d;mavi:1f4fd1;yesil:2e8b3a;sari:f5d23b;gri:8e8e8e";

let dictionary: Map<string, string> | null = null;

function dict(): Map<string, string> {
  if (dictionary) return dictionary;
  dictionary = new Map();
  for (const entry of PACKED.split(";")) {
    const i = entry.lastIndexOf(":");
    if (i <= 0) continue;
    const name = normalizeText(entry.slice(0, i));
    const hex = entry.slice(i + 1);
    dictionary.set(name, hex === "gradient" ? hex : `#${hex}`);
    dictionary.set(name.replace(/ /g, ""), hex === "gradient" ? hex : `#${hex}`);
  }
  return dictionary;
}

export const RAINBOW = "gradient";

const MODIFIERS: Record<string, number> = {
  light: 0.35, pale: 0.45, pastel: 0.45, soft: 0.25, baby: 0.4,
  dark: -0.35, deep: -0.3, darker: -0.45, lighter: 0.45,
};

function adjust(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const mix = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const out = rgb.map((c) => Math.round(c + (mix - c) * t));
  return rgbToHex(out as [number, number, number]);
}

function lookupSingle(phrase: string, allowSuffix = true): string | null {
  const d = dict();
  const n = normalizeText(phrase);
  if (!n) return null;
  const direct = d.get(n) ?? d.get(n.replace(/ /g, ""));
  if (direct) return direct;
  const words = n.split(" ");
  // "light heather grey" -> modifier + known color
  if (words.length > 1 && MODIFIERS[words[0]] !== undefined) {
    const base = lookupSingle(words.slice(1).join(" "), allowSuffix);
    if (base && base !== RAINBOW) return adjust(base, MODIFIERS[words[0]]);
  }
  if (!allowSuffix) return null;
  // Fall back to the longest known suffix ("vintage washed navy" -> "navy").
  for (let i = 1; i < words.length; i++) {
    const tail = words.slice(i).join(" ");
    const hit = d.get(tail) ?? d.get(tail.replace(/ /g, ""));
    if (hit) return hit;
  }
  return null;
}

function lookupAll(parts: string[]): string[] | null {
  if (parts.length < 2) return null;
  const colors = parts.map((part) => lookupSingle(part));
  return colors.every(Boolean) ? (colors as string[]).slice(0, 3) : null;
}

/**
 * Colors for an option value name. Multi-color values ("Black/White",
 * "Navy & Red") return up to three colors. "gradient" means multicolor.
 */
export function colorsForName(name: string | null | undefined): string[] | null {
  if (!name) return null;
  const raw = String(name);
  const explicit = raw
    .split(/\s*(?:\/|&|\+|,|\|)\s*|\s+(?:and|und|et|y|e|with)\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const multi = lookupAll(explicit);
  if (multi) return multi;
  const exact = lookupSingle(raw, false);
  if (exact) return [exact];
  const dashed = lookupAll(raw.split(/\s*-\s*/).filter(Boolean));
  if (dashed) return dashed;
  const loose = lookupSingle(raw, true);
  return loose ? [loose] : null;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(rgb: readonly number[]): string {
  return "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}

/** Parse "#rgb", "#rrggbb", "rgb(1 2 3)", "rgb(1, 2, 3)" into RGB. */
export function parseCssColor(input: string | null | undefined): [number, number, number] | null {
  if (!input) return null;
  const s = input.trim();
  const hex = hexToRgb(s);
  if (hex) return hex;
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

/** sRGB (0-255) to CIELAB (D65). */
export function rgbToLab(rgb: readonly number[]): [number, number, number] {
  const lin = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
  const y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
  const z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Perceived lightness check, used to add a border to very light swatches. */
export function isVeryLight(color: string): boolean {
  const rgb = parseCssColor(color);
  if (!rgb) return false;
  return rgbToLab(rgb)[0] > 88;
}
