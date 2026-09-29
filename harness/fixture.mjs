// Shared fixture for the local storefront harness: one product rendered the
// same way the Liquid app embed renders it.
export const COLORS = [
  { id: 5000000001, name: "Red" },
  { id: 5000000002, name: "Blue" },
  { id: 5000000003, name: "Green" },
  { id: 5000000004, name: "Black/White" },
];
export const SIZES = [
  { id: 5000000011, name: "S" },
  { id: 5000000012, name: "M" },
  { id: 5000000013, name: "L" },
];

let n = 0;
const m = (file, alt, color) => ({ id: 3000000000 + ++n, file, alt, color, imageId: 7000000000 + n });
export const MEDIA = [
  m("tee-hero", "Classic tee", "#999"),
  m("tee-red-front", "Red front", "#d0312d"),
  m("tee-red-back", "Red back", "#a02020"),
  m("tee-blue-front", "Blue front", "#1f4fd1"),
  m("tee-blue-back", "Blue back", "#16389a"),
  m("tee-blue-detail", "Blue detail", "#4a74e8"),
  m("tee-green-front", "Green front", "#2e8b3a"),
  m("tee-bw-front", "Black and white", "#333"),
  m("size-chart", "Size chart", "#eee"),
];
const byFile = Object.fromEntries(MEDIA.map((x) => [x.file, x.id]));

export const CONFIG = {
  v: 1,
  g: {
    [COLORS[0].id]: [byFile["tee-red-front"], byFile["tee-red-back"]],
    [COLORS[1].id]: [byFile["tee-blue-front"], byFile["tee-blue-back"], byFile["tee-blue-detail"]],
    [COLORS[2].id]: [byFile["tee-green-front"]],
    [COLORS[3].id]: [byFile["tee-bw-front"]],
  },
  s: [byFile["tee-hero"]],
};

const FEATURED = {
  Red: byFile["tee-red-front"],
  Blue: byFile["tee-blue-front"],
  Green: byFile["tee-green-front"],
  "Black/White": byFile["tee-bw-front"],
};
export const VARIANTS = [];
let v = 4000000000;
for (const c of COLORS) {
  for (const s of SIZES) {
    const soldOut = (c.name === "Green" && s.name === "L") || (c.name === "Black/White" && s.name === "S");
    VARIANTS.push({ id: ++v, color: c.name, size: s.name, available: !soldOut, featured: FEATURED[c.name] });
  }
}

export function imageUrl(file, { legacy = false, width = 800 } = {}) {
  return legacy
    ? `/s/files/1/0001/0002/products/${file}_${width}x.jpg?v=1`
    : `/cdn/shop/files/${file}.jpg?v=1&width=${width}`;
}

export function productJson({ selected = null, config = CONFIG } = {}) {
  return {
    id: 9000000001,
    handle: "classic-tee",
    url: "/products/classic-tee",
    selected,
    first: VARIANTS[0].id,
    config,
    options: [
      { name: "Color", position: 1, values: COLORS },
      { name: "Size", position: 2, values: SIZES },
    ],
    variants: VARIANTS.map((x) => [x.id, x.available ? 1 : 0, x.color, x.size, null, x.featured]),
    media: MEDIA.map((x) => ({ id: x.id, type: "image", src: `files/${x.file}.jpg`, thumb: imageUrl(x.file, { width: 160 }) })),
    images: MEDIA.map((x) => [x.imageId, `files/${x.file}.jpg`]),
  };
}

export const SETTINGS = {
  v: 1,
  gallery: { enabled: true, hideUnassigned: false, noSelection: "first", showMainFirst: true, preventFlash: true },
  swatches: { enabled: true, applyTo: "color", otherOptions: "pills", source: "auto", showLabel: true, tooltip: true, soldOut: "cross" },
  cards: { enabled: true, size: 20, max: 4, trigger: "hover" },
};

/** Storefront `/products/<handle>.js` payload for card swatches. */
export function ajaxProduct(handle, colorNames = ["Red", "Blue", "Green"]) {
  return {
    id: 9100000000 + handle.length,
    handle,
    url: `/products/${handle}`,
    options: [
      { name: "Color", position: 1, values: colorNames },
      { name: "Size", position: 2, values: ["S", "M"] },
    ],
    variants: colorNames.flatMap((c, i) =>
      ["S", "M"].map((s, j) => ({
        id: 9200000000 + i * 10 + j,
        options: [c, s],
        option1: c,
        option2: s,
        available: !(c === "Green" && s === "M"),
        featured_image: { src: `/cdn/shop/files/${handle}-${c.toLowerCase()}.jpg?v=1` },
      })),
    ),
  };
}

export function colorOf(file) {
  const media = MEDIA.find((x) => file.startsWith(x.file));
  if (media) return media.color;
  if (/red/.test(file)) return "#d0312d";
  if (/blue/.test(file)) return "#1f4fd1";
  if (/green/.test(file)) return "#2e8b3a";
  return "#bbb";
}
