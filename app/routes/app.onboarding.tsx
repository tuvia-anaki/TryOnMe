import { useCallback, useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Icon,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ExternalIcon,
  PlusCircleIcon,
  PlusIcon,
  QuestionCircleIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../lib/shop.server";
import { getThemeStatus, themeEditorLinks } from "../lib/theme.server";
import { connectProvider } from "../lib/credentials.server";
import { allProviders } from "../lib/ai/index.server";
import {
  cheapestTryOnCost,
  getModel,
  isModelSelectable,
} from "../lib/ai/registry";
import { PROVIDER_CAPTIONS, PROVIDER_RECOMMENDED, ProviderMark } from "../components/ProviderMark";
import { LANGUAGES, isRtl, isValidLanguage } from "../lib/i18n/languages";
import { t } from "../lib/i18n/translations";
import { openSupportChat } from "../lib/support-chat.client";

const TOTAL_STEPS = 4;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const [settings, credentials, themeStatus] = await Promise.all([
    prisma.shopSettings.findUniqueOrThrow({ where: { shopId: shop.id } }),
    prisma.aIProviderCredential.findMany({ where: { shopId: shop.id } }),
    getThemeStatus(admin),
  ]);

  let selection: string[] = [];
  try {
    const parsed = JSON.parse(settings.productSelectionJson || "[]");
    if (Array.isArray(parsed)) selection = parsed.map(String);
  } catch {
    selection = [];
  }

  // Details for the saved selection so step 4 can render a product grid.
  let selectionDetails: Array<{ id: string; title: string; imageUrl: string | null }> = [];
  if (selection.length > 0) {
    try {
      const res = await admin.graphql(
        `#graphql
        query TryOnOnboardingSelection($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product { id title featuredImage { url(transform: { maxWidth: 200, maxHeight: 200 }) } }
          }
        }`,
        { variables: { ids: selection.slice(0, 250).map((id) => `gid://shopify/Product/${id}`) } },
      );
      const body = (await res.json()) as any;
      selectionDetails = (body?.data?.nodes ?? [])
        .filter((n: any) => n?.id)
        .map((n: any) => ({
          id: n.id.replace("gid://shopify/Product/", ""),
          title: n.title ?? "",
          imageUrl: n.featuredImage?.url ?? null,
        }));
    } catch (error) {
      console.error("Selection details fetch failed:", (error as Error)?.message);
    }
  }

  const providerCards = allProviders()
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      caption: PROVIDER_CAPTIONS[p.id] ?? "",
      recommended: PROVIDER_RECOMMENDED[p.id] === true,
      implemented: p.implemented,
      keyPlaceholder: p.keyPlaceholder,
      keyHelpUrl: p.keyHelpUrl,
      price: cheapestTryOnCost(p.id),
    }))
    .sort((a, b) => {
      // Recommended provider first, then cheapest.
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    });

  const providerModels = Object.fromEntries(
    allProviders().map((p) => [
      p.id,
      p.getModels().map((m) => ({
        modelId: m.modelId,
        displayName: m.displayName,
        description: m.description,
        recommended: m.recommended,
        selectable: m.enabled && m.capabilities.supportsVirtualTryOn,
        qualityOptions: m.qualityOptions,
        defaultQuality: m.defaultQuality,
        pricing: m.pricing,
      })),
    ]),
  );

  return {
    language: shop.language,
    shopDomain: session.shop,
    themeStatus,
    editorLinks: themeEditorLinks(session.shop),
    connectedProviders: credentials.map((c) => ({ provider: c.provider, maskedKey: c.maskedKey })),
    settings: {
      provider: settings.provider,
      model: settings.model,
      quality: settings.quality,
      visitorDailyLimit: settings.visitorDailyLimit,
      productAvailabilityMode: settings.productAvailabilityMode,
      selection,
    },
    selectionDetails,
    providerCards,
    providerModels,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const form = await request.formData();
  const intent = form.get("intent");
  const { search } = new URL(request.url);

  if (intent === "language") {
    const language = String(form.get("language") ?? "en");
    await prisma.shop.update({
      where: { id: shop.id },
      data: { language: isValidLanguage(language) ? language : "en" },
    });
    return { intent, ok: true, message: null };
  }

  if (intent === "usage") {
    const visitorDailyLimit = Math.max(0, Math.min(1000, Number(form.get("visitorDailyLimit")) || 0));
    const mode = String(form.get("mode") ?? "all");
    let selection: string[] = [];
    try {
      const parsed = JSON.parse(String(form.get("selection") ?? "[]"));
      if (Array.isArray(parsed)) {
        selection = parsed.map(String).filter((s) => /^\d{1,20}$/.test(s)).slice(0, 500);
      }
    } catch {
      selection = [];
    }
    await prisma.shopSettings.update({
      where: { shopId: shop.id },
      data: {
        visitorDailyLimit,
        productAvailabilityMode: ["all", "include", "exclude"].includes(mode) ? mode : "all",
        productSelectionJson: JSON.stringify(selection),
      },
    });
    return { intent, ok: true, message: null };
  }

  if (intent === "connect") {
    const provider = String(form.get("provider") ?? "");
    const apiKey = String(form.get("apiKey") ?? "");
    const result = await connectProvider(shop.id, provider, apiKey);
    if (!result.ok) return { intent, ok: false, message: result.message };
    return { intent, ok: true, message: null };
  }

  // Final step: save the chosen model (when given) and complete onboarding.
  if (intent === "finish" || intent === "complete") {
    if (intent === "finish") {
      const provider = String(form.get("provider") ?? "");
      const model = String(form.get("model") ?? "");
      const quality = String(form.get("quality") ?? "medium");
      if (!isModelSelectable(provider as any, model)) {
        return { intent, ok: false, message: "That model doesn't support virtual try-on." };
      }
      const modelInfo = getModel(provider as any, model);
      await prisma.shopSettings.update({
        where: { shopId: shop.id },
        data: {
          provider,
          model,
          quality: modelInfo?.qualityOptions.some((q) => q.id === quality)
            ? quality
            : (modelInfo?.defaultQuality ?? "medium"),
        },
      });
    }
    await prisma.shop.update({
      where: { id: shop.id },
      data: { onboardingCompleted: true },
    });
    throw redirect(`/app${search}`);
  }

  return { intent, ok: false, message: "Unknown action." };
};

