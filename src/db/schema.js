export const coreDataModelTables = Object.freeze([
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
]);

export const officialDataStatuses = Object.freeze([
  "draft",
  "pending_review",
  "published",
  "archived"
]);

export const coreMigrationFiles = Object.freeze([
  "001_core_data_model.sql"
]);
