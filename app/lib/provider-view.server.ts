import prisma from "../db.server";
import { decryptSecret } from "./crypto.server";
import { allProviders, getProvider } from "./ai/index.server";

/**
 * Merchant-facing view of providers/models: only providers with a working
 * adapter, and only models that support try-on AND that the merchant's own
 * API key can access. Availability checks fail open (null = unknown) so a
 * transient provider outage never empties the settings page.
 */

export async function availableModelIds(
  shopId: string,
  providerId: string,
): Promise<string[] | null> {
  const provider = getProvider(providerId);
  if (!provider?.listAvailableModelIds) return null;
  const credential = await prisma.aIProviderCredential.findUnique({
    where: { shopId_provider: { shopId, provider: providerId } },
  });
  if (!credential) return null;
  return provider.listAvailableModelIds(decryptSecret(credential.encryptedApiKey));
}

export async function providersViewForShop(shopId: string) {
  const providers = allProviders().filter((p) => p.implemented);
  return Promise.all(
    providers.map(async (p) => {
      const available = await availableModelIds(shopId, p.id);
      return {
        id: p.id,
        displayName: p.displayName,
        implemented: p.implemented,
        keyPlaceholder: p.keyPlaceholder,
        keyHelpUrl: p.keyHelpUrl,
        models: p
          .getModels()
          .filter(
            (m) =>
              m.enabled ||
              !m.capabilities.supportsVirtualTryOn, // keep unsupported models visible (greyed out)
          )
          .map((m) => ({
            modelId: m.modelId,
            displayName: m.displayName,
            description: m.description,
            recommended: m.recommended,
            selectable:
              m.enabled &&
              m.capabilities.supportsVirtualTryOn &&
              // Registry ids may encode a quality tier; availability is
              // checked against the real API model id.
              (available === null || available.includes(m.apiModelId ?? m.modelId)),
            qualityOptions: m.qualityOptions,
            defaultQuality: m.defaultQuality,
            pricing: m.pricing,
          })),
      };
    }),
  );
}