function StepDots({ step }: { step: number }) {
  return (
    <InlineStack gap="150" align="center" blockAlign="center">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            background: n <= step ? "#1a1a1a" : "#f1f1f1",
            color: n <= step ? "#fff" : "#8a8a8a",
          }}
        >
          {n}
        </div>
      ))}
    </InlineStack>
  );
}

/** Fully-clickable selection box (radio-card). */
function OptionBox({
  selected,
  disabled,
  onClick,
  children,
  center,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        appearance: "none",
        fontFamily: "inherit",
        textAlign: center ? "center" : "start",
        cursor: disabled ? "default" : "pointer",
        width: "100%",
        background: selected
          ? "var(--p-color-bg-surface-secondary-active, #f1f1f1)"
          : "var(--p-color-bg-surface, #fff)",
        border: selected
          ? "2px solid var(--p-color-border-emphasis, #111)"
          : "1px solid var(--p-color-border, #e3e3e3)",
        borderRadius: 12,
        padding: "12px 14px",
        opacity: disabled ? 0.6 : 1,
        transition: "border-color 0.12s ease, background 0.12s ease",
      }}
    >
      {children}
    </button>
  );
}

export default function Onboarding() {
  const data = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const [searchParams, setSearchParams] = useSearchParams();
  const connectFetcher = useFetcher<typeof action>();
  const stepFetcher = useFetcher<typeof action>();
  const statusFetcher = useFetcher<{ embedEnabled: boolean; blockInstalled: boolean }>();

  const themeStatus = statusFetcher.data ?? data.themeStatus;

  const initialStep = Number(searchParams.get("step")) || 1;
  const [step, setStepState] = useState(Math.min(Math.max(initialStep, 1), TOTAL_STEPS));
  const setStep = useCallback(
    (n: number) => {
      setStepState(n);
      setSearchParams(
        (params) => {
          params.set("step", String(n));
          return params;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  // ---- Step 1: language
  const [lang, setLang] = useState(data.language || "en");
  const tr = useCallback(
    (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(lang, key, vars),
    [lang],
  );
  const rtl = isRtl(lang);

  // Auto-refresh theme status while the theme step is open.
  useEffect(() => {
    if (step !== 2) return;
    const tick = () => {
      if (statusFetcher.state === "idle") statusFetcher.load("/api/theme-status");
    };
    const id = setInterval(tick, 4000);
    tick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ---- Step 3: button design

  // ---- Step 4: usage + products
  const [visitorLimit, setVisitorLimit] = useState(String(data.settings.visitorDailyLimit));
  const [mode, setMode] = useState(data.settings.productAvailabilityMode);
  const [selection, setSelection] = useState<string[]>(data.settings.selection);
  const [productInfo, setProductInfo] = useState<
    Record<string, { title: string; imageUrl: string | null }>
  >(() =>
    Object.fromEntries(
      data.selectionDetails.map((d) => [d.id, { title: d.title, imageUrl: d.imageUrl }]),
    ),
  );

  // ---- Step 5: AI
  const [selectedProvider, setSelectedProvider] = useState(() =>
    data.providerCards.some((p) => p.id === data.settings.provider)
      ? (data.settings.provider as string)
      : "openai",
  );
  const [apiKey, setApiKey] = useState("");
  const selectedCard =
    data.providerCards.find((p) => p.id === selectedProvider) ?? data.providerCards[0];
  const providerConnected = data.connectedProviders.some((c) => c.provider === selectedProvider);
  const anyConnected = data.connectedProviders.length > 0;

  const connectedModels = data.providerCards
    .filter((p) => data.connectedProviders.some((c) => c.provider === p.id))
    .flatMap((p) =>
      (data.providerModels[p.id] ?? []).map((m) => ({
        ...m,
        providerId: p.id,
        providerName: p.displayName,
      })),
    );
  const selectableModels = connectedModels.filter((m) => m.selectable);
  const unsupportedModels = connectedModels.filter((m) => !m.selectable);

  const [modelChoice, setModelChoice] = useState<{ provider: string; modelId: string }>({
    provider: data.settings.provider ?? "",
    modelId: data.settings.model ?? "",
  });
  const modelInfo = connectedModels.find(
    (m) => m.providerId === modelChoice.provider && m.modelId === modelChoice.modelId,
  );
  const [quality, setQuality] = useState(data.settings.quality);
  const connecting = connectFetcher.state !== "idle";
  const stepBusy = stepFetcher.state !== "idle";

  useEffect(() => {
    const valid = selectableModels.some(
      (m) => m.providerId === modelChoice.provider && m.modelId === modelChoice.modelId,
    );
    if (!valid) {
      const fallback = selectableModels.find((m) => m.recommended) ?? selectableModels[0];
      if (fallback) {
        setModelChoice({ provider: fallback.providerId, modelId: fallback.modelId });
        setQuality(fallback.defaultQuality);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.connectedProviders.length]);

  // Advance a step when its save completes.
  useEffect(() => {
    if (stepFetcher.state === "idle" && stepFetcher.data?.ok) {
      if (stepFetcher.data.intent === "language") setStep(2);
      if (stepFetcher.data.intent === "usage") setStep(4);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepFetcher.state, stepFetcher.data]);

  const openHelpChat = () => {
    openSupportChat({
      language: lang,
      shopDomain: data.shopDomain,
      topic: "onboarding-connect-ai",
    }).catch(() => shopify.toast.show(tr("chatUnavailable"), { isError: true }));
  };

  const pickProducts = async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      selectionIds: selection.map((id) => ({ id: `gid://shopify/Product/${id}` })),
    });
    if (selected) {
      const picked = selected as Array<{
        id: string;
        title?: string;
        images?: Array<{ originalSrc?: string; src?: string }>;
      }>;
      setSelection(picked.map((p) => p.id.replace("gid://shopify/Product/", "")));
      setProductInfo((current) => {
        const next = { ...current };
        for (const p of picked) {
          const id = p.id.replace("gid://shopify/Product/", "");
          next[id] = {
            title: p.title ?? next[id]?.title ?? "",
            imageUrl:
              p.images?.[0]?.originalSrc ?? p.images?.[0]?.src ?? next[id]?.imageUrl ?? null,
          };
        }
        return next;
      });
    }
  };

  const priceLabel = (price: number | null) =>
    price != null ? tr("perTryOn", { price: `$${price.toFixed(2)}` }) : tr("noTryOnModels");

  return (
    <Page fullWidth>
      <TitleBar title="Virtual Try-On" />
      <div
        style={{ paddingTop: 24, paddingBottom: 32, maxWidth: 780, marginInline: "auto" }}
        dir={rtl ? "rtl" : "ltr"}
      >
        <BlockStack gap="500">
          <Box paddingBlockEnd="100">
            <InlineStack align="center">
              <StepDots step={step} />
            </InlineStack>
          </Box>

          {/* ---------------- Step 1: Language + welcome ---------------- */}
          {step === 1 && (
            <Card padding="600">
              <BlockStack gap="400">
                <BlockStack gap="200" inlineAlign="center">
                  <div style={{ fontSize: 40, lineHeight: 1 }}>✦</div>
                  <Text as="h1" variant="headingLg" alignment="center">
                    {tr("welcomeTitle")}
                  </Text>
                  <Text as="p" tone="subdued" alignment="center">
                    {tr("welcomeSubtitle")}
                  </Text>
                </BlockStack>

                <Text as="h2" variant="headingSm" alignment="center">
                  {tr("chooseLanguage")}
                </Text>
                <InlineGrid columns={{ xs: 2, sm: 3 }} gap="200">
                  {LANGUAGES.map((l) => (
                    <OptionBox
                      key={l.code}
                      selected={lang === l.code}
                      center
                      onClick={() => setLang(l.code)}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span style={{ fontSize: 20, lineHeight: 1 }}>{l.flag}</span>
                        <Text as="span" variant="bodySm" fontWeight={lang === l.code ? "semibold" : "regular"}>
                          {l.nativeName}
                        </Text>
                      </div>
                    </OptionBox>
                  ))}
                </InlineGrid>

                <InlineStack align="center">
                  <Button
                    variant="primary"
                    size="large"
                    loading={stepBusy && stepFetcher.formData?.get("intent") === "language"}
                    onClick={() =>
                      stepFetcher.submit({ intent: "language", language: lang }, { method: "post" })
                    }
                  >
                    {tr("continue")}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* ---------------- Step 2: Theme setup ---------------- */}
          {step === 2 && (
            <Card padding="600">
              <BlockStack gap="400">
                <BlockStack gap="100" inlineAlign="center">
                  <Text as="h1" variant="headingLg" alignment="center">
                    {tr("themeTitle")}
                  </Text>
                  <Text as="p" tone="subdued" alignment="center">
                    {tr("themeSubtitle")}
                  </Text>
                </BlockStack>

                {[
                  {
                    done: themeStatus.embedEnabled,
                    title: tr("embedTitle"),
                    description: tr("embedDesc"),
                    url: data.editorLinks.enableEmbed,
                  },
                  {
                    done: themeStatus.blockInstalled,
                    title: tr("blockTitle"),
                    description: tr("blockDesc"),
                    url: data.editorLinks.addBlock,
                  },
                ].map((item) => (
                  <Box key={item.title} padding="300" borderWidth="025" borderColor="border" borderRadius="300">
                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                      <Box>
                        <Icon
                          source={item.done ? CheckCircleIcon : PlusCircleIcon}
                          tone={item.done ? "success" : "subdued"}
                        />
                      </Box>
                      <BlockStack gap="050">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {item.title}
                          </Text>
                          {item.done && <Badge tone="success">{tr("done")}</Badge>}
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {item.description}
                        </Text>
                      </BlockStack>
                      <div style={{ marginInlineStart: "auto" }}>
                        <Button
                          url={item.url}
                          target="_blank"
                          icon={ExternalIcon}
                          variant={item.done ? "tertiary" : "primary"}
                        >
                          {tr("openThemeEditor")}
                        </Button>
                      </div>
                    </InlineStack>
                  </Box>
                ))}

                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  {themeStatus.embedEnabled && themeStatus.blockInstalled
                    ? tr("themeAllSet")
                    : tr("themeChecking")}
                </Text>

                <InlineStack align="space-between">
                  <Button variant="tertiary" onClick={() => setStep(1)}>
                    {tr("back")}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!themeStatus.embedEnabled || !themeStatus.blockInstalled}
                    onClick={() => setStep(3)}
                  >
                    {tr("continue")}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* ---------------- Step 3: Products & limits ---------------- */}
          {step === 3 && (
            <Card padding="600">
              <BlockStack gap="400">
                <BlockStack gap="100" inlineAlign="center">
                  <Text as="h1" variant="headingLg" alignment="center">
                    {tr("limitsTitle")}
                  </Text>
                  <Text as="p" tone="subdued" alignment="center">
                    {tr("limitsSubtitle")}
                  </Text>
                </BlockStack>

                <Select
                  label={tr("maxTryOns")}
                  options={[
                    { label: "1", value: "1" },
                    { label: "2", value: "2" },
                    { label: `3 (${tr("recommendedOption")})`, value: "3" },
                    { label: "5", value: "5" },
                    { label: "10", value: "10" },
                    { label: tr("unlimited"), value: "0" },
                  ]}
                  value={visitorLimit}
                  onChange={setVisitorLimit}
                />

                <BlockStack gap="200">
                  <Text as="p" fontWeight="semibold">
                    {tr("whichProducts")}
                  </Text>
                  {(
                    [
                      { id: "all", title: tr("allProducts") },
                      { id: "include", title: tr("onlySelected") },
                      { id: "exclude", title: tr("allExcept") },
                    ] as const
                  ).map((m) => (
                    <OptionBox key={m.id} selected={mode === m.id} onClick={() => setMode(m.id)}>
                      <Text as="p" fontWeight="medium">
                        {m.title}
                      </Text>
                    </OptionBox>
                  ))}
                  {mode !== "all" && (
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Button icon={PlusIcon} onClick={pickProducts}>
                          {selection.length ? tr("editSelection") : tr("chooseProducts")}
                        </Button>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {tr("productsSelected", { n: selection.length })}
                        </Text>
                      </InlineStack>
                      {selection.length > 0 && (
                        <InlineGrid columns={{ xs: 3, sm: 4, md: 5 }} gap="300">
                          {selection.map((id) => {
                            const info = productInfo[id];
                            return (
                              <div
                                key={id}
                                style={{
                                  position: "relative",
                                  border: "1px solid var(--p-color-border, #e3e3e3)",
                                  borderRadius: 12,
                                  overflow: "hidden",
                                  background: "#fff",
                                }}
                              >
                                {info?.imageUrl ? (
                                  <img
                                    src={info.imageUrl}
                                    alt={info.title}
                                    style={{
                                      width: "100%",
                                      aspectRatio: "1 / 1",
                                      objectFit: "cover",
                                      display: "block",
                                      background: "#f4f4f4",
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: "100%",
                                      aspectRatio: "1 / 1",
                                      background: "#f0f0f0",
                                    }}
                                  />
                                )}
                                <button
                                  type="button"
                                  aria-label="Remove"
                                  onClick={() =>
                                    setSelection((current) => current.filter((s) => s !== id))
                                  }
                                  style={{
                                    position: "absolute",
                                    top: 6,
                                    insetInlineEnd: 6,
                                    width: 22,
                                    height: 22,
                                    borderRadius: "50%",
                                    border: "none",
                                    background: "rgba(17,17,17,0.72)",
                                    color: "#fff",
                                    fontSize: 12,
                                    lineHeight: 1,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  ✕
                                </button>
                                <div
                                  style={{
                                    padding: "6px 8px 8px",
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                  title={info?.title ?? ""}
                                >
                                  {info?.title ?? "…"}
                                </div>
                              </div>
                            );
                          })}
                        </InlineGrid>
                      )}
                    </BlockStack>
                  )}
                </BlockStack>

                <InlineStack align="space-between" blockAlign="center">
                  <Button variant="tertiary" onClick={() => setStep(2)}>
                    {tr("back")}
                  </Button>
                  <InlineStack gap="200">
                    <Button variant="tertiary" onClick={() => setStep(4)}>
                      {tr("skipForNow")}
                    </Button>
                    <Button
                      variant="primary"
                      loading={stepBusy && stepFetcher.formData?.get("intent") === "usage"}
                      onClick={() =>
                        stepFetcher.submit(
                          {
                            intent: "usage",
                            visitorDailyLimit: visitorLimit,
                            mode,
                            selection: JSON.stringify(selection),
                          },
                          { method: "post" },
                        )
                      }
                    >
                      {tr("continue")}
                    </Button>
                  </InlineStack>
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* ---------------- Step 4: Connect AI ---------------- */}
          {step === 4 && (
            <Card padding="600">
              <BlockStack gap="400">
                <InlineStack align="end">
                  <Button icon={QuestionCircleIcon} onClick={openHelpChat}>
                    {tr("getHelpSetup")}
                  </Button>
                </InlineStack>

                <BlockStack gap="100" inlineAlign="center">
                  <Text as="h1" variant="headingLg" alignment="center">
                    {tr("aiTitle")}
                  </Text>
                  <Text as="p" tone="subdued" alignment="center">
                    {tr("aiSubtitle")}
                  </Text>
                </BlockStack>

                <InlineGrid columns={{ xs: 2, sm: data.providerCards.length }} gap="300">
                  {data.providerCards.map((p) => {
                    const isSelected = selectedProvider === p.id;
                    const isConnected = data.connectedProviders.some((c) => c.provider === p.id);
                    return (
                      <OptionBox
                        key={p.id}
                        selected={isSelected}
                        center
                        onClick={() => {
                          setSelectedProvider(p.id);
                          setApiKey("");
                        }}
                      >
                        <BlockStack gap="200" inlineAlign="center">
                          <ProviderMark id={p.id} size={30} />
                          <BlockStack gap="050" inlineAlign="center">
                            <Text as="p" variant="bodySm" fontWeight="semibold" alignment="center">
                              {p.displayName}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                              {priceLabel(p.price)}
                            </Text>
                          </BlockStack>
                          {isConnected && modelChoice.provider === p.id ? (
                            <Badge tone="success" size="small">
                              {tr("connectedBadge")}
                            </Badge>
                          ) : isConnected ? (
                            <Badge size="small">API key added</Badge>
                          ) : p.recommended ? (
                            <Badge tone="info" size="small">
                              {tr("recommendedBadge")}
                            </Badge>
                          ) : null}
                        </BlockStack>
                      </OptionBox>
                    );
                  })}
                </InlineGrid>

                {!providerConnected && (
                  <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                    <BlockStack gap="300">
                      <Text as="p" fontWeight="semibold">
                        {tr("connectProviderName", { name: selectedCard.displayName })}
                      </Text>
                      <TextField
                        label="API key"
                        labelHidden
                        value={apiKey}
                        onChange={setApiKey}
                        autoComplete="off"
                        type="password"
                        placeholder={selectedCard.keyPlaceholder}
                        error={
                          connectFetcher.data && !connectFetcher.data.ok
                            ? (connectFetcher.data.message ?? undefined)
                            : undefined
                        }
                        helpText={tr("keyHelp")}
                      />
                      <InlineStack gap="200" blockAlign="center">
                        <Button
                          variant="primary"
                          loading={connecting}
                          disabled={!apiKey.trim()}
                          onClick={() => {
                            connectFetcher.submit(
                              { intent: "connect", provider: selectedProvider, apiKey },
                              { method: "post" },
                            );
                            setApiKey("");
                          }}
                        >
                          {tr("connect")}
                        </Button>
                        <Button url={selectedCard.keyHelpUrl} target="_blank" variant="tertiary">
                          {tr("getApiKey")}
                        </Button>
                        <Button variant="plain" onClick={openHelpChat}>
                          {tr("helpSetting")}
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                )}

                {anyConnected && (
                  <BlockStack gap="300">
                    <BlockStack gap="050">
                      <Text as="h2" variant="headingSm">
                        {tr("aiModel")}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {tr("aiModelSubtitle")}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="200">
                      {selectableModels.map((m) => {
                        const isChosen =
                          modelChoice.provider === m.providerId && modelChoice.modelId === m.modelId;
                        const cost =
                          m.pricing.estimatedCostPerTryOn[isChosen ? quality : m.defaultQuality];
                        return (
                          <OptionBox
                            key={`${m.providerId}:${m.modelId}`}
                            selected={isChosen}
                            onClick={() => {
                              setModelChoice({ provider: m.providerId, modelId: m.modelId });
                              setQuality(m.defaultQuality);
                            }}
                          >
                            <InlineStack gap="300" blockAlign="center" wrap={false}>
                              <ProviderMark id={m.providerId} size={22} />
                              <BlockStack gap="050">
                                <Text as="p" fontWeight="semibold">
                                  {m.displayName}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {m.providerName} · {m.description}
                                </Text>
                              </BlockStack>
                              <div style={{ marginInlineStart: "auto", textAlign: "end" }}>
                                {m.recommended && <Badge tone="info">{tr("recommendedBadge")}</Badge>}
                                {typeof cost === "number" && (
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {tr("perTryOn", { price: `$${cost.toFixed(2)}` })}
                                  </Text>
                                )}
                              </div>
                            </InlineStack>
                          </OptionBox>
                        );
                      })}
                      {unsupportedModels.map((m) => (
                        <OptionBox
                          key={`${m.providerId}:${m.modelId}`}
                          selected={false}
                          disabled
                          onClick={() => {}}
                        >
                          <InlineStack gap="300" blockAlign="center" wrap={false}>
                            <ProviderMark id={m.providerId} size={22} />
                            <BlockStack gap="050">
                              <Text as="p" fontWeight="semibold">
                                {m.displayName}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {m.providerName} · {m.description}
                              </Text>
                            </BlockStack>
                            <div style={{ marginInlineStart: "auto" }}>
                              <Badge>{tr("notSupported")}</Badge>
                            </div>
                          </InlineStack>
                        </OptionBox>
                      ))}
                      {selectableModels.length === 0 && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {tr("noModelsHint")}
                        </Text>
                      )}
                    </BlockStack>

                    {modelInfo && modelInfo.qualityOptions.length > 1 && (
                      <Select
                        label={tr("quality")}
                        options={modelInfo.qualityOptions.map((q) => ({ label: q.label, value: q.id }))}
                        value={quality}
                        onChange={setQuality}
                      />
                    )}
                  </BlockStack>
                )}

                <InlineStack align="space-between" blockAlign="center">
                  <Button variant="tertiary" onClick={() => setStep(3)}>
                    {tr("back")}
                  </Button>
                  <InlineStack gap="200">
                    <Button
                      variant="primary"
                      loading={stepBusy && stepFetcher.formData?.get("intent") === "finish"}
                      disabled={!modelInfo?.selectable}
                      onClick={() =>
                        stepFetcher.submit(
                          {
                            intent: "finish",
                            provider: modelChoice.provider,
                            model: modelChoice.modelId,
                            quality,
                          },
                          { method: "post" },
                        )
                      }
                    >
                      {tr("finishSetup")}
                    </Button>
                  </InlineStack>
                </InlineStack>
              </BlockStack>
            </Card>
          )}
        </BlockStack>
      </div>
    </Page>
  );
}
