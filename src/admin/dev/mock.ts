/**
 * Local development only (mock.html): a fake `shopify` global and a fake
 * GraphQL Admin API backed by localStorage, so the admin can be built and
 * checked without a Shopify store. Never shipped in the production entry.
 */

type Json = any;

const STORE_KEY = "vc-mock-store-v1";
/** Theme files name the app's blocks "shopify://apps/<name Shopify picks>/blocks/<block>/<extension id>". */
const APP_SEGMENT = "variant-cards";
/** Served by the Vite dev middleware (vite.config.ts). */
const IMG = (file: string, label: string, color: string) => `/mock-img/${encodeURIComponent(file)}.jpg?c=${encodeURIComponent(color)}&l=${encodeURIComponent(label)}`;

interface MockVariant {
  id: number;
  title: string;
  options: string[];
  available: boolean;
  price: string;
  compareAtPrice: string | null;
  image: string | null;
}

interface MockProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  options: string[];
  image: string | null;
  variants: MockVariant[];
  swatches: Record<string, string>;
}

interface MockCollection {
  id: number;
  title: string;
  handle: string;
  sortOrder: string;
  productIds: number[];
  settings: string | null;
}

interface Store {
  products: MockProduct[];
  collections: MockCollection[];
  appSettings: string | null;
}

let seq = 5000;
const nextId = () => ++seq;

function product(title: string, colors: [string, string][], sizes: string[], price: number, opts: { compareAt?: number; vendor?: string; type?: string; noVariantImages?: boolean; swatches?: boolean } = {}): MockProduct {
  const id = nextId();
  const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const variants: MockVariant[] = [];
  colors.forEach(([name, color], ci) => {
    const image = opts.noVariantImages ? null : IMG(`${handle}-${name.toLowerCase().replace(/\W+/g, "-")}`, name, color);
    for (const size of sizes.length ? sizes : [null]) {
      variants.push({
        id: nextId(),
        title: size ? `${name} / ${size}` : name,
        options: size ? [name, size] : [name],
        available: !(ci === colors.length - 1 && size === sizes[sizes.length - 1]) && !(colors.length > 2 && ci === 1 && title.includes("Linen")),
        price: (price + (size === "XL" ? 5 : 0)).toFixed(2),
        compareAtPrice: opts.compareAt ? opts.compareAt.toFixed(2) : null,
        image,
      });
    }
  });
  return {
    id,
    title,
    handle,
    vendor: opts.vendor ?? "Acme Studio",
    productType: opts.type ?? "Apparel",
    options: sizes.length ? ["Color", "Size"] : ["Color"],
    image: variants[0]?.image ?? IMG(`${handle}-main`, title, "#b9b9b9"),
    variants,
    swatches: opts.swatches ? Object.fromEntries(colors.map(([name, color]) => [name, color])) : {},
  };
}

function seed(): Store {
  const products = [
    product("Classic tee", [["Red", "#d0312d"], ["Navy", "#1f2a44"], ["Heather Grey", "#a8a8a8"], ["Black/White", "#333"]], ["S", "M", "L", "XL"], 25),
    product("Linen shirt", [["Sand", "#d6c3a0"], ["Sage", "#9caf88"], ["Ocean Mist", "#7fa7b5"]], ["S", "M", "L"], 59, { compareAt: 79, swatches: true }),
    product("Everyday hoodie", [["Forest", "#2f5d3a"], ["Charcoal", "#3d3d3d"], ["Oatmeal", "#d9cdb4"]], ["S", "M", "L"], 69),
    product("Ceramic mug", [["White", "#f7f7f7"], ["Black", "#111"], ["Terracotta", "#c65d3b"]], [], 18, { type: "Home" }),
    product("Canvas tote", [["Natural", "#e9dfc9"]], [], 22, { type: "Bags" }),
    product("Wool beanie", [["Mustard", "#d4a017"], ["Rust", "#b7410e"], ["Navy", "#1f2a44"], ["Cream", "#f3ead3"]], [], 29, { type: "Accessories", noVariantImages: true }),
  ];
  for (let i = 1; i <= 30; i++) {
    products.push(product(`Sample product ${String(i).padStart(2, "0")}`, [["Blue", "#1f4fd1"], ["Green", "#2e8b3a"]], ["One size"], 15 + i));
  }
  const ids = (titles: string[]) => products.filter((p) => titles.some((t) => p.title.startsWith(t))).map((p) => p.id);
  const collections: MockCollection[] = [
    { id: 101, title: "Tops", handle: "tops", sortOrder: "MANUAL", productIds: ids(["Classic tee", "Linen shirt", "Everyday hoodie"]), settings: null },
    { id: 102, title: "Summer", handle: "summer", sortOrder: "BEST_SELLING", productIds: ids(["Linen shirt", "Classic tee", "Canvas tote", "Sample product"]), settings: null },
    { id: 103, title: "Home & living", handle: "home", sortOrder: "ALPHA_ASC", productIds: ids(["Ceramic mug", "Canvas tote"]), settings: null },
    { id: 104, title: "Accessories", handle: "accessories", sortOrder: "CREATED_DESC", productIds: ids(["Wool beanie", "Canvas tote"]), settings: null },
    { id: 105, title: "Sale", handle: "sale", sortOrder: "PRICE_ASC", productIds: ids(["Linen shirt"]), settings: null },
  ];
  return { products, collections, appSettings: null };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const fresh = seed();
  persist(fresh);
  return fresh;
}

