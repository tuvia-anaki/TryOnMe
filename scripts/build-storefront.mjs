// Bundles the storefront scripts into the theme app extension's assets.
// Usage: node scripts/build-storefront.mjs [--watch]
import { build, context } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "extensions/variant-images/assets";

const options = {
  entryPoints: {
    "pvi-product": "src/storefront/product-entry.ts",
    "pvi-swatches": "src/storefront/swatches-entry.ts",
    "pvi-cards": "src/storefront/cards-entry.ts",
  },
  outdir,
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "chrome87", "safari15", "firefox78", "edge88"],
  legalComments: "none",
  logLevel: "info",
  charset: "utf8",
};

// Regex lookbehind throws a SyntaxError in Safari < 16.4 and would kill the whole script.
function checkCompat() {
  for (const name of Object.keys(options.entryPoints)) {
    const code = readFileSync(`${outdir}/${name}.js`, "utf8");
    if (/\(\?<[=!]/.test(code)) {
      console.error(`✘ ${name}.js contains a regex lookbehind, which crashes older Safari.`);
      process.exitCode = 1;
    }
  }
}

function report() {
  checkCompat();
  for (const name of Object.keys(options.entryPoints)) {
    const file = `${outdir}/${name}.js`;
    const raw = readFileSync(file);
    console.log(`  ${file}: ${(raw.length / 1024).toFixed(1)} KB (${(gzipSync(raw).length / 1024).toFixed(1)} KB gzip)`);
  }
}

if (watch) {
  const ctx = await context({
    ...options,
    plugins: [{ name: "report", setup(b) { b.onEnd((r) => { if (!r.errors.length) report(); }); } }],
  });
  await ctx.watch();
  console.log("Watching storefront sources…");
} else {
  await build(options);
  report();
}
