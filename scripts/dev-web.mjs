// Web process for `shopify app dev`: rebuilds storefront scripts on change
// and runs the Vite dev server for the admin.
import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["scripts/build-storefront.mjs", "--watch"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: "inherit", env: process.env }),
];

const stop = () => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => code && stop());
