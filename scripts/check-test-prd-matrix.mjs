import { readFile } from "node:fs/promises";

const caseIdPattern = /\b(?:FE|ADM|API)-[A-Z0-9]+-[0-9]{3}\b/g;
const caseIdCellPattern = /^(?:FE|ADM|API)-[A-Z0-9]+-[0-9]{3}$/;
const allowedCoverageTypes = new Set([
  "Automated test",
  "Browser check",
  "Data-quality check",
  "Manual",
  "Out-of-scope"
]);

function uniqueIds(text) {
  return [...new Set(text.match(caseIdPattern) ?? [])].sort();
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function matrixRows(matrixText) {
  return matrixText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => caseIdCellPattern.test(cells[0] ?? ""))
    .map((cells) => {
      return {
        id: cells[0],
        coverageType: cells[1] ?? "",
        gate: cells[2] ?? "",
        notes: cells[3] ?? ""
      };
    });
}

const prdText = await readFile("docs/test-prd.md", "utf8");
const matrixText = await readFile("docs/test-prd-coverage-matrix.md", "utf8");
const prdIds = uniqueIds(prdText);
const rows = matrixRows(matrixText);
const matrixIds = rows.map((row) => row.id).sort();
const failures = [];
const rowCounts = new Map();

for (const id of matrixIds) {
  rowCounts.set(id, (rowCounts.get(id) ?? 0) + 1);
}

const missing = difference(prdIds, matrixIds);
const extra = difference(matrixIds, prdIds);
const duplicates = [...rowCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);

if (missing.length > 0) {
  failures.push(`Missing matrix rows for: ${missing.join(", ")}`);
}

if (extra.length > 0) {
  failures.push(`Matrix rows not present in docs/test-prd.md: ${extra.join(", ")}`);
}

if (duplicates.length > 0) {
  failures.push(`Duplicate matrix rows for: ${duplicates.join(", ")}`);
}

for (const row of rows) {
  if (!allowedCoverageTypes.has(row.coverageType)) {
    failures.push(`${row.id} uses unsupported coverage type "${row.coverageType}"`);
  }

  if (!row.gate) {
    failures.push(`${row.id} is missing a gate or artifact`);
  }

  if ((row.coverageType === "Manual" || row.coverageType === "Out-of-scope") && !row.notes) {
    failures.push(`${row.id} requires a documented manual or out-of-scope reason`);
  }
}

if (failures.length > 0) {
  console.error("Test PRD matrix check failed:");
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Test PRD matrix check passed: ${prdIds.length} case IDs mapped.`);
