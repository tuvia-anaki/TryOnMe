import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Page,
  RadioButton,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { QuestionCircleIcon } from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../lib/shop.server";
import {
  connectProvider,
  disconnectProvider,
  testProviderConnection,
} from "../lib/credentials.server";
import { availableModelIds, providersViewForShop } from "../lib/provider-view.server";
import { allProviders } from "../lib/ai/index.server";
import { getModel, isModelSelectable } from "../lib/ai/registry";
import { PROVIDER_CAPTIONS, PROVIDER_RECOMMENDED, ProviderMark } from "../components/ProviderMark";
import { openSupportChat } from "../lib/support-chat.client";
import { t } from "../lib/i18n/translations";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const [settings, credentials] = await Promise.all([
    prisma.shopSettings.findUniqueOrThrow({ where: { shopId: shop.id } }),
    prisma.aIProviderCredential.findMany({ where: { shopId: shop.id } }),
  ]);

  return {
    language: shop.language,
    shopDomain: session.shop,
    settings: {
      provider: settings.provider,
      model: settings.model,
      quality: settings.quality,
      visitorDailyLimit: settings.visitorDailyLimit,
      retentionDays: settings.retentionDays,
    },
    credentials: credentials.map((c) => ({ provider: c.provider, maskedKey: c.maskedKey })),
    providers: await providersViewForShop(shop.id),
    providerCards: allProviders().map((p) => ({
      id: p.id,
      displayName: p.displayName,
      implemented: p.implemented,
      keyPlaceholder: p.keyPlaceholder,
      keyHelpUrl: p.keyHelpUrl,
      caption: PROVIDER_CAPTIONS[p.id] ?? "",
      recommended: PROVIDER_RECOMMENDED[p.id] === true,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  switch (intent) {
    case "connect": {
      const provider = String(form.get("provider") ?? "");
      const result = await connectProvider(shop.id, provider, String(form.get("apiKey") ?? ""));
      if (result.ok) {
        const current = await prisma.shopSettings.findUnique({ where: { shopId: shop.id } });
        if (!current?.provider) {
          await prisma.shopSettings.update({
            where: { shopId: shop.id },
            data: { provider },
          });
        }
      }
      return { intent, ok: result.ok, message: result.ok ? "API key saved." : result.message };
    }
    case "test": {
      const result = await testProviderConnection(shop.id, String(form.get("provider") ?? ""));
      return { intent, ok: result.ok, message: result.message };
    }
    case "disconnect": {
      await disconnectProvider(shop.id, String(form.get("provider") ?? ""));
      return { intent, ok: true, message: "Disconnected." };
    }
    case "model": {
      const provider = String(form.get("provider") ?? "");
      const model = String(form.get("model") ?? "");
      const quality = String(form.get("quality") ?? "medium");
      if (!isModelSelectable(provider as any, model)) {
        return { intent, ok: false, message: "That model doesn't support virtual try-on." };
      }
      const available = await availableModelIds(shop.id, provider);
      const apiModelId = getModel(provider as any, model)?.apiModelId ?? model;
      if (available !== null && !available.includes(apiModelId)) {
        return {
          intent,
          ok: false,
          message: "Your API key doesn't have access to this model. Pick another model.",
        };
      }
      const info = getModel(provider as any, model);
      await prisma.shopSettings.update({
        where: { shopId: shop.id },
        data: {
          provider,
          model,
          quality: info?.qualityOptions.some((q) => q.id === quality)
            ? quality
            : (info?.defaultQuality ?? "medium"),
        },
      });
      return { intent, ok: true, message: "Model updated." };
    }
    case "limits": {
      const visitorDailyLimit = Math.max(0, Math.min(1000, Number(form.get("visitorDailyLimit")) || 0));
      await prisma.shopSettings.update({
        where: { shopId: shop.id },
        data: { visitorDailyLimit },
      });
      return { intent, ok: true, message: "Limits updated." };
    }
    case "retention": {
      const retentionDays = Math.max(1, Math.min(365, Number(form.get("retentionDays")) || 90));
      await prisma.shopSettings.update({
        where: { shopId: shop.id },
        data: { retentionDays },
      });
      return { intent, ok: true, message: "Retention updated." };
    }
    default:
      return { intent, ok: false, message: "Unknown action." };
  }
};

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [selectedProvider, setSelectedProvider] = useState(
    data.settings.provider ?? "openai",
  );
  const credential = data.credentials.find((c) => c.provider === selectedProvider);
  const selectedCard =
    data.providerCards.find((p) => p.id === selectedProvider) ?? data.providerCards[0];
  const providerInfo = data.providers.find((p) => p.id === selectedProvider);

  const [apiKey, setApiKey] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [model, setModel] = useState(data.settings.model ?? "");
  const [quality, setQuality] = useState(data.settings.quality);
  const [visitorLimit, setVisitorLimit] = useState(String(data.settings.visitorDailyLimit));
  const [retention, setRetention] = useState(String(data.settings.retentionDays));

  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
      if (fetcher.data.intent === "connect" && fetcher.data.ok) {
        setApiKey("");
        setReplacing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const openHelpChat = () => {
    openSupportChat({
      language: data.language,
      shopDomain: data.shopDomain,
      topic: "settings-ai-provider",
    }).catch(() =>
      shopify.toast.show(t(data.language, "chatUnavailable"), { isError: true }),
    );
  };

  const modelInfo = providerInfo?.models.find((m) => m.modelId === model);
  const estimated = modelInfo?.pricing.estimatedCostPerTryOn[quality];

  return (
    <Page title="Settings">
      <TitleBar title="Settings" />
      <BlockStack gap="400">
        {/* ---- AI provider ---- */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="start" gap="300" wrap={false}>
              <BlockStack gap="100">
                <Text as="h2" variant="headingSm">
                  AI provider
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Pick a provider and connect your own API key. You pay the provider
                  directly — Virtual Try-On adds no markup.
                </Text>
              </BlockStack>
              <Button icon={QuestionCircleIcon} onClick={openHelpChat}>
                {t(data.language, "getHelpSetup")}
              </Button>
            </InlineStack>

            <InlineGrid columns={{ xs: 2, sm: 2, md: data.providerCards.length }} gap="300">
              {data.providerCards.map((p) => {
                const isSelected = selectedProvider === p.id;
                const isConnected = data.credentials.some((c) => c.provider === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProvider(p.id);
                      setReplacing(false);
                      setApiKey("");
                    }}
                    style={{
                      appearance: "none",
                      fontFamily: "inherit",
                      textAlign: "center",
                      cursor: "pointer",
                      background: isSelected
                        ? "var(--p-color-bg-surface-secondary-active, #f1f1f1)"
                        : "var(--p-color-bg-surface, #fff)",
                      border: isSelected
                        ? "2px solid var(--p-color-border-emphasis, #111)"
                        : "1px solid var(--p-color-border, #e3e3e3)",
                      borderRadius: 12,
                      padding: "16px 10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      opacity: p.implemented ? 1 : 0.65,
                      transition: "border-color 0.12s ease, background 0.12s ease",
                    }}
                  >
                    <ProviderMark id={p.id} size={34} />
                    <div>
                      <Text as="p" variant="bodySm" fontWeight="semibold">
                        {p.displayName}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {p.caption}
                      </Text>
                    </div>
                    {isConnected && p.id === data.settings.provider ? (
                      <Badge tone="success" size="small">
                        Connected
                      </Badge>
                    ) : isConnected ? (
                      <Badge size="small">API key added</Badge>
                    ) : p.recommended ? (
                      <Badge tone="info" size="small">
                        Recommended
                      </Badge>
                    ) : null}
                  </button>
                );
              })}
            </InlineGrid>

            {!selectedCard.implemented ? (
              <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                <Text as="p" tone="subdued" variant="bodySm">
                  {selectedCard.displayName} support is coming soon — we'll enable it
                  automatically, no update needed on your side. For now, OpenAI and
                  Google Gemini are fully supported.
                </Text>
              </Box>
            ) : credential && !replacing ? (
              <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="p" fontWeight="semibold">
                      {selectedCard.displayName}
                    </Text>
                    <Text as="p" tone="subdued">
                      {credential.maskedKey}
                    </Text>
                    {selectedProvider === data.settings.provider ? (
                      <Badge tone="success">Connected</Badge>
                    ) : (
                      <Badge>API key added</Badge>
                    )}
                  </InlineStack>
                  <InlineStack gap="200">
                    <Button
                      loading={busy && fetcher.formData?.get("intent") === "test"}
                      onClick={() =>
                        fetcher.submit(
                          { intent: "test", provider: selectedProvider },
                          { method: "post" },
                        )
                      }
                    >
                      Test connection
                    </Button>
                    <Button onClick={() => setReplacing(true)}>Replace key</Button>
                    <Button
                      tone="critical"
                      variant="secondary"
                      onClick={() =>
                        fetcher.submit(
                          { intent: "disconnect", provider: selectedProvider },
                          { method: "post" },
                        )
                      }
                    >
                      Disconnect
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Box>
            ) : (
              <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                <BlockStack gap="300">
                  <Text as="p" fontWeight="semibold">
                    Connect {selectedCard.displayName}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Your key is validated, encrypted and never shown in full again.
                  </Text>
                  <TextField
                    label="API key"
                    labelHidden
                    value={apiKey}
                    onChange={setApiKey}
                    type="password"
                    autoComplete="off"
                    placeholder={selectedCard.keyPlaceholder}
                  />
                  <InlineStack gap="200" blockAlign="center">
                    <Button
                      variant="primary"
                      disabled={!apiKey.trim()}
                      loading={busy && fetcher.formData?.get("intent") === "connect"}
                      onClick={() =>
                        fetcher.submit(
                          { intent: "connect", provider: selectedProvider, apiKey },
                          { method: "post" },
                        )
                      }
                    >
                      {credential ? "Save new key" : "Connect"}
                    </Button>
                    <Button
                      url={selectedCard.keyHelpUrl}
                      target="_blank"
                      variant="tertiary"
                    >
                      Get an API key ↗
                    </Button>
                    {/* TODO: wire up help content later */}
                    <Button variant="plain" onClick={() => {}}>
                      Help
                    </Button>
                    {replacing && <Button variant="tertiary" onClick={() => setReplacing(false)}>Cancel</Button>}
                  </InlineStack>
                </BlockStack>
              </Box>
            )}
          </BlockStack>
        </Card>

        {/* ---- Model ---- */}
        {credential && providerInfo && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                AI model
              </Text>
              <BlockStack gap="200">
                {providerInfo.models
                  .filter((m) => m.selectable)
                  .map((m) => (
                    <Box
                      key={m.modelId}
                      padding="300"
                      borderWidth="025"
                      borderRadius="300"
                      borderColor={model === m.modelId ? "border-emphasis" : "border"}
                    >
                      <InlineStack gap="300" blockAlign="center" wrap={false}>
                        <RadioButton
                          label={m.displayName}
                          helpText={m.description}
                          checked={model === m.modelId}
                          onChange={() => {
                            setModel(m.modelId);
                            setQuality(m.defaultQuality);
                          }}
                        />
                        <div style={{ marginLeft: "auto", textAlign: "right" }}>
                          {m.recommended && <Badge tone="info">Recommended</Badge>}
                          <Text as="p" variant="bodySm" tone="subdued">
                            ~$
                            {(
                              m.pricing.estimatedCostPerTryOn[
                                m.modelId === model ? quality : m.defaultQuality
                              ] ?? 0
                            ).toFixed(2)}{" "}
                            / try-on
                          </Text>
                        </div>
                      </InlineStack>
                    </Box>
                  ))}
                {providerInfo.models
                  .filter((m) => !m.selectable)
                  .map((m) => (
                    <Box key={m.modelId} padding="300" borderWidth="025" borderRadius="300" borderColor="border">
                      <InlineStack gap="300" blockAlign="center">
                        <RadioButton label={m.displayName} helpText={m.description} checked={false} disabled onChange={() => {}} />
                        <div style={{ marginLeft: "auto" }}>
                          <Badge>Not supported</Badge>
                        </div>
                      </InlineStack>
                    </Box>
                  ))}
              </BlockStack>
              {modelInfo && modelInfo.qualityOptions.length > 1 && (
                <Select
                  label="Quality"
                  options={modelInfo.qualityOptions.map((q) => ({ label: q.label, value: q.id }))}
                  value={quality}
                  onChange={setQuality}
                />
              )}
              {typeof estimated === "number" && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Estimated AI cost: ~${estimated.toFixed(2)} per try-on (estimate —
                  actual provider charges can vary).
                </Text>
              )}
              <div>
                <Button
                  variant="primary"
                  disabled={!model}
                  loading={busy && fetcher.formData?.get("intent") === "model"}
                  onClick={() =>
                    fetcher.submit(
                      { intent: "model", provider: selectedProvider, model, quality },
                      { method: "post" },
                    )
                  }
                >
                  Save model
                </Button>
              </div>
            </BlockStack>
          </Card>
        )}

        {/* ---- Usage limits ---- */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingSm">
              Usage limits
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Protects your AI budget from abuse. Server-side rate limiting and
              duplicate-request protection are always on.
            </Text>
            <Select
              label="Maximum try-ons per visitor per day"
              options={[
                { label: "1", value: "1" },
                { label: "2", value: "2" },
                { label: "3 (recommended)", value: "3" },
                { label: "5", value: "5" },
                { label: "10", value: "10" },
                { label: "Unlimited", value: "0" },
              ]}
              value={visitorLimit}
              onChange={setVisitorLimit}
            />
            <div>
              <Button
                loading={busy && fetcher.formData?.get("intent") === "limits"}
                onClick={() =>
                  fetcher.submit(
                    { intent: "limits", visitorDailyLimit: visitorLimit },
                    { method: "post" },
                  )
                }
              >
                Save limits
              </Button>
            </div>
          </BlockStack>
        </Card>

        {/* ---- Privacy ---- */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingSm">
              Privacy
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Shopper photos and generated images are stored privately and deleted
              automatically after the retention period. Shoppers can also delete
              their own photos and try-ons at any time from the try-on window.
            </Text>
            <Select
              label="Keep shopper photos and results for"
              options={[
                { label: "7 days", value: "7" },
                { label: "30 days", value: "30" },
                { label: "90 days (recommended)", value: "90" },
                { label: "180 days", value: "180" },
                { label: "1 year", value: "365" },
              ]}
              value={retention}
              onChange={setRetention}
            />
            <div>
              <Button
                loading={busy && fetcher.formData?.get("intent") === "retention"}
                onClick={() =>
                  fetcher.submit(
                    { intent: "retention", retentionDays: retention },
                    { method: "post" },
                  )
                }
              >
                Save retention
              </Button>
            </div>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
