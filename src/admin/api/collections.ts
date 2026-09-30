import { COLLECTION_KEY, COLLECTION_NAMESPACE } from "../../shared/constants";
import { isDefaultCollectionSettings, sanitizeCollectionSettings, type CollectionSettings } from "../../shared/settings";
import type { VcProduct } from "../../shared/split";
import { gql, throwUserErrors, type UserError } from "./graphql";

/**
 * Collections and their per-collection settings (an app-owned metafield on
 * each collection, read by the app embed on that collection's page).
 */

export interface CollectionRow {
  id: number;
  gid: string;
  title: string;
  handle: string;
  sortOrder: string;
  productsCount: number;
  image: string | null;
  settings: CollectionSettings | null;
}

export interface CollectionPage {
  rows: CollectionRow[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

const FIELDS = `
  id title handle sortOrder
  productsCount { count }
  image { url(transform: { maxWidth: 160 }) }
  settings: metafield(namespace: "${COLLECTION_NAMESPACE}", key: "${COLLECTION_KEY}") { value }
`;

const LIST_QUERY = `#graphql
query CollectionsList($first: Int, $after: String, $last: Int, $before: String, $query: String) {
  collections(first: $first, after: $after, last: $last, before: $before, query: $query, sortKey: TITLE) {
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    nodes { ${FIELDS} }
  }
}`;

const DETAIL_QUERY = `#graphql
query CollectionDetail($id: ID!) {
  collection(id: $id) { ${FIELDS} }
}`;

const PRODUCTS_QUERY = `#graphql
query CollectionProducts($id: ID!, $after: String) {
  collection(id: $id) {
    products(first: 8, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title handle vendor productType
        featuredMedia { preview { image { url(transform: { maxWidth: 240 }) } } }
        options(first: 3) { name }
        variants(first: 50) {
          nodes {
            id title availableForSale price compareAtPrice
            selectedOptions { name value }
            image { url(transform: { maxWidth: 240 }) }
          }
        }
      }
    }
  }
}`;

const SAVE_MUTATION = `#graphql
mutation SaveCollectionSettings($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id }
    userErrors { field message code }
  }
}`;

const DELETE_MUTATION = `#graphql
mutation DeleteCollectionSettings($metafields: [MetafieldIdentifierInput!]!) {
  metafieldsDelete(metafields: $metafields) {
    deletedMetafields { key }
    userErrors { field message }
  }
}`;

const gidToId = (gid: string) => Number(gid.split("/").pop());

interface CollectionNode {
  id: string;
  title: string;
  handle: string;
  sortOrder: string;
  productsCount: { count: number } | null;
  image: { url: string } | null;
  settings: { value: string } | null;
}

function toRow(node: CollectionNode): CollectionRow {
  return {
    id: gidToId(node.id),
    gid: node.id,
    title: node.title,
    handle: node.handle,
    sortOrder: node.sortOrder,
    productsCount: node.productsCount?.count ?? 0,
    image: node.image?.url ?? null,
    settings: node.settings ? sanitizeCollectionSettings(node.settings.value) : null,
  };
}

export async function listCollections(params: { search?: string; after?: string | null; before?: string | null; pageSize?: number }): Promise<CollectionPage> {
  const size = params.pageSize ?? 50;
  const search = params.search?.trim();
  const variables: Record<string, unknown> = { query: search ? `title:*${search.replace(/["\\*]/g, " ")}*` : null };
  if (params.before) Object.assign(variables, { last: size, before: params.before });
  else Object.assign(variables, { first: size, after: params.after ?? null });
  const data = await gql<{
    collections: {
      pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null };
      nodes: CollectionNode[];
    };
  }>(LIST_QUERY, variables);
  return { rows: data.collections.nodes.map(toRow), ...data.collections.pageInfo };
}

export async function loadCollection(id: number): Promise<CollectionRow | null> {
  const data = await gql<{ collection: CollectionNode | null }>(DETAIL_QUERY, { id: `gid://shopify/Collection/${id}` });
  return data.collection ? toRow(data.collection) : null;
}

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  options: { name: string }[];
  variants: {
    nodes: {
      id: string;
      title: string;
      availableForSale: boolean;
      price: string;
      compareAtPrice: string | null;
      selectedOptions: { name: string; value: string }[];
      image: { url: string } | null;
    }[];
  };
}