function persist(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

const gid = (type: string, id: number) => `gid://shopify/${type}/${id}`;
const num = (g: string) => Number(/\d+$/.exec(g)?.[0] ?? 0);

function collectionNode(c: MockCollection, store: Store) {
  const first = store.products.find((p) => p.id === c.productIds[0]);
  return {
    id: gid("Collection", c.id),
    title: c.title,
    handle: c.handle,
    sortOrder: c.sortOrder,
    productsCount: { count: c.productIds.length },
    image: first?.image ? { url: first.image } : null,
    settings: c.settings ? { id: gid("Metafield", c.id), value: c.settings } : null,
  };
}

function productNode(p: MockProduct) {
  return {
    id: gid("Product", p.id),
    title: p.title,
    handle: p.handle,
    vendor: p.vendor,
    productType: p.productType,
    featuredMedia: p.image ? { preview: { image: { url: p.image } } } : null,
    options: p.options.map((name) => ({ name })),
    variants: {
      nodes: p.variants.map((v) => ({
        id: gid("ProductVariant", v.id),
        title: v.title,
        availableForSale: v.available,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        selectedOptions: p.options.map((name, i) => ({ name, value: v.options[i] })),
        image: v.image ? { url: v.image } : null,
      })),
    },
  };
}

/**
 * Theme files: the embed is on in the published theme when localStorage "vc-mock-embed" = "on";
 * another variant app's embed is on too when "vc-mock-other-app" = "on" (a variant image app always is).
 */
function themeFiles(themeId: number) {
  const embedOn = themeId === 1 && localStorage.getItem("vc-mock-embed") === "on";
  const embed = { type: `shopify://apps/${APP_SEGMENT}/blocks/vc-app-embed/0000`, disabled: !embedOn, settings: {} };
  const others = {
    o: { type: "shopify://apps/variants-on-collection/blocks/app-embed/0001", disabled: localStorage.getItem("vc-mock-other-app") !== "on", settings: {} },
    g: { type: "shopify://apps/prism-variant-images/blocks/variant-images-embed/0002", disabled: false, settings: {} },
  };
  const settingsData = { current: { blocks: themeId === 1 ? { ...(localStorage.getItem("vc-mock-embed") ? { e: embed } : {}), ...others } : {} } };
  const index = {
    sections: {
      hero: { type: "image-banner", blocks: {} },
      apps: themeId === 1 ? { type: "apps", blocks: { b: { type: `shopify://apps/${APP_SEGMENT}/blocks/vc-best-sellers/0000`, settings: {} } } } : { type: "apps", blocks: {} },
    },
  };
  return [
    { filename: "config/settings_data.json", body: { content: JSON.stringify(settingsData) } },
    { filename: "templates/index.json", body: { content: JSON.stringify(index) } },
    { filename: "templates/product.json", body: { content: JSON.stringify({ sections: {} }) } },
  ];
}

function handle(query: string, variables: Json): Json {
  const store = load();
  const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "";
  switch (op) {
    case "AppContext":
      return {
        currentAppInstallation: { id: "gid://shopify/AppInstallation/1", settings: store.appSettings ? { value: store.appSettings, updatedAt: "" } : null },
        shop: { name: "Demo store", myshopifyDomain: "demo-store.myshopify.com", primaryDomain: { url: "https://demo-store.myshopify.com" } },
      };
    case "SaveSettings": {
      const [m] = variables.metafields;
      store.appSettings = m.value;
      persist(store);
      return { metafieldsSet: { metafields: [{ id: "gid://shopify/Metafield/1", updatedAt: "" }], userErrors: [] } };
    }
    case "Themes":
      return {
        themes: {
          nodes: [
            { id: gid("OnlineStoreTheme", 1), name: "Dawn", role: "MAIN", themeStoreId: 887 },
            { id: gid("OnlineStoreTheme", 2), name: "Savor – new look", role: "UNPUBLISHED", themeStoreId: null },
          ],
        },
      };
    case "ThemeFiles": {
      const id = num(variables.id);
      return { theme: { id: variables.id, name: id === 1 ? "Dawn" : "Savor – new look", role: id === 1 ? "MAIN" : "UNPUBLISHED", themeStoreId: null, files: { nodes: themeFiles(id) } } };
    }
    case "CatalogCounts":
      return {
        withVariants: { count: store.products.filter((p) => p.variants.length > 1).length, precision: "EXACT" },
        products: { count: store.products.length, precision: "EXACT" },
        collectionsCount: { count: store.collections.length, precision: "EXACT" },
      };
    case "CollectionsList": {
      const term = String(variables.query ?? "").replace(/^title:\*|\*$/g, "").toLowerCase().trim();
      const list = store.collections.filter((c) => !term || c.title.toLowerCase().includes(term));
      return { collections: { pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }, nodes: list.map((c) => collectionNode(c, store)) } };
    }
    case "CollectionDetail": {
      const c = store.collections.find((x) => x.id === num(variables.id));
      return { collection: c ? collectionNode(c, store) : null };
    }
    case "CollectionProducts": {
      const c = store.collections.find((x) => x.id === num(variables.id));
      if (!c) return { collection: null };
      const start = Number(variables.after ?? 0);
      const ids = c.productIds.slice(start, start + 8);
      const nodes = ids.map((id) => productNode(store.products.find((p) => p.id === id)!));
      return { collection: { products: { pageInfo: { hasNextPage: start + 8 < c.productIds.length, endCursor: String(start + 8) }, nodes } } };
    }
    case "SaveCollectionSettings": {
      for (const m of variables.metafields) {
        const c = store.collections.find((x) => x.id === num(m.ownerId));
        if (c) c.settings = m.value;
      }
      persist(store);
      return { metafieldsSet: { metafields: [{ id: "gid://shopify/Metafield/2" }], userErrors: [] } };
    }
    case "DeleteCollectionSettings": {
      for (const m of variables.metafields) {
        const c = store.collections.find((x) => x.id === num(m.ownerId));
        if (c) c.settings = null;
      }
      persist(store);
      return { metafieldsDelete: { deletedMetafields: [{ key: "settings" }], userErrors: [] } };
    }
    case "ColorValues":
      return {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: store.products.map((p) => ({
            options: p.options.map((name, i) => ({
              name,
              optionValues: [...new Set(p.variants.map((v) => v.options[i]))].map((value) => ({ name: value, swatch: p.swatches[value] ? { color: p.swatches[value], image: null } : null })),
            })),
          })),
        },
      };
    default:
      throw new Error(`Mock: unknown operation ${op}`);
  }
}

