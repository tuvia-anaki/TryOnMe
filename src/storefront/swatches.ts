import { isColorOptionName } from "../shared/product";
import type { AppSettings } from "../shared/settings";
import type { SFProduct } from "./data";
import { isInert, readSelection, type NativeOption } from "./picker";
import { cssVars, SWATCH_CSS, visualFor, type SwatchVisual } from "./swatch-style";

/**
 * Visual swatches that drive the theme's own picker. Each option gets a
 * small shadow-DOM widget inserted where the native control was; the native
 * control stays in the DOM (hidden) and remains the source of truth, so the
 * theme keeps handling price, availability, URL and add-to-cart.
 */

export interface SwatchStrings {
  soldOut: string;
  unavailable: string;
}

const HOST_ATTR = "data-pvi-ui";
const NATIVE_HIDDEN = "data-pvi-native-hidden";

interface Group {
  optionIndex: number;
  host: HTMLElement;
  root: ShadowRoot;
  buttons: HTMLButtonElement[];
  valueLabel: HTMLElement | null;
  native: NativeOption;
}

export interface NativeSource {
  get(): NativeOption[];
  refresh(): NativeOption[];
}

export class SwatchController {
  private groups: Group[] = [];
  private native: NativeOption[] = [];
  private observer: MutationObserver | null = null;
  private busy = false;

  constructor(
    private readonly scope: Element,
    private readonly product: SFProduct,
    private readonly settings: AppSettings,
    private readonly strings: SwatchStrings,
    private readonly currentVariant: () => number | null,
    private readonly source: NativeSource,
  ) {}

  /** Options that get our UI, and whether it's visual (color/image) or pills. */
  private modeFor(index: number): "visual" | "pills" | null {
    const option = this.product.options[index];
    const s = this.settings.swatches;
    const name = option.name.trim().toLowerCase();
    const visual =
      s.applyTo === "all" ||
      (s.applyTo === "color" && isColorOptionName(option.name)) ||
      (s.applyTo === "custom" && s.customOptions.some((o) => o.trim().toLowerCase() === name));
    if (visual) return "visual";
    return s.otherOptions === "pills" ? "pills" : null;
  }

  start(): void {
    if (!this.settings.swatches.enabled || !this.product.options.length) return;
    if (this.product.variants.length < 2) return;
    this.mount();
    this.observer = new MutationObserver(() => {
      if (this.busy) return;
      // Theme re-rendered its picker: re-mount immediately (before paint).
      const broken =
        this.groups.some(
          (g) => !g.host.isConnected || g.native.blocks.some((b) => !b.isConnected) || isInert(g.host, this.scope),
        ) ||
        this.native.some((n) => n.controls.some((c) => !c.isConnected));
      if (broken) this.mount();
      else this.sync();
    });
    this.observer.observe(this.scope, { childList: true, subtree: true });
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    for (const group of this.groups) {
      group.host.remove();
      group.native.blocks.forEach((block) => block.removeAttribute(NATIVE_HIDDEN));
    }
    this.groups = [];
  }

  private refreshNative(): NativeOption[] {
    this.native = this.source.refresh();
    return this.native;
  }

  private mount(): void {
    this.busy = true;
    try {
      for (const group of this.groups) group.host.remove();
      this.groups = [];
      this.refreshNative();
      for (const native of this.native) {
        const mode = this.modeFor(native.index);
        if (!mode) continue;
        const group = this.build(native, mode);
        if (group) this.groups.push(group);
      }
      this.sync();
    } finally {
      this.observer?.takeRecords();
      this.busy = false;
    }
  }

  private imageFor(index: number, valueName: string): string | null {
    const valueId = this.product.options[index]?.values.find((v) => v.name === valueName)?.id;
    if (valueId != null) {
      // The app config's group for this value (single-option groups first).
      const groups = this.product.config.groups
        .filter((g) => g.valueIds.includes(valueId))
        .sort((a, b) => a.valueIds.length - b.valueIds.length);
      for (const group of groups) {
        const media = group.media.map((id) => this.product.mediaById.get(id)).find((m) => m?.thumb);
        if (media?.thumb) return media.thumb;
      }
    }
    const variant = this.product.variants.find((v) => v.names[index] === valueName && v.featuredMediaId);
    const media = variant?.featuredMediaId ? this.product.mediaById.get(variant.featuredMediaId) : null;
    return media?.thumb ?? null;
  }

