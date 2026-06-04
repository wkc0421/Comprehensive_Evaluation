import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import { createAuthService } from "./auth.js";
import { handleRequest } from "./app.js";
import { getExperienceById } from "./db/data-access.js";
import { seedIds } from "./db/seed-data.js";
import { createExperienceSubmissionStore } from "./experience-submissions.js";
import { createInteractionStore } from "./interactions.js";

function jsonRequest(body = {}) {
  return {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function sessionCookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");

  assert.ok(setCookie, "Expected session cookie to be set");
  return setCookie.split(";")[0];
}

function assertNoPhoneFields(payload) {
  const serialized = JSON.stringify(payload);

  assert.doesNotMatch(serialized, /13812345678/);
  assert.doesNotMatch(serialized, /phone(Hash|Ciphertext|Number)?/i);
}

function studentBottomNav(body) {
  const match = body.match(/<nav class="student-bottom-nav"[\s\S]*?<\/nav>/);

  assert.ok(match, "Expected student bottom navigation");
  return match[0];
}

function assertStudentBottomNav(body, currentHref) {
  const nav = studentBottomNav(body);
  const labels = [...nav.matchAll(/<span>(Home|Schools|Experiences|My)<\/span>/g)]
    .map((match) => match[1]);

  assert.deepEqual(labels, ["Home", "Schools", "Experiences", "My"]);
  assert.doesNotMatch(nav, />Timeline<|>Calculator</);
  assert.match(nav, new RegExp(`href="${currentHref}" aria-current="page"`));
}

function schoolNames(payload) {
  return payload.schools.map((schoolCard) => schoolCard.school.name);
}

function validExperienceSubmissionPayload(overrides = {}) {
  return {
    schoolId: seedIds.schools.sysu,
    year: 2026,
    majorGroup: "Science pilot group",
    candidateTrack: "physics",
    stage: "school_assessment",
    shortlistedStatus: true,
    admittedStatus: null,
    assessmentTypes: ["structured_interview", "group_discussion"],
    location: "Guangzhou campus",
    processSummary: "Panel interview followed a group discussion and individual experiment design prompts.",
    questionTypes: ["motivation", "experiment_design"],
    preparationSummary: "Prepared personal statement examples and concise experiment explanations.",
    difficultyScore: 4,
    pressureScore: 3,
    differentiationScore: 4,
    advice: "Use specific coursework examples and do not share personal sensitive details.",
    isAnonymous: true,
    verificationMaterials: [
      {
        materialType: "shortlist_notice",
        objectStorageKey: "private/submissions/sysu-shortlist.png",
        metadata: {
          sourceAccount: "source-account-123",
          realName: "Student Real Name",
          notes: "Screenshot metadata only"
        }
      }
    ],
    ...overrides
  };
}

describe("web routes", () => {
  let authService;
  let baseUrl;
  let experienceSubmissionStore;
  let interactionStore;
  let server;

  before(async () => {
    const timelineNow = () => new Date("2026-04-18T00:00:00.000Z");
    authService = createAuthService({
      env: {
        NODE_ENV: "test",
        AUTH_SECRET: "app-test-secret",
        AUTH_SESSION_COOKIE_NAME: "test_session",
        LOCAL_OTP_ENABLED: "true",
        LOCAL_OTP_CODE: "246810"
      },
      now: timelineNow
    });
    experienceSubmissionStore = createExperienceSubmissionStore({ now: timelineNow });
    interactionStore = createInteractionStore({ now: timelineNow });
    server = createServer((request, response) => {
      handleRequest(request, response, {
        authService,
        experienceSubmissionStore,
        interactionStore,
        now: timelineNow
      }).catch((error) => {
        response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: error.message }));
      });
    });

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("renders the student home route", async () => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Mobile-first student home/);
    assert.match(body, /Grade-aware entry points/);
    assert.match(body, /High school grade one/);
    assert.match(body, /High school grade two/);
    assert.match(body, /High school grade three/);
    assert.match(body, /Annual progress/);
    assert.match(body, /2026 Guangdong cycle/);
    assert.match(body, /Nearest deadlines/);
    assert.match(body, /Latest published guides/);
    assert.match(body, /Sun Yat-sen University/);
    assert.match(body, /Latest high-quality experiences/);
    assert.match(body, /Interview focused on motivation/);
    assert.doesNotMatch(body, /Draft Review Guide/);
    assert.doesNotMatch(body, /Working Draft/);
    assert.doesNotMatch(body, /Pending review experience/);
    assert.doesNotMatch(body, /admission probability|ranking prediction|paid consulting|open comments|private messaging/i);
  });

  it("applies the frontend PRD design tokens and typography guardrails", async () => {
    const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

    for (const token of [
      "--color-primary: #0F9F9A;",
      "--color-primary-pressed: #0B7F7C;",
      "--color-info: #2563EB;",
      "--color-success: #16A34A;",
      "--color-warning: #F59E0B;",
      "--color-danger: #DC2626;",
      "--color-page-bg: #F6F8FA;",
      "--color-card-bg: #FFFFFF;",
      "--color-border: #E5E7EB;",
      "--color-text-primary: #111827;",
      "--color-text-secondary: #4B5563;",
      "--color-text-muted: #9CA3AF;",
      "--radius-card: 8px;",
      "--radius-control: 8px;",
      "--shadow-card: 0 1px 2px rgba(17, 24, 39, 0.06);"
    ]) {
      assert.match(css, new RegExp(token.replaceAll("(", "\\(").replaceAll(")", "\\)")));
    }

    assert.doesNotMatch(css, /clamp\(|letter-spacing:\s*-/);
    assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
    assert.doesNotMatch(css, /border-radius:\s*(?:9|[1-9]\d)px/);
    assert.match(css, /\.student-bottom-nav/);
    assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
    assert.match(css, /min-height: 48px;/);
    assert.match(css, /font-size: 12px;/);
    assert.match(css, /width: min\(100%, 520px\);/);
  });

  it("renders the student shell with four-tab bottom navigation and top bar rules", async () => {
    const homeResponse = await fetch(`${baseUrl}/`, { headers: { accept: "text/html" } });
    const homeBody = await homeResponse.text();
    const schoolsResponse = await fetch(`${baseUrl}/schools?year=2025`, { headers: { accept: "text/html" } });
    const schoolsBody = await schoolsResponse.text();
    const experiencesResponse = await fetch(`${baseUrl}/experiences`, { headers: { accept: "text/html" } });
    const experiencesBody = await experiencesResponse.text();

    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000029",
      nickname: "Shell student"
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(user.id)).split(";")[0];
    const meResponse = await fetch(`${baseUrl}/me`, {
      headers: { accept: "text/html", cookie }
    });
    const meBody = await meResponse.text();

    assert.equal(homeResponse.status, 200);
    assert.equal(schoolsResponse.status, 200);
    assert.equal(experiencesResponse.status, 200);
    assert.equal(meResponse.status, 200);
    assertStudentBottomNav(homeBody, "/");
    assertStudentBottomNav(schoolsBody, "/schools");
    assertStudentBottomNav(experiencesBody, "/experiences");
    assertStudentBottomNav(meBody, "/me");
    assert.match(homeBody, /aria-label="Grade switch"/);
    assert.match(schoolsBody, /aria-label="Open school filters"/);
    assert.match(experiencesBody, /aria-label="Open experience filters"/);
    assert.match(meBody, /data-student-top-bar="list"/);
  });

  it("renders detail and task page top bars with back entries and accessible icon actions", async () => {
    const detailResponse = await fetch(`${baseUrl}/schools/${seedIds.schools.sysu}?year=2026`, {
      headers: { accept: "text/html" }
    });
    const detailBody = await detailResponse.text();
    const calculatorResponse = await fetch(`${baseUrl}/calculator?schoolId=${seedIds.schools.sysu}&year=2026`, {
      headers: { accept: "text/html" }
    });
    const calculatorBody = await calculatorResponse.text();

    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000031",
      nickname: "Task shell student"
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(user.id)).split(";")[0];
    const submissionResponse = await fetch(`${baseUrl}/experiences/new`, {
      headers: {
        accept: "text/html",
        cookie
      }
    });
    const submissionBody = await submissionResponse.text();

    assert.equal(detailResponse.status, 200);
    assert.equal(calculatorResponse.status, 200);
    assert.equal(submissionResponse.status, 200);
    assert.match(detailBody, /aria-label="Back to schools"/);
    assert.match(detailBody, /aria-label="Favorite school"/);
    assertStudentBottomNav(detailBody, "/schools");
    assert.match(calculatorBody, /aria-label="Back to schools"/);
    assert.doesNotMatch(calculatorBody, /Student bottom navigation/);
    assert.match(submissionBody, /aria-label="Back to experiences"/);
    assert.match(submissionBody, /Review after submit/);
    assert.doesNotMatch(submissionBody, /Student bottom navigation/);
  });

  it("renders the admin placeholder route", async () => {
    const reviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000030",
      nickname: "Admin overview reviewer",
      role: "data_reviewer"
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(reviewer.id)).split(";")[0];
    const response = await fetch(`${baseUrl}/admin`, {
      headers: { cookie }
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Admin console placeholder/);
    assert.match(body, /Official guide review/);
    assert.match(body, /Admin overview reviewer/);
  });

  it("returns the health API contract", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.database, "postgresql");
  });

  it("returns the school list API with year, status, and keyword filters", async () => {
    const response = await fetch(`${baseUrl}/schools?year=2025&status=published&keyword=Engineering`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.count, 1);
    assert.equal(body.filters.year, 2025);
    assert.equal(body.filters.status, "published");
    assert.equal(body.filters.keyword, "Engineering");
    assert.equal(body.schools[0].school.id, seedIds.schools.scut);
    assert.equal(body.schools[0].guide.year, 2025);
    assert.equal(body.schools[0].guide.status, "published");
    assert.equal(body.schools[0].guide.applicationStatus, "closed");
    assert.equal(body.schools[0].formula.available, false);
    assert.equal(body.schools[0].experiences.exists, true);
    assert.ok(body.schools[0].keyTimelineNodes.some((node) => node.eventKey === "application_deadline"));
  });

  it("keeps draft and pending review guides hidden from school list visitors", async () => {
    const response = await fetch(`${baseUrl}/api/schools?year=2026&sort=name`);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.deepEqual(schoolNames(body), ["Sun Yat-sen University"]);
    assert.doesNotMatch(serialized, /Draft Review Guide/);
    assert.doesNotMatch(serialized, /Working Draft/);

    const pendingResponse = await fetch(`${baseUrl}/api/schools?status=pending_review`);
    const pendingBody = await pendingResponse.json();

    assert.equal(pendingResponse.status, 200);
    assert.equal(pendingBody.count, 0);
  });

  it("filters the school list API by application status and school type", async () => {
    const response = await fetch(
      `${baseUrl}/api/schools?year=2025&applicationStatus=closed&schoolType=research%20university`
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(schoolNames(body), ["Southern University of Science and Technology"]);
    assert.equal(body.schools[0].guide.applicationStatus, "closed");
    assert.equal(body.schools[0].school.schoolType, "research university");
  });

  it("sorts the school list API by deadline, update time, and school name", async () => {
    const deadlineResponse = await fetch(`${baseUrl}/api/schools?year=2025&sort=deadline`);
    const updatedResponse = await fetch(`${baseUrl}/api/schools?year=2025&sort=updated`);
    const nameResponse = await fetch(`${baseUrl}/api/schools?year=2025&sort=name`);

    assert.deepEqual(schoolNames(await deadlineResponse.json()), [
      "Southern University of Science and Technology",
      "Sun Yat-sen University",
      "South China University of Technology"
    ]);
    assert.deepEqual(schoolNames(await updatedResponse.json()), [
      "Sun Yat-sen University",
      "South China University of Technology",
      "Southern University of Science and Technology"
    ]);
    assert.deepEqual(schoolNames(await nameResponse.json()), [
      "South China University of Technology",
      "Southern University of Science and Technology",
      "Sun Yat-sen University"
    ]);
  });

  it("renders the school list page with filters and guide cards for browsers", async () => {
    const response = await fetch(`${baseUrl}/schools?year=2025&sort=name`, {
      headers: { accept: "text/html" }
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /School list/);
    assert.match(body, /School keyword/);
    assert.match(body, /Guide status/);
    assert.match(body, /Application status/);
    assert.match(body, /School type/);
    assert.match(body, /Application deadline/);
    assert.match(body, /Key timeline nodes/);
    assert.match(body, /Formula not available/);
    assert.match(body, /published experience/);
    assert.doesNotMatch(body, /Draft Review Guide/);
    assert.doesNotMatch(body, /Working Draft/);
  });

  it("returns the guide list API with year, schoolId, status, and keyword filters", async () => {
    const response = await fetch(
      `${baseUrl}/api/guides?year=2025&schoolId=${seedIds.schools.scut}&status=published&keyword=timeline`
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.count, 1);
    assert.equal(body.filters.year, 2025);
    assert.equal(body.filters.schoolId, seedIds.schools.scut);
    assert.equal(body.filters.status, "published");
    assert.equal(body.filters.keyword, "timeline");
    assert.equal(body.guides[0].id, seedIds.guides.scut2025);
    assert.equal(body.guides[0].status, "published");
    assert.equal(body.guides[0].source.sourceType, "admission_guide");
    assert.equal(body.guides[0].source.officialSourceUrl, "https://example.edu/scut/2025-comprehensive-evaluation-guide");
  });

  it("hides unpublished guides from guide list and detail visitors", async () => {
    const listResponse = await fetch(`${baseUrl}/api/guides?year=2026&status=pending_review`);
    const listBody = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(listBody.count, 0);

    const detailResponse = await fetch(`${baseUrl}/api/guides/${seedIds.guides.scut2026Pending}`);
    const detailBody = await detailResponse.json();

    assert.equal(detailResponse.status, 404);
    assert.equal(detailBody.error, "not_found");
  });

  it("returns guide detail source attribution, structured fields, and version summary", async () => {
    const response = await fetch(`${baseUrl}/api/guides/${seedIds.guides.sysu2026}`);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.equal(body.school.id, seedIds.schools.sysu);
    assert.equal(body.guide.id, seedIds.guides.sysu2026);
    assert.equal(body.guide.status, "published");
    assert.equal(body.guide.version, 2);
    assert.equal(body.source.officialSourceUrl, "https://example.edu/sysu/2026-comprehensive-evaluation-guide");
    assert.equal(body.source.sourceType, "admission_guide");
    assert.equal(body.source.publishedAt, "2026-03-15T02:00:00.000Z");
    assert.equal(body.source.updatedAt, "2026-04-10T08:30:00.000Z");
    assert.equal(body.structuredFields.applicationUrl, "https://example.edu/apply");
    assert.ok(body.structuredFields.majors.some((major) => major.name === "Experimental science program"));
    assert.equal(body.versionSummary.currentVersion, 2);
    assert.deepEqual(body.versionSummary.versions.map((version) => version.version), [2, 1]);
    assert.equal(body.versionSummary.versions[1].id, seedIds.guides.sysu2026Initial);
    assert.doesNotMatch(serialized, /Draft Review Guide|Working Draft/);
  });

  it("returns the school detail API for one published school year", async () => {
    const response = await fetch(`${baseUrl}/schools/${seedIds.schools.sysu}?year=2026`);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.equal(body.school.id, seedIds.schools.sysu);
    assert.equal(body.school.name, "Sun Yat-sen University");
    assert.equal(body.school.provinceScope, "guangdong");
    assert.deepEqual(body.availableYears, [2026, 2025]);
    assert.equal(body.selectedYear, 2026);
    assert.equal(body.guide.id, seedIds.guides.sysu2026);
    assert.equal(body.guide.status, "published");
    assert.equal(body.guide.officialSourceUrl, "https://example.edu/sysu/2026-comprehensive-evaluation-guide");
    assert.equal(body.guide.applicationUrl, "https://example.edu/apply");
    assert.ok(body.timeline.some((node) => node.eventKey === "school_assessment"));
    assert.equal(body.formula.formulaName, "60/30/10 comprehensive score");
    assert.equal(body.featuredExperiences[0].schoolId, seedIds.schools.sysu);
    assert.doesNotMatch(serialized, /Pending review guide|Working Draft|Pending review experience/);
  });

  it("defaults school detail to current or latest published year and hides unpublished years", async () => {
    const defaultResponse = await fetch(`${baseUrl}/api/schools/${seedIds.schools.scut}`);
    const defaultBody = await defaultResponse.json();

    assert.equal(defaultResponse.status, 200);
    assert.equal(defaultBody.selectedYear, 2025);
    assert.equal(defaultBody.guide.id, seedIds.guides.scut2025);
    assert.equal(defaultBody.formula, null);

    const hiddenResponse = await fetch(`${baseUrl}/api/schools/${seedIds.schools.scut}?year=2026`);
    const hiddenBody = await hiddenResponse.json();

    assert.equal(hiddenResponse.status, 404);
    assert.equal(hiddenBody.error, "not_found");
  });

  it("renders the school detail page with official fields and pending supplements", async () => {
    const response = await fetch(`${baseUrl}/schools/${seedIds.schools.scut}?year=2025`, {
      headers: { accept: "text/html" }
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /South China University of Technology/);
    assert.match(body, /School base information/);
    assert.match(body, /Guide summary/);
    assert.match(body, /Official source/);
    assert.match(body, /Application link/);
    assert.match(body, /Timeline/);
    assert.match(body, /Score formula entry/);
    assert.match(body, /Score formula pending supplement/);
    assert.match(body, /Majors/);
    assert.match(body, /Subject requirements/);
    assert.match(body, /Academic test requirements/);
    assert.match(body, /Assessment method/);
    assert.match(body, /Admission rule/);
    assert.match(body, /Fees and contact/);
    assert.match(body, /Featured experiences/);
    assert.match(body, /Questions emphasized engineering interest/);
    assert.doesNotMatch(body, /Draft Review Guide/);
    assert.doesNotMatch(body, /Working Draft/);
  });

  it("calculates public score formulas through the POST score API", async () => {
    const response = await fetch(`${baseUrl}/score/calculate`, {
      method: "POST",
      ...jsonRequest({
        schoolId: seedIds.schools.sysu,
        year: 2026,
        scores: {
          gaokao: 690,
          schoolAssessment: 80,
          academicLevel: 90
        }
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.schoolId, seedIds.schools.sysu);
    assert.equal(body.year, 2026);
    assert.equal(body.formulaName, "60/30/10 comprehensive score");
    assert.equal(body.totalScore, 88.2);
    assert.deepEqual(body.breakdown.map((input) => input.contribution), [55.2, 24, 9]);
    assert.equal(body.explanation, "Gaokao, school assessment, and academic level conversion are weighted 60%, 30%, and 10%.");
    assert.equal(body.officialSourceUrl, "https://example.edu/sysu/2026-comprehensive-evaluation-guide");
    assert.match(body.disclaimer, /not an admission probability/i);
  });

  it("returns clear score API validation errors", async () => {
    const missingResponse = await fetch(`${baseUrl}/api/score/calculate`, {
      method: "POST",
      ...jsonRequest({
        schoolId: seedIds.schools.sysu,
        year: 2026,
        scores: {
          gaokao: 690,
          schoolAssessment: 80
        }
      })
    });
    const missingBody = await missingResponse.json();

    assert.equal(missingResponse.status, 400);
    assert.equal(missingBody.error, "missing_score");
    assert.match(missingBody.message, /Academic level conversion/);

    const noFormulaResponse = await fetch(`${baseUrl}/api/score/calculate`, {
      method: "POST",
      ...jsonRequest({
        schoolId: seedIds.schools.scut,
        year: 2025,
        scores: {
          gaokao: 690,
          schoolAssessment: 80
        }
      })
    });
    const noFormulaBody = await noFormulaResponse.json();

    assert.equal(noFormulaResponse.status, 404);
    assert.equal(noFormulaBody.error, "formula_not_available");
  });

  it("renders the score calculator page with three steps and the selected published formula", async () => {
    const response = await fetch(
      `${baseUrl}/calculator?schoolId=${seedIds.schools.sysu}&year=2026`,
      { headers: { accept: "text/html" } }
    );
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Score calculator/);
    assert.match(body, /Step 1/);
    assert.match(body, /Choose school and year/);
    assert.match(body, /Step 2/);
    assert.match(body, /Enter scores/);
    assert.match(body, /Step 3/);
    assert.match(body, /View results/);
    assert.match(body, /Sun Yat-sen University/);
    assert.match(body, /60\/30\/10 comprehensive score/);
    assert.match(body, /name="scores\[gaokao\]"/);
    assert.match(body, /name="scores\[schoolAssessment\]"/);
    assert.match(body, /name="scores\[academicLevel\]"/);
    assert.match(body, /Official source/);
    assert.match(body, /calculator\.js/);
    assert.doesNotMatch(body, /Draft Review Guide|Working Draft/);
  });

  it("hides the score calculation form when no clear published formula exists", async () => {
    const response = await fetch(
      `${baseUrl}/calculator?schoolId=${seedIds.schools.scut}&year=2025`,
      { headers: { accept: "text/html" } }
    );
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /South China University of Technology/);
    assert.match(body, /No clear published formula/);
    assert.match(body, /Calculation form is hidden/);
    assert.doesNotMatch(body, /id="score-input-form"/);
    assert.doesNotMatch(body, /name="scores\[gaokao\]"/);
  });

  it("returns the public experience API with filters, labels, and published-only visibility", async () => {
    const response = await fetch(
      `${baseUrl}/api/experiences?schoolId=${seedIds.schools.sysu}&year=2026&stage=school_assessment&assessmentType=structured_interview&verified=false&sort=useful`
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.equal(body.count, 1);
    assert.equal(body.filters.schoolId, seedIds.schools.sysu);
    assert.equal(body.filters.year, 2026);
    assert.equal(body.filters.stage, "school_assessment");
    assert.equal(body.filters.assessmentType, "structured_interview");
    assert.equal(body.filters.verified, false);
    assert.equal(body.filters.sort, "useful");
    assert.equal(body.experiences[0].id, seedIds.experiences.sysu2026PendingVerification);
    assert.equal(body.experiences[0].school.name, "Sun Yat-sen University");
    assert.equal(body.experiences[0].stageLabel, "School Assessment");
    assert.equal(body.experiences[0].assessmentFormat, "Structured Interview");
    assert.equal(body.experiences[0].verified, false);
    assert.equal(body.experiences[0].verifiedLabel, "Verification pending");
    assert.equal(body.experiences[0].historicalReferenceNotice, null);
    assert.doesNotMatch(serialized, /Pending review experience that must remain hidden/);
  });

  it("sorts the public experience API by newest, useful count, and verified first", async () => {
    const newestResponse = await fetch(`${baseUrl}/api/experiences?sort=newest`);
    const usefulResponse = await fetch(`${baseUrl}/api/experiences?sort=useful`);
    const verifiedResponse = await fetch(`${baseUrl}/api/experiences?sort=verified`);

    const newestBody = await newestResponse.json();
    const usefulBody = await usefulResponse.json();
    const verifiedBody = await verifiedResponse.json();

    assert.equal(newestResponse.status, 200);
    assert.equal(usefulResponse.status, 200);
    assert.equal(verifiedResponse.status, 200);
    assert.equal(newestBody.experiences[0].id, seedIds.experiences.sysu2026PendingVerification);
    assert.equal(usefulBody.experiences[0].id, seedIds.experiences.sysu2026PendingVerification);
    assert.equal(verifiedBody.experiences[0].id, seedIds.experiences.sysu2026);
    assert.equal(verifiedBody.experiences.at(-1).id, seedIds.experiences.sysu2026PendingVerification);
  });

  it("renders the experience list page with filters, structured cards, and historical notices", async () => {
    const response = await fetch(`${baseUrl}/experiences?year=2024&assessmentType=machine_test&sort=newest`, {
      headers: { accept: "text/html" }
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Experience list/);
    assert.match(body, /School/);
    assert.match(body, /Year/);
    assert.match(body, /Stage/);
    assert.match(body, /Assessment format/);
    assert.match(body, /Verified status/);
    assert.match(body, /Sort/);
    assert.match(body, /Southern University of Science and Technology/);
    assert.match(body, /2024/);
    assert.match(body, /Machine Test/);
    assert.match(body, /Verified experience/);
    assert.match(body, /Useful count/);
    assert.match(body, /Historical reference/);
    assert.match(body, /Submit experience/);
    assert.doesNotMatch(body, /Pending review experience that must remain hidden/);
  });

  it("renders the structured experience submission form for logged-in users", async () => {
    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000013",
      nickname: "Experience student",
      defaultAnonymous: true
    });
    const session = authService.createSessionForUser(user.id);
    const cookie = authService.serializeSessionCookie(session).split(";")[0];

    const response = await fetch(`${baseUrl}/experiences/new`, {
      headers: {
        accept: "text/html",
        cookie
      }
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Submit experience/);
    assert.match(body, /action="\/experiences"/);
    assert.match(body, /name="schoolId"/);
    assert.match(body, /name="year"/);
    assert.match(body, /name="majorGroup"/);
    assert.match(body, /name="candidateTrack"/);
    assert.match(body, /name="stage"/);
    assert.match(body, /name="shortlistedStatus"/);
    assert.match(body, /name="admittedStatus"/);
    assert.match(body, /name="assessmentTypes"/);
    assert.match(body, /name="location"/);
    assert.match(body, /name="processSummary"/);
    assert.match(body, /name="questionTypes"/);
    assert.match(body, /name="preparationSummary"/);
    assert.match(body, /name="difficultyScore"/);
    assert.match(body, /name="pressureScore"/);
    assert.match(body, /name="differentiationScore"/);
    assert.match(body, /name="advice"/);
    assert.match(body, /name="isAnonymous"/);
    assert.match(body, /name="verificationMaterialType"/);
    assert.match(body, /name="verificationSourceAccount"/);
  });

  it("validates required fields for structured experience submissions", async () => {
    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000014",
      nickname: "Validation student"
    });
    const session = authService.createSessionForUser(user.id);
    const cookie = authService.serializeSessionCookie(session).split(";")[0];

    const response = await fetch(`${baseUrl}/api/experiences`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ schoolId: seedIds.schools.sysu })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, "missing_required_field");
    assert.match(body.message, /Process is required|Year is required|Major group is required/);
  });

  it("creates pending review structured experiences with anonymous sanitized output", async () => {
    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000015",
      nickname: "Anonymous submitter",
      defaultAnonymous: true
    });
    const session = authService.createSessionForUser(user.id);
    const cookie = authService.serializeSessionCookie(session).split(";")[0];
    const payload = {
      schoolId: seedIds.schools.sysu,
      year: 2026,
      majorGroup: "Science pilot group",
      candidateTrack: "physics",
      stage: "school_assessment",
      shortlistedStatus: true,
      admittedStatus: null,
      assessmentTypes: ["structured_interview", "group_discussion"],
      location: "Guangzhou campus",
      processSummary: "Panel interview followed a group discussion and individual experiment design prompts.",
      questionTypes: ["motivation", "experiment_design"],
      preparationSummary: "Prepared personal statement examples and concise experiment explanations.",
      difficultyScore: 4,
      pressureScore: 3,
      differentiationScore: 4,
      advice: "Use specific coursework examples and do not share personal sensitive details.",
      isAnonymous: true,
      verificationMaterials: [
        {
          materialType: "shortlist_notice",
          objectStorageKey: "private/submissions/sysu-shortlist.png",
          metadata: {
            sourceAccount: "source-account-123",
            realName: "Student Real Name",
            notes: "Screenshot metadata only"
          }
        }
      ]
    };

    const response = await fetch(`${baseUrl}/experiences`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 201);
    assert.equal(body.status, "pending_review");
    assert.equal(body.experience.status, "pending_review");
    assert.equal(body.experience.schoolId, seedIds.schools.sysu);
    assert.equal(body.experience.year, 2026);
    assert.equal(body.experience.shortlistedStatus, true);
    assert.equal(body.experience.admittedStatus, null);
    assert.deepEqual(body.experience.assessmentTypes, ["structured_interview", "group_discussion"]);
    assert.equal(body.experience.verification.status, "pending_review");
    assert.equal(body.experience.verification.materialCount, 1);
    assert.deepEqual(body.experience.author, {
      anonymous: true,
      displayName: "Anonymous student"
    });
    assert.doesNotMatch(serialized, /Anonymous submitter/);
    assert.doesNotMatch(serialized, /source-account-123/);
    assert.doesNotMatch(serialized, /Student Real Name/);
    assert.doesNotMatch(serialized, /private\/submissions/);
    assert.doesNotMatch(serialized, /verificationMaterials|phone|realName|sourceAccount|userId/i);

    const privateMaterials = experienceSubmissionStore.listVerificationMaterials({
      experienceId: body.experience.id,
      userId: user.id
    });

    assert.equal(privateMaterials.length, 1);
    assert.equal(privateMaterials[0].metadata.sourceAccount, "source-account-123");

    const publicResponse = await fetch(`${baseUrl}/api/experiences?schoolId=${seedIds.schools.sysu}&year=2026`);
    const publicBody = await publicResponse.json();
    const publicSerialized = JSON.stringify(publicBody);

    assert.equal(publicResponse.status, 200);
    assert.doesNotMatch(publicSerialized, new RegExp(body.experience.id));
    assert.doesNotMatch(publicSerialized, /Panel interview followed a group discussion/);
  });

  it("returns the full Guangdong timeline with generated nodes, statuses, and site-only reminders", async () => {
    const response = await fetch(
      `${baseUrl}/api/timeline?year=2026&schoolIds=${seedIds.schools.sysu},${seedIds.schools.scut}`
    );
    const body = await response.json();
    const eventKeys = new Set(body.events.map((event) => event.eventKey));
    const applicationDeadline = body.events.find((event) => event.eventKey === "application_deadline");
    const preliminaryReview = body.events.find((event) => event.eventKey === "preliminary_review_result");

    assert.equal(response.status, 200);
    assert.equal(body.mine, false);
    assert.equal(body.count, 9);
    assert.ok(eventKeys.has("guide_publication"));
    assert.ok(eventKeys.has("confirmation_or_payment"));
    assert.ok(eventKeys.has("volunteer_application"));
    assert.equal(body.events.some((event) => event.schoolId === seedIds.schools.scut), false);
    assert.equal(applicationDeadline.status, "due_soon");
    assert.equal(applicationDeadline.statusLabel, "Due Soon");
    assert.equal(preliminaryReview.startsAt, null);
    assert.equal(preliminaryReview.endsAt, null);
    assert.equal(preliminaryReview.dateLabel, "To be announced");
    assert.equal(preliminaryReview.status, "not_started");
    assert.ok(body.reminders.some((reminder) => reminder.eventKey === "application_deadline"));
    assert.ok(body.reminders.every((reminder) => reminder.delivery === "site_only"));
    assert.doesNotMatch(JSON.stringify(body.reminders), /sms|wechat|email|external/i);
  });

  it("renders the timeline page with unknown dates and status labels", async () => {
    const response = await fetch(`${baseUrl}/timeline?year=2026`, {
      headers: { accept: "text/html" }
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Guangdong timeline/);
    assert.match(body, /Preliminary review result/);
    assert.match(body, /To be announced/);
    assert.match(body, /Due Soon/);
    assert.match(body, /Site reminder/);
    assert.doesNotMatch(body, /Application deadline under review/);
    assert.doesNotMatch(body, /1970/);
  });

  it("logs in with a phone OTP session without returning phone data", async () => {
    const otpResponse = await fetch(`${baseUrl}/api/auth/otp`, {
      method: "POST",
      ...jsonRequest({ phoneNumber: "+8613812345678" })
    });
    const otpBody = await otpResponse.json();

    assert.equal(otpResponse.status, 200);
    assert.equal(otpBody.delivery, "local_stub");
    assertNoPhoneFields(otpBody);

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      ...jsonRequest({
        phoneNumber: "+8613812345678",
        otpCode: "246810",
        nickname: "Grade two applicant",
        grade: "high_school_g2",
        defaultAnonymous: false
      })
    });
    const loginBody = await loginResponse.json();
    const cookie = sessionCookieFrom(loginResponse);

    assert.equal(loginResponse.status, 200);
    assert.equal(loginBody.user.nickname, "Grade two applicant");
    assert.equal(loginBody.user.role, "user");
    assert.equal(loginBody.user.accountStatus, "active");
    assert.equal(loginBody.user.defaultAnonymous, false);
    assert.ok(loginBody.session.expiresAt);
    assertNoPhoneFields(loginBody);

    const meResponse = await fetch(`${baseUrl}/api/me`, {
      headers: { cookie }
    });
    const meBody = await meResponse.json();

    assert.equal(meResponse.status, 200);
    assert.equal(meBody.user.id, loginBody.user.id);
    assertNoPhoneFields(meBody);
  });

  it("returns personal center data for favorites, submissions, notifications, and preferences", async () => {
    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000021",
      nickname: "Personal student",
      grade: "high_school_g3",
      defaultAnonymous: true
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(user.id)).split(";")[0];

    await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ targetType: "school", targetId: seedIds.schools.sysu })
    });
    await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ targetType: "experience", targetId: seedIds.experiences.sysu2026 })
    });

    const submissionResponse = await fetch(`${baseUrl}/api/experiences`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify(validExperienceSubmissionPayload({
        verificationMaterials: [
          {
            materialType: "shortlist_notice",
            objectStorageKey: "private/personal-center-proof.png",
            metadata: {
              sourceAccount: "source-account-private",
              realName: "Private Real Name"
            }
          }
        ]
      }))
    });
    const submissionBody = await submissionResponse.json();

    assert.equal(submissionResponse.status, 201);
    assert.equal(submissionBody.experience.status, "pending_review");

    const meResponse = await fetch(`${baseUrl}/api/me`, {
      headers: { cookie }
    });
    const meBody = await meResponse.json();
    const serialized = JSON.stringify(meBody);

    assert.equal(meResponse.status, 200);
    assert.equal(meBody.user.id, user.id);
    assert.equal(meBody.preferences.nickname, "Personal student");
    assert.equal(meBody.preferences.grade, "high_school_g3");
    assert.equal(meBody.preferences.defaultAnonymous, true);
    assert.equal(meBody.favorites.count, 2);
    assert.equal(meBody.favorites.schools[0].school.name, "Sun Yat-sen University");
    assert.equal(meBody.favorites.schools[0].guide.year, 2026);
    assert.equal(meBody.favorites.experiences[0].experience.id, seedIds.experiences.sysu2026);
    assert.equal(meBody.submittedExperiences.length, 1);
    assert.equal(meBody.submittedExperiences[0].id, submissionBody.experience.id);
    assert.equal(meBody.submittedExperiences[0].status, "pending_review");
    assert.equal(meBody.submittedExperiences[0].statusLabel, "Pending Review");
    assert.equal(meBody.submittedExperiences[0].verification.statusLabel, "Pending Review");
    assert.equal(meBody.statusLabels.draft, "Draft");
    assert.equal(meBody.statusLabels.published, "Published");
    assert.equal(meBody.statusLabels.rejected, "Rejected");
    assert.equal(meBody.statusLabels.hidden, "Hidden");
    assert.ok(meBody.notifications.some((notification) => {
      return notification.delivery === "site_only" &&
        notification.channels.includes("personal_center") &&
        notification.eventKey === "application_deadline";
    }));
    assert.doesNotMatch(serialized, /sms|wechat|email|external/i);
    assert.doesNotMatch(serialized, /source-account-private/);
    assert.doesNotMatch(serialized, /Private Real Name/);
    assert.doesNotMatch(serialized, /private\/personal-center-proof/);
    assert.doesNotMatch(serialized, /verificationMaterials|phone|realName|sourceAccount|userId/i);
    assertNoPhoneFields(meBody);

    const favoritesResponse = await fetch(`${baseUrl}/api/me/favorites`, {
      headers: { cookie }
    });
    const favoritesBody = await favoritesResponse.json();

    assert.equal(favoritesResponse.status, 200);
    assert.equal(favoritesBody.count, 2);
    assert.equal(favoritesBody.favorites.schools[0].school.id, seedIds.schools.sysu);
    assert.equal(favoritesBody.favorites.experiences[0].experience.id, seedIds.experiences.sysu2026);

    const experiencesResponse = await fetch(`${baseUrl}/api/me/experiences`, {
      headers: { cookie }
    });
    const experiencesBody = await experiencesResponse.json();

    assert.equal(experiencesResponse.status, 200);
    assert.equal(experiencesBody.count, 1);
    assert.equal(experiencesBody.experiences[0].statusLabel, "Pending Review");
    assert.equal(experiencesBody.statusLabels.pending_review, "Pending Review");
    assertNoPhoneFields(experiencesBody);
  });

  it("renders the personal center page and updates account preferences", async () => {
    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000022",
      nickname: "Profile student",
      grade: "high_school_g2",
      defaultAnonymous: true
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(user.id)).split(";")[0];

    const pageResponse = await fetch(`${baseUrl}/me`, {
      headers: {
        accept: "text/html",
        cookie
      }
    });
    const pageBody = await pageResponse.text();

    assert.equal(pageResponse.status, 200);
    assert.match(pageBody, /Personal center/);
    assert.match(pageBody, /My/);
    assert.match(pageBody, /Site notifications/);
    assert.match(pageBody, /Favorited schools/);
    assert.match(pageBody, /Favorited experiences/);
    assert.match(pageBody, /Submitted experiences/);
    assert.match(pageBody, /Account preferences/);
    assert.match(pageBody, /name="nickname"/);
    assert.match(pageBody, /name="grade"/);
    assert.match(pageBody, /name="defaultAnonymous"/);
    assert.doesNotMatch(pageBody, /phone/i);

    const formBody = new URLSearchParams({
      nickname: "Updated profile student",
      grade: "high_school_g1",
      defaultAnonymous: "false"
    });
    const updateResponse = await fetch(`${baseUrl}/me/preferences`, {
      method: "POST",
      headers: {
        accept: "text/html",
        cookie,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: formBody.toString()
    });
    const updateBody = await updateResponse.text();

    assert.equal(updateResponse.status, 200);
    assert.match(updateBody, /Preferences updated/);
    assert.match(updateBody, /value="Updated profile student"/);
    assert.match(updateBody, /High school grade one/);
    assert.doesNotMatch(updateBody, /phone/i);

    const apiResponse = await fetch(`${baseUrl}/api/me`, {
      headers: { cookie }
    });
    const apiBody = await apiResponse.json();

    assert.equal(apiResponse.status, 200);
    assert.equal(apiBody.preferences.nickname, "Updated profile student");
    assert.equal(apiBody.preferences.grade, "high_school_g1");
    assert.equal(apiBody.preferences.defaultAnonymous, false);
    assertNoPhoneFields(apiBody);

    const patchResponse = await fetch(`${baseUrl}/api/me`, {
      method: "PATCH",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        nickname: "Patched profile student",
        defaultAnonymous: true
      })
    });
    const patchBody = await patchResponse.json();

    assert.equal(patchResponse.status, 200);
    assert.equal(patchBody.preferences.nickname, "Patched profile student");
    assert.equal(patchBody.preferences.defaultAnonymous, true);
    assertNoPhoneFields(patchBody);
  });

  it("persists school favorites and returns a mine timeline for favorited schools only", async () => {
    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000005",
      nickname: "Timeline student"
    });
    const session = authService.createSessionForUser(user.id);
    const cookie = authService.serializeSessionCookie(session).split(";")[0];

    const emptyMineResponse = await fetch(`${baseUrl}/api/timeline?mine=true&year=2026`, {
      headers: { cookie }
    });
    const emptyMineBody = await emptyMineResponse.json();

    assert.equal(emptyMineResponse.status, 200);
    assert.equal(emptyMineBody.count, 0);
    assert.deepEqual(emptyMineBody.events, []);

    const favoriteResponse = await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ targetType: "school", targetId: seedIds.schools.sysu })
    });
    const favoriteBody = await favoriteResponse.json();

    assert.equal(favoriteResponse.status, 201);
    assert.equal(favoriteBody.status, "favorited");
    assert.equal(favoriteBody.favorite.targetType, "school");
    assert.equal(favoriteBody.favorite.targetId, seedIds.schools.sysu);

    const duplicateResponse = await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ targetType: "school", targetId: seedIds.schools.sysu })
    });
    const duplicateBody = await duplicateResponse.json();

    assert.equal(duplicateResponse.status, 200);
    assert.equal(duplicateBody.status, "already_favorited");
    assert.equal(duplicateBody.favorite.id, favoriteBody.favorite.id);

    const mineResponse = await fetch(`${baseUrl}/api/timeline?mine=true&year=2026`, {
      headers: { cookie }
    });
    const mineBody = await mineResponse.json();

    assert.equal(mineResponse.status, 200);
    assert.equal(mineBody.mine, true);
    assert.equal(mineBody.count, 9);
    assert.equal(mineBody.favorites.length, 1);
    assert.ok(mineBody.events.every((event) => event.schoolId === seedIds.schools.sysu));
    assert.ok(mineBody.events.some((event) => event.eventKey === "application_deadline"));
    assert.ok(mineBody.reminders.every((reminder) => reminder.delivery === "site_only"));

    const unfavoriteResponse = await fetch(
      `${baseUrl}/api/favorites/${encodeURIComponent(favoriteBody.favorite.id)}`,
      {
        method: "DELETE",
        headers: { cookie }
      }
    );
    const unfavoriteBody = await unfavoriteResponse.json();

    assert.equal(unfavoriteResponse.status, 200);
    assert.equal(unfavoriteBody.status, "unfavorited");
    assert.equal(unfavoriteBody.favorite.id, favoriteBody.favorite.id);

    const removedMineResponse = await fetch(`${baseUrl}/api/timeline?mine=true&year=2026`, {
      headers: { cookie }
    });
    const removedMineBody = await removedMineResponse.json();

    assert.equal(removedMineResponse.status, 200);
    assert.equal(removedMineBody.count, 0);
    assert.deepEqual(removedMineBody.events, []);
  });

  it("persists experience favorites and removes them through the public favorites route", async () => {
    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000016",
      nickname: "Experience favorite student"
    });
    const session = authService.createSessionForUser(user.id);
    const cookie = authService.serializeSessionCookie(session).split(";")[0];

    const favoriteResponse = await fetch(`${baseUrl}/favorites`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        targetType: "experience",
        targetId: seedIds.experiences.sysu2026
      })
    });
    const favoriteBody = await favoriteResponse.json();

    assert.equal(favoriteResponse.status, 201);
    assert.equal(favoriteBody.status, "favorited");
    assert.equal(favoriteBody.favorite.targetType, "experience");
    assert.equal(favoriteBody.favorite.targetId, seedIds.experiences.sysu2026);
    assert.deepEqual(interactionStore.listFavorites({
      userId: user.id,
      targetType: "experience"
    }).map((favorite) => favorite.id), [favoriteBody.favorite.id]);

    const duplicateResponse = await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        targetType: "experience",
        targetId: seedIds.experiences.sysu2026
      })
    });
    const duplicateBody = await duplicateResponse.json();

    assert.equal(duplicateResponse.status, 200);
    assert.equal(duplicateBody.status, "already_favorited");
    assert.equal(duplicateBody.favorite.id, favoriteBody.favorite.id);

    const removeResponse = await fetch(
      `${baseUrl}/favorites/${encodeURIComponent(favoriteBody.favorite.id)}`,
      {
        method: "DELETE",
        headers: { cookie }
      }
    );
    const removeBody = await removeResponse.json();

    assert.equal(removeResponse.status, 200);
    assert.equal(removeBody.status, "unfavorited");
    assert.equal(removeBody.favorite.id, favoriteBody.favorite.id);
    assert.deepEqual(interactionStore.listFavorites({
      userId: user.id,
      targetType: "experience"
    }), []);
  });

  it("prevents duplicate useful votes for the same experience and user", async () => {
    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000017",
      nickname: "Useful voter"
    });
    const otherUser = authService.createUserForTesting({
      phoneNumber: "+8613000000018",
      nickname: "Second useful voter"
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(user.id)).split(";")[0];
    const otherCookie = authService.serializeSessionCookie(authService.createSessionForUser(otherUser.id)).split(";")[0];

    const firstResponse = await fetch(`${baseUrl}/experiences/${seedIds.experiences.sysu2026}/useful`, {
      method: "POST",
      headers: { cookie }
    });
    const firstBody = await firstResponse.json();

    assert.equal(firstResponse.status, 201);
    assert.equal(firstBody.status, "marked_useful");
    assert.equal(firstBody.experienceId, seedIds.experiences.sysu2026);
    assert.equal(firstBody.usefulCount, 19);
    assert.ok(firstBody.usefulVote.id);

    const duplicateResponse = await fetch(`${baseUrl}/api/experiences/${seedIds.experiences.sysu2026}/useful`, {
      method: "POST",
      headers: { cookie }
    });
    const duplicateBody = await duplicateResponse.json();

    assert.equal(duplicateResponse.status, 409);
    assert.equal(duplicateBody.error, "duplicate_useful_vote");
    assert.equal(duplicateBody.usefulCount, 19);

    const secondResponse = await fetch(`${baseUrl}/api/experiences/${seedIds.experiences.sysu2026}/useful`, {
      method: "POST",
      headers: { cookie: otherCookie }
    });
    const secondBody = await secondResponse.json();

    assert.equal(secondResponse.status, 201);
    assert.equal(secondBody.usefulCount, 20);
  });

  it("creates pending reports for experiences and users without leaking phone fields", async () => {
    const reporter = authService.createUserForTesting({
      phoneNumber: "+8613000000019",
      nickname: "Report student"
    });
    const reportedUser = authService.createUserForTesting({
      phoneNumber: "+8613000000020",
      nickname: "Reported user"
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(reporter.id)).split(";")[0];

    const experienceReportResponse = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        targetType: "experience",
        targetId: seedIds.experiences.sysu2026,
        reason: "contains unverifiable claims",
        description: "The assessment process described here appears inconsistent with the official guide."
      })
    });
    const experienceReportBody = await experienceReportResponse.json();

    assert.equal(experienceReportResponse.status, 201);
    assert.equal(experienceReportBody.status, "pending");
    assert.equal(experienceReportBody.report.status, "pending");
    assert.equal(experienceReportBody.report.targetType, "experience");
    assert.equal(experienceReportBody.report.targetId, seedIds.experiences.sysu2026);
    assert.equal(experienceReportBody.report.reason, "contains unverifiable claims");
    assertNoPhoneFields(experienceReportBody);

    const userReportResponse = await fetch(`${baseUrl}/reports`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        targetType: "user",
        targetId: reportedUser.id,
        reason: "unsafe contact request"
      })
    });
    const userReportBody = await userReportResponse.json();

    assert.equal(userReportResponse.status, 201);
    assert.equal(userReportBody.status, "pending");
    assert.equal(userReportBody.report.targetType, "user");
    assert.equal(userReportBody.report.targetId, reportedUser.id);
    assert.equal(userReportBody.report.description, null);
    assert.deepEqual(new Set(interactionStore.listReports({
      reporterId: reporter.id,
      status: "pending"
    }).map((report) => report.id)), new Set([
      experienceReportBody.report.id,
      userReportBody.report.id
    ]));
    assertNoPhoneFields(userReportBody);
  });

  it("blocks unauthenticated users from restricted student and admin APIs", async () => {
    const cases = [
      { method: "GET", path: "/experiences/new" },
      { method: "POST", path: "/experiences", body: { schoolId: seedIds.schools.sysu } },
      { method: "POST", path: "/api/experiences", body: { schoolId: seedIds.schools.sysu } },
      { method: "POST", path: "/favorites", body: { targetType: "experience", targetId: seedIds.experiences.sysu2026 } },
      { method: "POST", path: "/api/favorites", body: { targetType: "school", targetId: seedIds.schools.sysu } },
      { method: "DELETE", path: "/api/favorites/missing-favorite" },
      { method: "DELETE", path: "/favorites/missing-favorite" },
      { method: "POST", path: `/experiences/${seedIds.experiences.sysu2026}/useful`, body: {} },
      { method: "POST", path: `/api/experiences/${seedIds.experiences.sysu2026}/useful`, body: {} },
      { method: "POST", path: "/reports", body: { targetType: "experience", targetId: seedIds.experiences.sysu2026 } },
      { method: "POST", path: "/api/reports", body: { targetType: "experience", targetId: seedIds.experiences.sysu2026 } },
      { method: "GET", path: "/me" },
      { method: "GET", path: "/api/me" },
      { method: "GET", path: "/me/favorites" },
      { method: "GET", path: "/api/me/favorites" },
      { method: "GET", path: "/me/experiences" },
      { method: "GET", path: "/api/me/experiences" },
      { method: "POST", path: "/me/preferences", body: { nickname: "Blocked student" } },
      { method: "PATCH", path: "/api/me", body: { defaultAnonymous: false } },
      { method: "GET", path: "/api/timeline?mine=true" },
      { method: "GET", path: "/admin" },
      { method: "GET", path: "/admin/guides" },
      { method: "GET", path: "/api/admin/guides" },
      { method: "POST", path: "/api/admin/guides", body: { schoolId: seedIds.schools.sysu } },
      { method: "POST", path: `/api/admin/guides/${seedIds.guides.scut2026Pending}/publish`, body: {} },
      { method: "GET", path: "/admin/experiences" },
      { method: "GET", path: "/api/admin/experiences" },
      { method: "POST", path: "/api/admin/experiences/missing-experience/review", body: { action: "approve" } },
      { method: "GET", path: "/admin/verifications" },
      { method: "GET", path: "/api/admin/verifications" },
      { method: "POST", path: "/api/admin/verifications/missing-verification/review", body: { action: "approve" } },
      { method: "GET", path: "/admin/reports" },
      { method: "GET", path: "/api/admin/reports" },
      { method: "POST", path: "/api/admin/reports/missing-report/resolve", body: { action: "keep", resolutionNote: "Checked." } },
      { method: "GET", path: "/api/admin/health" }
    ];

    for (const currentCase of cases) {
      const response = await fetch(`${baseUrl}${currentCase.path}`, {
        method: currentCase.method,
        ...(currentCase.body ? jsonRequest(currentCase.body) : {})
      });
      const body = await response.json();

      assert.equal(response.status, 401, currentCase.path);
      assert.equal(body.error, "login_required", currentCase.path);
      assert.match(body.message, /Login is required/);
    }
  });

  it("blocks limited and banned accounts from restricted actions", async () => {
    const limitedUser = authService.createUserForTesting({
      phoneNumber: "+8613000000001",
      accountStatus: "limited"
    });
    const bannedUser = authService.createUserForTesting({
      phoneNumber: "+8613000000002",
      role: "admin",
      accountStatus: "banned"
    });
    const limitedSession = authService.createSessionForUser(limitedUser.id);
    const bannedSession = authService.createSessionForUser(bannedUser.id);

    const limitedResponse = await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: {
        cookie: authService.serializeSessionCookie(limitedSession).split(";")[0],
        "content-type": "application/json"
      },
      body: JSON.stringify({ targetType: "school", targetId: seedIds.schools.sysu })
    });
    const limitedBody = await limitedResponse.json();

    assert.equal(limitedResponse.status, 403);
    assert.equal(limitedBody.error, "account_restricted");
    assert.equal(limitedBody.accountStatus, "limited");

    const bannedResponse = await fetch(`${baseUrl}/api/admin/health`, {
      headers: { cookie: authService.serializeSessionCookie(bannedSession).split(";")[0] }
    });
    const bannedBody = await bannedResponse.json();

    assert.equal(bannedResponse.status, 403);
    assert.equal(bannedBody.error, "account_restricted");
    assert.equal(bannedBody.accountStatus, "banned");
  });

  it("enforces reviewer or admin roles on admin APIs", async () => {
    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000003",
      role: "user"
    });
    const contentReviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000031",
      role: "content_reviewer"
    });
    const dataReviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000032",
      role: "data_reviewer"
    });
    const admin = authService.createUserForTesting({
      phoneNumber: "+8613000000004",
      role: "admin"
    });
    const userSession = authService.createSessionForUser(user.id);
    const contentReviewerSession = authService.createSessionForUser(contentReviewer.id);
    const dataReviewerSession = authService.createSessionForUser(dataReviewer.id);
    const adminSession = authService.createSessionForUser(admin.id);

    const userResponse = await fetch(`${baseUrl}/api/admin/health`, {
      headers: { cookie: authService.serializeSessionCookie(userSession).split(";")[0] }
    });
    const userBody = await userResponse.json();

    assert.equal(userResponse.status, 403);
    assert.equal(userBody.error, "forbidden");

    const userGuideResponse = await fetch(`${baseUrl}/api/admin/guides`, {
      headers: { cookie: authService.serializeSessionCookie(userSession).split(";")[0] }
    });
    const userGuideBody = await userGuideResponse.json();

    assert.equal(userGuideResponse.status, 403);
    assert.equal(userGuideBody.error, "forbidden");

    const userModerationResponse = await fetch(`${baseUrl}/api/admin/experiences`, {
      headers: { cookie: authService.serializeSessionCookie(userSession).split(";")[0] }
    });
    const userModerationBody = await userModerationResponse.json();

    assert.equal(userModerationResponse.status, 403);
    assert.equal(userModerationBody.error, "forbidden");

    const contentGuideResponse = await fetch(`${baseUrl}/api/admin/guides`, {
      headers: { cookie: authService.serializeSessionCookie(contentReviewerSession).split(";")[0] }
    });
    const contentGuideBody = await contentGuideResponse.json();

    assert.equal(contentGuideResponse.status, 403);
    assert.equal(contentGuideBody.error, "forbidden");

    const contentModerationResponse = await fetch(`${baseUrl}/api/admin/experiences`, {
      headers: { cookie: authService.serializeSessionCookie(contentReviewerSession).split(";")[0] }
    });
    const contentModerationBody = await contentModerationResponse.json();

    assert.equal(contentModerationResponse.status, 200);
    assert.equal(typeof contentModerationBody.count, "number");

    const dataGuideResponse = await fetch(`${baseUrl}/api/admin/guides`, {
      headers: { cookie: authService.serializeSessionCookie(dataReviewerSession).split(";")[0] }
    });
    const dataGuideBody = await dataGuideResponse.json();

    assert.equal(dataGuideResponse.status, 200);
    assert.ok(dataGuideBody.guides.some((item) => item.guide.id === seedIds.guides.scut2026Pending));

    const adminResponse = await fetch(`${baseUrl}/api/admin/health`, {
      headers: { cookie: authService.serializeSessionCookie(adminSession).split(";")[0] }
    });
    const adminBody = await adminResponse.json();

    assert.equal(adminResponse.status, 200);
    assert.equal(adminBody.ok, true);
    assert.equal(adminBody.user.role, "admin");
    assertNoPhoneFields(adminBody);
  });

  it("renders the admin guide review queue with source attribution and extracted fields", async () => {
    const reviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000033",
      nickname: "Guide reviewer",
      role: "data_reviewer"
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(reviewer.id)).split(";")[0];

    const response = await fetch(`${baseUrl}/admin/guides`, {
      headers: {
        accept: "text/html",
        cookie
      }
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Guide review queue/);
    assert.match(body, /South China University of Technology 2026 Draft Review Guide/);
    assert.match(body, /Southern University of Science and Technology 2026 Working Draft/);
    assert.match(body, /Official source attribution/);
    assert.match(body, /Extracted fields/);
    assert.match(body, /Submit review/);
    assert.match(body, /Publish/);
    assert.match(body, /Return/);
    assert.match(body, /Pending supplement/);
    assert.match(body, /Archive/);
    assertNoPhoneFields(body);
  });

  it("reviews guide drafts with audit records and publishes them to student APIs only after approval", async () => {
    const reviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000034",
      nickname: "Official data reviewer",
      role: "data_reviewer"
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(reviewer.id)).split(";")[0];
    const guidePayload = {
      schoolId: seedIds.schools.sysu,
      admissionYear: 2027,
      officialSourceUrl: "https://example.edu/sysu/2027-comprehensive-evaluation-guide",
      sourceType: "admission_guide",
      sourceTitle: "SYSU 2027 official comprehensive evaluation guide",
      sourcePublishedAt: "2027-03-15T02:00:00.000Z",
      guideTitle: "Sun Yat-sen University 2027 Guangdong Comprehensive Evaluation Guide",
      summary: "Draft official guide for 2027 Guangdong candidates awaiting manual data review.",
      structuredFields: {
        applicationUrl: "https://example.edu/sysu/2027-apply",
        applicationStatus: "open",
        applicationStartAt: "2027-03-18T01:00:00.000Z",
        applicationDeadlineAt: "2027-04-20T15:59:59.000Z",
        majors: [
          { name: "Integrated science program", track: "physics" }
        ],
        subjectRequirements: ["Physics track required for integrated science"],
        academicTestRequirements: "Academic level examination results must meet the official notice.",
        assessmentMethod: "Materials review plus school assessment.",
        admissionRule: "Comprehensive score follows the published official formula.",
        fees: { applicationFeeCny: 0, assessmentFeeCny: 0 },
        contact: { phone: "020-00000000", email: "admission@example.edu" }
      }
    };

    const hiddenBeforeResponse = await fetch(
      `${baseUrl}/api/guides?schoolId=${seedIds.schools.sysu}&year=2027`
    );
    const hiddenBeforeBody = await hiddenBeforeResponse.json();

    assert.equal(hiddenBeforeResponse.status, 200);
    assert.equal(hiddenBeforeBody.count, 0);

    const createResponse = await fetch(`${baseUrl}/api/admin/guides`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify(guidePayload)
    });
    const createBody = await createResponse.json();
    const createdGuideId = createBody.guide.guide.id;

    assert.equal(createResponse.status, 201);
    assert.equal(createBody.status, "draft");
    assert.equal(createBody.guide.guide.status, "draft");
    assert.equal(createBody.guide.source.officialSourceUrl, guidePayload.officialSourceUrl);
    assert.equal(createBody.guide.structuredFields.applicationDeadlineAt, "2027-04-20T15:59:59.000Z");
    assert.equal(createBody.guide.reviewAudit.at(-1).operation, "create_draft");
    assert.equal(createBody.guide.reviewAudit.at(-1).operatorId, reviewer.id);

    const hiddenDraftResponse = await fetch(
      `${baseUrl}/api/guides?schoolId=${seedIds.schools.sysu}&year=2027`
    );
    const hiddenDraftBody = await hiddenDraftResponse.json();

    assert.equal(hiddenDraftResponse.status, 200);
    assert.equal(hiddenDraftBody.count, 0);

    const submitResponse = await fetch(`${baseUrl}/api/admin/guides/${createdGuideId}/submit-review`, {
      method: "POST",
      ...jsonRequest({ note: "Ready for official data review." }),
      headers: {
        cookie,
        "content-type": "application/json"
      }
    });
    const submitBody = await submitResponse.json();

    assert.equal(submitResponse.status, 200);
    assert.equal(submitBody.status, "pending_review");
    assert.equal(submitBody.guide.guide.status, "pending_review");
    assert.equal(submitBody.guide.reviewAudit.at(-1).operation, "submit_review");
    assert.equal(submitBody.guide.reviewAudit.at(-1).operatedAt, "2026-04-18T00:00:00.000Z");

    const publishResponse = await fetch(`${baseUrl}/api/admin/guides/${createdGuideId}/publish`, {
      method: "POST",
      ...jsonRequest({ note: "Official source and extracted fields verified." }),
      headers: {
        cookie,
        "content-type": "application/json"
      }
    });
    const publishBody = await publishResponse.json();

    assert.equal(publishResponse.status, 200);
    assert.equal(publishBody.status, "published");
    assert.equal(publishBody.guide.guide.status, "published");
    assert.equal(publishBody.guide.guide.isCurrent, true);
    assert.equal(publishBody.guide.reviewAudit.at(-1).operation, "publish");
    assert.equal(publishBody.guide.reviewAudit.at(-1).operatorId, reviewer.id);
    assert.equal(publishBody.guide.reviewAudit.at(-1).operatedAt, "2026-04-18T00:00:00.000Z");

    const visibleResponse = await fetch(
      `${baseUrl}/api/guides?schoolId=${seedIds.schools.sysu}&year=2027`
    );
    const visibleBody = await visibleResponse.json();

    assert.equal(visibleResponse.status, 200);
    assert.equal(visibleBody.count, 1);
    assert.equal(visibleBody.guides[0].id, createdGuideId);
    assert.equal(visibleBody.guides[0].status, "published");
    assert.equal(visibleBody.guides[0].source.officialSourceUrl, guidePayload.officialSourceUrl);

    const supplementResponse = await fetch(
      `${baseUrl}/api/admin/guides/${seedIds.guides.sustech2026Draft}/pending-supplement`,
      {
        method: "POST",
        ...jsonRequest({ note: "Missing official application dates." }),
        headers: {
          cookie,
          "content-type": "application/json"
        }
      }
    );
    const supplementBody = await supplementResponse.json();

    assert.equal(supplementResponse.status, 200);
    assert.equal(supplementBody.status, "pending_supplement");
    assert.equal(supplementBody.guide.guide.status, "draft");
    assert.equal(supplementBody.guide.guide.supplementStatus, "pending_supplement");
    assert.equal(supplementBody.guide.reviewAudit.at(-1).operation, "mark_pending_supplement");

    const returnSubmitResponse = await fetch(
      `${baseUrl}/api/admin/guides/${seedIds.guides.sustech2026Draft}/submit-review`,
      {
        method: "POST",
        ...jsonRequest({ note: "Supplement added for recheck." }),
        headers: {
          cookie,
          "content-type": "application/json"
        }
      }
    );

    assert.equal(returnSubmitResponse.status, 200);

    const returnResponse = await fetch(
      `${baseUrl}/api/admin/guides/${seedIds.guides.sustech2026Draft}/return`,
      {
        method: "POST",
        ...jsonRequest({ note: "Source attribution still needs correction." }),
        headers: {
          cookie,
          "content-type": "application/json"
        }
      }
    );
    const returnBody = await returnResponse.json();

    assert.equal(returnResponse.status, 200);
    assert.equal(returnBody.status, "returned");
    assert.equal(returnBody.guide.guide.status, "draft");
    assert.equal(returnBody.guide.reviewAudit.at(-1).operation, "return");

    const archiveResponse = await fetch(
      `${baseUrl}/api/admin/guides/${seedIds.guides.sustech2026Draft}/archive`,
      {
        method: "POST",
        ...jsonRequest({ note: "Archived duplicate draft." }),
        headers: {
          cookie,
          "content-type": "application/json"
        }
      }
    );
    const archiveBody = await archiveResponse.json();

    assert.equal(archiveResponse.status, 200);
    assert.equal(archiveBody.status, "archived");
    assert.equal(archiveBody.guide.guide.status, "archived");
    assert.equal(archiveBody.guide.reviewAudit.at(-1).operation, "archive");
  });

  it("renders admin timeline and formula management pages for data reviewers", async () => {
    const reviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000035",
      nickname: "Timeline formula reviewer",
      role: "data_reviewer"
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(reviewer.id)).split(";")[0];

    const timelineResponse = await fetch(`${baseUrl}/admin/timeline?year=2026`, {
      headers: {
        accept: "text/html",
        cookie
      }
    });
    const timelineBody = await timelineResponse.text();

    assert.equal(timelineResponse.status, 200);
    assert.match(timelineBody, /Timeline overrides/);
    assert.match(timelineBody, /Guide-generated event/);
    assert.match(timelineBody, /Manual override/);
    assert.match(timelineBody, /Override reason/);
    assert.match(timelineBody, /Save override/);
    assertNoPhoneFields(timelineBody);

    const formulaResponse = await fetch(`${baseUrl}/admin/formulas`, {
      headers: {
        accept: "text/html",
        cookie
      }
    });
    const formulaBody = await formulaResponse.text();

    assert.equal(formulaResponse.status, 200);
    assert.match(formulaBody, /Score formula drafts/);
    assert.match(formulaBody, /Inputs schema and weights/);
    assert.match(formulaBody, /Sample calculation tests/);
    assert.match(formulaBody, /Publish formula/);
    assertNoPhoneFields(formulaBody);
  });

  it("requires override reasons and audits manual timeline overrides", async () => {
    const reviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000036",
      nickname: "Timeline override reviewer",
      role: "data_reviewer"
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(reviewer.id)).split(";")[0];
    const overridePayload = {
      admissionGuideId: seedIds.guides.sysu2026,
      eventKey: "application_deadline",
      title: "SYSU audited application deadline",
      startsAt: "2026-04-21T15:59:59.000Z",
      endsAt: "2026-04-21T15:59:59.000Z",
      description: "Deadline corrected after official reviewer checked the source notice."
    };

    const missingReasonResponse = await fetch(`${baseUrl}/api/admin/timeline/overrides`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify(overridePayload)
    });
    const missingReasonBody = await missingReasonResponse.json();

    assert.equal(missingReasonResponse.status, 400);
    assert.equal(missingReasonBody.error, "missing_override_reason");

    const overrideResponse = await fetch(`${baseUrl}/api/admin/timeline/overrides`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ...overridePayload,
        overrideReason: "Official application deadline notice updated on the source site."
      })
    });
    const overrideBody = await overrideResponse.json();

    assert.equal(overrideResponse.status, 200);
    assert.equal(overrideBody.status, "overridden");
    assert.equal(overrideBody.timelineNode.title, overridePayload.title);
    assert.equal(overrideBody.timelineNode.description, overridePayload.description);
    assert.equal(overrideBody.timelineNode.startsAt, overridePayload.startsAt);
    assert.equal(overrideBody.timelineNode.source, "manual_override");
    assert.equal(overrideBody.timelineNode.override.reason, "Official application deadline notice updated on the source site.");
    assert.equal(overrideBody.timelineNode.override.reviewAudit.at(-1).operation, "override_timeline");
    assert.equal(overrideBody.timelineNode.override.reviewAudit.at(-1).operatorId, reviewer.id);
    assert.equal(overrideBody.timelineNode.override.reviewAudit.at(-1).operatedAt, "2026-04-18T00:00:00.000Z");

    const publicTimelineResponse = await fetch(
      `${baseUrl}/api/timeline?year=2026&schoolIds=${encodeURIComponent(seedIds.schools.sysu)}`
    );
    const publicTimelineBody = await publicTimelineResponse.json();

    assert.equal(publicTimelineResponse.status, 200);
    assert.ok(publicTimelineBody.events.some((event) => {
      return event.eventKey === "application_deadline" &&
        event.title === overridePayload.title &&
        event.description === overridePayload.description &&
        event.startsAt === overridePayload.startsAt;
    }));
  });

  it("requires passing formula samples before publication and exposes published formulas to the calculator", async () => {
    const reviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000037",
      nickname: "Formula reviewer",
      role: "data_reviewer"
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(reviewer.id)).split(";")[0];
    const formulaPayload = {
      schoolId: seedIds.schools.scut,
      year: 2025,
      status: "draft",
      formulaName: "SCUT 2025 audited 85/15 formula",
      formulaType: "weighted_sum",
      formulaConfig: {
        inputs: [
          { key: "gaokao", label: "Gaokao score", maxScore: 750, weight: 0.85 },
          { key: "schoolAssessment", label: "School assessment", maxScore: 100, weight: 0.15 }
        ],
        outputMaxScore: 100
      },
      explanation: "Comprehensive score uses normalized gaokao and school assessment inputs from the official guide.",
      officialSourceUrl: "https://example.edu/scut/2025-comprehensive-evaluation-guide",
      sampleTests: [
        {
          name: "Intentionally failing full-score sample",
          scores: { gaokao: 750, schoolAssessment: 100 },
          expectedTotalScore: 99
        }
      ]
    };

    const hiddenResponse = await fetch(`${baseUrl}/api/score/calculate`, {
      method: "POST",
      ...jsonRequest({
        schoolId: seedIds.schools.scut,
        year: 2025,
        scores: { gaokao: 750, schoolAssessment: 100 }
      })
    });
    const hiddenBody = await hiddenResponse.json();

    assert.equal(hiddenResponse.status, 404);
    assert.equal(hiddenBody.error, "formula_not_available");

    const createResponse = await fetch(`${baseUrl}/api/admin/formulas`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify(formulaPayload)
    });
    const createBody = await createResponse.json();
    const formulaId = createBody.formula.formula.id;

    assert.equal(createResponse.status, 201);
    assert.equal(createBody.status, "draft_created");
    assert.equal(createBody.formula.formula.status, "draft");
    assert.equal(createBody.formula.reviewAudit.at(-1).operation, "create_formula_draft");
    assert.equal(createBody.formula.reviewAudit.at(-1).operatorId, reviewer.id);
    assert.equal(createBody.formula.sampleResults[0].passed, false);

    const failedPublishResponse = await fetch(`${baseUrl}/api/admin/formulas/${encodeURIComponent(formulaId)}/publish`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ note: "Trying to publish before sample passes." })
    });
    const failedPublishBody = await failedPublishResponse.json();

    assert.equal(failedPublishResponse.status, 422);
    assert.equal(failedPublishBody.error, "formula_sample_failed");

    const updateResponse = await fetch(`${baseUrl}/api/admin/formulas`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: formulaId,
        sampleTests: [
          {
            name: "Passing full-score sample",
            scores: { gaokao: 750, schoolAssessment: 100 },
            expectedTotalScore: 100
          }
        ],
        note: "Corrected expected total after sample calculation review."
      })
    });
    const updateBody = await updateResponse.json();

    assert.equal(updateResponse.status, 200);
    assert.equal(updateBody.status, "draft_updated");
    assert.equal(updateBody.formula.sampleResults[0].passed, true);
    assert.equal(updateBody.formula.reviewAudit.at(-1).operation, "update_formula_draft");

    const publishResponse = await fetch(`${baseUrl}/api/admin/formulas/${encodeURIComponent(formulaId)}/publish`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ note: "Formula sample test passed and source was checked." })
    });
    const publishBody = await publishResponse.json();

    assert.equal(publishResponse.status, 200);
    assert.equal(publishBody.status, "published");
    assert.equal(publishBody.formula.formula.status, "published");
    assert.equal(publishBody.formula.sampleResults[0].passed, true);
    assert.equal(publishBody.formula.reviewAudit.at(-1).operation, "publish_formula");
    assert.equal(publishBody.formula.reviewAudit.at(-1).operatorId, reviewer.id);
    assert.equal(publishBody.formula.reviewAudit.at(-1).operatedAt, "2026-04-18T00:00:00.000Z");

    const scoreResponse = await fetch(`${baseUrl}/api/score/calculate`, {
      method: "POST",
      ...jsonRequest({
        schoolId: seedIds.schools.scut,
        year: 2025,
        scores: { gaokao: 750, schoolAssessment: 100 }
      })
    });
    const scoreBody = await scoreResponse.json();

    assert.equal(scoreResponse.status, 200);
    assert.equal(scoreBody.formulaId, formulaId);
    assert.equal(scoreBody.formulaName, formulaPayload.formulaName);
    assert.equal(scoreBody.totalScore, 100);

    const calculatorResponse = await fetch(
      `${baseUrl}/calculator?schoolId=${encodeURIComponent(seedIds.schools.scut)}&year=2025`,
      { headers: { accept: "text/html" } }
    );
    const calculatorBody = await calculatorResponse.text();

    assert.equal(calculatorResponse.status, 200);
    assert.match(calculatorBody, /SCUT 2025 audited 85\/15 formula/);
    assert.match(calculatorBody, /id="score-input-form"/);
    assert.doesNotMatch(calculatorBody, /No clear published formula/);
  });

  it("creates AI ingestion runs as draft-only official guide review material", async () => {
    const reviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000048",
      nickname: "Ingestion reviewer",
      role: "data_reviewer"
    });
    const cookie = authService.serializeSessionCookie(authService.createSessionForUser(reviewer.id)).split(";")[0];
    const sourceDocuments = [
      {
        id: "route-source-third-party",
        sourceUrl: "https://www.sohu.com/a/guangdong-zhpj",
        title: "Third-party discovery clue for comprehensive evaluation",
        sourceType: "third_party_info",
        status: "candidate"
      },
      {
        id: "route-source-chsi",
        sourceUrl: "https://gaokao.chsi.com.cn/zsgs/zhpj",
        title: "Yangguang Gaokao official comprehensive evaluation notice",
        sourceType: "chsi_yangguang_gaokao",
        status: "candidate"
      },
      {
        id: "route-source-geea",
        sourceUrl: "https://eea.gd.gov.cn/admission/2029-zhpj",
        title: "Guangdong Education Examination Authority 2029 notice",
        sourceType: "guangdong_education_exam_authority",
        fetchedAt: "2029-03-15T02:00:00.000Z",
        contentHash: "route-geea-hash",
        rawTextAssetUrl: "oss://raw/route-geea.txt",
        status: "accepted"
      }
    ];
    const extractedGuideFields = {
      guideTitle: {
        value: "Sun Yat-sen University 2029 Guangdong Comprehensive Evaluation Guide",
        sourceDocumentId: "route-source-geea",
        confidence: 0.92
      },
      summary: {
        value: "AI-extracted guide draft for manual data review only.",
        sourceDocumentId: "route-source-geea",
        confidence: 0.9
      },
      applicationStatus: {
        value: "open",
        sourceDocumentId: "route-source-geea",
        confidence: 0.8
      },
      majors: {
        value: [
          { name: "Clinical medicine pilot class", track: "physics" }
        ],
        manualNote: "Reviewer entered the major list from the official attachment."
      }
    };

    const hiddenBeforeResponse = await fetch(
      `${baseUrl}/api/guides?schoolId=${encodeURIComponent(seedIds.schools.sysu)}&year=2029`
    );
    const hiddenBeforeBody = await hiddenBeforeResponse.json();

    assert.equal(hiddenBeforeResponse.status, 200);
    assert.equal(hiddenBeforeBody.count, 0);

    const createResponse = await fetch(`${baseUrl}/api/admin/ingestion-runs`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "route-ingestion-run",
        schoolId: seedIds.schools.sysu,
        year: 2029,
        keyword: "SYSU 2029",
        sourceDocuments,
        extractedGuideFields,
        timelineCandidates: [
          {
            eventKey: "application_deadline",
            title: "Application deadline",
            endsAt: "2029-04-20T15:59:59.000Z",
            sourceDocumentId: "route-source-geea",
            confidence: 0.83
          }
        ],
        formulaCandidates: [
          {
            formulaName: "Extracted 85/15 weighted formula",
            formulaType: "weighted_sum",
            manualNote: "Formula text requires data reviewer verification."
          }
        ],
        confidenceScore: 0.86,
        reviewNotes: "Manual review required before any publish transition."
      })
    });
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(createBody.status, "draft_created");
    assert.deepEqual(createBody.ingestionRun.sourceDocuments.map((document) => document.id), [
      "route-source-geea",
      "route-source-chsi",
      "route-source-third-party"
    ]);
    assert.equal(createBody.ingestionRun.sourceDocuments[0].sourcePriorityLabel, "Guangdong Education Examination Authority");
    assert.equal(createBody.ingestionRun.sourceDocuments.at(-1).authorityRole, "discovery_clue");
    assert.equal(createBody.ingestionRun.draftGuide.status, "draft");
    assert.equal(createBody.ingestionRun.draftGuide.isCurrent, false);
    assert.equal(
      createBody.ingestionRun.extractedGuideFields.guideTitle.trace.sourceDocumentId,
      "route-source-geea"
    );
    assert.match(
      createBody.ingestionRun.extractedGuideFields.majors.trace.manualNote,
      /official attachment/
    );

    const hiddenDraftResponse = await fetch(
      `${baseUrl}/api/guides?schoolId=${encodeURIComponent(seedIds.schools.sysu)}&year=2029`
    );
    const hiddenDraftBody = await hiddenDraftResponse.json();

    assert.equal(hiddenDraftResponse.status, 200);
    assert.equal(hiddenDraftBody.count, 0);

    const listResponse = await fetch(`${baseUrl}/api/admin/ingestion-runs?keyword=SYSU`, {
      headers: { cookie }
    });
    const listBody = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.ok(listBody.ingestionRuns.some((run) => run.id === "route-ingestion-run"));

    const detailResponse = await fetch(`${baseUrl}/api/admin/ingestion-runs/route-ingestion-run`, {
      headers: { cookie }
    });
    const detailBody = await detailResponse.json();

    assert.equal(detailResponse.status, 200);
    assert.equal(detailBody.timelineCandidates[0].trace.sourceDocumentId, "route-source-geea");
    assert.equal(detailBody.formulaCandidates[0].trace.authorityRole, "manual_note");

    const pageResponse = await fetch(`${baseUrl}/admin/ingestion-runs`, {
      headers: {
        accept: "text/html",
        cookie
      }
    });
    const pageBody = await pageResponse.text();

    assert.equal(pageResponse.status, 200);
    assert.match(pageBody, /Ingestion draft workflow/);
    assert.match(pageBody, /Source document candidates/);
    assert.match(pageBody, /Traceable extracted guide fields/);
    assert.match(pageBody, /Hidden until manual publish/);
    assertNoPhoneFields(pageBody);

    const rejectResponse = await fetch(`${baseUrl}/api/admin/ingestion-runs`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        keyword: "third-party rejected",
        createDraft: false,
        sourceDocuments: [
          {
            id: "route-source-third-party-rejected",
            sourceUrl: "https://www.zhihu.com/question/zhpj",
            title: "Third-party guide post",
            sourceType: "third_party_info",
            status: "accepted"
          }
        ]
      })
    });
    const rejectBody = await rejectResponse.json();

    assert.equal(rejectResponse.status, 400);
    assert.equal(rejectBody.error, "third_party_final_authority_rejected");
  });

  it("moderates pending experiences, publishes approved submissions, and keeps verification materials private", async () => {
    const student = authService.createUserForTesting({
      phoneNumber: "+8613000000038",
      nickname: "Moderation submitter"
    });
    const reviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000039",
      nickname: "Content reviewer",
      role: "content_reviewer"
    });
    const studentCookie = authService.serializeSessionCookie(authService.createSessionForUser(student.id)).split(";")[0];
    const reviewerCookie = authService.serializeSessionCookie(authService.createSessionForUser(reviewer.id)).split(";")[0];

    const submitResponse = await fetch(`${baseUrl}/api/experiences`, {
      method: "POST",
      headers: {
        cookie: studentCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify(validExperienceSubmissionPayload({
        processSummary: "Structured interview had a panel discussion and a short experiment design prompt.",
        advice: "Prepare concise coursework examples and remove private identity details from public text.",
        verificationMaterials: [
          {
            materialType: "admission_result",
            objectStorageKey: "private/moderation/admission-result.png",
            metadata: {
              sourceAccount: "moderation-source-account",
              realName: "Moderation Student"
            }
          }
        ]
      }))
    });
    const submitBody = await submitResponse.json();
    const experienceId = submitBody.experience.id;

    assert.equal(submitResponse.status, 201);

    const queueResponse = await fetch(`${baseUrl}/api/admin/experiences`, {
      headers: { cookie: reviewerCookie }
    });
    const queueBody = await queueResponse.json();
    const queuedExperience = queueBody.experiences.find((experience) => experience.id === experienceId);

    assert.equal(queueResponse.status, 200);
    assert.equal(queuedExperience.status, "pending_review");
    assert.equal(queuedExperience.moderation.approvalBlocked, false);
    assert.ok(queuedExperience.moderation.warnings.some((warning) => {
      return warning.code === "verification_privacy_warning";
    }));
    assertNoPhoneFields(queueBody);

    const htmlResponse = await fetch(`${baseUrl}/admin/experiences`, {
      headers: {
        accept: "text/html",
        cookie: reviewerCookie
      }
    });
    const htmlBody = await htmlResponse.text();

    assert.equal(htmlResponse.status, 200);
    assert.match(htmlBody, /Experience moderation queue/);
    assert.match(htmlBody, /Sensitive content and privacy warnings/);
    assert.match(htmlBody, /Verification privacy warning/);
    assertNoPhoneFields(htmlBody);

    const approveResponse = await fetch(`${baseUrl}/api/admin/experiences/${encodeURIComponent(experienceId)}/review`, {
      method: "POST",
      headers: {
        cookie: reviewerCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "approve",
        note: "Public text is clean and verification privacy metadata remains reviewer-only."
      })
    });
    const approveBody = await approveResponse.json();

    assert.equal(approveResponse.status, 200);
    assert.equal(approveBody.status, "published");
    assert.equal(approveBody.experience.reviewAudit.at(-1).operation, "approve_experience");
    assert.equal(approveBody.experience.reviewAudit.at(-1).operatorId, reviewer.id);

    const verificationQueueResponse = await fetch(`${baseUrl}/api/admin/verifications`, {
      headers: { cookie: reviewerCookie }
    });
    const verificationQueueBody = await verificationQueueResponse.json();
    const verificationReview = verificationQueueBody.verifications.find((item) => {
      return item.experience.id === experienceId;
    });

    assert.equal(verificationQueueResponse.status, 200);
    assert.equal(verificationReview.material.storageKeyPresent, true);
    assert.equal(verificationReview.material.metadata.sourceAccount, "moderation-source-account");
    assert.doesNotMatch(JSON.stringify(verificationQueueBody), /private\/moderation\/admission-result/);

    const verifyResponse = await fetch(
      `${baseUrl}/api/admin/verifications/${encodeURIComponent(verificationReview.material.id)}/review`,
      {
        method: "POST",
        headers: {
          cookie: reviewerCookie,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "approve",
          note: "Verification material checked by reviewer."
        })
      }
    );
    const verifyBody = await verifyResponse.json();

    assert.equal(verifyResponse.status, 200);
    assert.equal(verifyBody.status, "verified");
    assert.equal(verifyBody.verification.material.reviewAudit.at(-1).operation, "approve_verification");

    const publicResponse = await fetch(`${baseUrl}/api/experiences?schoolId=${seedIds.schools.sysu}&year=2026`);
    const publicBody = await publicResponse.json();
    const publicExperience = publicBody.experiences.find((experience) => experience.id === experienceId);
    const publicSerialized = JSON.stringify(publicBody);

    assert.equal(publicResponse.status, 200);
    assert.equal(publicExperience.verificationStatus, "verified");
    assert.doesNotMatch(publicSerialized, /verificationMaterials|objectStorageKey|sourceAccount|realName|private\/moderation/i);
  });

  it("blocks approval for prohibited experience content and allows return for rewrite", async () => {
    const student = authService.createUserForTesting({
      phoneNumber: "+8613000000040",
      nickname: "Risk submitter"
    });
    const reviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000041",
      nickname: "Risk reviewer",
      role: "content_reviewer"
    });
    const studentCookie = authService.serializeSessionCookie(authService.createSessionForUser(student.id)).split(";")[0];
    const reviewerCookie = authService.serializeSessionCookie(authService.createSessionForUser(reviewer.id)).split(";")[0];

    const submitResponse = await fetch(`${baseUrl}/api/experiences`, {
      method: "POST",
      headers: {
        cookie: studentCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify(validExperienceSubmissionPayload({
        processSummary: "The assessment is a current live exam and I saved the exact original question from the room.",
        advice: "Add my WeChat for true-question sales, ghostwriting, and guaranteed admission help."
      }))
    });
    const submitBody = await submitResponse.json();
    const experienceId = submitBody.experience.id;

    assert.equal(submitResponse.status, 201);

    const approvalResponse = await fetch(`${baseUrl}/api/admin/experiences/${encodeURIComponent(experienceId)}/review`, {
      method: "POST",
      headers: {
        cookie: reviewerCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "approve",
        note: "Attempting approval should fail."
      })
    });
    const approvalBody = await approvalResponse.json();
    const warningCodes = new Set(approvalBody.moderation.warnings.map((warning) => warning.code));

    assert.equal(approvalResponse.status, 422);
    assert.equal(approvalBody.error, "moderation_blocked");
    assert.equal(approvalBody.moderation.approvalBlocked, true);
    assert.ok(warningCodes.has("ongoing_exam_content"));
    assert.ok(warningCodes.has("undisclosed_original_question"));
    assert.ok(warningCodes.has("true_question_sales"));
    assert.ok(warningCodes.has("material_ghostwriting"));
    assert.ok(warningCodes.has("guaranteed_admission_claim"));
    assert.ok(warningCodes.has("external_traffic_scam"));

    const returnResponse = await fetch(`${baseUrl}/api/admin/experiences/${encodeURIComponent(experienceId)}/review`, {
      method: "POST",
      headers: {
        cookie: reviewerCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "return",
        note: "Rewrite required for prohibited content."
      })
    });
    const returnBody = await returnResponse.json();

    assert.equal(returnResponse.status, 200);
    assert.equal(returnBody.status, "returned");
    assert.equal(returnBody.experience.reviewAudit.at(-1).operation, "return_experience");

    const publicResponse = await fetch(`${baseUrl}/api/experiences?schoolId=${seedIds.schools.sysu}&year=2026`);
    const publicBody = await publicResponse.json();

    assert.equal(publicResponse.status, 200);
    assert.equal(publicBody.experiences.some((experience) => experience.id === experienceId), false);
  });

  it("resolves reports by keeping, hiding, deleting, and limiting targets", async () => {
    const submitter = authService.createUserForTesting({
      phoneNumber: "+8613000000042",
      nickname: "Reported submitter"
    });
    const reporter = authService.createUserForTesting({
      phoneNumber: "+8613000000043",
      nickname: "Report author"
    });
    const targetUser = authService.createUserForTesting({
      phoneNumber: "+8613000000044",
      nickname: "Reported account"
    });
    const reviewer = authService.createUserForTesting({
      phoneNumber: "+8613000000045",
      nickname: "Report reviewer",
      role: "content_reviewer"
    });
    const submitterCookie = authService.serializeSessionCookie(authService.createSessionForUser(submitter.id)).split(";")[0];
    const reporterCookie = authService.serializeSessionCookie(authService.createSessionForUser(reporter.id)).split(";")[0];
    const reviewerCookie = authService.serializeSessionCookie(authService.createSessionForUser(reviewer.id)).split(";")[0];

    const submitResponse = await fetch(`${baseUrl}/api/experiences`, {
      method: "POST",
      headers: {
        cookie: submitterCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify(validExperienceSubmissionPayload({
        processSummary: "Panel interview and group discussion with no prohibited content.",
        advice: "Use public school information and concise personal examples."
      }))
    });
    const submitBody = await submitResponse.json();
    const dynamicExperienceId = submitBody.experience.id;

    assert.equal(submitResponse.status, 201);

    const approveResponse = await fetch(`${baseUrl}/api/admin/experiences/${encodeURIComponent(dynamicExperienceId)}/review`, {
      method: "POST",
      headers: {
        cookie: reviewerCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "approve",
        note: "Clean report-resolution fixture."
      })
    });

    assert.equal(approveResponse.status, 200);

    const keepReportResponse = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: {
        cookie: reporterCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        targetType: "experience",
        targetId: seedIds.experiences.sysu2026,
        reason: "Needs reviewer check",
        description: "The report should be resolved by keeping the target."
      })
    });
    const hideReportResponse = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: {
        cookie: reporterCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        targetType: "experience",
        targetId: dynamicExperienceId,
        reason: "Hide target",
        description: "The target should be hidden from student pages."
      })
    });
    const deleteReportResponse = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: {
        cookie: reporterCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        targetType: "experience",
        targetId: dynamicExperienceId,
        reason: "Delete target",
        description: "The target should be deleted from student pages."
      })
    });
    const userReportResponse = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: {
        cookie: reporterCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        targetType: "user",
        targetId: targetUser.id,
        reason: "Account risk",
        description: "The target account should be limited."
      })
    });
    const keepReport = await keepReportResponse.json();
    const hideReport = await hideReportResponse.json();
    const deleteReport = await deleteReportResponse.json();
    const userReport = await userReportResponse.json();

    assert.equal(keepReportResponse.status, 201);
    assert.equal(hideReportResponse.status, 201);
    assert.equal(deleteReportResponse.status, 201);
    assert.equal(userReportResponse.status, 201);

    const reportsPageResponse = await fetch(`${baseUrl}/admin/reports`, {
      headers: {
        accept: "text/html",
        cookie: reviewerCookie
      }
    });
    const reportsPageBody = await reportsPageResponse.text();

    assert.equal(reportsPageResponse.status, 200);
    assert.match(reportsPageBody, /Report resolution queue/);
    assert.match(reportsPageBody, /Keep target/);
    assert.match(reportsPageBody, /Limit account/);
    assertNoPhoneFields(reportsPageBody);

    const keepResolveResponse = await fetch(
      `${baseUrl}/api/admin/reports/${encodeURIComponent(keepReport.report.id)}/resolve`,
      {
        method: "POST",
        headers: {
          cookie: reviewerCookie,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "keep",
          resolutionNote: "Target is acceptable after review."
        })
      }
    );
    const keepResolveBody = await keepResolveResponse.json();

    assert.equal(keepResolveResponse.status, 200);
    assert.equal(keepResolveBody.status, "resolved");
    assert.equal(keepResolveBody.report.resolution.action, "keep");
    assert.equal(getExperienceById(seedIds.experiences.sysu2026)?.id, seedIds.experiences.sysu2026);

    const hideResolveResponse = await fetch(
      `${baseUrl}/api/admin/reports/${encodeURIComponent(hideReport.report.id)}/resolve`,
      {
        method: "POST",
        headers: {
          cookie: reviewerCookie,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "hide",
          resolutionNote: "Target hidden after report review."
        })
      }
    );
    const hideResolveBody = await hideResolveResponse.json();

    assert.equal(hideResolveResponse.status, 200);
    assert.equal(hideResolveBody.sideEffect.action, "hidden");
    assert.equal(getExperienceById(dynamicExperienceId), null);

    const deleteResolveResponse = await fetch(
      `${baseUrl}/api/admin/reports/${encodeURIComponent(deleteReport.report.id)}/resolve`,
      {
        method: "POST",
        headers: {
          cookie: reviewerCookie,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "delete",
          resolutionNote: "Target deleted after duplicate report."
        })
      }
    );
    const deleteResolveBody = await deleteResolveResponse.json();

    assert.equal(deleteResolveResponse.status, 200);
    assert.equal(deleteResolveBody.sideEffect.action, "deleted");

    const limitResolveResponse = await fetch(
      `${baseUrl}/api/admin/reports/${encodeURIComponent(userReport.report.id)}/resolve`,
      {
        method: "POST",
        headers: {
          cookie: reviewerCookie,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "limit_account",
          resolutionNote: "Account limited after report review."
        })
      }
    );
    const limitResolveBody = await limitResolveResponse.json();

    assert.equal(limitResolveResponse.status, 200);
    assert.equal(limitResolveBody.sideEffect.accountStatus, "limited");
    assert.equal(authService.getUserById(targetUser.id).accountStatus, "limited");
    assertNoPhoneFields(limitResolveBody);
  });
});
