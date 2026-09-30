/**
 * Local development only (mock.html): a fake `shopify` global and a fake
 * GraphQL Admin API backed by localStorage, so the admin UI can be built and
 * tested without a Shopify store. Never shipped in the production entry.
 */

type Json = any;

const STORE_KEY = "pvi-mock-store-v1";
/** Served by the Vite dev middleware (vite.config.ts); the file name is in the path like on Shopify's CDN. */
const IMG = (file: string, label: string, color: string) =>
  `/mock-img/${encodeURIComponent(file)}.jpg?c=${encodeURIComponent(color)}&l=${encodeURIComponent(label)}`;

interface MockProduct {
  id: number;
  title: string;
  handle: string;
  options: { id: number; name: string; values: { id: number; name: string; color?: string | null }[] }[];
  media: { id: number; alt: string; url: string; type: string }[];
  variants: { id: number; title: string; values: string[]; mediaId: number | null; available: boolean }[];
  metafields: Record<string, { value: string; digest: string; updatedAt: string }>;
}

let seq = 1000;
const nextId = () => ++seq;

function product(title: string, colors: [string, string][], sizes: string[], imagesPerColor: number, opts: { alt?: boolean; variantImages?: boolean; hero?: boolean; fileNames?: boolean } = {}): MockProduct {
  const id = nextId();
  const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const colorOption = { id: nextId(), name: "Color", values: colors.map(([name]) => ({ id: nextId(), name })) };
  const sizeOption = sizes.length ? { id: nextId(), name: "Size", values: sizes.map((name) => ({ id: nextId(), name })) } : null;
  const media: MockProduct["media"] = [];
  if (opts.hero !== false) media.push({ id: nextId(), alt: `${title} lifestyle`, url: IMG(`${handle}-lifestyle`, "lifestyle", "#b9b9b9"), type: "IMAGE" });
  const firstImage = new Map<string, number>();
  for (const [name, color] of colors) {
    for (let i = 1; i <= imagesPerColor; i++) {
      const mid = nextId();
      const label = `${name} ${i}`;
      const file = opts.fileNames ? `${handle}-${name.toLowerCase().replace(/\W+/g, "-")}-${i}` : `IMG_${mid}`;
      media.push({ id: mid, alt: opts.alt ? `${name} – view ${i}` : "", url: IMG(file, label, color), type: "IMAGE" });
      if (i === 1) firstImage.set(name, mid);
    }
  }
  media.push({ id: nextId(), alt: "Size chart", url: IMG(`${handle}-size-chart`, "size chart", "#ffffff"), type: "IMAGE" });
  const variants: MockProduct["variants"] = [];
  for (const [name] of colors) {
    for (const size of sizes.length ? sizes : [null]) {
      variants.push({
        id: nextId(),
        title: size ? `${name} / ${size}` : name,
        values: size ? [name, size] : [name],
        mediaId: opts.variantImages === false ? null : firstImage.get(name) ?? null,
        available: !(name === colors[colors.length - 1][0] && size === sizes[sizes.length - 1]),
      });
    }
  }
  return { id, title, handle, options: sizeOption ? [colorOption, sizeOption] : [colorOption], media, variants, metafields: {} };
}

function seed(): { products: MockProduct[]; appMetafields: Record<string, { value: string }> } {
  const products = [
    product("Classic tee", [["Red", "#d0312d"], ["Navy", "#1f2a44"], ["Heather Grey", "#a8a8a8"], ["Black/White", "#333"]], ["S", "M", "L"], 2),
    product("Linen shirt", [["Sand", "#d6c3a0"], ["Sage", "#9caf88"], ["Ocean Mist", "#7fa7b5"]], ["S", "M", "L", "XL"], 3, { alt: true, variantImages: false }),
    product("Ceramic mug", [["White", "#f7f7f7"], ["Black", "#111"], ["Terracotta", "#c65d3b"]], [], 2, { fileNames: true, variantImages: false, hero: false }),
    product("Canvas tote", [["Natural", "#e9dfc9"]], [], 2),
  ];
  for (let i = 1; i <= 57; i++) {
    products.push(product(`Sample product ${String(i).padStart(2, "0")}`, [["Blue", "#1f4fd1"], ["Green", "#2e8b3a"]], ["One size"], 1));
  }
  return { products, appMetafields: {} };
}

