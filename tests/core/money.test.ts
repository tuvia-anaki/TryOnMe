import { describe, expect, it } from "vitest";
import { findMoney, formatMoney, learnMoneyPattern, SAMPLE_CENTS } from "../../src/shared/money";

const learn = (sample: string) => {
  const pattern = learnMoneyPattern(sample, SAMPLE_CENTS);
  if (!pattern) throw new Error(`no pattern in ${sample}`);
  return pattern;
};

describe("money patterns learned from Shopify's own formatting", () => {
  it.each([
    ["$1,234.56", 949, "$9.49"],
    ["$1,234.56 CAD", 123400, "$1,234.00 CAD"],
    ["1.234,56 €", 949, "9,49 €"],
    ["1 234,56 €", 1234567, "12 345,67 €"],
    ["€1.234,56 EUR", 5000, "€50,00 EUR"],
    ["¥1,235", 94900, "¥949"],
    ["Rs. 1,234.56", 199900, "Rs. 1,999.00"],
    ["CHF 1’234.56", 150000, "CHF 1’500.00"],
    ["1.234,560 KD", 1500, "15,000 KD"],
    ["kr 1.234,56", 12900, "kr 129,00"],
  ])("%s → %s", (sample, cents, expected) => {
    expect(formatMoney(learn(sample), cents)).toBe(expected);
  });

  it("finds a price inside surrounding words", () => {
    const pattern = learn("$1,234.56 CAD");
    const text = "From $9.49 CAD";
    const found = findMoney(text, [pattern]);
    expect(found && text.slice(found.start, found.end)).toBe("$9.49 CAD");
    expect(found?.cents).toBe(949);
    const eu = learn("1.234,56 €");
    const found2 = findMoney("ab 12,90 € *", [eu]);
    expect(found2?.cents).toBe(1290);
  });

  it("only accepts bare numbers in loose mode", () => {
    const pattern = learn("$1,234.56");
    expect(findMoney("9.49", [pattern])).toBeNull();
    expect(findMoney("9.49", [pattern], true)?.cents).toBe(949);
    expect(findMoney("Size 10", [pattern])).toBeNull();
  });
});
