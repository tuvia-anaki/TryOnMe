import { learnMoneyPattern, SAMPLE_CENTS, type MoneyPattern } from "../shared/money";
import { effectiveSettings, sanitizeCollectionSettings, sanitizeSettings, type AppSettings, type EffectiveSettings, type Texts } from "../shared/settings";

/** Everything the app embed prints for the storefront script (see blocks/app-embed.liquid). */
export interface RawContext {
  template: string;
  collection: { handle: string; id: number } | null;
  settings: unknown;
  collectionSettings: unknown;
  money: { plain: string; withCurrency: string };
  texts: Texts;
  designMode: boolean;
}

export interface PageContext {
  template: string;
  collection: { handle: string; id: number } | null;
  settings: AppSettings;
  effective: EffectiveSettings;
  /** Price patterns: without and with the currency code. */
  money: MoneyPattern[];
  texts: Texts;
  designMode: boolean;
  root: string;
}

/** Money formats may contain HTML entities ("&euro;{{amount}}"). */
function decode(text: string): string {
  if (!/[&<]/.test(text)) return text;
  return new DOMParser().parseFromString(text, "text/html").documentElement.textContent ?? text;
}

export function readContext(doc: Document = document): PageContext | null {
  const el = doc.getElementById("vc-config");
  if (!el?.textContent) return null;
  let raw: RawContext;
  try {
    raw = JSON.parse(el.textContent);
  } catch {
    return null;
  }
  const settings = sanitizeSettings(raw.settings);
  const collectionSettings = raw.collectionSettings ? sanitizeCollectionSettings(raw.collectionSettings) : null;
  const money = [raw.money?.withCurrency, raw.money?.plain]
    .map((sample) => (sample ? learnMoneyPattern(decode(sample), SAMPLE_CENTS) : null))
    .filter((p): p is MoneyPattern => !!p);
  // Merchant texts win over the store-language defaults printed by Liquid.
  const texts = { ...raw.texts } as Texts;
  for (const [key, value] of Object.entries(settings.texts)) if (value) texts[key as keyof Texts] = value;
  const r = (window as any).Shopify?.routes?.root;
  return {
    template: raw.template ?? "",
    collection: raw.collection ?? null,
    settings,
    effective: effectiveSettings(settings, collectionSettings),
    money,
    texts,
    designMode: !!raw.designMode,
    root: typeof r === "string" && r ? r : "/",
  };
}

/** Does the app split cards on this page? */
export function isActivePage(ctx: PageContext): boolean {
  const { settings, effective, template, collection } = ctx;
  if (!settings.enabled || !effective.enabled) return false;
  const type = template.split(".")[0];
  if (type === "collection" && collection) {
    if (collection.handle === "all") return settings.pages.allProducts;
    return settings.collections.mode === "all" || settings.collections.handles.includes(collection.handle);
  }
  if (type === "search") return settings.pages.search;
  if (type === "index") return settings.pages.home;
  return false;
}