const MOCK_CSS = `
ui-save-bar{display:none!important}
.vc-mock-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;padding:10px 16px;border-radius:10px;background:#303030;color:#fff;font:14px system-ui}
.vc-mock-toast.is-error{background:#8e1f0b}
.vc-mock-savebar{position:sticky;top:0;z-index:9999;display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:8px 16px;background:#1a1a1a;color:#fff;font:14px system-ui}
.vc-mock-savebar span{margin-right:auto}
.vc-mock-savebar button{font:inherit;padding:4px 12px;border-radius:8px;border:1px solid #666;background:#303030;color:#fff;cursor:pointer}
`;

function showToast(message: string, isError?: boolean) {
  const el = document.createElement("div");
  el.className = `vc-mock-toast${isError ? " is-error" : ""}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function saveBarFor(id: string) {
  const source = document.getElementById(id);
  let bar = document.getElementById(`${id}--mock`);
  if (!bar) {
    bar = document.createElement("div");
    bar.id = `${id}--mock`;
    bar.className = "vc-mock-savebar";
    const label = document.createElement("span");
    label.textContent = "Unsaved changes";
    bar.appendChild(label);
    for (const button of Array.from(source?.querySelectorAll("button") ?? [])) {
      const copy = document.createElement("button");
      copy.textContent = button.textContent;
      copy.addEventListener("click", () => button.click());
      bar.appendChild(copy);
    }
    document.body.prepend(bar);
  }
  return bar;
}

export function installMock(): void {
  const style = document.createElement("style");
  style.textContent = MOCK_CSS;
  document.head.append(style);
  const originalFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("shopify:admin/")) {
      await new Promise((r) => setTimeout(r, 150));
      const body = JSON.parse(String(init?.body ?? "{}"));
      try {
        const data = handle(body.query, body.variables ?? {});
        return new Response(JSON.stringify({ data, extensions: { cost: { requestedQueryCost: 10, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 1990, restoreRate: 100 } } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ errors: [{ message: (error as Error).message }] }), { status: 200 });
      }
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;

  (window as any).shopify = {
    config: { apiKey: "mock-api-key", shop: "demo-store.myshopify.com", locale: new URLSearchParams(location.search).get("locale") ?? "en" },
    toast: { show: (message: string, opts?: { isError?: boolean }) => showToast(message, opts?.isError) },
    saveBar: {
      show: async (id: string) => void saveBarFor(id),
      hide: async (id: string) => void document.getElementById(`${id}--mock`)?.remove(),
      toggle: async () => undefined,
      leaveConfirmation: async () => {
        if (document.querySelector(".vc-mock-savebar") && !confirm("Leave without saving?")) await new Promise(() => undefined);
      },
    },
    resourcePicker: async () => [
      { id: gid("Collection", 102), handle: "summer", title: "Summer" },
      { id: gid("Collection", 105), handle: "sale", title: "Sale" },
    ],
  };
  // Toggle the embed state with localStorage "vc-mock-embed" = "on" / "off"; reset with vcMockReset().
  (window as any).vcMockReset = () => {
    localStorage.removeItem(STORE_KEY);
    location.reload();
  };
}
