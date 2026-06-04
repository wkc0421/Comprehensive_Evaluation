# Guangdong Comprehensive Evaluation

Mobile-first Node.js web application for Guangdong comprehensive evaluation admissions guides, timelines, score calculation, structured interview experiences, and audited admin workflows.

## Tech Stack

- Node.js HTTP server for student pages, admin pages, and API route handlers.
- JavaScript modules with dependency-free quality scripts for the initial scaffold.
- PostgreSQL as the MVP database target.
- PostgreSQL full-text search for MVP keyword search over schools, admission guides, source documents, and experiences.

## Getting Started

1. Install dependencies. The initial scaffold has no third-party runtime dependencies, but this creates a local lockfile when needed:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in local values:

   ```bash
   cp .env.example .env
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open the student app at `http://localhost:3000` and the admin placeholder at `http://localhost:3000/admin`. The health API is available at `http://localhost:3000/api/health`.

## Scripts

- `npm run dev` starts the Node.js development server.
- `npm run build` creates a production-ready `dist/` copy.
- `npm run typecheck` runs syntax and route contract checks for the JavaScript modules.
- `npm run lint` runs dependency-free lint checks for whitespace, tabs, and JavaScript syntax.
- `npm test` runs the Node.js test suite once.

## Environment

`.env.example` documents the required local configuration:

- `DATABASE_URL` points to the PostgreSQL database.
- `OBJECT_STORAGE_*` values are placeholders for source documents and verification materials.
- `AUTH_*` and `LOCAL_OTP_*` values configure local session and OTP behavior for development.

## Data And Search

PostgreSQL is the MVP database target. The first implementation should use migrations against `DATABASE_URL` and keep official guide records auditable by school, year, Guangdong scope, status, and version.

MVP search should use PostgreSQL full-text search with generated `tsvector` columns or expression indexes. This keeps keyword search in the primary database for the initial scope and avoids introducing a separate search service before the content model stabilizes.

Core schema migrations live in `src/db/migrations`. The current data model migration defines the PostgreSQL tables for users, schools, official guides, timelines, formulas, experiences, interactions, reports, source documents, and ingestion runs. Schema validation runs through `npm test` and reads the migration files locally without connecting to `DATABASE_URL`.
