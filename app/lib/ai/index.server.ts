import type { AIProvider, ProviderId } from "./types";
import { openaiProvider } from "./openai.server";
import { geminiProvider } from "./gemini.server";
import { vertexProvider } from "./vertex.server";
import { fashnProvider } from "./fashn.server";

const PROVIDERS: Record<ProviderId, AIProvider> = {
  openai: openaiProvider,
  gemini: geminiProvider,
  vertex: vertexProvider,
  fashn: fashnProvider,
};

export function getProvider(id: string): AIProvider | undefined {
  return PROVIDERS[id as ProviderId];
}

export function allProviders(): AIProvider[] {
  return Object.values(PROVIDERS);
}