  private build(native: NativeOption, mode: "visual" | "pills"): Group | null {
    const option = this.product.options[native.index];
    const visuals: SwatchVisual[] = option.values.map((value) =>
      mode === "pills"
        ? { kind: "text" }
        : visualFor(
            {
              name: value.name,
              nativeColor: value.color,
              nativeImage: value.image,
              variantImage: this.imageFor(native.index, value.name),
            },
            this.settings,
          ),
    );
    // A "visual" option where nothing can be drawn falls back to pills.
    const allText = visuals.every((v) => v.kind === "text");
    if (mode === "visual" && allText && this.settings.swatches.otherOptions === "native") return null;

    const dom = createSwatchGroup({
      optionName: option.name,
      values: option.values.map((value, i) => ({ name: value.name, visual: allText ? { kind: "text" } : visuals[i] })),
      settings: this.settings,
      idPrefix: `pvi-l-${this.product.id}-${native.index}`,
    });
    dom.buttons.forEach((button) => {
      button.addEventListener("click", () => this.choose(native, button.dataset.value ?? ""));
      button.addEventListener("keydown", (event) => this.onKey(event, dom.buttons, native));
    });
    const first = native.blocks[0];
    if (!first?.parentElement) return null;
    first.parentElement.insertBefore(dom.host, first);
    native.blocks.forEach((block) => block.setAttribute(NATIVE_HIDDEN, ""));
    return { optionIndex: native.index, host: dom.host, root: dom.root, buttons: dom.buttons, valueLabel: dom.valueLabel, native };
  }

  private onKey(event: KeyboardEvent, buttons: HTMLButtonElement[], native: NativeOption): void {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const step = keys[event.key];
    if (!step) return;
    event.preventDefault();
    const enabled = buttons.filter((b) => !b.classList.contains("hide"));
    const index = enabled.indexOf(event.currentTarget as HTMLButtonElement);
    const next = enabled[(index + step + enabled.length) % enabled.length];
    if (!next) return;
    next.focus();
    this.choose(native, next.dataset.value ?? "");
  }

  private choose(native: NativeOption, value: string): void {
    const event = new CustomEvent("pvi:swatch-click", {
      bubbles: true,
      cancelable: true,
      detail: { productId: this.product.id, option: this.product.options[native.index]?.name, value },
    });
    // Integrations can cancel the default behaviour (selecting the value in the theme's picker).
    if (!this.scope.dispatchEvent(event)) return;
    // Refresh the reference in case the theme re-rendered since mounting.
    this.native = this.source.get();
    const fresh = this.native.find((n) => n.index === native.index && n.controls.every((c) => c.isConnected)) ?? native;
    fresh.choose(value);
    this.sync(value, native.index);
  }

  /** Update selected + availability state from the native picker. */
  sync(optimisticValue?: string, optimisticIndex?: number): void {
    if (!this.groups.length) return;
    const selection = readSelection(this.native, this.product.options.length);
    const current = this.currentVariant();
    const variant = current != null ? this.product.variantById.get(current) : null;
    selection.forEach((name, i) => {
      if (name == null && variant) selection[i] = variant.names[i];
    });
    if (optimisticValue != null && optimisticIndex != null) selection[optimisticIndex] = optimisticValue;

    for (const group of this.groups) {
      applySwatchState(
        { buttons: group.buttons, valueLabel: group.valueLabel },
        selection[group.optionIndex],
        (value) => this.availability(group.optionIndex, value, selection),
        this.settings,
        this.strings,
      );
    }
  }

