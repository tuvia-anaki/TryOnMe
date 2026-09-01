import type { ModelInfo, ProviderId } from "./types";

/**
 * Central model + pricing registry.
 *
 * ALL pricing metadata lives here — never hard-code costs elsewhere.
 * Costs are ESTIMATES for one try-on at ~1024×1536 with two input images;
 * actual provider charges vary with image tokens. Update `lastUpdated`
 * and the numbers together when provider pricing changes.
 */

const OPENAI_PRICING_SOURCE = "https://platform.openai.com/docs/pricing";

export const MODEL_REGISTRY: ModelInfo[] = [
  {
    provider: "openai",
    modelId: "gpt-image-2-high",
    apiModelId: "gpt-image-2",
    displayName: "GPT Image 2 · High",
    description: "Best quality",
    recommended: false,
    enabled: true,
    capabilities: {
      supportsImageInput: true,
      supportsMultipleImages: true,
      supportsImageEditing: true,
      supportsVirtualTryOn: true,
    },
    qualityOptions: [{ id: "high", label: "High" }],
    defaultQuality: "high",
    pricing: {
      estimatedCostPerTryOn: { high: 0.22 },
      note: "Estimated AI cost per try-on. You pay OpenAI directly — we don't add any markup.",
      lastUpdated: "2026-08-31",
      source: OPENAI_PRICING_SOURCE,
    },
  },
  {
    provider: "openai",
    modelId: "gpt-image-2-medium",
    apiModelId: "gpt-image-2",
    displayName: "GPT Image 2 · Medium",
    description: "Great quality, balanced cost · Recommended",
    recommended: true,
    enabled: true,
    capabilities: {
      supportsImageInput: true,
      supportsMultipleImages: true,
      supportsImageEditing: true,
      supportsVirtualTryOn: true,
    },
    qualityOptions: [{ id: "medium", label: "Medium" }],
    defaultQuality: "medium",
    pricing: {
      estimatedCostPerTryOn: { medium: 0.08 },
      note: "Estimated AI cost per try-on. You pay OpenAI directly — we don't add any markup.",
      lastUpdated: "2026-08-31",
      source: OPENAI_PRICING_SOURCE,
    },
  },
  {
    provider: "gemini",
    modelId: "gemini-2.5-flash-image",
    displayName: "Gemini 2.5 Flash Image",
    description: "Fast, low cost · Great value",
    recommended: true,
    enabled: true,
    capabilities: {
      supportsImageInput: true,
      supportsMultipleImages: true,
      supportsImageEditing: true,
      supportsVirtualTryOn: true,
    },
    qualityOptions: [{ id: "standard", label: "Standard" }],
    defaultQuality: "standard",
    pricing: {
      // ~1290 output tokens per image at $30/1M output tokens, plus image input.
      estimatedCostPerTryOn: { standard: 0.04 },
      note: "Estimated AI cost per try-on. You pay Google directly — we don't add any markup.",
      lastUpdated: "2026-08-31",
      source: "https://ai.google.dev/gemini-api/docs/pricing",
    },
  },
  {
    provider: "vertex",
    modelId: "virtual-try-on-001",
    displayName: "Google Virtual Try-On",
    description: "Purpose-built try-on model · Apparel",
    recommended: false,
    enabled: true,
    capabilities: {
      supportsImageInput: true,
      supportsMultipleImages: true,
      supportsImageEditing: true,
      supportsVirtualTryOn: true,
    },
    qualityOptions: [{ id: "standard", label: "Standard" }],
    defaultQuality: "standard",
    pricing: {
      estimatedCostPerTryOn: { standard: 0.05 },
      note: "Estimated AI cost per try-on. Runs on Vertex AI — requires the Vertex AI API enabled on your Google Cloud project. You pay Google directly.",
      lastUpdated: "2026-08-31",
      source: "https://cloud.google.com/vertex-ai/generative-ai/pricing",
    },
  },
  {
    provider: "fashn",
    modelId: "tryon-max",
    displayName: "FASHN Try-On Max",
    description: "Best quality · Dedicated try-on model",
    recommended: true,
    enabled: true,
    capabilities: {
      supportsImageInput: true,
      supportsMultipleImages: true,
      supportsImageEditing: true,
      supportsVirtualTryOn: true,
    },
    qualityOptions: [{ id: "standard", label: "Standard" }],
    defaultQuality: "standard",
    pricing: {
      estimatedCostPerTryOn: { standard: 0.08 },
      note: "Estimated AI cost per try-on. You pay FASHN directly — we don't add any markup.",
      lastUpdated: "2026-08-31",
      source: "https://fashn.ai/pricing",
    },
  },
  {
    provider: "fashn",
    modelId: "tryon-v1.6",
    displayName: "FASHN Try-On v1.6",
    description: "Faster, lower cost · Apparel",
    recommended: false,
    enabled: true,
    capabilities: {
      supportsImageInput: true,
      supportsMultipleImages: true,
      supportsImageEditing: true,
      supportsVirtualTryOn: true,
    },
    qualityOptions: [{ id: "standard", label: "Standard" }],
    defaultQuality: "standard",
    pricing: {
      estimatedCostPerTryOn: { standard: 0.04 },
      note: "Estimated AI cost per try-on. You pay FASHN directly — we don't add any markup.",
      lastUpdated: "2026-08-31",
      source: "https://fashn.ai/pricing",
    },
  },
  {
    provider: "gemini",
    modelId: "gemini-3.1-flash-lite-image",
    displayName: "Gemini 3.1 Flash Lite Image",
    description: "Cheapest option · Good for high volume",
    recommended: false,
    enabled: true,
    capabilities: {
      supportsImageInput: true,
      supportsMultipleImages: true,
      supportsImageEditing: true,
      supportsVirtualTryOn: true,
    },
    qualityOptions: [{ id: "standard", label: "Standard" }],
    defaultQuality: "standard",
    pricing: {
      estimatedCostPerTryOn: { standard: 0.02 },
      note: "Estimated AI cost per try-on. You pay Google directly — we don't add any markup.",
      lastUpdated: "2026-08-31",
      source: "https://ai.google.dev/gemini-api/docs/pricing",
    },
  },
  {
    provider: "gemini",
    modelId: "gemini-3.1-flash-image",
    displayName: "Gemini 3.1 Flash Image",
    description: "Newer Flash generation · Fast, high quality",
    recommended: false,
    enabled: true,
    capabilities: {
      supportsImageInput: true,
      supportsMultipleImages: true,
      supportsImageEditing: true,
      supportsVirtualTryOn: true,
    },
    qualityOptions: [{ id: "standard", label: "Standard" }],
    defaultQuality: "standard",
    pricing: {
      estimatedCostPerTryOn: { standard: 0.09 },
      note: "Estimated AI cost per try-on. You pay Google directly — we don't add any markup.",
      lastUpdated: "2026-08-31",
      source: "https://ai.google.dev/gemini-api/docs/pricing",
    },
  },
  {
    provider: "gemini",
    modelId: "gemini-3-pro-image",
    displayName: "Nano Banana Pro",
    description: "Gemini 3 Pro Image · Highest quality",
    recommended: false,
    enabled: true,
    capabilities: {
      supportsImageInput: true,
      supportsMultipleImages: true,
      supportsImageEditing: true,
      supportsVirtualTryOn: true,
    },
    qualityOptions: [{ id: "standard", label: "Standard" }],
    defaultQuality: "standard",
    pricing: {
      // ~$0.134 per 1K/2K output image plus image input tokens.
      estimatedCostPerTryOn: { standard: 0.14 },
      note: "Estimated AI cost per try-on. You pay Google directly — we don't add any markup.",
      lastUpdated: "2026-08-31",
      source: "https://ai.google.dev/gemini-api/docs/pricing",
    },
  },
];

/** Cheapest estimated try-on cost for a provider (null if it has no usable model). */
export function cheapestTryOnCost(provider: ProviderId): number | null {
  const costs = MODEL_REGISTRY.filter(
    (m) => m.provider === provider && m.enabled && m.capabilities.supportsVirtualTryOn,
  ).map((m) => m.pricing.estimatedCostPerTryOn[m.defaultQuality]);
  const valid = costs.filter((c): c is number => typeof c === "number");
  return valid.length ? Math.min(...valid) : null;
}

export function modelsForProvider(provider: ProviderId): ModelInfo[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider);
}

export function getModel(provider: ProviderId, modelId: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((m) => m.provider === provider && m.modelId === modelId);
}

/** A model may be selected only if it's enabled and can actually do try-on. */
export function isModelSelectable(provider: ProviderId, modelId: string): boolean {
  const model = getModel(provider, modelId);
  return Boolean(model && model.enabled && model.capabilities.supportsVirtualTryOn);
}

export function estimatedCost(
  provider: ProviderId,
  modelId: string,
  quality: string,
): number | null {
  const model = getModel(provider, modelId);
  if (!model) return null;
  const cost = model.pricing.estimatedCostPerTryOn[quality];
  return typeof cost === "number" ? cost : null;
}
