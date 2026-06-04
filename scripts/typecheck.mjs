import { spawnSync } from "node:child_process";

import { handleRequest } from "../src/app.js";
import { adminNavigation, studentNavigation } from "../src/lib/product.js";
import { collectFiles } from "./file-utils.mjs";

const jsFiles = await collectFiles(".", [".js", ".mjs"]);
const failures = [];

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });

  if (result.status !== 0) {
    failures.push(result.stderr || result.stdout || `${file} failed syntax validation`);
  }
}

if (typeof handleRequest !== "function") {
  failures.push("src/app.js must export handleRequest(request, response)");
}

for (const item of [...studentNavigation, ...adminNavigation]) {
  if (typeof item.href !== "string" || !item.href.startsWith("/")) {
    failures.push(`Invalid navigation href: ${JSON.stringify(item)}`);
  }

  if (typeof item.label !== "string" || item.label.length === 0) {
    failures.push(`Invalid navigation label: ${JSON.stringify(item)}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Typechecked ${jsFiles.length} JavaScript modules and route contracts`);
