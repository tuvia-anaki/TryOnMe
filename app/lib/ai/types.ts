/**
 * Common AI provider abstraction. Every provider implements this interface so
 * the rest of the app never branches on `if (provider === "openai")`.
 */

export type ProviderId = "openai" | "gemini" | "vertex" | "fashn";

export interface ModelCapabilities {
  supportsImageInput: boolean;
  supportsMultipleImages: boolean;
  supportsImageEditing: boolean;
  supportsVirtualTryOn: boolean;
  /** OpenAI `input_fidelity` param — gpt-image-1 only; gpt-image-2 rejects it. */
  supportsInputFidelity?: boolean;
}

export interface QualityOption {
  id: string; // e.g. "low" | "medium" | "high"
  label: string;
}

export interface ModelPricing {
  /** Estimated all-in USD cost for one try-on generation, keyed by quality id. */
  estimatedCostPerTryOn: Record<string, number>;
  /** Human-readable note shown next to estimates. */
  note: string;
  lastUpdated: string; // ISO date
  source: string; // URL of the official pricing page
}

export interface ModelInfo {
  provider: ProviderId;
  /** Registry key shown to merchants; may encode a fixed quality tier. */
  modelId: string;
  /** Actual model id sent to the provider API (defaults to modelId). */
  apiModelId?: string;
  displayName: string;
  description: string;
  recommended: boolean;
  enabled: boolean;
  capabilities: ModelCapabilities;
  qualityOptions: QualityOption[];
  defaultQuality: string;
  pricing: ModelPricing;
}

export interface GenerateTryOnInput {
  apiKey: string;
  modelId: string;
  quality: string;
  /** Shopper photograph (JPEG/PNG bytes). */
  personImage: { data: Buffer; contentType: string };
  /** Product reference image bytes. */
  productImage: { data: Buffer; contentType: string };
  /** Server-built prompt. Never comes from the storefront. */
  prompt: string;
}

export interface GenerateTryOnResult {
  imageData: Buffer;
  contentType: string;
}

/** Normalized provider failure. `code` maps to shopper-safe messages. */
export class ProviderError extends Error {
  code: "invalid_key" | "quota" | "content_rejected" | "provider_error";

  constructor(code: ProviderError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "ProviderError";
  }
}

export interface AIProvider {
  id: ProviderId;
  displayName: string;
  /** Whether this adapter has a working generateTryOn implementation. */
  implemented: boolean;
  keyPlaceholder: string;
  keyHelpUrl: string;
  validateApiKey(apiKey: string): Promise<{ valid: boolean; message?: string }>;
  getModels(): ModelInfo[];
  /**
   * Model ids this API key can actually use, or null when unknown (endpoint
   * unavailable / request failed). Callers must fail open on null.
   */
  listAvailableModelIds?(apiKey: string): Promise<string[] | null>;
  generateTryOn(input: GenerateTryOnInput): Promise<GenerateTryOnResult>;
}
