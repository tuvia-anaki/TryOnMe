/**
 * Server-side product validation. The storefront only ever sends numeric
 * product/variant IDs — the server verifies the product belongs to the shop
 * and picks the image URL itself, so clients can't feed us arbitrary images.
 */

interface GraphqlClient {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

export interface ValidatedProduct {
  productId: string;
  variantId: string | null;
  title: string;
  productType: string;
  vendor: string;
  description: string;
  variantTitle: string | null;
  /** Primary reference image (the selected variant's, when it has one). */
  imageUrl: string;
  /** Primary image first, then other views of the same product. */
  imageUrls: string[];
}

const PRODUCT_QUERY = `#graphql
  query TryOnProduct($id: ID!) {
    product(id: $id) {
      id
      title
      productType
      vendor
      description
      status
      featuredImage { url }
      images(first: 8) { nodes { url } }
      variants(first: 100) {
        nodes {
          id
          title
          image { url }
        }
      }
    }
  }
`;

/** How many product views to send the AI. More context, more tokens/cost. */
export const MAX_PRODUCT_REFERENCE_IMAGES = 4;

export function isNumericId(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,20}$/.test(value);
}

export async function validateProduct(
  admin: GraphqlClient,
  productId: string,
  variantId: string | null,
): Promise<ValidatedProduct | null> {
  if (!isNumericId(productId)) return null;
  if (variantId !== null && !isNumericId(variantId)) return null;

  const response = await admin.graphql(PRODUCT_QUERY, {
    variables: { id: `gid://shopify/Product/${productId}` },
  });
  const body = (await response.json()) as any;
  const product = body?.data?.product;
  if (!product || product.status !== "ACTIVE") return null;

  const variants: Array<{ id: string; title: string; image?: { url?: string } }> =
    product.variants?.nodes ?? [];
  const variant = variantId
    ? variants.find((v) => v.id === `gid://shopify/ProductVariant/${variantId}`)
    : null;
  // A variant id that doesn't belong to this product is rejected outright.
  if (variantId && !variant) return null;

  const imageUrl = variant?.image?.url || product.featuredImage?.url || null;
  if (!imageUrl) return null;

  // Extra angles/details of the SAME product materially improve fidelity:
  // the model sees the print placement, trim and back/side detail it would
  // otherwise have to invent. Primary image first, deduped, capped.
  const galleryUrls: string[] = (product.images?.nodes ?? [])
    .map((n: { url?: string }) => n?.url)
    .filter((u: unknown): u is string => typeof u === "string");
  const imageUrls = [imageUrl, product.featuredImage?.url, ...galleryUrls]
    .filter((u): u is string => typeof u === "string" && isShopifyCdnUrl(u))
    .filter((u, i, all) => all.indexOf(u) === i)
    .slice(0, MAX_PRODUCT_REFERENCE_IMAGES);

  return {
    productId,
    variantId,
    title: product.title ?? "",
    productType: product.productType ?? "",
    vendor: product.vendor ?? "",
    description: product.description ?? "",
    variantTitle: variant?.title ?? null,
    imageUrl,
    imageUrls,
  };
}

/** Only ever fetch product images from Shopify's CDN. */
export function isShopifyCdnUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "cdn.shopify.com" ||
        parsed.hostname.endsWith(".shopifycdn.com") ||
        parsed.hostname.endsWith(".shopify.com"))
    );
  } catch {
    return false;
  }
}
