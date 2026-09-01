import prisma from "../db.server";
import { sha256Hex } from "./crypto.server";

/**
 * Anonymous storefront visitors.
 *
 * The storefront script generates a random token, keeps it in a first-party
 * cookie (`tryon_visitor_id`), and sends it with every proxy request. We only
 * ever store a SHA-256 hash of it, scoped per shop, so tokens can't be read
 * from the database and one shop's visitors can't be referenced by another.
 */

const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{21,128}$/;

export function isValidVisitorToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

export async function findVisitor(shopId: string, token: string) {
  if (!isValidVisitorToken(token)) return null;
  return prisma.visitor.findUnique({
    where: {
      shopId_anonymousTokenHash: {
        shopId,
        anonymousTokenHash: sha256Hex(token),
      },
    },
  });
}

export async function findOrCreateVisitor(shopId: string, token: string) {
  if (!isValidVisitorToken(token)) return null;
  const anonymousTokenHash = sha256Hex(token);
  return prisma.visitor.upsert({
    where: { shopId_anonymousTokenHash: { shopId, anonymousTokenHash } },
    create: { shopId, anonymousTokenHash },
    update: { lastSeenAt: new Date() },
  });
}

/**
 * Delete everything we hold for a visitor: photos, try-ons, stored assets.
 * Used by the shopper-facing "Clear my photos and try-ons" action.
 */
export async function deleteVisitorData(shopId: string, token: string) {
  const visitor = await findVisitor(shopId, token);
  if (!visitor) return { deleted: 0 };

  const [photos, tryOns] = await Promise.all([
    prisma.visitorPhoto.findMany({ where: { visitorId: visitor.id } }),
    prisma.tryOn.findMany({ where: { visitorId: visitor.id, shopId } }),
  ]);

  const { storage } = await import("./storage.server");
  const keys = [
    ...photos.map((p) => p.storageKey),
    ...tryOns.map((t) => t.generatedImageStorageKey).filter((k): k is string => Boolean(k)),
  ];
  await Promise.allSettled(keys.map((key) => storage().delete(key)));

  await prisma.visitor.delete({ where: { id: visitor.id } });
  return { deleted: photos.length + tryOns.length };
}
