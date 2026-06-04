# Project Guidance

- The current scaffold is a dependency-free Node.js ESM app. Keep new foundation work in plain JavaScript modules unless a later story explicitly introduces a framework or package.
- HTTP routing is centralized in `src/app.js`; `src/server.js` should stay limited to server startup concerns.
- Server-rendered HTML belongs in `src/pages.js`, shared product metadata belongs in `src/lib/product.js`, and mobile-first styling belongs in `public/styles.css`.
- `npm run build` writes production files to `dist/src` and `dist/public`; `npm start` runs `dist/src/server.js`.
- Quality scripts in `scripts/` are intentionally dependency-free and should ignore Ralph run logs and PRD source files.
- PostgreSQL schema migrations live in `src/db/migrations`; keep migration validation dependency-free until a later story introduces database tooling.
- Dependency-free seed fixtures and student-facing published-only data access helpers live in `src/db`; keep them in plain JavaScript until database tooling is introduced.
- Authentication/session helpers live in `src/auth.js`; route tests can inject an auth service through `handleRequest(request, response, { authService })`, and public responses should use the public user shape so phone fields never leak.
- Public school browsing cards should use `listSchoolGuideCards` from `src/db/data-access.js` so API and page behavior share published-only visibility, filters, sort order, timeline nodes, formula availability, and experience signals.
- Public school detail pages and APIs should use `getSchoolDetail` from `src/db/data-access.js` so year defaulting, published-only guide visibility, timeline/formula aggregation, and featured experience ranking stay consistent.
- Public admission guide APIs should use `listGuides` and `getGuideDetail` from `src/db/data-access.js` so published-only current lists, keyword filters, source attribution, structured fields, and version summaries stay consistent.
