import { splitOptionName, TITLE_PRESETS, type SplitBy } from "../../shared/settings";
import { isSizeOptionName } from "../../shared/product";
import { loadOptionNames, type StoreOption } from "../api/collections";
import { t, tn } from "../i18n";
import { useAsync } from "../lib/hooks";
import { ChoiceCards } from "./ChoiceCards";
import type { DropdownOption } from "./Dropdown";
import { Dropdown } from "./Dropdown";
import { Text } from "./fields";
import { SplitVisual, type SplitKind } from "./SplitVisual";

/**
 * The two settings that shape every card, in plain words: what gets its own
 * card (each style / each variant / each value of an option / nothing),
 * and the card's title.
 */

export function splitKind(enabled: boolean, by: SplitBy): SplitKind {
  if (!enabled) return "none";
  return by === "all" ? "variant" : splitOptionName(by) ? "option" : "style";
}

/** "Style", "Variant" or the option's name: the word in "Product name - Style". */
export function splitWord(by: SplitBy): string {
  return by === "all" ? t("Variant") : splitOptionName(by) ?? t("Style");
}

/** One line for summaries: "Each style", "Each variant", "Each Scent", "One card per product". */
export function splitSummary(enabled: boolean, by: SplitBy): string {
  const kind = splitKind(enabled, by);
  if (kind === "none") return t("One card per product");
  if (kind === "variant") return t("Each variant");
  if (kind === "option") return t("Each {option}", { option: splitOptionName(by)! });
  return t("Each style");
}

/** The option names to offer, keeping one that's already chosen even if no product has it now. */
function optionChoices(options: StoreOption[] | undefined, current: string | null): StoreOption[] {
  const list = options ?? [];
  if (current && !list.some((o) => o.name.toLowerCase() === current.toLowerCase())) return [{ name: current, products: 0, example: "" }, ...list];
  return list;
}

/** "Every variant" in the option list (all options together). */
const EVERY = "__every__";

/** What gets its own card: three pictures (each style, one option, one card per product). */
export function SplitPicker(props: { enabled: boolean; by: SplitBy; labelHidden?: boolean; onChange: (split: { enabled: boolean; by: SplitBy }) => void }) {
  const options = useAsync(() => loadOptionNames(), []);
  const kind = splitKind(props.enabled, props.by);
  const picked = kind === "variant" ? "option" : kind;
  const current = splitOptionName(props.by);
  const available = optionChoices(options.data, current);

  const choose = (next: SplitKind) => {
    if (next === "none") props.onChange({ enabled: false, by: props.by });
    else if (next === "style") props.onChange({ enabled: true, by: "auto" });
    else if (kind !== "option" && kind !== "variant") {
      // Start with the most common option that isn't a size (sizes rarely deserve their own cards).
      const first = available.find((o) => !isSizeOptionName(o.name)) ?? available[0];
      props.onChange({ enabled: true, by: first ? `option:${first.name}` : "all" });
    }
  };

  return (
    <>
      <ChoiceCards<SplitKind>
        label={t("What gets its own card")}
        labelHidden={props.labelHidden}
        value={picked}
        onChange={choose}
        choices={[
          {
            value: "style",
            title: t("Each style"),
            badge: t("Recommended"),
            description: t("Colors, materials, scents… each gets its own card. Sizes stay together."),
            visual: <SplitVisual kind="style" />,
          },
          { value: "option", title: t("Pick an option"), description: t("Split by one option you choose, like Scent or Size."), visual: <SplitVisual kind="option" /> },
          { value: "none", title: t("One card per product"), description: t("Like your theme. Add swatches to pick colors on the card."), visual: <SplitVisual kind="none" /> },
        ]}
      />
      {picked === "option" && (
        <div class="vc-narrow">
          <Dropdown
            label={t("Which option")}
            value={kind === "variant" ? EVERY : (current ?? "")}
            options={[
              ...available.map((o) => ({
                value: o.name,
                label: o.name,
                description: o.products ? [tn(o.products, "{count} product", "{count} products"), o.example && t("e.g. {example}", { example: o.example })].filter(Boolean).join(" · ") : undefined,
              })),
              { value: EVERY, label: t("Every variant"), description: t("All options together, like Red / S") },
            ]}
            onChange={(name) => props.onChange({ enabled: true, by: name === EVERY ? "all" : `option:${name}` })}
          />
        </div>
      )}
    </>
  );
}

const CUSTOM = "__custom__";

/** A value of the chosen option, for title examples ("Fig" for Scent). */
export function useOptionExample(by: SplitBy): string | undefined {
  const name = splitOptionName(by);
  const options = useAsync(() => (name ? loadOptionNames() : Promise.resolve([])), [name]);
  return name ? options.data?.find((o) => o.name.toLowerCase() === name.toLowerCase())?.example : undefined;
}

/**
 * Title choices in words ("Product name - Color") with an example underneath ("T-shirt - Red").
 * `example` is a value of the chosen option ("Fig" for Scent).
 */
export function titleChoices(by: SplitBy, example?: string): DropdownOption<string>[] {
  const word = splitWord(by);
  const value = by === "all" ? `${t("Red")} / S` : splitOptionName(by) ? example || word : t("Red");
  const product = t("T-shirt");
  const fill = (template: string, name: string, v: string) => template.replace("{product}", name).replace("{value}", v);
  return TITLE_PRESETS.map((template) => ({
    value: template,
    label: template === "{product}" ? t("Product name only") : fill(template, t("Product name"), word),
    description: fill(template, product, value),
  }));
}

export function TitlePicker(props: { title: string; by: SplitBy; onChange: (title: string) => void }) {
  const preset = (TITLE_PRESETS as readonly string[]).includes(props.title);
  const example = useOptionExample(props.by);
  return (
    <>
      <Dropdown
        label={t("Card title")}
        value={preset ? props.title : CUSTOM}
        details={t("The name shoppers see on each card.")}
        showDescription
        options={[...titleChoices(props.by, example), { value: CUSTOM, label: t("Custom"), description: t("Write your own") }]}
        onChange={(value) => props.onChange(value === CUSTOM ? "{product} · {value}" : value)}
      />
      {!preset && (
        <Text
          label={t("Custom title")}
          value={props.title}
          details={t("Use {product} and {value}, like “{product} - {value}”. {vendor} and {type} work too.")}
          onChange={props.onChange}
        />
      )}
    </>
  );
}
