import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  DatePicker,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Modal,
  Page,
  Popover,
  ProgressBar,
  Text,
  Thumbnail,
} from "@shopify/polaris";
import { CalendarIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../lib/shop.server";
import { storage } from "../lib/storage.server";
import { getModel } from "../lib/ai/registry";

/** Merchant-facing explanation of a failed generation (shoppers never see this). */
function merchantFailureReason(code: string | null, detail: string | null): string {
  const head =
    code === "invalid_key"
      ? "Your AI provider rejected the API key — update it in Settings."
      : code === "quota"
        ? "Your AI provider account is out of credits or over its quota."
        : code === "content_rejected"
          ? "The AI provider's safety filter rejected this photo."
          : "The AI provider returned an error.";
  const extra = detail ? ` Provider says: “${detail.slice(0, 220)}”` : "";
  return head + extra;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  // Preserve the embedded-app query params (shop, host, id_token, ...) —
  // dropping them on a document redirect breaks authentication downstream.
  const { search } = new URL(request.url);
  if (!shop.onboardingCompleted) throw redirect(`/app/onboarding${search}`);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Date range from ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults: this month so far).
  const url = new URL(request.url);
  const parseDay = (value: string | null): Date | null => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  let rangeStart = parseDay(url.searchParams.get("from")) ?? startOfMonth;
  let rangeEndDay = parseDay(url.searchParams.get("to")) ?? startOfToday;
  if (rangeStart > rangeEndDay) [rangeStart, rangeEndDay] = [rangeEndDay, rangeStart];
  const rangeEndExclusive = new Date(
    rangeEndDay.getFullYear(),
    rangeEndDay.getMonth(),
    rangeEndDay.getDate() + 1,
  );
  const inRange = { gte: rangeStart, lt: rangeEndExclusive };

  const [totalAllTime, todayCount, monthTryOns, funnel, productFunnel, recent] = await Promise.all([
    prisma.tryOn.count({ where: { shopId: shop.id } }),
    prisma.tryOn.count({ where: { shopId: shop.id, createdAt: { gte: startOfToday } } }),
    prisma.tryOn.findMany({
      where: { shopId: shop.id, createdAt: inRange },
      select: {
        status: true,
        estimatedCost: true,
        productId: true,
        productTitle: true,
        productImageUrl: true,
        createdAt: true,
      },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["type", "triedOn"],
      where: { shopId: shop.id, createdAt: inRange },
      _count: true,
    }),
    prisma.analyticsEvent.groupBy({
      by: ["productId", "type", "triedOn"],
      where: { shopId: shop.id, createdAt: inRange },
      _count: true,
    }),
    prisma.tryOn.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        productTitle: true,
        productImageUrl: true,
        status: true,
        createdAt: true,
        provider: true,
        model: true,
        quality: true,
        errorCode: true,
        errorMessage: true,
        generatedImageStorageKey: true,
        photo: { select: { storageKey: true } },
        visitor: {
          select: {
            createdAt: true,
            lastSeenAt: true,
            _count: { select: { tryOns: true } },
          },
        },
      },
    }),
  ]);

  const completed = monthTryOns.filter((t) => t.status === "completed").length;
  const failed = monthTryOns.filter((t) => t.status === "failed").length;
  const finished = completed + failed;
  const estCost = monthTryOns
    .filter((t) => t.status === "completed")
    .reduce((sum, t) => sum + (t.estimatedCost ?? 0), 0);

  // Conversion funnel (selected range): add-to-cart rate with vs. without try-on.
  const funnelCount = (type: string, triedOn: boolean) =>
    funnel.find((f) => f.type === type && f.triedOn === triedOn)?._count ?? 0;
  const viewsWith = funnelCount("view", true);
  const viewsWithout = funnelCount("view", false);
  const atcWith = funnelCount("add_to_cart", true);
  const atcWithout = funnelCount("add_to_cart", false);
  const rate = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 100) : null;

  // Per-product aggregation for "Most tried products".
  const byProduct = new Map<
    string,
    { productId: string; title: string; imageUrl: string; total: number; lastAt: Date }
  >();
  for (const t of monthTryOns) {
    const entry = byProduct.get(t.productId) ?? {
      productId: t.productId,
      title: t.productTitle,
      imageUrl: t.productImageUrl,
      total: 0,
      lastAt: t.createdAt,
    };
    entry.total += 1;
    if (t.createdAt > entry.lastAt) {
      entry.lastAt = t.createdAt;
      entry.imageUrl = t.productImageUrl;
      entry.title = t.productTitle;
    }
    byProduct.set(t.productId, entry);
  }

  // Per-product conversion: add-to-cart rate among shoppers who tried it on,
  // and the baseline rate for shoppers who didn't.
  const productCount = (productId: string, type: string, triedOn: boolean) =>
    productFunnel.find(
      (f) => f.productId === productId && f.type === type && f.triedOn === triedOn,
    )?._count ?? 0;

  const topProducts = [...byProduct.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((p) => {
      const viewsWithTryOn = productCount(p.productId, "view", true);
      const atcWithTryOn = productCount(p.productId, "add_to_cart", true);
      const viewsWithoutTryOn = productCount(p.productId, "view", false);
      const atcWithoutTryOn = productCount(p.productId, "add_to_cart", false);
      return {
        title: p.title,
        imageUrl: p.imageUrl,
        total: p.total,
        addToCarts: atcWithTryOn,
        conversion: rate(atcWithTryOn, viewsWithTryOn),
        baselineConversion: rate(atcWithoutTryOn, viewsWithoutTryOn),
        lastAt: p.lastAt.toISOString(),
      };
    });

  const recentDetailed = await Promise.all(
    recent.map(async (r) => ({
      id: r.id,
      productTitle: r.productTitle,
      productImageUrl: r.productImageUrl,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      modelLabel:
        getModel(r.provider as any, r.model)?.displayName ?? r.model,
      quality: r.quality,
      failureReason: r.status === "failed" ? merchantFailureReason(r.errorCode, r.errorMessage) : null,
      personPhotoUrl: r.photo?.storageKey
        ? await storage().signedUrl(r.photo.storageKey).catch(() => null)
        : null,
      resultUrl: r.generatedImageStorageKey
        ? await storage().signedUrl(r.generatedImageStorageKey).catch(() => null)
        : null,
      visitor: {
        tryOnCount: r.visitor._count.tryOns,
        firstSeen: r.visitor.createdAt.toISOString(),
        lastSeen: r.visitor.lastSeenAt.toISOString(),
      },
    })),
  );

  const toDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return {
    range: { from: toDay(rangeStart), to: toDay(rangeEndDay) },
    stats: {
      today: todayCount,
      month: monthTryOns.length,
      total: totalAllTime,
      successRate: finished > 0 ? Math.round((completed / finished) * 100) : null,
      estCost,
      addToCarts: atcWith + atcWithout,
      atcRateWithTryOn: rate(atcWith, viewsWith),
      atcRateWithoutTryOn: rate(atcWithout, viewsWithout),
    },
    topProducts,
    recent: recentDetailed,
  };
};

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge tone="success">Completed</Badge>;
    case "failed":
      return <Badge tone="critical">Failed</Badge>;
    default:
      return <Badge tone="info">Processing</Badge>;
  }
}

function BentoTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Box background="bg-surface-secondary" padding="400" borderRadius="300">
      <BlockStack gap="100">
        <Text as="p" variant="headingXl">
          {value}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        {hint && (
          <Text as="p" variant="bodySm" tone="subdued">
            {hint}
          </Text>
        )}
      </BlockStack>
    </Box>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function DetailImage({ src, label }: { src: string | null; label: string }) {
  return (
    <BlockStack gap="100" inlineAlign="center">
      {src ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img
          src={src}
          alt={label}
          style={{
            width: "100%",
            aspectRatio: "3 / 4",
            objectFit: "cover",
            borderRadius: 10,
            background: "#f4f4f4",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            aspectRatio: "3 / 4",
            borderRadius: 10,
            background: "#f4f4f4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9a9a9a",
            fontSize: 12,
          }}
        >
          Not available
        </div>
      )}
      <Text as="p" variant="bodySm" tone="subdued">
        {label}
      </Text>
    </BlockStack>
  );
}

function parseDay(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDayParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function DateRangeButton({ range }: { range: { from: string; to: string } }) {
  const [, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const selectedStart = parseDay(range.from);
  const selectedEnd = parseDay(range.to);
  const [{ month, year }, setVisible] = useState({
    month: selectedEnd.getMonth(),
    year: selectedEnd.getFullYear(),
  });

  const label =
    range.from === range.to
      ? selectedStart.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : `${selectedStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${selectedEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <Popover
      active={open}
      onClose={() => setOpen(false)}
      preferredAlignment="right"
      activator={
        <Button icon={CalendarIcon} onClick={() => setOpen((v) => !v)} disclosure>
          {label}
        </Button>
      }
    >
      <Box padding="400">
        <DatePicker
          month={month}
          year={year}
          onMonthChange={(m, y) => setVisible({ month: m, year: y })}
          selected={{ start: selectedStart, end: selectedEnd }}
          onChange={({ start, end }) => {
            setSearchParams(
              (params) => {
                params.set("from", toDayParam(start));
                params.set("to", toDayParam(end ?? start));
                return params;
              },
              { replace: true, preventScrollReset: true },
            );
          }}
          disableDatesAfter={new Date()}
          allowRange
        />
      </Box>
    </Popover>
  );
}

export default function Analytics() {
  const data = useLoaderData<typeof loader>();
  const [openId, setOpenId] = useState<string | null>(null);
  const openItem = data.recent.find((r) => r.id === openId) ?? null;

  const tiles: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Try-ons today", value: String(data.stats.today) },
    { label: "Try-ons in period", value: String(data.stats.month) },
    { label: "Total try-ons", value: String(data.stats.total) },
    {
      label: "Success rate",
      value: data.stats.successRate != null ? `${data.stats.successRate}%` : "—",
    },
    { label: "Est. AI cost", value: `~$${data.stats.estCost.toFixed(2)}` },
    { label: "Add-to-carts", value: String(data.stats.addToCarts), hint: "on try-on products" },
    {
      label: "Add-to-cart rate",
      value: data.stats.atcRateWithTryOn != null ? `${data.stats.atcRateWithTryOn}%` : "—",
      hint: "after a try-on",
    },
    {
      label: "Add-to-cart rate",
      value: data.stats.atcRateWithoutTryOn != null ? `${data.stats.atcRateWithoutTryOn}%` : "—",
      hint: "without a try-on",
    },
  ];

  return (
    <Page>
      <TitleBar title="Analytics" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {/* Bento grid: one stat per box */}
              <BlockStack gap="200">
                <InlineStack align="end">
                  <DateRangeButton range={data.range} />
                </InlineStack>
                <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
                  {tiles.map((tile) => (
                    <BentoTile key={tile.label + (tile.hint ?? "")} {...tile} />
                  ))}
                </InlineGrid>
              </BlockStack>

              {/* Most tried products */}
              {data.topProducts.length > 0 && (
                <Card>
                  <BlockStack gap="400">
                    <Text as="h3" variant="headingSm">
                      Most tried products
                    </Text>
                    <BlockStack gap="300">
                      {data.topProducts.map((p) => (
                        <Box
                          key={p.title}
                          background="bg-surface-secondary"
                          padding="300"
                          borderRadius="300"
                        >
                          <InlineStack gap="400" blockAlign="center" wrap={false}>
                            <Thumbnail source={p.imageUrl} alt={p.title} size="medium" />
                            <Box width="100%">
                              <BlockStack gap="200">
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                                    {p.title}
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Last tried {formatTime(p.lastAt)}
                                  </Text>
                                </InlineStack>
                                <InlineStack gap="400">
                                  <Text as="p" variant="bodySm">
                                    <Text as="span" fontWeight="semibold">
                                      {p.total}
                                    </Text>{" "}
                                    try-on{p.total === 1 ? "" : "s"}
                                  </Text>
                                  <Text as="p" variant="bodySm">
                                    <Text as="span" fontWeight="semibold">
                                      {p.conversion != null ? `${p.conversion}%` : "—"}
                                    </Text>{" "}
                                    add to cart after try-on
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {p.baselineConversion != null
                                      ? `${p.baselineConversion}% without`
                                      : "no baseline yet"}
                                  </Text>
                                </InlineStack>
                                <ProgressBar size="small" progress={p.conversion ?? 0} />
                              </BlockStack>
                            </Box>
                          </InlineStack>
                        </Box>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}

              {/* Recent activity */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Recent activity
                  </Text>
                  {data.recent.length === 0 ? (
                    <Text as="p" tone="subdued" variant="bodySm">
                      No try-ons yet. Open a product page and click "Try It On" to test it.
                    </Text>
                  ) : (
                    <BlockStack gap="0">
                      {data.recent.map((r, i) => (
                        <BlockStack key={r.id} gap="0">
                          {i > 0 && <Divider />}
                          <Box paddingBlock="200">
                            <InlineStack align="space-between" blockAlign="center" wrap={false}>
                              <InlineStack gap="300" blockAlign="center" wrap={false}>
                                <Thumbnail
                                  source={r.productImageUrl}
                                  alt={r.productTitle}
                                  size="small"
                                />
                                <BlockStack gap="050">
                                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                                    {r.productTitle}
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {formatTime(r.createdAt)}
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                              <InlineStack gap="200" blockAlign="center" wrap={false}>
                                {statusBadge(r.status)}
                                <Button size="slim" onClick={() => setOpenId(r.id)}>
                                  Open
                                </Button>
                              </InlineStack>
                            </InlineStack>
                          </Box>
                        </BlockStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {openItem && (
        <Modal
          open
          onClose={() => setOpenId(null)}
          title={openItem.productTitle}
          size="small"
        >
          <Modal.Section>
            <BlockStack gap="400">
              <InlineStack gap="200" blockAlign="center">
                {statusBadge(openItem.status)}
                <Badge>{openItem.modelLabel}</Badge>
                <Text as="p" variant="bodySm" tone="subdued">
                  {formatTime(openItem.createdAt)}
                </Text>
              </InlineStack>
              {openItem.failureReason && (
                <Box background="bg-surface-critical" padding="300" borderRadius="300">
                  <Text as="p" variant="bodySm">
                    {openItem.failureReason}
                  </Text>
                </Box>
              )}
              <InlineGrid columns={3} gap="300">
                <DetailImage src={openItem.personPhotoUrl} label="Shopper photo" />
                <DetailImage src={openItem.productImageUrl} label="Product" />
                <DetailImage src={openItem.resultUrl} label="Result" />
              </InlineGrid>
              <Divider />
              <BlockStack gap="100">
                <Text as="h4" variant="headingSm">
                  Shopper
                </Text>
                <Text as="p" variant="bodySm">
                  {openItem.visitor.tryOnCount} try-on
                  {openItem.visitor.tryOnCount === 1 ? "" : "s"} in total · first seen{" "}
                  {formatDate(openItem.visitor.firstSeen)} · last seen{" "}
                  {formatDate(openItem.visitor.lastSeen)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Shoppers are anonymous — this is everything we know about them.
                </Text>
              </BlockStack>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
