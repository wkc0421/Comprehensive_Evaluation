# Test Deliverables And Release Readiness

This file records deterministic US-029 readiness deliverables for a fresh checkout.

## Required Local Setup

Use PostgreSQL at:

```bash
postgresql://postgres:postgres@127.0.0.1:5432/guangdong_comprehensive_evaluation
```

Create the local database when needed:

```bash
createdb "postgresql://postgres:postgres@127.0.0.1:5432/guangdong_comprehensive_evaluation"
```

The database integration gate uses an isolated schema inside `DATABASE_URL`, applies committed migrations, validates schema objects, and drops that schema before exiting so the command can be rerun.

## Verification Sequence

From a fresh checkout:

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
npm run data-quality
npm run test-prd:matrix
BROWSER_SCREENSHOT_DIR=scripts/ralph/runs/browser-core-pages npm run browser-test
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/guangdong_comprehensive_evaluation npm run db:integration
npm run perf:smoke
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/guangdong_comprehensive_evaluation npm run release-readiness
```

## Deterministic Artifacts

| Deliverable | Location or command |
|---|---|
| Test case coverage matrix | `docs/test-prd-coverage-matrix.md` |
| Matrix completeness report | `npm run test-prd:matrix` |
| API and route test reports | `npm test` |
| Privacy/security scan coverage | `src/test-prd-readiness.test.js`, `src/frontend-acceptance.test.js`, `npm run browser-test` |
| Data quality report | `npm run data-quality` |
| Responsive screenshots | `BROWSER_SCREENSHOT_DIR` passed to `npm run browser-test` |
| PostgreSQL migration/integration report | `DATABASE_URL=... npm run db:integration` |
| Performance smoke report | `npm run perf:smoke` |
| Release readiness checklist | `npm run release-readiness` |

## Manual Items

The current dependency-free stack intentionally keeps real SMS delivery, WeChat, email, payment, object-storage file retrieval, production CDN behavior, and production-only read-only smoke outside deterministic local gates. Those areas are excluded by `docs/test-prd.md` or require external services not introduced in the MVP.
