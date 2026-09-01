import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Icon,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
  Thumbnail,
} from "@shopify/polaris";
import {
  AlertCircleIcon,
  ChartVerticalIcon,
  CheckCircleIcon,
  KeyIcon,
  PaintBrushFlatIcon,
  ProductIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../lib/shop.server";
import { getModel } from "../lib/ai/registry";
import { getProvider } from "../lib/ai/index.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  // Preserve the embedded-app query params (shop, host, id_token, ...) —
  // dropping them on a document redirect breaks authentication downstream.
  const { search } = new URL(request.url);
  if (!shop.onboardingCompleted) throw redirect(`/app/onboarding${search}`);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [settings, credentials, totalTryOns, todayTryOns, lastTryOn] = await Promise.all([
    prisma.shopSettings.findUnique({ where: { shopId: shop.id } }),
    prisma.aIProviderCredential.findMany({ where: { shopId: shop.id } }),
    prisma.tryOn.count({ where: { shopId: shop.id } }),
    prisma.tryOn.count({ where: { shopId: shop.id, createdAt: { gte: startOfToday } } }),
    prisma.tryOn.findFirst({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      select: {
        productTitle: true,
        productImageUrl: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  const providerId = settings?.provider ?? null;
  const provider = providerId ? getProvider(providerId) : undefined;
  const model =
    providerId && settings?.model ? getModel(providerId as any, settings.model) : undefined;
  const credential = credentials.find((c) => c.provider === providerId);

  const selection = JSON.parse(settings?.productSelectionJson || "[]") as string[];

  return {
    ai: {
      connected: Boolean(provider && settings?.model && credential),
      providerName: provider?.displayName ?? null,
      modelName: model?.displayName ?? settings?.model ?? null,
      quality: settings?.quality ?? "medium",
      maskedKey: credential?.maskedKey ?? null,
    },
    stats: {
      total: totalTryOns,
      today: todayTryOns,
      last: lastTryOn
        ? {
            productTitle: lastTryOn.productTitle,
            productImageUrl: lastTryOn.productImageUrl,
            status: lastTryOn.status,
            createdAt: lastTryOn.createdAt.toISOString(),
          }
        : null,
    },
    availability: {
      mode: settings?.productAvailabilityMode ?? "all",
      selectionCount: selection.length,
    },
  };
};

/** Uniform card header: icon + title (+ optional badge) left, action right. */
function SectionHeader({
  icon,
  title,
  badge,
  action,
}: {
  icon: typeof KeyIcon;
  title: string;
  badge?: React.ReactNode;
  action?: { label: string; to: string; primary?: boolean };
}) {
  return (
    <InlineStack align="space-between" blockAlign="center" wrap={false}>
      <InlineStack gap="200" blockAlign="center">
        <Icon source={icon} tone="subdued" />
        <Text as="h3" variant="headingSm">
          {title}
        </Text>
        {badge}
      </InlineStack>
      {action && (
        <Link to={action.to}>
          <Button size="slim" variant={action.primary ? "primary" : "secondary"}>
            {action.label}
          </Button>
        </Link>
      )}
    </InlineStack>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text as="p" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <Text as="p" variant="bodyMd" fontWeight="semibold">
        {value}
      </Text>
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text as="p" variant="headingXl">
        {value}
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">
        {label}
      </Text>
    </Box>
  );
}

export default function Home() {
  const data = useLoaderData<typeof loader>();

  const availabilityLabel =
    data.availability.mode === "all"
      ? "Live on all products"
      : data.availability.mode === "include"
        ? `Live on ${data.availability.selectionCount} selected product${data.availability.selectionCount === 1 ? "" : "s"}`
        : `Live on all products except ${data.availability.selectionCount}`;

  return (
    <Page>
      <TitleBar title="Virtual Try-On" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {/* AI provider & API key */}
              <Card>
                <BlockStack gap="400">
                  <SectionHeader
                    icon={KeyIcon}
                    title="AI provider"
                    badge={
                      data.ai.connected ? (
                        <Badge tone="success">Connected</Badge>
                      ) : (
                        <Badge tone="attention">Setup needed</Badge>
                      )
                    }
                    action={{
                      label: data.ai.connected ? "Manage" : "Connect AI",
                      to: "/app/settings",
                      primary: !data.ai.connected,
                    }}
                  />
                  {data.ai.connected ? (
                    <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
                      <InfoItem label="Provider" value={data.ai.providerName ?? "—"} />
                      <InfoItem label="Model" value={data.ai.modelName ?? "—"} />
                      <InfoItem
                        label="Quality"
                        value={data.ai.quality[0].toUpperCase() + data.ai.quality.slice(1)}
                      />
                      <InfoItem label="API key" value={data.ai.maskedKey ?? "—"} />
                    </InlineGrid>
                  ) : (
                    <Text as="p" tone="subdued">
                      Connect an AI provider so shoppers can generate try-ons.
                    </Text>
                  )}
                </BlockStack>
              </Card>

              {/* Try-on activity */}
              <Card>
                <BlockStack gap="400">
                  <SectionHeader
                    icon={ChartVerticalIcon}
                    title="Try-ons"
                    action={{ label: "Full analytics", to: "/app/dashboard" }}
                  />
                  <InlineGrid columns={2} gap="400">
                    <Box
                      background="bg-surface-secondary"
                      padding="400"
                      borderRadius="300"
                    >
                      <Stat label="Total try-ons" value={String(data.stats.total)} />
                    </Box>
                    <Box
                      background="bg-surface-secondary"
                      padding="400"
                      borderRadius="300"
                    >
                      <Stat label="Today" value={String(data.stats.today)} />
                    </Box>
                  </InlineGrid>
                  {data.stats.last ? (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Latest try-on
                      </Text>
                      <InlineStack gap="300" blockAlign="center" wrap={false}>
                        <Thumbnail
                          source={data.stats.last.productImageUrl}
                          alt={data.stats.last.productTitle}
                          size="small"
                        />
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {data.stats.last.productTitle}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {new Date(data.stats.last.createdAt).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    </BlockStack>
                  ) : (
                    <Text as="p" variant="bodySm" tone="subdued">
                      No try-ons yet. Open a product page and click "Try It On" to test it.
                    </Text>
                  )}
                </BlockStack>
              </Card>

              {/* Product availability + widget design, side by side */}
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                <Card>
                  <BlockStack gap="400">
                    <SectionHeader
                      icon={ProductIcon}
                      title="Availability"
                      action={{ label: "Manage", to: "/app/settings" }}
                    />
                    {/* Icon wrapped in Box: Polaris Icon has margin:auto and
                        floats to the row's center when left bare in a flex row. */}
                    <InlineStack gap="150" blockAlign="center" wrap={false}>
                      <Box>
                        <Icon
                          source={
                            data.availability.mode === "all" ? CheckCircleIcon : AlertCircleIcon
                          }
                          tone={data.availability.mode === "all" ? "success" : "caution"}
                        />
                      </Box>
                      <Text as="p" fontWeight="semibold">
                        {availabilityLabel}
                      </Text>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Choose which products show the Try It On button.
                    </Text>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="400">
                    <SectionHeader
                      icon={PaintBrushFlatIcon}
                      title="Widget design"
                      action={{ label: "Edit", to: "/app/design" }}
                    />
                    <Text as="p" variant="bodySm" tone="subdued">
                      Customize how the Try It On button and widget look on your
                      storefront.
                    </Text>
                  </BlockStack>
                </Card>
              </InlineGrid>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
