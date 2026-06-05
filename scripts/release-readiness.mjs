import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const expectedDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/guangdong_comprehensive_evaluation";

if (!process.env.DATABASE_URL) {
  console.error("Release readiness requires DATABASE_URL for the PostgreSQL integration gate.");
  console.error(`Use DATABASE_URL=${expectedDatabaseUrl}`);
  process.exit(1);
}

const env = {
  ...process.env,
  BROWSER_SCREENSHOT_DIR: process.env.BROWSER_SCREENSHOT_DIR ?? "scripts/ralph/runs/release-readiness-browser"
};
const steps = [
  ["build", ["run", "build"]],
  ["typecheck", ["run", "typecheck"]],
  ["lint", ["run", "lint"]],
  ["unit and route tests", ["test"]],
  ["data quality", ["run", "data-quality"]],
  ["test PRD matrix", ["run", "test-prd:matrix"]],
  ["browser verification", ["run", "browser-test"]],
  ["PostgreSQL integration", ["run", "db:integration"]],
  ["performance smoke", ["run", "perf:smoke"]]
];

for (const [label, args] of steps) {
  console.log(`\n[release-readiness] ${label}`);
  const result = spawnSync(npmCommand, args, {
    stdio: "inherit",
    env
  });

  if (result.status !== 0) {
    console.error(`[release-readiness] ${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nRelease readiness passed.");
