import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Integration tests need a scratch PostgreSQL database. Set TEST_DATABASE_URL
 * to run them (e.g. a free Neon/Render database, or a local Postgres):
 *
 *   TEST_DATABASE_URL="postgresql://..." npm test
 *
 * Without it the DB-backed suite skips and the pure-logic suites still run.
 * NEVER point this at production — setup wipes and recreates the schema.
 */
export default function setup() {
  fs.rmSync(path.join(process.cwd(), ".data", "test-storage"), {
    recursive: true,
    force: true,
  });

  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn(
      "\n[tests] TEST_DATABASE_URL not set — skipping database integration tests.\n",
    );
    return;
  }

  execSync("npx prisma db push --force-reset --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
