import {
  cloneConfig,
  PRODUCT_CONFIG_KEY,
  PRODUCT_CONFIG_NAMESPACE,
  parseStoredConfig,
  pruneConfig,
  toStoredConfig,
  type NormalizedConfig,
} from "../../shared/config";
import { makeMedia, type MediaType, type ProductModel, type PVariant } from "../../shared/product";
import { variantMainMedia } from "../../shared/resolve";
import { gidToId, gql, throwUserErrors, toGid, type UserError } from "./graphql";

/* ------------------------------------------------------------------ */
/* Product list                                                        */
/* ------------------------------------------------------------------ */

export interface ProductRow {
  id: number;
  gid: string;
  title: string;
  handle: string;
  status: string;
  image: string | null;
  mediaCount: number;
  variantsCount: number;
  options: string[];
  configured: boolean;
  groups: number;
  updatedAt: string | null;
}

export interface ProductPage {
  rows: ProductRow[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

const LIST_QUERY = `#graphql
query ProductsList($first: Int, $after: String, $last: Int, $before: String, $query: String) {
  products(first: $first, after: $after, last: $last, before: $before, query: $query, sortKey: TITLE) {
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    nodes {
      id
      title
      handle
      status
      featuredMedia { preview { image { url(transform: { maxWidth: 120 }) altText } } }
      mediaCount { count }
      variantsCount { count }
      options(first: 3) { id name }
      config: metafield(namespace: "${PRODUCT_CONFIG_NAMESPACE}", key: "${PRODUCT_CONFIG_KEY}") { value updatedAt }
    }
  }
}`;

interface ListNode {
  id: string;
  title: string;
  handle: string;
  status: string;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  mediaCount: { count: number } | null;
  variantsCount: { count: number } | null;
  options: { id: string; name: string }[];
  config: { value: string; updatedAt: string } | null;
}

export async function listProducts(params: {
  search?: string;
  after?: string | null;
  before?: string | null;
  pageSize?: number;
}): Promise<ProductPage> {
  const size = params.pageSize ?? 25;
  const search = params.search?.trim();
  // Free-text search (title, SKU, vendor…); quoted so spaces and punctuation are safe.
  const variables: Record<string, unknown> = {
    query: search ? `"${search.replace(/["\\]/g, " ")}"` : null,
  };
  if (params.before) {
    variables.last = size;
    variables.before = params.before;
  } else {
    variables.first = size;
    variables.after = params.after ?? null;
  }
  const data = await gql<{
    products: {
      pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null };
      nodes: ListNode[];
    };
  }>(LIST_QUERY, variables);
  return {
    rows: data.products.nodes.map((node) => {
      const config = node.config ? parseStoredConfig(node.config.value) : null;
      return {
        id: gidToId(node.id),
        gid: node.id,
        title: node.title,
        handle: node.handle,
        status: node.status,
        image: node.featuredMedia?.preview?.image?.url ?? null,
        mediaCount: node.mediaCount?.count ?? 0,
        variantsCount: node.variantsCount?.count ?? 0,
        options: node.options.map((o) => o.name),
        configured: !!config && config.groups.length > 0,
        groups: config?.groups.length ?? 0,
        updatedAt: node.config?.updatedAt ?? null,
      };
    }),
    hasNextPage: data.products.pageInfo.hasNextPage,
    hasPreviousPage: data.products.pageInfo.hasPreviousPage,
    startCursor: data.products.pageInfo.startCursor,
    endCursor: data.products.pageInfo.endCursor,
  };
}

/* ------------------------------------------------------------------ */
/* Product detail                                                      */
/* ------------------------------------------------------------------ */

const DETAIL_QUERY = `#graphql
query ProductDetail($id: ID!, $mediaAfter: String, $variantsAfter: String) {
  product(id: $id) {
    id
    title
    handle
    status
    onlineStoreUrl
    onlineStorePreviewUrl
    options {
      id
      name
      position
      optionValues {
        id
        name
        hasVariants
        swatch { color image { image { url(transform: { maxWidth: 120 }) } } }
      }
    }
    media(first: 100, after: $mediaAfter) {
      pageInfo { hasNextPage endCursor }
      nodes { id alt mediaContentType status preview { image { url width height } } }
    }
    variants(first: 100, after: $variantsAfter) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        availableForSale
        sku
        selectedOptions { name value optionValue { id } }
        media(first: 1) { nodes { id } }
      }
    }
    config: metafield(namespace: "${PRODUCT_CONFIG_NAMESPACE}", key: "${PRODUCT_CONFIG_KEY}") {
      id
      value
      compareDigest
      updatedAt
    }
  }
}`;

interface MediaNode {
  id: string;
  alt: string | null;
  mediaContentType: MediaType;
  status: string;
  preview: { image: { url: string; width: number; height: number } | null } | null;
}

interface VariantNode {
  id: string;
  title: string;
  availableForSale: boolean;
  sku: string | null;
  selectedOptions: { name: string; value: string; optionValue: { id: string } | null }[];
  media: { nodes: { id: string }[] };
}

interface DetailData {
  product: {
    id: string;
    title: string;
    handle: string;
    status: string;
    onlineStoreUrl: string | null;
    onlineStorePreviewUrl: string | null;
    options: {
      id: string;
      name: string;
      position: number;
      optionValues: {
        id: string;
        name: string;
        hasVariants: boolean;
        swatch: { color: string | null; image: { image: { url: string } | null } | null } | null;
      }[];
    }[];
    media: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: MediaNode[] };
    variants: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: VariantNode[] };
    config: { id: string; value: string; compareDigest: string; updatedAt: string } | null;
  } | null;
}

