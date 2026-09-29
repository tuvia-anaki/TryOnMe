import { makeMedia, type MediaType, type ProductModel } from "../src/shared/product";

/**
 * T-shirt: Color (Red, Blue, Green) × Size (S, M).
 * Media order: hero, red1, red2, blue1, blue2, green1, sizechart
 * Native variant images: Red→red1, Blue→blue1, Green→green1
 */
export const COLOR = { red: 11, blue: 12, green: 13 } as const;
export const SIZE = { s: 21, m: 22 } as const;
export const MEDIA = { hero: 101, red1: 102, red2: 103, blue1: 104, blue2: 105, green1: 106, chart: 107 } as const;

export function tshirt(overrides: Partial<ProductModel> = {}): ProductModel {
  const media = (
    [
      [MEDIA.hero, "tee-hero.jpg", "Classic tee"],
      [MEDIA.red1, "tee-red-front.jpg", "Red tee front"],
      [MEDIA.red2, "tee-red-back.jpg", "Red tee back"],
      [MEDIA.blue1, "tee-blue-front.jpg", "Blue tee front"],
      [MEDIA.blue2, "tee-blue-back.jpg", "Blue tee back"],
      [MEDIA.green1, "tee-green.jpg", "Green"],
      [MEDIA.chart, "size-chart.png", "Size chart"],
    ] as const
  ).map(([id, file, alt], position) =>
    makeMedia({
      id,
      type: "IMAGE" as MediaType,
      alt,
      url: `https://cdn.shopify.com/s/files/1/0001/files/${file}?v=1`,
      width: 1000,
      height: 1000,
      position,
    }),
  );
  const variantImage: Record<number, number> = {
    [COLOR.red]: MEDIA.red1,
    [COLOR.blue]: MEDIA.blue1,
    [COLOR.green]: MEDIA.green1,
  };
  const variants = [];
  let id = 1000;
  for (const [colorName, colorId] of Object.entries(COLOR)) {
    for (const [sizeName, sizeId] of Object.entries(SIZE)) {
      variants.push({
        id: ++id,
        title: `${colorName} / ${sizeName}`,
        available: true,
        valueIds: [colorId, sizeId],
        mediaId: variantImage[colorId],
        sku: null,
      });
    }
  }
  return {
    id: 1,
    title: "Classic tee",
    handle: "classic-tee",
    status: "ACTIVE",
    onlineStoreUrl: null,
    previewUrl: null,
    options: [
      {
        id: 1,
        name: "Color",
        position: 1,
        values: [
          { id: COLOR.red, name: "Red", color: null, imageUrl: null, hasVariants: true },
          { id: COLOR.blue, name: "Blue", color: null, imageUrl: null, hasVariants: true },
          { id: COLOR.green, name: "Green", color: null, imageUrl: null, hasVariants: true },
        ],
      },
      {
        id: 2,
        name: "Size",
        position: 2,
        values: [
          { id: SIZE.s, name: "S", color: null, imageUrl: null, hasVariants: true },
          { id: SIZE.m, name: "M", color: null, imageUrl: null, hasVariants: true },
        ],
      },
    ],
    variants,
    media,
    ...overrides,
  };
}
