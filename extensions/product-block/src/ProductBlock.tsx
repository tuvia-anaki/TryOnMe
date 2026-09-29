import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { bestInstantStrategy } from "../../../src/shared/autoassign";
import { groupingCombinations, suggestGroupingOptions } from "../../../src/shared/product";
import { setApiEndpoint } from "../../../src/admin/api/graphql";
import { loadProduct, saveProductConfig, type LoadedProduct } from "../../../src/admin/api/products";
import { loadAppContext } from "../../../src/admin/api/settings";

/**
 * Product details page block: shows whether variant images are set up for
 * this product and offers one-click auto-assign. Runs inside the Shopify
 * admin (Shopify-hosted) and talks to the Admin API directly.
 */

setApiEndpoint("shopify:admin/api/graphql.json");

export default async () => {
  render(<Block />, document.body);
};

const tr = (key: string, options?: Record<string, unknown>) => shopify.i18n.translate(key, options as any) as string;

function productIdFromGid(gid: string | undefined): number {
  const match = gid ? /\/(\d+)$/.exec(gid) : null;
  return match ? Number(match[1]) : 0;
}

function Block() {
  const productId = productIdFromGid(shopify.data.selected?.[0]?.id);
  const [loaded, setLoaded] = useState<LoadedProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "warning" | "critical"; text: string } | null>(null);

  const load = async () => {
    try {
      setError(null);
      setLoaded(await loadProduct(productId));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (productId) void load();
  }, [productId]);

  const autoAssign = async () => {
    if (!loaded) return;
    setBusy(true);
    setMessage(null);
    try {
      const context = await loadAppContext();
      const { product } = loaded;
      const best = bestInstantStrategy(product, {
        groupBy: suggestGroupingOptions(product),
        leading: context.settings.admin.leading,
      });
      if (best.result.groupsFilled < 2) {
        setMessage({ tone: "warning", text: tr("noMatch") });
        return;
      }
      best.result.config.hideUnassigned = loaded.config.hideUnassigned;
      await saveProductConfig(product, best.result.config, {
        syncVariantImages: context.settings.admin.syncVariantImages,
        digest: loaded.digest,
      });
      setMessage({
        tone: "success",
        text: tr("assigned", {
          images: best.result.assignedMedia,
          filled: best.result.groupsFilled,
          total: best.result.groupsTotal,
        }),
      });
      await load();
    } catch (e) {
      setMessage({ tone: "critical", text: tr("error", { message: (e as Error).message }) });
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <s-admin-block heading={tr("heading")}>
        <s-banner tone="critical">{tr("error", { message: error })}</s-banner>
      </s-admin-block>
    );
  }
  if (!loaded) {
    return (
      <s-admin-block heading={tr("heading")}>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-spinner accessibilityLabel={tr("loading")} />
          <s-text color="subdued">{tr("loading")}</s-text>
        </s-stack>
      </s-admin-block>
    );
  }

  const { product, config } = loaded;
  const configured = config.groups.length > 0;
  const combos = groupingCombinations(product, suggestGroupingOptions(product));
  const labels = new Map(combos.map((c) => [c.key, c.label]));
  const canAssign = product.variants.length > 1 && product.media.length > 1;

  return (
    <s-admin-block heading={tr("heading")}>
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          {configured ? (
            <s-badge tone="success">{tr("setUp", { count: config.groups.length })}</s-badge>
          ) : (
            <s-badge tone="caution">{tr("notSetUp")}</s-badge>
          )}
          <s-text color="subdued">{tr("summary", { variants: product.variants.length, media: product.media.length })}</s-text>
        </s-stack>

        {product.variants.length < 2 && <s-text color="subdued">{tr("singleVariant")}</s-text>}
        {product.variants.length > 1 && product.media.length < 2 && <s-text color="subdued">{tr("notEnoughMedia")}</s-text>}

        {configured && (
          <s-stack direction="block" gap="small-100">
            {config.groups.slice(0, 6).map((group) => (
              <s-text key={group.key}>{tr("groupLine", { label: labels.get(group.key) ?? group.key, count: group.media.length })}</s-text>
            ))}
          </s-stack>
        )}

        {message && <s-banner tone={message.tone}>{message.text}</s-banner>}

        <s-stack direction="inline" gap="small-200" alignItems="center">
          {canAssign && (
            <s-button onClick={() => void autoAssign()} loading={busy} disabled={busy}>
              {configured ? tr("reassign") : tr("autoAssign")}
            </s-button>
          )}
          <s-link href={`app:products/${product.id}`}>{tr("edit")}</s-link>
        </s-stack>
      </s-stack>
    </s-admin-block>
  );
}
