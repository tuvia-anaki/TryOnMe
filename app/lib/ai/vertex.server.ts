import type {
  AIProvider,
  GenerateTryOnInput,
  GenerateTryOnResult,
} from "./types";
import { ProviderError } from "./types";
import { modelsForProvider } from "./registry";

/**
 * Google Vertex AI adapter — hosts Google's dedicated Virtual Try-On model
 * (virtual-try-on-001), which speaks the Vertex :predict protocol: person
 * image + garment image in, generated image out, no text prompt.
 *
 * Works with a Google API key whose Cloud project has the Vertex AI API
 * (aiplatform.googleapis.com) enabled.
 */

const VERTEX_VTO_URL =
  "https://aiplatform.googleapis.com/v1/publishers/google/models/virtual-try-on-001:predict";

function keyHeaders(apiKey: string): Record<string, string> {
  return { "x-goog-api-key": apiKey, "Content-Type": "application/json" };
}

export const vertexProvider: AIProvider = {
  id: "vertex",
  displayName: "Google Vertex AI",
  implemented: true,
  keyPlaceholder: "AIza...",
  keyHelpUrl: "https://console.cloud.google.com/apis/credentials",

  async validateApiKey(apiKey: string) {
    try {
      // No cheap key-info endpoint: an empty predict distinguishes auth
      // failures from payload validation errors.
      const res = await fetch(VERTEX_VTO_URL, {
        method: "POST",
        headers: keyHeaders(apiKey),
        body: JSON.stringify({ instances: [{}] }),
      });
      if (res.status === 400 || res.status === 422 || res.ok) {
        return { valid: true }; // authenticated; payload was (intentionally) invalid
      }
      let message = `Google returned an unexpected error (status ${res.status}).`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        message = body.error?.message ?? message;
      } catch {
        // keep generic message
      }
      if (res.status === 401) {
        return { valid: false, message: "Google rejected this API key." };
      }
      if (res.status === 403 && /has not been used|is disabled/i.test(message)) {
        return {
          valid: false,
          message:
            "Your key works, but the Vertex AI API isn't enabled on its Google Cloud project yet. " +
            message,
        };
      }
      return { valid: false, message };
    } catch {
      return { valid: false, message: "Couldn't reach Google. Check your connection and try again." };
    }
  },

  getModels() {
    return modelsForProvider("vertex");
  },

  async generateTryOn(input: GenerateTryOnInput): Promise<GenerateTryOnResult> {
    const res = await fetch(VERTEX_VTO_URL, {
      method: "POST",
      headers: keyHeaders(input.apiKey),
      body: JSON.stringify({
        instances: [
          {
            personImage: {
              image: { bytesBase64Encoded: input.personImage.data.toString("base64") },
            },
            productImages: [
              {
                image: { bytesBase64Encoded: input.productImages[0].data.toString("base64") },
              },
            ],
          },
        ],
        parameters: { sampleCount: 1 },
      }),
    });

    if (!res.ok) {
      let message = `Vertex Virtual Try-On failed with status ${res.status}.`;
      let status = "";
      try {
        const body = (await res.json()) as { error?: { message?: string; status?: string } };
        message = body.error?.message ?? message;
        status = body.error?.status ?? "";
      } catch {
        // keep generic message
      }
      if (res.status === 401 || status === "UNAUTHENTICATED") {
        throw new ProviderError("invalid_key", message);
      }
      if (res.status === 429 || status === "RESOURCE_EXHAUSTED") {
        throw new ProviderError("quota", message);
      }
      // 403 typically means the Vertex AI API isn't enabled on the key's
      // project — the message includes the exact enable link, which surfaces
      // to the merchant in Analytics.
      throw new ProviderError("provider_error", message);
    }

    const body = (await res.json()) as {
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
    };
    const prediction = body.predictions?.[0];
    if (!prediction?.bytesBase64Encoded) {
      throw new ProviderError(
        "provider_error",
        "Vertex Virtual Try-On returned no image (the photo may not show enough of the person for this model).",
      );
    }
    return {
      imageData: Buffer.from(prediction.bytesBase64Encoded, "base64"),
      contentType: prediction.mimeType || "image/png",
    };
  },
};
