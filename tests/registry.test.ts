import { describe, expect, it } from "vitest";
import {
  MODEL_REGISTRY,
  estimatedCost,
  getModel,
  isModelSelectable,
} from "../app/lib/ai/registry";

describe("model registry", () => {
  it("recommends gpt-image-2 with try-on capability", () => {
    const model = getModel("openai", "gpt-image-2-medium");
    expect(model?.recommended).toBe(true);
    expect(model?.apiModelId).toBe("gpt-image-2");
    expect(model?.capabilities.supportsVirtualTryOn).toBe(true);
    expect(model?.defaultQuality).toBe("medium");
  });

  it("only allows models that actually support try-on", () => {
    expect(isModelSelectable("openai", "gpt-image-2-high")).toBe(true);
    expect(isModelSelectable("gemini", "gemini-2.5-flash-image")).toBe(true);
    expect(isModelSelectable("openai", "made-up-model")).toBe(false);
  });

  it("never marks a model selectable without multi-image editing support", () => {
    for (const model of MODEL_REGISTRY) {
      if (model.enabled && model.capabilities.supportsVirtualTryOn) {
        expect(model.capabilities.supportsImageInput).toBe(true);
        expect(model.capabilities.supportsMultipleImages).toBe(true);
        expect(model.capabilities.supportsImageEditing).toBe(true);
      }
    }
  });

  it("centralizes pricing with provenance metadata", () => {
    for (const model of MODEL_REGISTRY) {
      expect(model.pricing.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(model.pricing.source).toMatch(/^https:\/\//);
    }
    expect(estimatedCost("openai", "gpt-image-2-medium", "medium")).toBeGreaterThan(0);
    expect(estimatedCost("openai", "gpt-image-2-medium", "nope")).toBeNull();
    expect(estimatedCost("openai", "missing", "medium")).toBeNull();
  });
});
