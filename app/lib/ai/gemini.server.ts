import type {
  AIProvider,
  GenerateTryOnInput,
  GenerateTryOnResult,
} from "./types";
import { ProviderError } from "./types";
import { modelsForProvider } from "./registry";

/**
 * Google Gemini adapter — implemented against the Gemini API
 * (generativelanguage.googleapis.com). Gemini 2.5 Flash Image accepts
 * multiple reference images plus a prompt and returns an edited image,
 * which fits the try-on workflow well.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function keyHeaders(apiKey: string): Record<string, string> {
  return { "x-goog-api-key": apiKey, "Content-Type": "application/json" };
}

async function parseError(res: Response): Promise<never> {
  let message = `Gemini request failed with status ${res.status}.`;
  let status = "";
  try {
    const body = (await res.json()) as {
      error?: { message?: string; status?: string };
    };
    message = body.error?.message ?? message;
    status = body.error?.status ?? "";
  } catch {
    // non-JSON error body; keep the generic message
  }
  if (res.status === 401 || res.status === 403 || status === "UNAUTHENTICATED" || status === "PERMISSION_DENIED") {
    throw new ProviderError("invalid_key", message);
  }
  if (res.status === 429 || status === "RESOURCE_EXHAUSTED") {
    throw new ProviderError("quota", message);
  }
  throw new ProviderError("provider_error", message);
}

export const geminiProvider: AIProvider = {
  id: "gemini",
  displayName: "Google Gemini",
  implemented: true,
  keyPlaceholder: "AIza...",
  keyHelpUrl: "https://aistudio.google.com/apikey",

  async validateApiKey(apiKey: string) {
    try {
      const res = await fetch(`${GEMINI_BASE}/models?pageSize=1`, {
        headers: { "x-goog-api-key": apiKey },
      });
      if (res.ok) return { valid: true };
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return { valid: false, message: "Google rejected this API key." };
      }
      return {
        valid: false,
        message: `Google returned an unexpected error (status ${res.status}). Try again.`,
      };
    } catch {
      return { valid: false, message: "Couldn't reach Google. Check your connection and try again." };
    }
  },

  getModels() {
    return modelsForProvider("gemini");
  },

  async listAvailableModelIds(apiKey: string) {
    try {
      const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, {
        headers: { "x-goog-api-key": apiKey },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { models?: Array<{ name?: string }> };
      if (!body.models) return null;
      // Model names come back as "models/<id>".
      return body.models
        .map((m) => (m.name ?? "").replace(/^models\//, ""))
        .filter(Boolean);
    } catch {
      return null; // fail open — availability unknown
    }
  },

  async generateTryOn(input: GenerateTryOnInput): Promise<GenerateTryOnResult> {
    // Gemini image models occasionally return a text-only response instead of
    // an image (transient model behavior). One automatic retry fixes almost
    // all of these; if both attempts fail we surface what the model said.
    let lastError: ProviderError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await geminiGenerateOnce(input);
      } catch (error) {
        if (error instanceof ProviderError && error.code === "provider_error" && /instead of an image|no image data/i.test(error.message)) {
          lastError = error;
          continue; // retry once
        }
        throw error;
      }
    }
    throw lastError ?? new ProviderError("provider_error", "Gemini returned no image data.");
  },
};

async function geminiGenerateOnce(input: GenerateTryOnInput): Promise<GenerateTryOnResult> {
    const res = await fetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(input.modelId)}:generateContent`,
      {
        method: "POST",
        headers: keyHeaders(input.apiKey),
        body: JSON.stringify({
          contents: [
            {
              parts: [
                // Interleaved, labeled parts: Gemini applies edits far more
                // reliably when each image is named and the instruction is an
                // explicit edit command that comes after the images.
                { text: "PHOTO A — the person:" },
                {
                  inlineData: {
                    mimeType: input.personImage.contentType,
                    data: input.personImage.data.toString("base64"),
                  },
                },
                ...input.productImages.flatMap((image, index) => [
                  {
                    text:
                      index === 0
                        ? "PHOTO B — the product (primary view):"
                        : `PHOTO B${index + 1} — the SAME product, another view (use it to get the design exactly right):`,
                  },
                  {
                    inlineData: {
                      mimeType: image.contentType,
                      data: image.data.toString("base64"),
                    },
                  },
                ]),
                {
                  text:
                    "TASK: Edit PHOTO A so that this exact person is now wearing/using the product from PHOTO B. " +
                    "PHOTO A is the 'first reference image' (the person) and PHOTO B is the 'second reference image' (the product) in the instructions below. " +
                    "Do NOT return PHOTO A unchanged — the product from PHOTO B must be visibly and realistically placed on the person. " +
                    "Return only the edited photograph.\n\n" +
                    input.prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      },
    );

    if (!res.ok) await parseError(res);

    const body = (await res.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{
        finishReason?: string;
        content?: {
          parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }>;
        };
      }>;
    };

    if (body.promptFeedback?.blockReason) {
      throw new ProviderError(
        "content_rejected",
        `Gemini blocked the request: ${body.promptFeedback.blockReason}`,
      );
    }

    const candidate = body.candidates?.[0];
    if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
      throw new ProviderError("content_rejected", "Gemini blocked the generated content.");
    }

    const imagePart = candidate?.content?.parts?.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      const text = candidate?.content?.parts
        ?.map((p) => p.text)
        .filter(Boolean)
        .join(" ")
        .trim();
      throw new ProviderError(
        "provider_error",
        text
          ? `Gemini returned text instead of an image: "${text.slice(0, 250)}"`
          : `Gemini returned no image data (finishReason: ${candidate?.finishReason ?? "unknown"}).`,
      );
    }

    return {
      imageData: Buffer.from(imagePart.inlineData.data, "base64"),
      contentType: imagePart.inlineData.mimeType || "image/png",
    };
}
