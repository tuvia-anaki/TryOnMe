import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  isValidStorageKey,
  storage,
  verifyAssetSignature,
} from "../lib/storage.server";

/**
 * GET /asset/<storage-key>?exp=...&sig=...
 * Serves private local-storage assets via short-lived HMAC-signed URLs.
 * Only used with the "local" storage driver; the s3 driver returns
 * presigned bucket URLs instead. Keys are 64-hex random — not enumerable.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const key = params["*"] ?? "";
  const url = new URL(request.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";

  if (!isValidStorageKey(key) || !verifyAssetSignature(key, exp, sig)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await storage().get(key);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": key.includes("/result/") ? "image/png" : "image/jpeg",
        "Cache-Control": "private, max-age=300",
        // Needed so the storefront Share button can fetch() the blob.
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};
