import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { accountStatuses, userRoles } from "../auth.js";
import { coreDataModelTables, coreMigrationFiles, officialDataStatuses } from "./schema.js";

const migrationSql = await readFile(new URL("./migrations/001_core_data_model.sql", import.meta.url), "utf8");

function compactSql(sql) {
  return sql.toLowerCase().replace(/\s+/g, " ").trim();
}

function tableDefinition(tableName) {
  const tablePattern = new RegExp(
    `CREATE TABLE IF NOT EXISTS ${tableName} \\((?<body>[\\s\\S]*?)\\n\\);`,
    "i"
  );
  const match = migrationSql.match(tablePattern);

  assert.ok(match?.groups?.body, `Missing table definition for ${tableName}`);
  return compactSql(match.groups.body);
}

describe("core data model migration", () => {
  it("registers the core migration file", () => {
    assert.deepEqual(coreMigrationFiles, ["001_core_data_model.sql"]);
  });

  it("creates every required persistent table", () => {
    for (const tableName of coreDataModelTables) {
      assert.match(
        migrationSql,
        new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\(`, "i"),
        `Expected ${tableName} to be created`
      );
    }
  });

  it("uses the canonical official data statuses", () => {
    const statusDeclaration = migrationSql.match(/CREATE TYPE official_data_status AS ENUM \((?<values>[^)]+)\)/i);
    const statuses = [...(statusDeclaration?.groups?.values ?? "").matchAll(/'([^']+)'/g)]
      .map((match) => match[1]);

    assert.deepEqual(statuses, officialDataStatuses);
  });

  it("models admission guides by school, year, Guangdong scope, status, and version", () => {
    const guideTable = tableDefinition("admission_guides");

    assert.match(guideTable, /school_id uuid not null references schools\(id\)/);
    assert.match(guideTable, /admission_year integer not null/);
    assert.match(guideTable, /province_scope text not null default 'guangdong' check \(province_scope = 'guangdong'\)/);
    assert.match(guideTable, /status official_data_status not null default 'draft'/);
    assert.match(guideTable, /version integer not null default 1 check \(version >= 1\)/);
    assert.match(
      guideTable,
      /constraint admission_guides_school_year_scope_version_unique unique \(school_id, admission_year, province_scope, version\)/
    );
  });

  it("applies official data status to curated official tables", () => {
    for (const tableName of ["schools", "admission_guides", "timeline_events", "score_formulas", "source_documents"]) {
      assert.match(
        tableDefinition(tableName),
        /status official_data_status not null default 'draft'/,
        `Expected ${tableName} to use official_data_status`
      );
    }
  });

  it("prevents duplicate interaction actions for the same user and target", () => {
    assert.match(
      tableDefinition("interactions"),
      /constraint interactions_one_action_per_target unique \(user_id, target_type, target_id, action\)/
    );
  });

  it("stores authenticated user profile fields, roles, and account statuses", () => {
    const usersTable = tableDefinition("users");
    const roleDeclaration = migrationSql.match(/CREATE TYPE user_role AS ENUM \((?<values>[^)]+)\)/i);
    const roles = [...(roleDeclaration?.groups?.values ?? "").matchAll(/'([^']+)'/g)]
      .map((match) => match[1]);
    const statusDeclaration = migrationSql.match(/CREATE TYPE account_status AS ENUM \((?<values>[^)]+)\)/i);
    const statuses = [...(statusDeclaration?.groups?.values ?? "").matchAll(/'([^']+)'/g)]
      .map((match) => match[1]);

    assert.deepEqual(roles, userRoles);
    assert.equal(roles.includes("visitor"), false);
    assert.deepEqual(statuses, accountStatuses);
    assert.match(usersTable, /nickname text not null/);
    assert.match(
      usersTable,
      /grade text check \(grade in \('high_school_g1', 'high_school_g2', 'high_school_g3', 'graduated'\)\)/
    );
    assert.match(usersTable, /default_anonymous boolean not null default true/);
    assert.match(usersTable, /role user_role not null default 'user'/);
    assert.match(usersTable, /account_status account_status not null default 'active'/);
  });
});