export interface LoadedProduct {
  product: ProductModel;
  config: NormalizedConfig;
  /** Digest of the stored metafield, for safe concurrent saves. */
  digest: string | null;
  updatedAt: string | null;
}

export async function loadProduct(id: number): Promise<LoadedProduct | null> {
  const gid = toGid("Product", id);
  const first = await gql<DetailData>(DETAIL_QUERY, { id: gid });
  const p = first.product;
  if (!p) return null;

  const mediaNodes = [...p.media.nodes];
  const variantNodes = [...p.variants.nodes];
  let mediaPage = p.media.pageInfo;
  let variantPage = p.variants.pageInfo;
  while (mediaPage.hasNextPage || variantPage.hasNextPage) {
    const next = await gql<DetailData>(DETAIL_QUERY, {
      id: gid,
      mediaAfter: mediaPage.hasNextPage ? mediaPage.endCursor : null,
      variantsAfter: variantPage.hasNextPage ? variantPage.endCursor : null,
    });
    if (!next.product) break;
    if (mediaPage.hasNextPage) {
      mediaNodes.push(...next.product.media.nodes);
      mediaPage = next.product.media.pageInfo;
    }
    if (variantPage.hasNextPage) {
      variantNodes.push(...next.product.variants.nodes);
      variantPage = next.product.variants.pageInfo;
    }
  }

  const options = p.options
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((option) => ({
      id: gidToId(option.id),
      name: option.name,
      position: option.position,
      values: option.optionValues.map((value) => ({
        id: gidToId(value.id),
        name: value.name,
        color: value.swatch?.color ?? null,
        imageUrl: value.swatch?.image?.image?.url ?? null,
        hasVariants: value.hasVariants,
      })),
    }));

  const media = mediaNodes.map((node, position) =>
    makeMedia({
      id: gidToId(node.id),
      type: node.mediaContentType,
      alt: node.alt ?? "",
      url: node.preview?.image?.url ?? null,
      width: node.preview?.image?.width ?? null,
      height: node.preview?.image?.height ?? null,
      position,
    }),
  );

  const variants: PVariant[] = variantNodes.map((node) => {
    const valueIds = options.map((option) => {
      const selected = node.selectedOptions.find((s) => s.name === option.name);
      if (selected?.optionValue?.id) return gidToId(selected.optionValue.id);
      return option.values.find((v) => v.name === selected?.value)?.id ?? 0;
    });
    return {
      id: gidToId(node.id),
      title: node.title,
      available: node.availableForSale,
      valueIds: valueIds.filter((id) => id > 0),
      mediaId: node.media.nodes[0] ? gidToId(node.media.nodes[0].id) : null,
      sku: node.sku,
    };
  });

  const product: ProductModel = {
    id: gidToId(p.id),
    title: p.title,
    handle: p.handle,
    status: p.status,
    onlineStoreUrl: p.onlineStoreUrl,
    previewUrl: p.onlineStorePreviewUrl,
    options,
    variants,
    media,
  };

  const stored = parseStoredConfig(p.config?.value ?? null);
  const config = pruneConfig(
    stored,
    media.map((m) => m.id),
    options.flatMap((o) => o.values.map((v) => v.id)),
  );
  return { product, config, digest: p.config?.compareDigest ?? null, updatedAt: p.config?.updatedAt ?? null };
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

const SAVE_MUTATION = `#graphql
mutation SaveVariantImages($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id compareDigest updatedAt }
    userErrors { field message code }
  }
}`;

const DELETE_MUTATION = `#graphql
mutation DeleteVariantImages($metafields: [MetafieldIdentifierInput!]!) {
  metafieldsDelete(metafields: $metafields) {
    deletedMetafields { key }
    userErrors { field message }
  }
}`;

const SYNC_MUTATION = `#graphql
mutation SyncVariantImages($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    userErrors { field message code }
  }
}`;

export class StaleConfigError extends Error {
  constructor() {
    super("This product's variant images were changed somewhere else. Reload to see the latest version.");
    this.name = "StaleConfigError";
  }
}

export interface SaveOptions {
  /** Also set each variant's native Shopify image to its main image. */
  syncVariantImages: boolean;
  digest: string | null;
}

export interface SaveResult {
  digest: string | null;
  updatedAt: string | null;
  syncedVariants: number;
}

export async function saveProductConfig(
  product: ProductModel,
  config: NormalizedConfig,
  options: SaveOptions,
): Promise<SaveResult> {
  const stored = toStoredConfig(config);
  const ownerId = toGid("Product", product.id);
  let digest: string | null = null;
  let updatedAt: string | null = null;

  if (stored) {
    const input: Record<string, unknown> = {
      ownerId,
      namespace: PRODUCT_CONFIG_NAMESPACE,
      key: PRODUCT_CONFIG_KEY,
      type: "json",
      value: JSON.stringify(stored),
    };
    if (options.digest) input.compareDigest = options.digest;
    const data = await gql<{
      metafieldsSet: { metafields: { id: string; compareDigest: string; updatedAt: string }[]; userErrors: UserError[] };
    }>(SAVE_MUTATION, { metafields: [input] });
    const errors = data.metafieldsSet.userErrors;
    if (errors.some((e) => e.code === "STALE_OBJECT" || /digest|stale|changed/i.test(e.message))) throw new StaleConfigError();
    throwUserErrors(errors, "Couldn't save variant images");
    digest = data.metafieldsSet.metafields[0]?.compareDigest ?? null;
    updatedAt = data.metafieldsSet.metafields[0]?.updatedAt ?? null;
  } else {
    const data = await gql<{ metafieldsDelete: { userErrors: UserError[] } }>(DELETE_MUTATION, {
      metafields: [{ ownerId, namespace: PRODUCT_CONFIG_NAMESPACE, key: PRODUCT_CONFIG_KEY }],
    });
    throwUserErrors(data.metafieldsDelete.userErrors, "Couldn't clear variant images");
  }

  let syncedVariants = 0;
  if (options.syncVariantImages && stored) {
    syncedVariants = await syncVariantImages(product, config);
  }
  return { digest, updatedAt, syncedVariants };
}

/** Point each variant's native image at its group's main image (cart, checkout, feeds). */
export async function syncVariantImages(product: ProductModel, config: NormalizedConfig): Promise<number> {
  const main = variantMainMedia(
    config,
    product.media.map((m) => m.id),
    product.variants,
  );
  const changes: { id: string; mediaId: string }[] = [];
  for (const variant of product.variants) {
    const target = main.get(variant.id);
    if (target && target !== variant.mediaId) {
      const media = product.media.find((m) => m.id === target);
      // Shopify only accepts ready images as variant images.
      if (media && media.type === "IMAGE") changes.push({ id: toGid("ProductVariant", variant.id), mediaId: toGid("MediaImage", target) });
    }
  }
  for (let i = 0; i < changes.length; i += 100) {
    const batch = changes.slice(i, i + 100);
    const data = await gql<{ productVariantsBulkUpdate: { userErrors: UserError[] } }>(SYNC_MUTATION, {
      productId: toGid("Product", product.id),
      variants: batch,
    });
    throwUserErrors(data.productVariantsBulkUpdate.userErrors, "Saved, but couldn't update variant images");
  }
  // Keep the local model in sync so the next save doesn't redo the work.
  for (const variant of product.variants) {
    const target = main.get(variant.id);
    if (target && changes.some((c) => c.id === toGid("ProductVariant", variant.id))) variant.mediaId = target;
  }
  return changes.length;
}

export { cloneConfig };
