import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
  Thumbnail,
} from "@shopify/polaris";
import { ImageIcon, PlusIcon, XSmallIcon } from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../lib/shop.server";

/**
 * Products page: where merchants choose which products offer Virtual Try-On.
 * Changes save automatically — no Save button to forget.
 */

interface SelectedProduct {
  id: string;
  title: string;
  imageUrl: string | null;
  status: string;
}

const PRODUCTS_QUERY = `#graphql
  query TryOnSelectedProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        status
        featuredImage { url(transform: { maxWidth: 120, maxHeight: 120 }) }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await prisma.shopSettings.findUniqueOrThrow({
    where: { shopId: shop.id },
  });

  let selection: string[] = [];
  try {
    const parsed = JSON.parse(settings.productSelectionJson || "[]");
    if (Array.isArray(parsed)) selection = parsed.map(String);
  } catch {
    selection = [];
  }

  let products: SelectedProduct[] = [];
  if (selection.length > 0) {
    try {
      const response = await admin.graphql(PRODUCTS_QUERY, {
        variables: {
          ids: selection.slice(0, 250).map((id) => `gid://shopify/Product/${id}`),
        },
      });
      const body = (await response.json()) as any;
      products = (body?.data?.nodes ?? [])
        .filter((n: any) => n?.id)
        .map((n: any) => ({
          id: n.id.replace("gid://shopify/Product/", ""),
          title: n.title ?? "",
          imageUrl: n.featuredImage?.url ?? null,
          status: n.status ?? "ACTIVE",
        }));
    } catch (error) {
      console.error("Failed to load selected products:", (error as Error)?.message);
    }
  }

  return {
    mode: settings.productAvailabilityMode,
    selection,
    products,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const form = await request.formData();

  const mode = String(form.get("mode") ?? "all");
  let selection: string[] = [];
  try {
    const parsed = JSON.parse(String(form.get("selection") ?? "[]"));
    if (Array.isArray(parsed)) {
      selection = parsed
        .map(String)
        .filter((s) => /^\d{1,20}$/.test(s))
        .slice(0, 500);
    }
  } catch {
    selection = [];
  }

  await prisma.shopSettings.update({
    where: { shopId: shop.id },
    data: {
      productAvailabilityMode: ["all", "include", "exclude"].includes(mode) ? mode : "all",
      productSelectionJson: JSON.stringify(selection),
    },
  });

  return { ok: true };
};

const MODES = [
  {
    id: "all",
    title: "All products",
    description: "Shoppers can try on anything in your store.",
  },
  {
    id: "include",
    title: "Only selected products",
    description: "Show the Try-On button only on products you pick.",
  },
  {
    id: "exclude",
    title: "All except selected",
    description: "Show it everywhere except the products you pick.",
  },
] as const;

export default function Products() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [mode, setMode] = useState(data.mode);
  const [selection, setSelection] = useState<string[]>(data.selection);
  const skipFirstSave = useRef(true);

  // Auto-save whenever the mode or selection changes.
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    fetcher.submit(
      { mode, selection: JSON.stringify(selection) },
      { method: "post" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selection]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      shopify.toast.show("Saved");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const pickProducts = async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      selectionIds: selection.map((id) => ({ id: `gid://shopify/Product/${id}` })),
    });
    if (selected) {
      setSelection(
        selected.map((p: { id: string }) => p.id.replace("gid://shopify/Product/", "")),
      );
    }
  };

  const removeProduct = (id: string) => {
    setSelection((current) => current.filter((s) => s !== id));
  };

  // Products we have details for, in selection order; picker-added items we
  // haven't reloaded yet show as pending rows.
  const detailById = new Map(data.products.map((p) => [p.id, p]));

  return (
    <Page title="Products" subtitle="Choose where the Try-On button appears">
      <TitleBar title="Products" />
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            {MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  style={{
                    appearance: "none",
                    fontFamily: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                    width: "100%",
                    background: active
                      ? "var(--p-color-bg-surface-secondary-active, #f1f1f1)"
                      : "var(--p-color-bg-surface, #fff)",
                    border: active
                      ? "2px solid var(--p-color-border-emphasis, #111)"
                      : "1px solid var(--p-color-border, #e3e3e3)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    transition: "border-color 0.12s ease, background 0.12s ease",
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      flexShrink: 0,
                      border: active
                        ? "6px solid var(--p-color-border-emphasis, #111)"
                        : "2px solid var(--p-color-border, #c9c9c9)",
                      background: "#fff",
                      boxSizing: "border-box",
                    }}
                  />
                  <span>
                    <Text as="p" fontWeight="semibold">
                      {m.title}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {m.description}
                    </Text>
                  </span>
                </button>
              );
            })}
          </BlockStack>
        </Card>

        {mode !== "all" && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingSm">
                    {mode === "include" ? "Selected products" : "Excluded products"}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {selection.length === 0
                      ? mode === "include"
                        ? "No products selected yet — the button won't appear anywhere until you pick some."
                        : "No products excluded yet."
                      : `${selection.length} product${selection.length === 1 ? "" : "s"}`}
                  </Text>
                </BlockStack>
                <Button icon={PlusIcon} onClick={pickProducts}>
                  {selection.length ? "Edit selection" : "Choose products"}
                </Button>
              </InlineStack>

              {selection.length > 0 && (
                <BlockStack gap="150">
                  {selection.map((id) => {
                    const product = detailById.get(id);
                    return (
                      <Box
                        key={id}
                        padding="200"
                        borderWidth="025"
                        borderColor="border"
                        borderRadius="300"
                      >
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          <Thumbnail
                            source={product?.imageUrl || ImageIcon}
                            alt={product?.title ?? "Product"}
                            size="small"
                          />
                          <BlockStack gap="050">
                            <Text as="p" fontWeight="medium">
                              {product?.title ?? "Loading…"}
                            </Text>
                            {product && product.status !== "ACTIVE" && (
                              <Badge size="small" tone="attention">
                                {product.status === "DRAFT" ? "Draft" : "Archived"}
                              </Badge>
                            )}
                          </BlockStack>
                          <div style={{ marginLeft: "auto" }}>
                            <Button
                              icon={XSmallIcon}
                              variant="tertiary"
                              accessibilityLabel={`Remove ${product?.title ?? "product"}`}
                              onClick={() => removeProduct(id)}
                            />
                          </div>
                        </InlineStack>
                      </Box>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        )}

        <Text as="p" variant="bodySm" tone="subdued">
          Changes save automatically.
        </Text>
      </BlockStack>
    </Page>
  );
}
