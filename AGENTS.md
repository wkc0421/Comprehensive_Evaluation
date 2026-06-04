# Project Guidance

- The current scaffold is a dependency-free Node.js ESM app. Keep new foundation work in plain JavaScript modules unless a later story explicitly introduces a framework or package.
- HTTP routing is centralized in `src/app.js`; `src/server.js` should stay limited to server startup concerns.
- Server-rendered HTML belongs in `src/pages.js`, shared product metadata belongs in `src/lib/product.js`, and mobile-first styling belongs in `public/styles.css`.
- `npm run build` writes production files to `dist/src` and `dist/public`; `npm start` runs `dist/src/server.js`.
- Quality scripts in `scripts/` are intentionally dependency-free and should ignore Ralph run logs and PRD source files.
