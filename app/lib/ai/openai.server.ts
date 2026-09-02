import type {
  AIProvider,
  GenerateTryOnInput,
  GenerateTryOnResult,
} from "./types";
import { ProviderError } from "./types";
import { getModel, modelsForProvider } from "./registry";

/**
 * OpenAI adapter — fully implemented against the OpenAI Images API.
 * Uses /v1/images/edits with two reference images (person + product) and a
 * server-built prompt. `input_fidelity: high` preserves faces and product
 * detail on models that support it.
 */

const OPENAI_BASE = "https://api.openai.com/v1";

async function parseError(res: Response): Promise<never> {
  let message = `OpenAI request failed with status ${res.status}.`;
  let type = "";
  let code = "";
  try {
    const body = (await res.json()) as {
      error?: { message?: string; type?: string; code?: string };
    };
    message = body.error?.message ?? message;
    type = body.error?.type ?? "";
    code = body.error?.code ?? "";
  } catch {
    // non-JSON error body; keep the generic message
  }

  if (res.status === 401) throw new ProviderError("invalid_key", message);
  if (
    res.status === 429 ||
    type === "insufficient_quota" ||
    code === "insufficient_quota" ||
    code === "billing_hard_limit_reached"
  ) {
    throw new ProviderError("quota", message);
  }
  if (code === "moderation_blocked" || code === "content_policy_violation") {
    throw new ProviderError("content_rejected", message);
  }
  throw new ProviderError("provider_error", message);
}

export const openaiProvider: AIProvider = {
  id: "openai",
  displayName: "OpenAI",
  implemented: true,
  keyPlaceholder: "sk-...",
  keyHelpUrl: "https://platform.openai.com/api-keys",

  async validateApiKey(apiKey: string) {
    try {
      const res = await fetch(`${OPENAI_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) return { valid: true };
      if (res.status === 401) {
        return { valid: false, message: "OpenAI rejected this API key." };
      }
      return {
        valid: false,
        message: `OpenAI returned an unexpected error (status ${res.status}). Try again.`,
      };
    } catch {
      return { valid: false, message: "Couldn't reach OpenAI. Check your connection and try again." };
    }
  },

  getModels() {
    return modelsForProvider("openai");
  },

  async listAvailableModelIds(apiKey: string) {
    try {
      const res = await fetch(`${OPENAI_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: Array<{ id?: string }> };
      if (!Array.isArray(body.data)) return null;
      return body.data.map((m) => m.id ?? "").filter(Boolean);
    } catch {
      return null;
    }
  },

  async generateTryOn(input: GenerateTryOnInput): Promise<GenerateTryOnResult> {
    const form = new FormData();
    form.append("model", input.modelId);
    form.append("prompt", input.prompt);
    form.append("quality", input.quality);
    // No explicit size: the API default ("auto") matches the input photo's
    // aspect ratio instead of forcing a crop/recompose to portrait.
    if (getModel("openai", input.modelId)?.capabilities.supportsInputFidelity) {
      form.append("input_fidelity", "high");
    }
    form.append("n", "1");
    form.append(
      "image[]",
      new Blob([new Uint8Array(input.personImage.data)], { type: input.personImage.contentType }),
      "person.jpg",
    );
    // Every available view of the product: extra angles stop the model from
    // inventing detail it can't see in a single photo.
    input.productImages.forEach((image, index) => {
      form.append(
        "image[]",
        new Blob([new Uint8Array(image.data)], { type: image.contentType }),
        `product-${index + 1}.jpg`,
      );
    });

    const res = await fetch(`${OPENAI_BASE}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form,
    });

    if (!res.ok) await parseError(res);

    const body = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) {
      throw new ProviderError("provider_error", "OpenAI returned no image data.");
    }
    return { imageData: Buffer.from(b64, "base64"), contentType: "image/png" };
  },
};