function load(): ReturnType<typeof seed> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(store: ReturnType<typeof seed>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

const gid = (type: string, id: number) => `gid://shopify/${type}/${id}`;
const num = (g: string) => Number(/\d+$/.exec(g)?.[0] ?? 0);
const now = () => new Date().toISOString();

function metafieldNode(p: MockProduct, ns: string, key: string) {
  const m = p.metafields[`${ns}.${key}`];
  return m ? { id: gid("Metafield", p.id), value: m.value, compareDigest: m.digest, updatedAt: m.updatedAt } : null;
}

function handle(query: string, variables: Json): Json {
  const store = load();
  const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "";
  switch (op) {
    case "AppContext":
      return {
        currentAppInstallation: {
          id: "gid://shopify/AppInstallation/1",
          settings: store.appMetafields["variant_images.settings"] ?? null,
        },
        shop: { name: "Demo Store", myshopifyDomain: "demo-store.myshopify.com", primaryDomain: { url: "https://demo-store.example" } },
      };
    case "MainTheme":
      return {
        themes: {
          nodes: [
            {
              id: gid("OnlineStoreTheme", 1),
              name: "Dawn",
              themeStoreId: 887,
              files: {
                nodes: [
                  {
                    filename: "config/settings_data.json",
                    body: { content: JSON.stringify({ current: { blocks: localStorage.getItem("pvi-mock-embed") === "on" ? { a: { type: "shopify://apps/prism/blocks/variant-images-embed/1", disabled: false } } : {} } }) },
                  },
                  { filename: "templates/product.json", body: { content: JSON.stringify({ sections: { main: { type: "main-product", settings: { hide_variants: false } } } }) } },
                ],
              },
            },
          ],
        },
      };
    case "Counts":
      return { productsCount: { count: store.products.length, precision: "EXACT" } };
    case "ProductsList": {
      let list = store.products;
      const q: string | null = variables.query;
      if (q) {
        if (q.includes("has_only_default_variant:false")) list = list.filter((p) => p.variants.length > 1);
        const term = q.replace("has_only_default_variant:false", "").trim().replace(/^"|"$/g, "").toLowerCase();
        if (term) list = list.filter((p) => p.title.toLowerCase().includes(term));
      }
      const size = variables.first ?? variables.last ?? 25;
      let start = 0;
      if (variables.after) start = Number(variables.after);
      if (variables.before) start = Math.max(0, Number(variables.before) - size);
      const slice = list.slice(start, start + size);
      return {
        products: {
          pageInfo: {
            hasNextPage: start + size < list.length,
            hasPreviousPage: start > 0,
            startCursor: String(start),
            endCursor: String(start + slice.length),
          },
          nodes: slice.map((p) => ({
            id: gid("Product", p.id),
            title: p.title,
            handle: p.handle,
            status: "ACTIVE",
            featuredMedia: p.media[0] ? { preview: { image: { url: p.media[0].url, altText: "" } } } : null,
            mediaCount: { count: p.media.length },
            variantsCount: { count: p.variants.length },
            options: p.options.map((o) => ({ id: gid("ProductOption", o.id), name: o.name })),
            config: metafieldNode(p, "$app:variant_images", "data"),
          })),
        },
      };
    }
    case "ProductDetail": {
      const p = store.products.find((x) => x.id === num(variables.id));
      if (!p) return { product: null };
      return {
        product: {
          id: gid("Product", p.id),
          title: p.title,
          handle: p.handle,
          status: "ACTIVE",
          onlineStoreUrl: `https://demo-store.example/products/${p.handle}`,
          onlineStorePreviewUrl: null,
          options: p.options.map((o, i) => ({
            id: gid("ProductOption", o.id),
            name: o.name,
            position: i + 1,
            optionValues: o.values.map((v) => ({ id: gid("ProductOptionValue", v.id), name: v.name, hasVariants: true, swatch: null })),
          })),
          media: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: p.media.map((m) => ({ id: gid("MediaImage", m.id), alt: m.alt, mediaContentType: m.type, status: "READY", preview: { image: { url: m.url, width: 400, height: 400 } } })),
          },
          variants: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: p.variants.map((v) => ({
              id: gid("ProductVariant", v.id),
              title: v.title,
              availableForSale: v.available,
              sku: null,
              selectedOptions: v.values.map((value, i) => {
                const option = p.options[i];
                const ov = option.values.find((x) => x.name === value)!;
                return { name: option.name, value, optionValue: { id: gid("ProductOptionValue", ov.id) } };
              }),
              media: { nodes: v.mediaId ? [{ id: gid("MediaImage", v.mediaId) }] : [] },
            })),
          },
          config: metafieldNode(p, "$app:variant_images", "data"),
        },
      };
    }
    case "SaveVariantImages":
    case "SaveSettings": {
      const out: Json[] = [];
      for (const input of variables.metafields) {
        const record = { value: input.value, digest: Math.random().toString(36).slice(2), updatedAt: now() };
        if (String(input.ownerId).includes("AppInstallation")) {
          store.appMetafields[`${input.namespace}.${input.key}`] = { value: input.value };
        } else {
          const p = store.products.find((x) => x.id === num(input.ownerId));
          if (!p) continue;
          const existing = p.metafields[`${input.namespace}.${input.key}`];
          if (input.compareDigest && existing && existing.digest !== input.compareDigest) {
            return { metafieldsSet: { metafields: [], userErrors: [{ field: ["compareDigest"], message: "The metafield has been modified since it was loaded.", code: "STALE_OBJECT" }] } };
          }
          p.metafields[`${input.namespace}.${input.key}`] = record;
        }
        out.push({ id: gid("Metafield", 1), compareDigest: record.digest, updatedAt: record.updatedAt });
      }
      save(store);
      return { metafieldsSet: { metafields: out, userErrors: [] } };
    }
    case "DeleteVariantImages": {
      for (const input of variables.metafields) {
        const p = store.products.find((x) => x.id === num(input.ownerId));
        if (p) delete p.metafields[`${input.namespace}.${input.key}`];
      }
      save(store);
      return { metafieldsDelete: { deletedMetafields: [], userErrors: [] } };
    }
    case "SyncVariantImages": {
      const p = store.products.find((x) => x.id === num(variables.productId));
      for (const change of variables.variants) {
        const v = p?.variants.find((x) => x.id === num(change.id));
        if (v) v.mediaId = num(change.mediaId);
      }
      save(store);
      return { productVariantsBulkUpdate: { userErrors: [] } };
    }
    case "ConfiguredProducts":
      return {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: store.products.map((p) => ({ id: gid("Product", p.id), config: metafieldNode(p, "$app:variant_images", "data") })),
        },
      };
    case "ColorValues":
      return {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: store.products.map((p) => ({
            options: p.options.map((o) => ({ name: o.name, optionValues: o.values.map((v) => ({ name: v.name, swatch: null })) })),
          })),
        },
      };
    default:
      throw new Error(`Mock: unknown operation ${op}`);
  }
}

function showToast(message: string, isError?: boolean) {
  const el = document.createElement("div");
  el.className = `pvi-mock-toast${isError ? " is-error" : ""}`;
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
    bar.className = "pvi-mock-savebar";
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
  const originalFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("shopify:admin/")) {
      await new Promise((r) => setTimeout(r, 120));
      const body = JSON.parse(String(init?.body ?? "{}"));
      try {
        const data = handle(body.query, body.variables ?? {});
        return new Response(JSON.stringify({ data, extensions: { cost: { requestedQueryCost: 10, throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 990, restoreRate: 50 } } } }), {
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
        if (document.querySelector(".pvi-mock-savebar") && !confirm("Leave without saving?")) await new Promise(() => undefined);
      },
    },
  };
  // Handy for the embed-status step: toggle with localStorage "pvi-mock-embed" = "on".
  (window as any).pviMockReset = () => {
    localStorage.removeItem(STORE_KEY);
    location.reload();
  };
}
