import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import { collectFiles } from "./file-utils.mjs";

const textFiles = [
  "package.json",
  "package-lock.json",
  "README.md",
  ".env.example",
  ...(await collectFiles("src", [".js", ".sql"])),
  ...(await collectFiles("public", [".css"])),
  ...(await collectFiles("scripts", [".mjs"]))
];
const jsFiles = textFiles.filter((file) => file.endsWith(".js") || file.endsWith(".mjs"));
const failures = [];

for (const file of textFiles) {
  const contents = await readFile(file, "utf8");
  const lines = contents.split("\n");

  lines.forEach((line, index) => {
    if (/\s+$/.test(line)) {
      failures.push(`${file}:${index + 1} has trailing whitespace`);
    }

    if (line.includes("\t")) {
      failures.push(`${file}:${index + 1} contains a tab character`);
    }
  });
}

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });

  if (result.status !== 0) {
    failures.push(result.stderr || result.stdout || `${file} failed syntax validation`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Linted ${textFiles.length} files`);
