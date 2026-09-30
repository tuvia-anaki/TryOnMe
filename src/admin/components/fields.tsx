import { Dropdown } from "./Dropdown";

/** Form fields with plain value callbacks. */

/** A dropdown (the app's own, not the browser's): [value, label, optional second line]. */
export function Select<T extends string>(props: {
  label: string;
  labelHidden?: boolean;
  value: T;
  options: [T, string, string?][];
  details?: string;
  disabled?: boolean;
  /** Show the chosen option's second line on the button too. */
  showDescription?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Dropdown
      label={props.label}
      labelHidden={props.labelHidden}
      showDescription={props.showDescription}
      value={props.value}
      options={props.options.map(([value, label, description]) => ({ value, label, description }))}
      details={props.details}
      disabled={props.disabled}
      onChange={props.onChange}
    />
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
