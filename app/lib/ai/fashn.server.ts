import type {
  AIProvider,
  GenerateTryOnInput,
  GenerateTryOnResult,
} from "./types";
import { ProviderError } from "./types";
import { modelsForProvider } from "./registry";

/**
 * FASHN adapter (fashn.ai) — a dedicated virtual try-on API.
 * Async protocol: POST /v1/run with the person + garment images, then poll
 * GET /v1/status/{id} until the prediction completes. Auth: Bearer key.
 */

const FASHN_BASE = "https://api.fashn.ai/v1";
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 150_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDataUri(data: Buffer, contentType: string): string {
  return `data:${contentType};base64,${data.toString("base64")}`;
}

export const fashnProvider: AIProvider = {
  id: "fashn",
  displayName: "FASHN",
  implemented: true,
  keyPlaceholder: "fa-...",
  keyHelpUrl: "https://app.fashn.ai/api",

  async validateApiKey(apiKey: string) {
    try {
      const res = await fetch(`${FASHN_BASE}/credits`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) return { valid: true };
      if (res.status === 401 || res.status === 403) {
        return { valid: false, message: "FASHN rejected this API key." };
      }
      return {
        valid: false,
        message: `FASHN returned an unexpected error (status ${res.status}). Try again.`,
      };
    } catch {
      return { valid: false, message: "Couldn't reach FASHN. Check your connection and try again." };
    }
  },

  getModels() {
    return modelsForProvider("fashn");
  },

  async generateTryOn(input: GenerateTryOnInput): Promise<GenerateTryOnResult> {
    const submit = await fetch(`${FASHN_BASE}/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_name: input.modelId,
        inputs:
          input.modelId === "tryon-max"
            ? {
                // tryon-max schema: person + product image, no tuning knobs.
                model_image: toDataUri(input.personImage.data, input.personImage.contentType),
                product_image: toDataUri(input.productImage.data, input.productImage.contentType),
                output_format: "png",
              }
            : {
                model_image: toDataUri(input.personImage.data, input.personImage.contentType),
                garment_image: toDataUri(input.productImage.data, input.productImage.contentType),
                // Best-quality settings: slower but noticeably better output.
                mode: "quality",
                category: "auto",
                garment_photo_type: "auto",
                output_format: "png",
              },
      }),
    });

    if (!submit.ok) {
      let message = `FASHN request failed with status ${submit.status}.`;
      try {
        const body = (await submit.json()) as { error?: unknown; message?: string };
        message =
          (typeof body.error === "string" ? body.error : JSON.stringify(body.error ?? body.message ?? "")).slice(0, 300) ||
          message;
      } catch {
        // keep generic message
      }
      if (submit.status === 401 || submit.status === 403) {
        throw new ProviderError("invalid_key", message);
      }
      if (submit.status === 402 || submit.status === 429) {
        throw new ProviderError("quota", message);
      }
      throw new ProviderError("provider_error", message);
    }

    const job = (await submit.json()) as { id?: string; error?: unknown };
    if (!job.id) {
      throw new ProviderError(
        "provider_error",
        `FASHN returned no prediction id${job.error ? `: ${JSON.stringify(job.error).slice(0, 200)}` : "."}`,
      );
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const poll = await fetch(`${FASHN_BASE}/status/${encodeURIComponent(job.id)}`, {
        headers: { Authorization: `Bearer ${input.apiKey}` },
      });
      if (!poll.ok) continue; // transient; the overall deadline bounds us
      const body = (await poll.json()) as {
        status?: string;
        output?: string[];
        error?: { name?: string; message?: string } | string | null;
      };
      const status = body.status ?? "";
      if (status === "completed") {
        const outputUrl = body.output?.[0];
        if (!outputUrl) {
          throw new ProviderError("provider_error", "FASHN completed without an output image.");
        }
        const image = await fetch(outputUrl);
        if (!image.ok) {
          throw new ProviderError("provider_error", "Couldn't download the FASHN result image.");
        }
        return {
          imageData: Buffer.from(await image.arrayBuffer()),
          contentType: image.headers.get("content-type") || "image/png",
        };
      }
      if (status === "failed" || status === "canceled") {
        const err = body.error;
        const message =
          typeof err === "string"
            ? err
            : (err?.message ?? err?.name ?? `FASHN prediction ${status}.`);
        if (/nsfw|content|moderat/i.test(message)) {
          throw new ProviderError("content_rejected", message);
        }
        // Photo-quality failures (e.g. "Failed to detect body pose in model
        // image") → shoppers get "try another photo", not a generic error.
        if (/pose|body|detect|no person|face/i.test(message)) {
          throw new ProviderError("content_rejected", message);
        }
        if (/credit|insufficient|quota/i.test(message)) {
          throw new ProviderError("quota", message);
        }
        throw new ProviderError("provider_error", message.slice(0, 300));
      }
      // starting / in_queue / processing — keep polling.
    }
    throw new ProviderError("provider_error", "FASHN generation timed out.");
  },
};
