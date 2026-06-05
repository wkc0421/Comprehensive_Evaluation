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
- `npm run data-quality` reports 2024 through 2026 Guangdong guide coverage and validates student-facing official data quality.
- `npm run browser-test` runs Playwright browser checks for student pages at 375x667, 390x844, 430x932, 768x1024, and 1440x900, plus admin pages at 1280x720, 1440x900, and 1920x1080 when Python Playwright is available.
- `npm run test-prd:matrix` verifies that `docs/test-prd-coverage-matrix.md` maps every explicit case ID in `docs/test-prd.md`.
- `npm run db:integration` applies committed migrations to an isolated PostgreSQL schema when `DATABASE_URL` is set and verifies required tables, constraints, statuses, and full-text search indexes.
- `npm run perf:smoke` runs local warmed-request performance smoke checks for the home page, public list APIs, score calculation, and admin list APIs.
- `npm run release-readiness` runs the full release readiness sequence, including build, typecheck, lint, tests, data quality, matrix, browser, PostgreSQL integration, and performance smoke gates.

## Environment

`.env.example` documents the required local configuration:

- `DATABASE_URL` points to the PostgreSQL database.
- `OBJECT_STORAGE_*` values are placeholders for source documents and verification materials.
- `AUTH_*` values configure session cookies.
- `PHONE_VERIFICATION_*` values configure production phone OTP provider request and verification endpoints.
- `LOCAL_OTP_*` values configure the local phone OTP stub. The stub is accepted only when `NODE_ENV` is `development` or `test`; production must use a real phone verification provider.

## Authentication

The MVP exposes dependency-free session endpoints:

- `POST /api/auth/otp` requests a phone verification code.
- `POST /api/auth/login` verifies the code, creates or reads the user profile, and sets the `AUTH_SESSION_COOKIE_NAME` HTTP-only session cookie.
- `GET /api/me` returns the current user profile.

In production, the auth service posts to `PHONE_VERIFICATION_REQUEST_URL` to request a code and `PHONE_VERIFICATION_VERIFY_URL` to verify it. Users store nickname, grade, default anonymous preference, role, and account status. Stored roles are limited to `user`, `content_reviewer`, `data_reviewer`, and `admin`; visitors are unauthenticated users and are not stored as a role. Public-facing auth responses return only the public user profile and never return phone number, phone hash, or phone ciphertext fields.

## Data And Search

PostgreSQL is the MVP database target. The first implementation should use migrations against `DATABASE_URL` and keep official guide records auditable by school, year, Guangdong scope, status, and version.

MVP search should use PostgreSQL full-text search with generated `tsvector` columns or expression indexes. This keeps keyword search in the primary database for the initial scope and avoids introducing a separate search service before the content model stabilizes.

Core schema migrations live in `src/db/migrations`. The current data model migration defines the PostgreSQL tables for users, schools, official guides, timelines, formulas, experiences, interactions, reports, source documents, and ingestion runs. Schema validation runs through `npm test` and reads the migration files locally without connecting to `DATABASE_URL`.

For the database-backed readiness gate, use a local PostgreSQL database at:

```bash
postgresql://postgres:postgres@127.0.0.1:5432/guangdong_comprehensive_evaluation
```

Example local setup:

```bash
createdb "postgresql://postgres:postgres@127.0.0.1:5432/guangdong_comprehensive_evaluation"
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/guangdong_comprehensive_evaluation npm run db:integration
```

If `DATABASE_URL`, `psql`, or the database is missing, `npm run db:integration` fails with setup guidance instead of a low-level connection error. See `docs/test-deliverables.md` for the full out-of-box verification sequence and deterministic test artifacts.
