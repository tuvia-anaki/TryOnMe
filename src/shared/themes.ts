/**
 * Themes whose collection pages the storefront script is tested against
 * (real demo-store markup, see tests/compat), plus the free themes built on
 * the same code (Dawn and Horizon families).
 */
export const TESTED_THEMES = [
  // Dawn family (free themes)
  "Dawn", "Refresh", "Sense", "Craft", "Studio", "Taste", "Crave", "Origin", "Ride", "Colorblock", "Publisher", "Spotlight", "Trade",
  // Horizon family (free themes)
  "Horizon", "Savor", "Atelier", "Tinker", "Pitch", "Heritage", "Dwell", "Fabric", "Vessel", "Ritual",
  // Theme Store themes
  "Prestige", "Impulse", "Impact", "Focal", "Warehouse", "Symmetry", "Motion", "Broadcast", "Be Yours", "Enterprise",
  "Expanse", "Palo Alto", "Empire", "Stiletto", "Minimog", "Ella", "Shrine", "Pipeline", "Streamline", "Showcase",
];

/** The tested theme a (possibly renamed, "Copy of …") theme is based on. */
export function testedThemeFor(name: string): string | null {
  const lower = ` ${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  return TESTED_THEMES.find((theme) => lower.includes(` ${theme.toLowerCase()} `)) ?? null;
}
