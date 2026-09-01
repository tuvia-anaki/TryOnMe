import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import {
  handleProxyError,
  jsonResponse,
  requireProxyShop,
} from "../lib/proxy.server";
import { LIMITS } from "../lib/rate-limit.server";
import { findOrCreateVisitor } from "../lib/visitor.server";
import { newStorageKey, storage } from "../lib/storage.server";

/**
 * POST /apps/tryon/upload  (multipart: photo, visitor_token)
 * Stores a shopper photo in private storage. Validates MIME by magic bytes,
 * enforces size limits, and scopes the photo to the shop + visitor.
 */

const MAX_BYTES = 8 * 1024 * 1024;

function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop } = await requireProxyShop(request, {
      rate: LIMITS.uploadPerIp,
      scope: "upload",
    });

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES + 4096) {
      return jsonResponse({ message: "That photo is too large." }, 413);
    }

    const form = await request.formData();
    const token = form.get("visitor_token");
    const photo = form.get("photo");
    if (typeof token !== "string" || !(photo instanceof File)) {
      return jsonResponse({ message: "Invalid request." }, 400);
    }

    const visitor = await findOrCreateVisitor(shop.id, token);
    if (!visitor) return jsonResponse({ message: "Invalid request." }, 400);

    const bytes = Buffer.from(await photo.arrayBuffer());
    if (bytes.length > MAX_BYTES) {
      return jsonResponse({ message: "That photo is too large." }, 413);
    }
    const sniffed = sniffImageType(bytes);
    if (!sniffed) {
      return jsonResponse(
        { message: "We couldn't use this photo. Please try another one." },
        415,
      );
    }

    const storageKey = newStorageKey(shop.id, "photo");
    await storage().put(storageKey, bytes, sniffed);

    const record = await prisma.visitorPhoto.create({
      data: { visitorId: visitor.id, storageKey },
    });

    return jsonResponse({ photoId: record.id });
  } catch (error) {
    return handleProxyError(error);
  }
};
