import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import { createAuthService } from "./auth.js";
import { handleRequest } from "./app.js";
import { seedIds } from "./db/seed-data.js";
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

function schoolNames(payload) {
  return payload.schools.map((schoolCard) => schoolCard.school.name);
}

describe("web routes", () => {
  let authService;
  let baseUrl;
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
    interactionStore = createInteractionStore({ now: timelineNow });
    server = createServer((request, response) => {
      handleRequest(request, response, { authService, interactionStore, now: timelineNow }).catch((error) => {
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

  it("renders the admin placeholder route", async () => {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Admin console placeholder/);
    assert.match(body, /Official guide review/);
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
    assert.doesNotMatch(body, /Pending review experience that must remain hidden/);
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

  it("blocks unauthenticated users from restricted student and admin APIs", async () => {
    const cases = [
      { method: "POST", path: "/api/experiences", body: { schoolId: seedIds.schools.sysu } },
      { method: "POST", path: "/api/favorites", body: { targetType: "school", targetId: seedIds.schools.sysu } },
      { method: "DELETE", path: "/api/favorites/missing-favorite" },
      { method: "POST", path: `/api/experiences/${seedIds.experiences.sysu2026}/useful`, body: {} },
      { method: "POST", path: "/api/reports", body: { targetType: "experience", targetId: seedIds.experiences.sysu2026 } },
      { method: "GET", path: "/api/timeline?mine=true" },
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
    const admin = authService.createUserForTesting({
      phoneNumber: "+8613000000004",
      role: "admin"
    });
    const userSession = authService.createSessionForUser(user.id);
    const adminSession = authService.createSessionForUser(admin.id);

    const userResponse = await fetch(`${baseUrl}/api/admin/health`, {
      headers: { cookie: authService.serializeSessionCookie(userSession).split(";")[0] }
    });
    const userBody = await userResponse.json();

    assert.equal(userResponse.status, 403);
    assert.equal(userBody.error, "forbidden");

    const adminResponse = await fetch(`${baseUrl}/api/admin/health`, {
      headers: { cookie: authService.serializeSessionCookie(adminSession).split(";")[0] }
    });
    const adminBody = await adminResponse.json();

    assert.equal(adminResponse.status, 200);
    assert.equal(adminBody.ok, true);
    assert.equal(adminBody.user.role, "admin");
    assertNoPhoneFields(adminBody);
  });
});