const cents = (money: string | null) => (money == null ? null : Math.round(Number(money) * 100));

function toProduct(node: ProductNode): VcProduct {
  const optionNames = node.options.map((o) => o.name);
  const variants = node.variants.nodes.map((v) => {
    const price = cents(v.price) ?? 0;
    const compare = cents(v.compareAtPrice);
    return {
      id: gidToId(v.id),
      title: v.title,
      options: optionNames.map((name) => v.selectedOptions.find((o) => o.name === name)?.value ?? ""),
      available: v.availableForSale,
      price,
      compareAtPrice: compare && compare > price ? compare : null,
      image: v.image?.url ?? null,
      mediaId: null,
    };
  });
  return {
    id: gidToId(node.id),
    handle: node.handle,
    title: node.title,
    vendor: node.vendor,
    type: node.productType,
    options: optionNames,
    variants,
    image: node.featuredMedia?.preview?.image?.url ?? null,
    available: variants.some((v) => v.available),
  };
}

/** A collection's products in its current order (up to `max`), for the variant order editor. */
export async function loadCollectionProducts(id: number, max = 200, onProgress?: (loaded: number) => void): Promise<{ products: VcProduct[]; truncated: boolean }> {
  const products: VcProduct[] = [];
  let after: string | null = null;
  for (;;) {
    const data: { collection: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ProductNode[] } } | null } = await gql(PRODUCTS_QUERY, {
      id: `gid://shopify/Collection/${id}`,
      after,
    });
    const page = data.collection?.products;
    if (!page) break;
    products.push(...page.nodes.map(toProduct));
    onProgress?.(products.length);
    if (!page.pageInfo.hasNextPage) return { products, truncated: false };
    if (products.length >= max) return { products, truncated: true };
    after = page.pageInfo.endCursor;
  }
  return { products, truncated: false };
}

/** Save a collection's overrides (or remove them when nothing is overridden). */
export async function saveCollectionSettings(collectionGid: string, settings: CollectionSettings): Promise<void> {
  const clean = sanitizeCollectionSettings(settings);
  if (isDefaultCollectionSettings(clean)) {
    const data = await gql<{ metafieldsDelete: { userErrors: UserError[] } }>(DELETE_MUTATION, {
      metafields: [{ ownerId: collectionGid, namespace: COLLECTION_NAMESPACE, key: COLLECTION_KEY }],
    });
    throwUserErrors(data.metafieldsDelete.userErrors, "Couldn't reset the collection's settings");
    return;
  }
  const data = await gql<{ metafieldsSet: { userErrors: UserError[] } }>(SAVE_MUTATION, {
    metafields: [{ ownerId: collectionGid, namespace: COLLECTION_NAMESPACE, key: COLLECTION_KEY, type: "json", value: JSON.stringify(clean) }],
  });
  throwUserErrors(data.metafieldsSet.userErrors, "Couldn't save the collection's settings");
}

const COUNTS_QUERY = `#graphql
query CatalogCounts {
  withVariants: productsCount(query: "has_only_default_variant:false") { count precision }
  products: productsCount { count precision }
  collectionsCount { count precision }
}`;

export interface CatalogCounts {
  products: number;
  withVariants: number;
  collections: number;
}

export async function loadCounts(): Promise<CatalogCounts> {
  const data = await gql<{ withVariants: { count: number }; products: { count: number }; collectionsCount: { count: number } }>(COUNTS_QUERY);
  return { products: data.products.count, withVariants: data.withVariants.count, collections: data.collectionsCount.count };
}