  /** Cascading availability: earlier options' selections constrain later ones. */
  private availability(index: number, value: string, selection: (string | null)[]): "available" | "soldout" | "missing" {
    let exists = false;
    for (const variant of this.product.variants) {
      if (variant.names[index] !== value) continue;
      let ok = true;
      for (let j = 0; j < index; j++) {
        if (selection[j] != null && variant.names[j] !== selection[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      exists = true;
      if (variant.available) return "available";
    }
    // Liquid only lists the first 250 variants: beyond that, "not found" means unknown.
    if (!exists && this.product.variants.length >= 250) return "available";
    return exists ? "soldout" : "missing";
  }
}

/* ------------------------------------------------------------------ */
/* DOM helpers shared with the admin's live preview                    */
/* ------------------------------------------------------------------ */

export interface SwatchGroupDom {
  host: HTMLElement;
  root: ShadowRoot;
  buttons: HTMLButtonElement[];
  valueLabel: HTMLElement | null;
}

export function createSwatchGroup(params: {
  optionName: string;
  values: { name: string; visual: SwatchVisual }[];
  settings: AppSettings;
  idPrefix: string;
}): SwatchGroupDom {
  const { settings } = params;
  const host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "swatches");
  host.className = "pvi-swatches";
  host.setAttribute("style", cssVars(settings));
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = SWATCH_CSS;
  root.appendChild(style);

  let valueLabel: HTMLElement | null = null;
  const labelId = `${params.idPrefix}-label`;
  if (settings.swatches.showLabel) {
    const label = document.createElement("div");
    label.className = "label";
    label.id = labelId;
    label.setAttribute("part", "label");
    const b = document.createElement("b");
    b.textContent = `${params.optionName}: `;
    valueLabel = document.createElement("span");
    valueLabel.setAttribute("part", "value");
    label.append(b, valueLabel);
    root.appendChild(label);
  }

  const list = document.createElement("div");
  list.className = "list";
  list.setAttribute("role", "radiogroup");
  list.setAttribute("part", "list");
  if (valueLabel) list.setAttribute("aria-labelledby", labelId);
  else list.setAttribute("aria-label", params.optionName);
  root.appendChild(list);

  const buttons = params.values.map(({ name, visual }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.dataset.value = name;
    button.setAttribute("part", "swatch");
    if (visual.kind === "text") {
      button.className = "sw pill";
      button.textContent = name;
    } else {
      button.className = `sw vis${visual.light ? " light" : ""}`;
      button.setAttribute("aria-label", name);
      const fill = document.createElement("span");
      fill.className = "fill";
      if (visual.kind === "color") fill.style.background = visual.background ?? "";
      else fill.style.backgroundImage = `url("${String(visual.image).replace(/"/g, "%22")}")`;
      button.appendChild(fill);
      if (settings.swatches.tooltip) {
        const tip = document.createElement("span");
        tip.className = "tip";
        tip.setAttribute("part", "tooltip");
        tip.setAttribute("aria-hidden", "true");
        tip.textContent = name;
        button.appendChild(tip);
      }
    }
    const status = document.createElement("span");
    status.className = "sr";
    button.appendChild(status);
    list.appendChild(button);
    return button;
  });
  return { host, root, buttons, valueLabel };
}

export function applySwatchState(
  dom: { buttons: HTMLButtonElement[]; valueLabel: HTMLElement | null },
  selected: string | null,
  availability: (value: string) => "available" | "soldout" | "missing",
  settings: AppSettings,
  strings: SwatchStrings,
): void {
  if (dom.valueLabel) dom.valueLabel.textContent = selected ?? "";
  for (const button of dom.buttons) {
    const value = button.dataset.value ?? "";
    const isSelected = value === selected;
    button.setAttribute("aria-checked", String(isSelected));
    button.tabIndex = isSelected || (selected == null && button === dom.buttons[0]) ? 0 : -1;
    const state = availability(value);
    const soldOut = state !== "available";
    button.classList.toggle("sold", soldOut);
    button.classList.remove("cross", "fade", "hide");
    if (soldOut) {
      const style = settings.swatches.soldOut;
      // Never hide the selected value.
      button.classList.add(style === "hide" && isSelected ? "cross" : style);
    }
    const status = button.querySelector(".sr");
    if (status) status.textContent = soldOut ? ` (${state === "missing" ? strings.unavailable : strings.soldOut})` : "";
  }
}
