# Test PRD Coverage Matrix

This matrix maps every explicit `FE-*`, `ADM-*`, and `API-*` case ID in `docs/test-prd.md` to a deterministic local gate. Keep this file in sync with the PRD; `npm run test-prd:matrix` fails when a case ID is added, removed, or renamed without a matching matrix update.

| Case ID | Coverage type | Gate / artifact | Notes |
|---|---|---|---|
| FE-HOME-001 | Browser check | `npm run browser-test`, `src/app.test.js`, `src/e2e.test.js` | Home guest first screen, task entries, latest guides, and latest experiences. |
| FE-HOME-002 | Browser check | `npm run browser-test`, `src/app.test.js` | Grade-one content state. |
| FE-HOME-003 | Browser check | `npm run browser-test`, `src/e2e.test.js` | Logged-in favorited-school timeline priority. |
| FE-HOME-004 | Automated test | `src/app.test.js` | Empty timeline/home data state. |
| FE-HOME-005 | Browser check | `npm run browser-test`, `src/app.test.js` | Home task links to schools, timeline, calculator, and experiences. |
| FE-NAV-001 | Browser check | `npm run browser-test`, `src/frontend-acceptance.test.js` | Four-tab student navigation and active state. |
| FE-NAV-002 | Browser check | `npm run browser-test`, `src/app.test.js` | Logged-out My guide without personal data access. |
| FE-NAV-003 | Browser check | `npm run browser-test`, `src/frontend-acceptance.test.js` | Task pages hide bottom navigation and keep back entry. |
| FE-SCHOOL-001 | Browser check | `npm run browser-test`, `src/app.test.js` | School cards, years, status, formula, and experience count. |
| FE-SCHOOL-002 | Automated test | `src/app.test.js`, `src/db/data-access.test.js` | Year filtering. |
| FE-SCHOOL-003 | Automated test | `src/app.test.js`, `src/db/data-access.test.js` | Application status filtering. |
| FE-SCHOOL-004 | Automated test | `src/app.test.js`, `src/db/data-access.test.js` | Abbreviation keyword search. |
| FE-SCHOOL-005 | Browser check | `npm run browser-test`, `src/app.test.js` | Empty state and clear-filter action. |
| FE-SCHOOL-006 | Browser check | `npm run browser-test`, `src/app.test.js` | Guest favorite login continuation. |
| FE-DETAIL-001 | Browser check | `npm run browser-test`, `src/app.test.js` | Published school detail content. |
| FE-DETAIL-002 | Automated test | `src/app.test.js`, `src/db/data-access.test.js` | Year switching and selected-year data. |
| FE-DETAIL-003 | Browser check | `npm run browser-test`, `src/app.test.js` | Historical-reference fallback. |
| FE-DETAIL-004 | Browser check | `npm run browser-test`, `src/app.test.js` | No-formula calculator hiding. |
| FE-DETAIL-005 | Browser check | `npm run browser-test`, `src/frontend-acceptance.test.js` | Single primary action on detail page. |
| FE-DETAIL-006 | Browser check | `npm run browser-test`, `src/frontend-acceptance.test.js` | Long official fields collapse/wrap without overflow. |
| FE-TIME-001 | Browser check | `npm run browser-test`, `src/app.test.js` | Month grouping and timeline list rendering. |
| FE-TIME-002 | Automated test | `src/e2e.test.js`, `src/app.test.js` | Logged-in favorites timeline. |
| FE-TIME-003 | Browser check | `npm run browser-test`, `src/app.test.js` | Logged-out My Favorites login guide. |
| FE-TIME-004 | Browser check | `npm run browser-test`, `src/app.test.js` | Unknown dates render as to be announced. |
| FE-TIME-005 | Browser check | `npm run browser-test`, `src/frontend-acceptance.test.js` | Timeline node links to school detail. |
| FE-SCORE-001 | Automated test | `src/db/data-access.test.js`, `src/test-prd-readiness.test.js` | 60/30/10 score calculation. |
| FE-SCORE-002 | Automated test | `src/db/data-access.test.js`, `src/test-prd-readiness.test.js` | 85/15 score calculation. |
| FE-SCORE-003 | Automated test | `src/db/data-access.test.js` | Custom weighted formula normalization. |
| FE-SCORE-004 | Browser check | `npm run browser-test`, `src/app.test.js` | No-formula unavailable state. |
| FE-SCORE-005 | Browser check | `npm run browser-test`, `src/app.test.js` | Missing score validation. |
| FE-SCORE-006 | Browser check | `npm run browser-test`, `src/test-prd-readiness.test.js` | Out-of-range validation. |
| FE-SCORE-007 | Browser check | `npm run browser-test` | School/year switch clears inputs. |
| FE-SCORE-008 | Automated test | `src/test-prd-readiness.test.js`, `src/frontend-acceptance.test.js` | No admission probability or recommendation copy. |
| FE-EXP-001 | Browser check | `npm run browser-test`, `src/app.test.js` | Experience list card content. |
| FE-EXP-002 | Automated test | `src/app.test.js`, `src/db/data-access.test.js` | Experience filters. |
| FE-EXP-003 | Browser check | `npm run browser-test`, `src/app.test.js` | Historical reference label. |
| FE-EXP-004 | Browser check | `npm run browser-test`, `src/test-prd-readiness.test.js` | Verified label without material details. |
| FE-EXP-005 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Anonymous public output privacy. |
| FE-EXP-006 | Browser check | `npm run browser-test`, `src/app.test.js` | Guest useful action login continuation. |
| FE-EXP-007 | Automated test | `src/app.test.js`, `src/test-prd-readiness.test.js` | Duplicate useful vote behavior. |
| FE-EXP-008 | Automated test | `src/app.test.js`, `src/test-prd-readiness.test.js` | Report submission enters admin queue. |
| FE-POST-001 | Browser check | `npm run browser-test`, `src/app.test.js` | Logged-out submission login guide. |
| FE-POST-002 | Automated test | `src/app.test.js`, `src/test-prd-readiness.test.js` | Required submission fields. |
| FE-POST-003 | Browser check | `npm run browser-test`, `src/e2e.test.js` | Pending-review submission and My visibility. |
| FE-POST-004 | Automated test | `src/test-prd-readiness.test.js`, `src/e2e.test.js` | Anonymous approved public output. |
| FE-POST-005 | Browser check | `npm run browser-test` | Seven-day local draft restore prompt. |
| FE-POST-006 | Browser check | `npm run browser-test` | Draft cleanup after successful submit. |
| FE-POST-007 | Browser check | `npm run browser-test`, `src/frontend-acceptance.test.js` | Verification files are not stored in local draft. |
| FE-ME-001 | Browser check | `npm run browser-test`, `src/app.test.js` | Logged-out My guide. |
| FE-ME-002 | Browser check | `npm run browser-test`, `src/app.test.js` | Logged-in My content. |
| FE-ME-003 | Automated test | `src/app.test.js`, `src/test-prd-readiness.test.js` | Submitted-experience status groups and public hiding. |
| FE-ME-004 | Browser check | `npm run browser-test` | Logout clears local draft and returns to logged-out My. |
| ADM-ING-001 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Data reviewer creates ingestion run. |
| ADM-ING-002 | Browser check | `npm run browser-test`, `src/app.test.js` | Ingestion source candidate detail. |
| ADM-ING-003 | Automated test | `src/db/data-access.test.js`, `src/frontend-acceptance.test.js` | Third-party source is discovery clue only. |
| ADM-ING-004 | Automated test | `src/test-prd-readiness.test.js`, `src/db/data-access.test.js` | Generated guide draft remains student-hidden. |
| ADM-ING-005 | Browser check | `npm run browser-test`, `src/frontend-acceptance.test.js` | Failed ingestion state and list stability. |
| ADM-GUIDE-001 | Browser check | `npm run browser-test`, `src/app.test.js` | Guide review queue. |
| ADM-GUIDE-002 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Publishing complete guide makes it public. |
| ADM-GUIDE-003 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Missing official source blocks guide create/publish. |
| ADM-GUIDE-004 | Automated test | `src/app.test.js`, `src/db/data-access.test.js` | Pending supplement placeholders. |
| ADM-GUIDE-005 | Automated test | `src/db/data-access.test.js`, `src/test-prd-readiness.test.js` | Version increment and audit record. |
| ADM-GUIDE-006 | Automated test | `src/test-prd-readiness.test.js`, `src/data-quality.test.js` | Draft guide hidden from student APIs. |
| ADM-TIME-001 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Generated nodes from published guide fields. |
| ADM-TIME-002 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Manual override reason and original data audit. |
| ADM-TIME-003 | Browser check | `npm run browser-test`, `src/app.test.js` | Unknown dates render as to be announced. |
| ADM-TIME-004 | Automated test | `src/app.test.js`, `src/db/data-access.test.js` | Timeline status calculation. |
| ADM-FORMULA-001 | Automated test | `src/app.test.js`, `src/test-prd-readiness.test.js` | Data reviewer saves formula draft. |
| ADM-FORMULA-002 | Automated test | `src/app.test.js`, `src/test-prd-readiness.test.js` | Sample-test gate before formula publish. |
| ADM-FORMULA-003 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Missing source blocks formula publication/create. |
| ADM-FORMULA-004 | Browser check | `npm run browser-test`, `src/app.test.js` | Published formula visible to calculator. |
| ADM-FORMULA-005 | Automated test | `src/test-prd-readiness.test.js`, `src/data-quality.test.js` | Draft formulas hidden from public calculator. |
| ADM-EXP-001 | Browser check | `npm run browser-test`, `src/app.test.js` | Experience moderation queue and warnings. |
| ADM-EXP-002 | Automated test | `src/test-prd-readiness.test.js`, `src/e2e.test.js` | Approve submission to public display. |
| ADM-EXP-003 | Automated test | `src/app.test.js`, `src/test-prd-readiness.test.js` | Return reason visible in My status. |
| ADM-EXP-004 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Hidden content removed from public side. |
| ADM-EXP-005 | Automated test | `src/experience-submissions.js`, `src/test-prd-readiness.test.js` | Undisclosed-original-question moderation warning. |
| ADM-EXP-006 | Automated test | `src/test-prd-readiness.test.js`, `src/frontend-acceptance.test.js` | Anonymous student preview privacy. |
| ADM-VER-001 | Browser check | `npm run browser-test`, `src/test-prd-readiness.test.js` | Verification material queue. |
| ADM-VER-002 | Automated test | `src/test-prd-readiness.test.js`, `src/e2e.test.js` | Approve verification sets public verified label. |
| ADM-VER-003 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Reject verification keeps public label unverified. |
| ADM-VER-004 | Automated test | `src/test-prd-readiness.test.js`, `src/frontend-acceptance.test.js` | Material review routes deny normal users and never expose raw URLs. |
| ADM-REP-001 | Browser check | `npm run browser-test`, `src/test-prd-readiness.test.js` | Reports enter handling queue. |
| ADM-REP-002 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Reject report resolves without target side effect. |
| ADM-REP-003 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Hide reported content from public side. |
| ADM-REP-004 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Limit reported account with operator audit. |
| API-PUB-001 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Public schools published-only contract. |
| API-PUB-002 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Public guides published-only contract. |
| API-PUB-003 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Draft guide detail returns stable 404. |
| API-PUB-004 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Public timeline published-node contract. |
| API-PUB-005 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Public experiences published-only contract. |
| API-USER-001 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Logged-in experience submission. |
| API-USER-002 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Guest submission returns 401 login_required. |
| API-USER-003 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | First useful vote. |
| API-USER-004 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Duplicate useful vote stable response. |
| API-USER-005 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Favorite school success. |
| API-USER-006 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Delete favorite success. |
| API-USER-007 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Report creation. |
| API-USER-008 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | My submissions contract. |
| API-SCORE-001 | Automated test | `src/test-prd-readiness.test.js`, `src/db/data-access.test.js` | 60/30/10 score API. |
| API-SCORE-002 | Automated test | `src/test-prd-readiness.test.js`, `src/db/data-access.test.js` | 85/15 score API. |
| API-SCORE-003 | Automated test | `src/test-prd-readiness.test.js`, `src/db/data-access.test.js` | Missing score 400. |
| API-SCORE-004 | Automated test | `src/test-prd-readiness.test.js`, `src/db/data-access.test.js` | Out-of-range score 400. |
| API-SCORE-005 | Automated test | `src/test-prd-readiness.test.js`, `src/db/data-access.test.js` | No published formula error. |
| API-SCORE-006 | Automated test | `src/test-prd-readiness.test.js`, `src/data-quality.test.js` | Draft formula hidden from score API. |
| API-ADM-001 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Data reviewer creates ingestion run. |
| API-ADM-002 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Normal user blocked from ingestion. |
| API-ADM-003 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Complete guide publish success. |
| API-ADM-004 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Missing source guide payload fails. |
| API-ADM-005 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Formula publish without passing sample fails. |
| API-ADM-006 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Content reviewer moderation transition. |
| API-ADM-007 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Normal user blocked from verification review. |
| API-ADM-008 | Automated test | `src/test-prd-readiness.test.js`, `src/app.test.js` | Report resolution audit and side effect. |
