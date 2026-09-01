import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export default function setup() {
  const dbPath = path.join(process.cwd(), "prisma", "test.sqlite");
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: "file:./test.sqlite" },
    stdio: "inherit",
  });
  fs.rmSync(path.join(process.cwd(), ".data", "test-storage"), {
    recursive: true,
    force: true,
  });
}
