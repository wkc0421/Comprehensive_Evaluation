import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const databaseUrl = process.env.DATABASE_URL;
const expectedLocalUrl = "postgresql://postgres:postgres@127.0.0.1:5432/guangdong_comprehensive_evaluation";

function failSetup(message, detail = "") {
  console.error("PostgreSQL integration gate setup failed.");
  console.error(message);
  console.error(`Set DATABASE_URL to ${expectedLocalUrl}`);

  if (detail) {
    console.error(detail.trim());
  }

  process.exit(1);
}

if (!databaseUrl) {
  failSetup("DATABASE_URL is required for npm run db:integration.");
}

const psqlVersion = spawnSync("psql", ["--version"], { encoding: "utf8" });

if (psqlVersion.status !== 0) {
  failSetup("The psql command-line client is required.", psqlVersion.stderr || psqlVersion.stdout);
}

const schemaName = `gce_readiness_${Date.now()}_${process.pid}`.replace(/[^a-zA-Z0-9_]/g, "_");

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

function setupError(label, output) {
  return new Error([
    "PostgreSQL integration gate setup failed.",
    `${label} failed. Confirm PostgreSQL is running and the local test database exists.`,
    `Set DATABASE_URL to ${expectedLocalUrl}`,
    output.trim()
  ].filter(Boolean).join("\n"));
}

function runPsql(sql, label, options = {}) {
  const result = spawnSync("psql", [
    databaseUrl,
    "-X",
    "--set",
    "ON_ERROR_STOP=1",
    "--no-align",
    "--tuples-only"
  ], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.status !== 0 && !options.allowFailure) {
    throw setupError(label, result.stderr || result.stdout);
  }

  return result;
}

function verifyOutput(label, output, expected) {
  const actual = output.trim();

  if (actual !== expected) {
    throw new Error(`${label} expected ${expected}, got ${actual || "(empty)"}`);
  }
}

let schemaCreated = false;
try {
  runPsql(`CREATE SCHEMA ${quoteIdentifier(schemaName)};`, "Create isolated schema");
  schemaCreated = true;

  const migration = await readFile("src/db/migrations/001_core_data_model.sql", "utf8");

  runPsql(
    `SET search_path TO ${quoteIdentifier(schemaName)}, public;\n${migration}`,
    "Apply committed migrations"
  );

  const tableList = [
    "users",
    "schools",
    "admission_guides",
    "timeline_events",
    "score_formulas",
    "experiences",
    "experience_verifications",
    "interactions",
    "reports",
    "source_documents",
    "ingestion_runs"
  ];
  const indexList = [
    "admission_guides_one_current_per_scope",
    "schools_search_idx",
    "admission_guides_search_idx",
    "source_documents_search_idx",
    "experiences_search_idx"
  ];
  const requiredConstraints = [
    "admission_guides_school_year_scope_version_unique",
    "interactions_one_action_per_target"
  ];
  const expectedStatuses = "draft,pending_review,published,archived";
  const verificationSql = `
WITH required_tables(name) AS (
  VALUES ${tableList.map((name) => `(${quoteLiteral(name)})`).join(", ")}
),
found_tables AS (
  SELECT table_name AS name
  FROM information_schema.tables
  WHERE table_schema = ${quoteLiteral(schemaName)}
),
required_indexes(name) AS (
  VALUES ${indexList.map((name) => `(${quoteLiteral(name)})`).join(", ")}
),
found_indexes AS (
  SELECT indexname AS name
  FROM pg_indexes
  WHERE schemaname = ${quoteLiteral(schemaName)}
),
required_constraints(name) AS (
  VALUES ${requiredConstraints.map((name) => `(${quoteLiteral(name)})`).join(", ")}
),
found_constraints AS (
  SELECT con.conname AS name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = ${quoteLiteral(schemaName)}
),
official_statuses AS (
  SELECT string_agg(enum.enumlabel, ',' ORDER BY enum.enumsortorder) AS statuses
  FROM pg_enum enum
  JOIN pg_type typ ON typ.oid = enum.enumtypid
  JOIN pg_namespace nsp ON nsp.oid = typ.typnamespace
  WHERE nsp.nspname = ${quoteLiteral(schemaName)}
    AND typ.typname = 'official_data_status'
)
SELECT CASE WHEN
  NOT EXISTS (SELECT name FROM required_tables EXCEPT SELECT name FROM found_tables)
  AND NOT EXISTS (SELECT name FROM required_indexes EXCEPT SELECT name FROM found_indexes)
  AND NOT EXISTS (SELECT name FROM required_constraints EXCEPT SELECT name FROM found_constraints)
  AND (SELECT statuses FROM official_statuses) = ${quoteLiteral(expectedStatuses)}
THEN 'ok' ELSE 'failed' END;
`;
  const verification = runPsql(verificationSql, "Verify migrated schema");

  verifyOutput("PostgreSQL schema verification", verification.stdout, "ok");
  console.log(`PostgreSQL integration gate passed in isolated schema ${schemaName}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  const cleanup = schemaCreated
    ? runPsql(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE;`, "Drop isolated schema", {
        allowFailure: true
      })
    : { status: 0 };

  if (cleanup.status !== 0) {
    console.error(`Warning: failed to drop isolated schema ${schemaName}.`);
    console.error(cleanup.stderr || cleanup.stdout);
    process.exitCode = 1;
  }
}
