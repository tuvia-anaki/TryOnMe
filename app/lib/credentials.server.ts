import prisma from "../db.server";
import { encryptSecret, decryptSecret, maskApiKey } from "./crypto.server";
import { getProvider } from "./ai/index.server";

/**
 * Merchant AI credentials: validate against the provider, encrypt with
 * AES-256-GCM, store only ciphertext + masked display form.
 * Raw keys are never logged and never leave the server.
 */

export type ConnectResult =
  | { ok: true; maskedKey: string }
  | { ok: false; message: string };

export async function connectProvider(
  shopId: string,
  providerId: string,
  apiKey: string,
): Promise<ConnectResult> {
  const provider = getProvider(providerId);
  if (!provider) return { ok: false, message: "Unknown provider." };
  if (!provider.implemented) {
    return { ok: false, message: `${provider.displayName} support is coming soon.` };
  }

  const trimmed = apiKey.trim();
  if (trimmed.length < 8 || trimmed.length > 512) {
    return { ok: false, message: "That doesn't look like a valid API key." };
  }

  const validation = await provider.validateApiKey(trimmed);
  if (!validation.valid) {
    return {
      ok: false,
      message: validation.message ?? "The provider rejected this API key.",
    };
  }

  const maskedKey = maskApiKey(trimmed);
  await prisma.aIProviderCredential.upsert({
    where: { shopId_provider: { shopId, provider: providerId } },
    create: { shopId, provider: providerId, encryptedApiKey: encryptSecret(trimmed), maskedKey },
    update: { encryptedApiKey: encryptSecret(trimmed), maskedKey },
  });

  return { ok: true, maskedKey };
}

export async function testProviderConnection(
  shopId: string,
  providerId: string,
): Promise<{ ok: boolean; message: string }> {
  const provider = getProvider(providerId);
  const credential = await prisma.aIProviderCredential.findUnique({
    where: { shopId_provider: { shopId, provider: providerId } },
  });
  if (!provider || !credential) return { ok: false, message: "No API key connected." };

  const validation = await provider.validateApiKey(decryptSecret(credential.encryptedApiKey));
  return validation.valid
    ? { ok: true, message: "Connection is working." }
    : { ok: false, message: validation.message ?? "The provider rejected the stored key." };
}

export async function disconnectProvider(shopId: string, providerId: string) {
  await prisma.aIProviderCredential.deleteMany({
    where: { shopId, provider: providerId },
  });
  // If this was the active provider, clear the selection.
  const settings = await prisma.shopSettings.findUnique({ where: { shopId } });
  if (settings?.provider === providerId) {
    await prisma.shopSettings.update({
      where: { shopId },
      data: { provider: null, model: null },
    });
  }
}
