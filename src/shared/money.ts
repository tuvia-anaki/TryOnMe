/**
 * Prices written exactly like the store writes them. The theme app extension
 * prints one sample amount with Shopify's own money filters (in the shopper's
 * currency), e.g. "$1,234.56" / "$1,234.56 CAD" / "1.234,56 €" / "¥1,235";
 * from that sample we learn symbol placement, separators and decimals.
 */

export const SAMPLE_CENTS = 123456;

export interface MoneyPattern {
  prefix: string;
  suffix: string;
  decimals: number;
  decimalSep: string;
  groupSep: string;
}

const NUMBER_RUN = /\d(?:[\d.,'’\s   ]*\d)?/g;
const SEPARATORS = /[.,'’\s   ]/;

interface Reading {
  value: number;
  decimals: number;
  decimalSep: string;
  groupSep: string;
}

function groupsOk(intPart: string, sep: string): boolean {
  const parts = intPart.split(sep);
  return /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every((part) => /^\d{3}$/.test(part));
}

/** The ways a run of digits and separators can be read ("1,234" = 1234 or 1.234). */
function readings(run: string): Reading[] {
  const out: Reading[] = [];
  const seps = [...new Set([...run].filter((ch) => SEPARATORS.test(ch)))];
  if (!seps.length) return [{ value: Number(run), decimals: 0, decimalSep: ".", groupSep: "" }];
  // A whole number with group separators ("1,234", "1 234").
  if (seps.length === 1 && groupsOk(run, seps[0])) {
    out.push({ value: Number(run.split(seps[0]).join("")), decimals: 0, decimalSep: seps[0] === "." ? "," : ".", groupSep: seps[0] });
  }
  // The last separator is the decimal separator ("1,234.56", "9,49", "1.234,560").
  const m = /^(.*?)([.,])(\d{1,3})$/.exec(run);
  if (m) {
    const [, intPart, decimalSep, frac] = m;
    const groupSeps = [...new Set([...intPart].filter((ch) => SEPARATORS.test(ch)))];
    if (!groupSeps.length && /^\d+$/.test(intPart)) {
      out.push({ value: Number(`${intPart}.${frac}`), decimals: frac.length, decimalSep, groupSep: "" });
    } else if (groupSeps.length === 1 && groupSeps[0] !== decimalSep && groupsOk(intPart, groupSeps[0])) {
      out.push({ value: Number(`${intPart.split(groupSeps[0]).join("")}.${frac}`), decimals: frac.length, decimalSep, groupSep: groupSeps[0] });
    }
  }
  return out;
}

/** Learn the pattern from text that shows `cents` (e.g. "$1,234.56 CAD" for 123456). */
export function learnMoneyPattern(text: string, cents: number): MoneyPattern | null {
  const target = cents / 100;
  for (const match of text.matchAll(NUMBER_RUN)) {
    const run = match[0].trim();
    const start = match.index ?? 0;
    for (const reading of readings(run)) {
      const matches =
        Math.abs(reading.value - target) < 0.0001 || (reading.decimals === 0 && Math.round(target) === reading.value);
      if (!matches) continue;
      return {
        prefix: text.slice(0, start),
        suffix: text.slice(start + match[0].length),
        decimals: reading.decimals,
        decimalSep: reading.decimalSep,
        groupSep: reading.groupSep,
      };
    }
  }
  return null;
}

/** Format an amount in cents with a learned pattern. */
export function formatMoney(pattern: MoneyPattern, cents: number): string {
  const value = pattern.decimals === 0 ? Math.round(cents / 100) : cents / 100;
  const fixed = value.toFixed(pattern.decimals);
  const [int, frac] = fixed.split(".");
  const grouped = pattern.groupSep ? int.replace(/\B(?=(\d{3})+(?!\d))/g, pattern.groupSep) : int;
  return `${pattern.prefix}${frac ? `${grouped}${pattern.decimalSep}${frac}` : grouped}${pattern.suffix}`;
}

export interface MoneyMatch {
  start: number;
  end: number;
  pattern: MoneyPattern;
  cents: number;
}

/**
 * Where an amount appears in a text written with one of the patterns
 * ("From $9.49 CAD" → the "$9.49 CAD" part). `loose` also accepts a bare
 * number, for themes that print the currency symbol in a separate element.
 */
export function findMoney(text: string, patterns: MoneyPattern[], loose = false): MoneyMatch | null {
  const trimEnd = (value: string) => value.replace(/[\s\u00a0\u202f]+$/, "");
  const trimStart = (value: string) => value.replace(/^[\s\u00a0\u202f]+/, "");
  let fallback: MoneyMatch | null = null;
  for (const match of text.matchAll(NUMBER_RUN)) {
    const run = match[0].trim();
    const runStart = match.index ?? 0;
    const runEnd = runStart + match[0].length;
    for (const pattern of patterns) {
      const reading = readings(run).find(
        (r) =>
          r.decimals === pattern.decimals &&
          (!r.groupSep || r.groupSep === pattern.groupSep) &&
          (r.decimals === 0 || r.decimalSep === pattern.decimalSep),
      );
      if (!reading) continue;
      const cents = Math.round(reading.value * 100);
      const prefix = pattern.prefix.trim();
      const suffix = pattern.suffix.trim();
      const before = trimEnd(text.slice(0, runStart));
      const after = trimStart(text.slice(runEnd));
      const hasPrefix = !prefix || before.endsWith(prefix);
      const hasSuffix = !suffix || after.startsWith(suffix);
      if (hasPrefix && hasSuffix && (prefix || suffix)) {
        const start = prefix ? before.length - prefix.length : runStart;
        const end = suffix ? text.length - after.length + suffix.length : runEnd;
        return { start, end, pattern, cents };
      }
      if (loose && !fallback) fallback = { start: runStart, end: runEnd, pattern: { ...pattern, prefix: "", suffix: "" }, cents };
    }
  }
  return fallback;
}
