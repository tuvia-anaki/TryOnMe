// Collects every translatable admin string (t("…"), tn(n, "…", "…"), msg("…"))
// and reports which locale files miss which strings.
// Usage: node scripts/i18n-extract.mjs [--write]   (--write updates src/admin/locales/_catalog.json)
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = "src/admin";
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "dev" && name !== "locales") walk(path);
    } else if (/\.(tsx?|mjs)$/.test(name)) files.push(path);
  }
})(root);

const strings = new Set();
const literal = `"((?:[^"\\\\]|\\\\.)*)"`;
const patterns = [
  new RegExp(`\\bt\\(\\s*${literal}`, "g"),
  new RegExp(`\\bmsg\\(\\s*${literal}`, "g"),
  new RegExp(`\\btn\\([^,]+,\\s*${literal}\\s*,\\s*${literal}`, "g"),
];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      for (const g of m.slice(1)) if (g !== undefined) strings.add(JSON.parse(`"${g}"`));
    }
  }
}
const catalog = [...strings].sort();
if (process.argv.includes("--write")) {
  writeFileSync(join(root, "locales/_catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
}
console.log(`${catalog.length} strings in ${files.length} files`);
for (const name of readdirSync(join(root, "locales")).filter((f) => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f))) {
  const dict = JSON.parse(readFileSync(join(root, "locales", name), "utf8"));
  const missing = catalog.filter((s) => !(s in dict));
  const extra = Object.keys(dict).filter((s) => !strings.has(s));
  const badVars = Object.entries(dict).filter(([k, v]) => {
    const vars = (x) => [...x.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    return vars(k) !== vars(v);
  });
  console.log(`${name}: ${missing.length} missing, ${extra.length} unused, ${badVars.length} placeholder mismatches`);
}
