import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { effectiveSettings, type AppSettings, type SwatchLook, type SwatchShape, type SwatchSize } from "../../shared/settings";
import { formatTitle, productCards, type VariantCard, type VcProduct } from "../../shared/split";
import { swatchSet, type SwatchSet } from "../../shared/swatches";
import { buildSwatches, type SwatchStyle } from "../../storefront/swatches";
import { loadSampleProducts } from "../api/collections";
import { ErrorBanner, Loading } from "../components/common";
import { TEE } from "../components/SplitVisual";
import { PageHeader, Panel, Segmented, ToggleRow } from "../components/ui";
import { currentLanguage, t } from "../i18n";
import { useSettingsDraft } from "../lib/draft";
import { useAsync } from "../lib/hooks";

/** A shirt picture, for the preview when the store has no product to show yet. */
const shirt = (hex: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#f4f4f4"/><path d="${TEE}" transform="translate(8 8)" fill="${hex}"/></svg>`)}`;

function demoProduct(): VcProduct {
  const colors: [string, string][] = [
    [t("Red"), "#d0312d"],
    [t("Blue"), "#2f6fdf"],
    [t("Green"), "#2e8b57"],
  ];
  const variants = colors.map(([name, hex], i) => ({ id: i + 1, title: name, options: [name], available: true, price: 2500, compareAtPrice: null, image: shirt(hex), mediaId: null }));
  return { id: 1, handle: "t-shirt", title: t("T-shirt"), vendor: "", type: "", options: [t("Color")], variants, image: variants[0].image, available: true };
}

interface Sample {
  card: VariantCard;
  set: SwatchSet;
}

/** The first card the store would show for each product that gets swatches (up to 3). */
function samplesFor(products: VcProduct[], settings: AppSettings): Sample[] {
  const rules = effectiveSettings(settings, null);
  const split = { split: rules.split, by: rules.by, hideSoldOut: rules.hideSoldOut, hideNoImage: rules.hideNoImage };
  const out: Sample[] = [];
  for (const product of products) {
    const card = productCards(product, split)[0];
    const set = card && swatchSet(card, rules);
    if (set) out.push({ card, set });
    if (out.length === 3) break;
  }
  return out;
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currentLanguage(), { style: "currency", currency }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

/** One product card as shoppers see it, with the store's own swatch code drawing the swatches. */
function PreviewCard({ sample, style, settings, currency }: { sample: Sample; style: SwatchStyle; settings: AppSettings; currency: string }) {
  const [shown, setShown] = useState(sample.card);
  const slot = useRef<HTMLDivElement>(null);
  const index = sample.card.product.options.indexOf(sample.set.option);
  const value = index >= 0 ? shown.variant.options[index] : sample.set.current;
  useEffect(() => {
    if (!slot.current) return;
    const row = buildSwatches(document, { ...sample.set, current: value }, "#", style, (swatch) => {
      setShown(swatch.card);
      row.select(swatch.value);
    });
    slot.current.replaceChildren(row.host);
  }, [sample, style.look, style.shape, style.size]);

  const product = shown.product;
  const title = sample.card.split ? formatTitle(settings.split.title, shown) : product.title;
  const price = shown.minPrice === shown.maxPrice ? money(shown.minPrice, currency) : `${money(shown.minPrice, currency)} – ${money(shown.maxPrice, currency)}`;
  return (
    <div class="vc-preview__card">
      <div class="vc-preview__photo">{(shown.image ?? product.image) && <img src={shown.image ?? product.image!} alt="" />}</div>
      <div class="vc-preview__title">{title}</div>
      <div class="vc-preview__price">{price}</div>
      <div ref={slot} />
    </div>
  );
}

function Preview({ settings, currency }: { settings: AppSettings; currency: string }) {
  const products = useAsync(() => loadSampleProducts(), []);
  const { samples, demo } = useMemo(() => {
    if (products.loading) return { samples: [], demo: false };
    const own = samplesFor(products.data ?? [], settings);
    // No product of the store gets swatches yet (or they couldn't load): a sample shirt shows the idea.
    return own.length ? { samples: own, demo: false } : { samples: samplesFor([demoProduct()], settings), demo: true };
  }, [products.data, products.loading, settings.split.enabled, settings.split.by, settings.hide.soldOut, settings.hide.noImage]);
  const style = settings.swatches;
  return (
    <div class="vc-preview">
      <p class="vc-muted">{products.loading ? t("Loading…") : demo ? t("A sample product. Try it: pick one.") : t("Your products, as shoppers will see them. Try it: pick one.")}</p>
      <div class="vc-preview__cards">
        {samples.map((sample) => (
          <PreviewCard key={sample.card.key} sample={sample} style={style} settings={settings} currency={currency} />
        ))}
      </div>
    </div>
  );
}

/** Swatches: one switch, three design choices, and a preview with the store's own products. */
export function Swatches() {
  // A form: changes are saved with Shopify's save bar, which appears once something changes.
  const { context, draft, patch } = useSettingsDraft("vc-swatches-save-bar");
  const header = (
    <PageHeader
      title={t("Swatches")}
      subtitle={t("Small swatches under each product card, with a color or a photo of each variant. Shoppers pick one, and the card shows that variant: its photo, name, price and link.")}
      back={{ label: t("Home"), to: "/" }}
    />
  );

  if (context.error) {
    return (
      <s-page inlineSize="base">
        {header}
        <ErrorBanner error={context.error} onRetry={context.reload} />
      </s-page>
    );
  }
  if (!draft) {
    return (
      <s-page inlineSize="base">
        {header}
        <Loading />
      </s-page>
    );
  }
  const sw = draft.swatches;

  return (
    <s-page inlineSize="base">
      {header}
      <div class="vc-stack">
        <Panel>
          <ToggleRow
            title={t("Swatches on product cards")}
            description={sw.enabled ? t("On every page that shows variant cards.") : t("Turn them on to choose how they look.")}
            checked={sw.enabled}
            onChange={(enabled) => patch("swatches", { enabled })}
          />
        </Panel>

        {sw.enabled && (
          <Panel title={t("Design")}>
            <div class="vc-design">
              <div class="vc-design__options">
                <Segmented<SwatchLook>
                  label={t("Each swatch shows")}
                  value={sw.look}
                  options={[
                    { value: "color", label: t("Color") },
                    { value: "photo", label: t("Photo") },
                  ]}
                  details={sw.look === "color" ? t("The color in the variant's name, like Navy. Variants without one show their photo.") : t("A small photo of each variant.")}
                  onChange={(look) => patch("swatches", { look })}
                />
                <Segmented<SwatchShape>
                  label={t("Shape")}
                  value={sw.shape}
                  options={[
                    { value: "round", label: t("Round") },
                    { value: "square", label: t("Square") },
                  ]}
                  onChange={(shape) => patch("swatches", { shape })}
                />
                <Segmented<SwatchSize>
                  label={t("Size")}
                  value={sw.size}
                  options={[
                    { value: "small", label: t("Small") },
                    { value: "medium", label: t("Medium") },
                    { value: "large", label: t("Large") },
                  ]}
                  onChange={(size) => patch("swatches", { size })}
                />
              </div>
              <Preview settings={draft} currency={context.data?.shop.currency ?? "USD"} />
            </div>
          </Panel>
        )}

        <Panel title={t("Good to know")}>
          <ul class="vc-bullets">
            <li>{t("Sold-out variants look faded. Shoppers can still pick them to see the photo.")}</li>
            <li>{t("With “One card per product” on Home, swatches are how shoppers pick a variant.")}</li>
          </ul>
        </Panel>
      </div>
    </s-page>
  );
}
