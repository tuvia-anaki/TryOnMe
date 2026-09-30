import type { ComponentChildren } from "preact";

/** Thin wrappers around Polaris form fields with plain value callbacks. */

export function Toggle(props: { label: string; details?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <s-switch
      label={props.label}
      details={props.details}
      checked={props.checked}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
    />
  );
}

export function Check(props: { label: string; details?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <s-checkbox
      label={props.label}
      details={props.details}
      checked={props.checked}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
    />
  );
}

export function Select<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string][];
  details?: string;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <s-select label={props.label} value={props.value} details={props.details} disabled={props.disabled} onChange={(event) => props.onChange(event.currentTarget.value as T)}>
      {props.options.map(([value, label]) => (
        <s-option key={value} value={value}>
          {label}
        </s-option>
      ))}
    </s-select>
  );
}

export function Text(props: { label: string; value: string; placeholder?: string; details?: string; maxLength?: number; onChange: (value: string) => void }) {
  return (
    <s-text-field
      label={props.label}
      value={props.value}
      placeholder={props.placeholder}
      details={props.details}
      maxLength={props.maxLength}
      onInput={(event) => props.onChange(event.currentTarget.value ?? "")}
    />
  );
}

export function Area(props: { label: string; value: string; placeholder?: string; details?: string; rows?: number; onChange: (value: string) => void }) {
  return (
    <s-text-area
      label={props.label}
      value={props.value}
      placeholder={props.placeholder}
      details={props.details}
      rows={props.rows ?? 5}
      onInput={(event) => props.onChange(event.currentTarget.value ?? "")}
    />
  );
}

export function NumberInput(props: { label: string; value: number; min: number; max: number; suffix?: string; details?: string; onChange: (value: number) => void }) {
  return (
    <s-number-field
      label={props.label}
      value={String(props.value)}
      min={props.min}
      max={props.max}
      step={1}
      suffix={props.suffix}
      details={props.details}
      onChange={(event) => {
        const n = Number(event.currentTarget.value);
        if (Number.isFinite(n)) props.onChange(Math.min(props.max, Math.max(props.min, Math.round(n))));
      }}
    />
  );
}

/** A settings card: title, short description, fields. */
export function Card(props: { heading: string; description?: string; children: ComponentChildren }) {
  return (
    <s-section heading={props.heading}>
      <s-stack direction="block" gap="base">
        {props.description && <s-paragraph color="subdued">{props.description}</s-paragraph>}
        {props.children}
      </s-stack>
    </s-section>
  );
}
