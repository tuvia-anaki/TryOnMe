// Refuses to deploy the Shopify config while application_url is still a placeholder:
// that would point every install of the app at a site that doesn't exist.
import { readFileSync } from "node:fs";

const toml = readFileSync("shopify.app.toml", "utf8");
const url = /^\s*application_url\s*=\s*"([^"]*)"/m.exec(toml)?.[1] ?? "";
if (!/^https:\/\//.test(url) || /YOUR-|example\.com/.test(url)) {
  console.error(
    `✘ shopify.app.toml application_url is "${url}".\n` +
      "  Host the admin first (Render, or Cloudflare with npm run deploy:worker), then put its URL in application_url and auth.redirect_urls.",
  );
  process.exit(1);
}
console.log(`✓ application_url = ${url}`);
