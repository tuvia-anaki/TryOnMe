import { splitOptionName, TITLE_PRESETS, type SplitBy } from "../../shared/settings";
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
 * card (each color / each variant / each value of another option / nothing),
 * and the card's title.
 */

export function splitKind(enabled: boolean, by: SplitBy): SplitKind {
  if (!enabled) return "none";
  return by === "all" ? "variant" : splitOptionName(by) ? "option" : "color";
}

/** "Color", "Variant" or the option's name: the word in "Product name - Color". */
export function splitWord(by: SplitBy): string {
  return by === "all" ? t("Variant") : splitOptionName(by) ?? t("Color");
}

/** One line for summaries: "Each color", "Each variant", "Each Scent", "One card per product". */
export function splitSummary(enabled: boolean, by: SplitBy): string {
  const kind = splitKind(enabled, by);
  if (kind === "none") return t("One card per product");
  if (kind === "variant") return t("Each variant");
  if (kind === "option") return t("Each {option}", { option: splitOptionName(by)! });
  return t("Each color");
}

/** The option names to offer, keeping one that's already chosen even if no product has it now. */
function optionChoices(options: StoreOption[] | undefined, current: string | null): StoreOption[] {
  const list = options ?? [];
  if (current && !list.some((o) => o.name.toLowerCase() === current.toLowerCase())) return [{ name: current, products: 0, example: "" }, ...list];
  return list;
}

export function SplitPicker(props: { enabled: boolean; by: SplitBy; labelHidden?: boolean; onChange: (split: { enabled: boolean; by: SplitBy }) => void }) {
  const options = useAsync(() => loadOptionNames(), []);
  const kind = splitKind(props.enabled, props.by);
  const current = splitOptionName(props.by);
  const available = optionChoices(options.data, current);
  const noOptions = !!options.data && !available.length;

  const choose = (next: SplitKind) => {
    if (next === "none") props.onChange({ enabled: false, by: props.by });
    else if (next === "variant") props.onChange({ enabled: true, by: "all" });
    else if (next === "color") props.onChange({ enabled: true, by: "auto" });
    else if (available.length) props.onChange({ enabled: true, by: `option:${current ?? available[0].name}` });
  };

  return (
    <>
      <ChoiceCards<SplitKind>
        label={t("What gets its own card")}
        labelHidden={props.labelHidden}
        value={kind}
        onChange={choose}
        choices={[
          { value: "color", title: t("Each color"), badge: t("Recommended"), description: t("Red, blue and green become 3 cards. Sizes stay together."), visual: <SplitVisual kind="color" /> },
          { value: "variant", title: t("Each variant"), description: t("Every color and size gets its own card."), visual: <SplitVisual kind="variant" /> },
          {
            value: "option",
            title: t("Another option"),
            description: noOptions ? t("Your products don't have other options.") : t("Like material or style."),
            visual: <SplitVisual kind="option" />,
            disabled: noOptions && kind !== "option",
          },
          { value: "none", title: t("Don't split"), description: t("One card per product, like your theme."), visual: <SplitVisual kind="none" /> },
        ]}
      />
      {kind === "option" && (
        <div class="vc-narrow">
          <Dropdown
            label={t("Which option")}
            value={current ?? ""}
            options={available.map((o) => ({
              value: o.name,
              label: o.name,
              description: o.products ? [tn(o.products, "{count} product", "{count} products"), o.example && t("e.g. {example}", { example: o.example })].filter(Boolean).join(" · ") : undefined,
            }))}
            onChange={(name) => props.onChange({ enabled: true, by: `option:${name}` })}
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
