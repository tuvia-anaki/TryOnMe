import prisma from "../db.server";

/** Find or create the Shop row + default settings for a shop domain. */
export async function ensureShop(shopDomain: string) {
  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain },
    update: { installed: true },
  });
  await prisma.shopSettings.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id },
    update: {},
  });
  await prisma.widgetSettings.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id },
    update: {},
  });
  return shop;
}

export async function getShopWithSettings(shopDomain: string) {
  return prisma.shop.findUnique({
    where: { shopDomain },
    include: { settings: true, widgetSettings: true, credentials: true },
  });
}

/** Full teardown on app/uninstalled or shop/redact. */
export async function deleteShopData(shopDomain: string) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: {
      visitors: { include: { photos: true } },
      tryOns: true,
    },
  });
  if (!shop) return;

  const { storage } = await import("./storage.server");
  const keys = [
    ...shop.visitors.flatMap((v) => v.photos.map((p) => p.storageKey)),
    ...shop.tryOns
      .map((t) => t.generatedImageStorageKey)
      .filter((k): k is string => Boolean(k)),
  ];
  await Promise.allSettled(keys.map((key) => storage().delete(key)));
  await prisma.shop.delete({ where: { id: shop.id } });
}

/**
 * Is try-on available for this product under the shop's availability mode?
 * `productSelectionJson` stores an array of numeric product ids (as strings).
 */
export function isProductAvailable(
  settings: { productAvailabilityMode: string; productSelectionJson: string },
  productId: string,
): boolean {
  let selection: string[] = [];
  try {
    const parsed = JSON.parse(settings.productSelectionJson);
    if (Array.isArray(parsed)) selection = parsed.map(String);
  } catch {
    selection = [];
  }
  switch (settings.productAvailabilityMode) {
    case "include":
      return selection.includes(String(productId));
    case "exclude":
      return !selection.includes(String(productId));
    default:
      return true;
  }
}
