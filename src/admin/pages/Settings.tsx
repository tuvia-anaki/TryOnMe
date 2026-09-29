import { useRef, useState } from "preact/hooks";
import { PRODUCT_CONFIG_KEY, PRODUCT_CONFIG_NAMESPACE } from "../../shared/config";
import { sanitizeSettings, type AppSettings } from "../../shared/settings";
import { gql, throwUserErrors, type UserError } from "../api/graphql";
import { loadAppContext, saveSettings, type AppContext } from "../api/settings";
import { ErrorBanner, Loading } from "../components/common";
import { formatNumber, t } from "../i18n";
import { toast, useAsync, useSaveBar } from "../lib/hooks";

const val = (event: Event): string => String((event.currentTarget as any)?.value ?? "");
const checked = (event: Event): boolean => !!(event.currentTarget as any)?.checked;

/** Delete every product's variant image setup (used before uninstalling, or to start over). */
async function removeAllAssignments(onProgress: (removed: number) => void, shouldStop: () => boolean): Promise<number> {
  let after: string | null = null;
  let removed = 0;
  for (;;) {
    const data: any = await gql(
      `#graphql
      query ConfiguredProducts($after: String) {
        products(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id config: metafield(namespace: "${PRODUCT_CONFIG_NAMESPACE}", key: "${PRODUCT_CONFIG_KEY}") { id } }
        }
      }`,
      { after },
    );
    const owners: string[] = data.products.nodes.filter((n: any) => n.config).map((n: any) => n.id);
    for (let i = 0; i < owners.length; i += 25) {
      const batch = owners.slice(i, i + 25).map((ownerId) => ({ ownerId, namespace: PRODUCT_CONFIG_NAMESPACE, key: PRODUCT_CONFIG_KEY }));
      const result = await gql<{ metafieldsDelete: { userErrors: UserError[] } }>(
        `#graphql
        mutation DeleteVariantImages($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) { deletedMetafields { key } userErrors { field message } }
        }`,
        { metafields: batch },
      );
      throwUserErrors(result.metafieldsDelete.userErrors, "Couldn't remove variant images");
      removed += batch.length;
      onProgress(removed);
    }
    if (shouldStop() || !data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return removed;
}

function SettingsForm({ context }: { context: AppContext }) {
  const [draft, setDraft] = useState<AppSettings>(context.settings);
  const [saved, setSaved] = useState<AppSettings>(context.settings);
  const [saving, setSaving] = useState(false);
  const [cleanup, setCleanup] = useState<{ running: boolean; removed: number; done: boolean }>({ running: false, removed: 0, done: false });
  const stop = useRef(false);
  const modalRef = useRef<any>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const g = draft.gallery;
  const a = draft.admin;

  const updateGallery = (patch: Partial<AppSettings["gallery"]>) => setDraft((d) => sanitizeSettings({ ...d, gallery: { ...d.gallery, ...patch } }));
  const updateAdmin = (patch: Partial<AppSettings["admin"]>) => setDraft((d) => sanitizeSettings({ ...d, admin: { ...d.admin, ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const clean = await saveSettings(context, draft);
      setDraft(clean);
      setSaved(clean);
      toast(t("Saved"));
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setSaving(false);
    }
  };
  useSaveBar("pvi-settings-save-bar", dirty, saving, { onSave: () => void save(), onDiscard: () => setDraft(saved) }, { save: t("Save"), discard: t("Discard") });

  const runCleanup = async () => {
    modalRef.current?.hideOverlay?.();
    stop.current = false;
    setCleanup({ running: true, removed: 0, done: false });
    try {
      const removed = await removeAllAssignments(
        (n) => setCleanup((c) => ({ ...c, removed: n })),
        () => stop.current,
      );
      setCleanup({ running: false, removed, done: true });
      toast(t("Removed variant images from {count} products.", { count: formatNumber(removed) }));
    } catch (error) {
      setCleanup((c) => ({ ...c, running: false }));
      toast((error as Error).message, true);
    }
  };

  return (
    <s-page heading={t("Settings")} inlineSize="base">
      <s-button slot="primary-action" variant="primary" disabled={!dirty || saving} loading={saving} onClick={() => void save()}>
        {t("Save")}
      </s-button>

      <s-section heading={t("Product gallery")}>
        <s-stack direction="block" gap="base">
          <s-switch label={t("Show only the selected variant's images")} checked={g.enabled} onChange={(event) => updateGallery({ enabled: checked(event) })} />
          <s-switch
            label={t("Hide images that aren't assigned to any variant")}
            details={t("Off: images you didn't assign (like a size chart) show for every variant. Images marked “All variants (shared)” always show.")}
            checked={g.hideUnassigned}
            onChange={(event) => updateGallery({ hideUnassigned: checked(event) })}
          />
          <s-select label={t("When a product page opens without a selected variant")} value={g.noSelection} onChange={(event) => updateGallery({ noSelection: val(event) as any })}>
            <s-option value="first">{t("Show the first available variant's images")}</s-option>
            <s-option value="all">{t("Show all images")}</s-option>
          </s-select>
          <s-switch
            label={t("Jump to the variant's main image when a shopper picks a variant")}
            checked={g.showMainFirst}
            onChange={(event) => updateGallery({ showMainFirst: checked(event) })}
          />
          <s-switch
            label={t("Prevent flicker while the page loads")}
            details={t("Hides other variants' images before the script runs, on themes that support it.")}
            checked={g.preventFlash}
            onChange={(event) => updateGallery({ preventFlash: checked(event) })}
          />
        </s-stack>
      </s-section>

      <s-section heading={t("Saving and auto-assign")}>
        <s-stack direction="block" gap="base">
          <s-switch
            label={t("Set each variant's Shopify image to its main image when saving")}
            details={t("Keeps cart, checkout, order and Google Shopping images in sync with what shoppers see.")}
            checked={a.syncVariantImages}
            onChange={(event) => updateAdmin({ syncVariantImages: checked(event) })}
          />
          <s-select
            label={t("Auto-assign: images placed before the first variant image")}
            value={a.leading}
            onChange={(event) => updateAdmin({ leading: val(event) as any })}
          >
            <s-option value="shared">{t("Show for every variant (shared)")}</s-option>
            <s-option value="first">{t("Belong to the first variant")}</s-option>
            <s-option value="none">{t("Leave unassigned")}</s-option>
          </s-select>
        </s-stack>
      </s-section>

      <s-section heading={t("Theme compatibility (advanced)")}>
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            {t("The app finds your theme's gallery automatically. Only if it can't, enter a CSS selector that matches one gallery item (a slide or thumbnail).")}
          </s-paragraph>
          <s-text-field
            label={t("Gallery item selector")}
            placeholder=".product-gallery__item"
            value={g.itemSelector}
            onChange={(event) => updateGallery({ itemSelector: val(event) })}
          />
          <s-text-area
            label={t("Custom CSS")}
            rows={6}
            value={draft.customCss}
            details={t("Loaded on pages where the app runs. Swatches can be styled with CSS variables like --pvi-size or ::part(swatch).")}
            onChange={(event) => setDraft((d) => ({ ...d, customCss: val(event) }))}
          />
        </s-stack>
      </s-section>

      <s-section heading={t("Remove all data")}>
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            {t("Deletes the variant image setup from every product. Your product images themselves are never touched. Shopify also removes this data automatically some time after you uninstall the app.")}
          </s-paragraph>
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-button tone="critical" commandFor="pvi-cleanup-modal" disabled={cleanup.running}>
              {t("Remove all variant image assignments")}
            </s-button>
            {cleanup.running && (
              <>
                <s-text color="subdued">{t("Removed from {count} products…", { count: formatNumber(cleanup.removed) })}</s-text>
                <s-button variant="tertiary" onClick={() => (stop.current = true)}>
                  {t("Stop")}
                </s-button>
              </>
            )}
            {cleanup.done && !cleanup.running && <s-text color="subdued">{t("Done.")}</s-text>}
          </s-stack>
        </s-stack>
        <s-modal id="pvi-cleanup-modal" heading={t("Remove all assignments?")} ref={modalRef}>
          <s-paragraph>{t("Every product will show all of its images again. This can't be undone.")}</s-paragraph>
          <s-button slot="primary-action" tone="critical" variant="primary" onClick={() => void runCleanup()}>
            {t("Remove all")}
          </s-button>
          <s-button slot="secondary-actions" commandFor="pvi-cleanup-modal" command="--hide">
            {t("Cancel")}
          </s-button>
        </s-modal>
      </s-section>
    </s-page>
  );
}

export function Settings() {
  const context = useAsync(() => loadAppContext(), []);
  if (context.error) {
    return (
      <s-page heading={t("Settings")}>
        <ErrorBanner error={context.error} onRetry={context.reload} />
      </s-page>
    );
  }
  if (!context.data) {
    return (
      <s-page heading={t("Settings")}>
        <Loading />
      </s-page>
    );
  }
  return <SettingsForm context={context.data} />;
}
