import type { ComponentChildren } from "preact";
import { useId, useRef } from "preact/hooks";

/**
 * A choice between a few options shown as cards (a radio group): a picture,
 * a title and a line of explanation each. Arrow keys move the selection.
 */

export interface Choice<T extends string> {
  value: T;
  title: string;
  description?: string;
  /** A small picture that shows what the choice does. */
  visual?: ComponentChildren;
  badge?: string;
  disabled?: boolean;
}

export function ChoiceCards<T extends string>(props: {
  label: string;
  labelHidden?: boolean;
  value: T;
  choices: Choice<T>[];
  /** Narrowest card width before the cards wrap. */
  minWidth?: number;
  onChange: (value: T) => void;
}) {
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);
  const selected = Math.max(
    0,
    props.choices.findIndex((c) => c.value === props.value),
  );

  /** Arrow keys: the next choice that isn't disabled, in that direction. */
  const move = (from: number, delta: 1 | -1) => {
    const n = props.choices.length;
    for (let i = 1; i <= n; i++) {
      const next = (from + delta * i + n * 2) % n;
      if (props.choices[next].disabled) continue;
      props.onChange(props.choices[next].value);
      group.current?.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus();
      return;
    }
  };

  return (
    <div class="vc-field">
      <span id={labelId} class={props.labelHidden ? "vc-visually-hidden" : "vc-field__label"}>
        {props.label}
      </span>
      <div ref={group} class="vc-choices" role="radiogroup" aria-labelledby={labelId} style={{ "--vc-choice-min": `${props.minWidth ?? 150}px` } as Record<string, string>}>
        {props.choices.map((choice, index) => {
          const checked = index === selected;
          return (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              disabled={choice.disabled}
              class={`vc-choice${checked ? " is-selected" : ""}`}
              onClick={() => props.onChange(choice.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  move(index, 1);
                } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  move(index, -1);
                }
              }}
            >
              {choice.visual && (
                <span class="vc-choice__visual" aria-hidden="true">
                  {choice.visual}
                </span>
              )}
              <span class="vc-choice__head">
                <span class="vc-choice__radio" aria-hidden="true" />
                <span class="vc-choice__title">{choice.title}</span>
                {choice.badge && <span class="vc-choice__badge">{choice.badge}</span>}
              </span>
              {choice.description && <span class="vc-choice__desc">{choice.description}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
