import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import { createAuthService } from "./auth.js";
import { handleRequest } from "./app.js";
import { seedIds } from "./db/seed-data.js";
import { createExperienceSubmissionStore } from "./experience-submissions.js";
import { createInteractionStore } from "./interactions.js";

function jsonRequest(body = {}) {
  return {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function createCookie(authService, profile) {
  const user = authService.createUserForTesting(profile);
  const session = authService.createSessionForUser(user.id);

  return {
    user,
    cookie: authService.serializeSessionCookie(session).split(";")[0]
  };
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
    processSummary: "Panel interview included a group discussion and a short experiment design prompt.",
    questionTypes: ["motivation", "experiment_design"],
    preparationSummary: "Prepared official guide details, coursework examples, and concise experiment explanations.",
    difficultyScore: 4,
    pressureScore: 3,
    differentiationScore: 4,
    advice: "Use specific coursework examples and keep private identity details out of public text.",
    isAnonymous: true,
    verificationMaterials: [
      {
        materialType: "admission_result",
        objectStorageKey: "private/e2e/admission-result.png",
        metadata: {
          sourceAccount: "e2e-source-account",
          realName: "E2E Student"
        }
      }
    ],
    ...overrides
  };
}

describe("MVP end-to-end quality gates", () => {
  let authService;
  let baseUrl;
  let server;
  let experienceSubmissionStore;
  let interactionStore;

  before(async () => {
    const now = () => new Date("2026-04-18T00:00:00.000Z");
    authService = createAuthService({
      env: {
        NODE_ENV: "test",
        AUTH_SECRET: "e2e-test-secret",
        AUTH_SESSION_COOKIE_NAME: "e2e_session",
        LOCAL_OTP_ENABLED: "true",
        LOCAL_OTP_CODE: "246810"
      },
      now
    });
    experienceSubmissionStore = createExperienceSubmissionStore({ now });
    interactionStore = createInteractionStore({ now });
    server = createServer((request, response) => {
      handleRequest(request, response, {
        authService,
        experienceSubmissionStore,
        interactionStore,
        now
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

  it("covers a grade-three user favoriting a school and viewing deadline nodes in my timeline", async () => {
    const { cookie } = createCookie(authService, {
      phoneNumber: "+8613000000200",
      nickname: "Grade three timeline user",
      grade: "high_school_g3"
    });

    const favoriteResponse = await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        targetType: "school",
        targetId: seedIds.schools.sysu
      })
    });
    const favoriteBody = await favoriteResponse.json();

    assert.equal(favoriteResponse.status, 201);
    assert.equal(favoriteBody.favorite.targetId, seedIds.schools.sysu);

    const timelineResponse = await fetch(`${baseUrl}/api/timeline?mine=true&year=2026`, {
      headers: { cookie }
    });
    const timelineBody = await timelineResponse.json();
    const deadline = timelineBody.events.find((event) => event.eventKey === "application_deadline");

    assert.equal(timelineResponse.status, 200);
    assert.equal(timelineBody.mine, true);
    assert.equal(timelineBody.favorites.length, 1);
    assert.ok(timelineBody.events.every((event) => event.schoolId === seedIds.schools.sysu));
    assert.equal(deadline.title, "Application deadline");
    assert.equal(deadline.dateLabel, "2026-04-20T15:59:59.000Z");
    assert.equal(deadline.status, "due_soon");
    assert.ok(timelineBody.reminders.some((reminder) => reminder.eventKey === "application_deadline"));
    assert.ok(timelineBody.reminders.every((reminder) => reminder.delivery === "site_only"));
  });

  it("covers a grade-three user using the school detail calculator with formula source attribution", async () => {
    const { cookie } = createCookie(authService, {
      phoneNumber: "+8613000000201",
      nickname: "Grade three calculator user",
      grade: "high_school_g3"
    });

    const detailResponse = await fetch(`${baseUrl}/api/schools/${seedIds.schools.sysu}?year=2026`, {
      headers: { cookie }
    });
    const detailBody = await detailResponse.json();

    assert.equal(detailResponse.status, 200);
    assert.equal(detailBody.formula.formulaName, "60/30/10 comprehensive score");
    assert.equal(detailBody.formula.officialSourceUrl, "https://example.edu/sysu/2026-comprehensive-evaluation-guide");

    const calculatorPageResponse = await fetch(
      `${baseUrl}/calculator?schoolId=${seedIds.schools.sysu}&year=2026`,
      {
        headers: {
          accept: "text/html",
          cookie
        }
      }
    );
    const calculatorPageBody = await calculatorPageResponse.text();

    assert.equal(calculatorPageResponse.status, 200);
    assert.match(calculatorPageBody, /60\/30\/10 comprehensive score/);
    assert.match(calculatorPageBody, /Official source/);

    const scoreResponse = await fetch(`${baseUrl}/api/score/calculate`, {
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
    const scoreBody = await scoreResponse.json();

    assert.equal(scoreResponse.status, 200);
    assert.equal(scoreBody.totalScore, 88.2);
    assert.equal(scoreBody.officialSourceUrl, detailBody.formula.officialSourceUrl);
    assert.match(scoreBody.disclaimer, /not an admission probability/i);
  });

  it("covers a grade-two user viewing 2024 through 2026 guide changes and school experiences", async () => {
    const { cookie } = createCookie(authService, {
      phoneNumber: "+8613000000202",
      nickname: "Grade two comparison user",
      grade: "high_school_g2"
    });
    const yearlyGuideCounts = [];

    for (const year of [2024, 2025, 2026]) {
      const guideResponse = await fetch(`${baseUrl}/api/guides?year=${year}`, {
        headers: { cookie }
      });
      const guideBody = await guideResponse.json();

      assert.equal(guideResponse.status, 200);
      assert.ok(guideBody.count > 0, `Expected published guide data for ${year}`);
      assert.ok(guideBody.guides.every((guide) => guide.year === year && guide.status === "published"));
      yearlyGuideCounts.push(guideBody.count);
    }

    assert.deepEqual(yearlyGuideCounts, [2, 3, 1]);

    const versionResponse = await fetch(`${baseUrl}/api/guides/${seedIds.guides.sysu2026}`, {
      headers: { cookie }
    });
    const versionBody = await versionResponse.json();

    assert.equal(versionResponse.status, 200);
    assert.deepEqual(versionBody.versionSummary.versions.map((version) => version.version), [2, 1]);

    for (const year of [2024, 2025, 2026]) {
      const experienceResponse = await fetch(`${baseUrl}/api/experiences?year=${year}&sort=newest`, {
        headers: { cookie }
      });
      const experienceBody = await experienceResponse.json();

      assert.equal(experienceResponse.status, 200);
      assert.ok(experienceBody.count > 0, `Expected published school experiences for ${year}`);
      assert.ok(experienceBody.experiences.every((experience) => experience.year === year));
    }
  });

  it("covers a grade-one user entering basics and school overview from the home page", async () => {
    const { cookie } = createCookie(authService, {
      phoneNumber: "+8613000000203",
      nickname: "Grade one overview user",
      grade: "high_school_g1"
    });

    const homeResponse = await fetch(`${baseUrl}/`, {
      headers: {
        accept: "text/html",
        cookie
      }
    });
    const homeBody = await homeResponse.text();

    assert.equal(homeResponse.status, 200);
    assert.match(homeBody, /High school grade one/);
    assert.match(homeBody, /Build a baseline view of participating schools/);
    assert.match(homeBody, /Annual progress/);
    assert.match(homeBody, /href="\/schools"/);
    assert.doesNotMatch(homeBody, /admission probability|paid consulting|private messaging/i);

    const schoolsResponse = await fetch(`${baseUrl}/schools?year=2026`, {
      headers: {
        accept: "text/html",
        cookie
      }
    });
    const schoolsBody = await schoolsResponse.text();

    assert.equal(schoolsResponse.status, 200);
    assert.match(schoolsBody, /School list/);
    assert.match(schoolsBody, /Sun Yat-sen University/);
    assert.match(schoolsBody, /Application deadline/);
    assert.match(schoolsBody, /Formula/);
    assert.doesNotMatch(schoolsBody, /Draft Review Guide|Working Draft/);
  });

  it("covers experience submission, admin approval, and student-side display", async () => {
    const { cookie: studentCookie } = createCookie(authService, {
      phoneNumber: "+8613000000204",
      nickname: "E2E submitter",
      grade: "high_school_g3"
    });
    const { user: reviewer, cookie: reviewerCookie } = createCookie(authService, {
      phoneNumber: "+8613000000205",
      nickname: "E2E content reviewer",
      role: "content_reviewer"
    });

    const submitResponse = await fetch(`${baseUrl}/api/experiences`, {
      method: "POST",
      headers: {
        cookie: studentCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify(validExperienceSubmissionPayload({
        processSummary: "E2E approved experience used a clean panel interview and group discussion summary.",
        advice: "E2E public advice focuses on official guide preparation and concise coursework examples."
      }))
    });
    const submitBody = await submitResponse.json();
    const experienceId = submitBody.experience.id;

    assert.equal(submitResponse.status, 201);
    assert.equal(submitBody.experience.status, "pending_review");

    const hiddenResponse = await fetch(`${baseUrl}/api/experiences?schoolId=${seedIds.schools.sysu}&year=2026`);
    const hiddenBody = await hiddenResponse.json();

    assert.equal(hiddenResponse.status, 200);
    assert.equal(hiddenBody.experiences.some((experience) => experience.id === experienceId), false);

    const approveResponse = await fetch(`${baseUrl}/api/admin/experiences/${encodeURIComponent(experienceId)}/review`, {
      method: "POST",
      headers: {
        cookie: reviewerCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "approve",
        note: "E2E approval after public text and verification metadata review."
      })
    });
    const approveBody = await approveResponse.json();

    assert.equal(approveResponse.status, 200);
    assert.equal(approveBody.status, "published");
    assert.equal(approveBody.experience.reviewAudit.at(-1).operatorId, reviewer.id);

    const verificationQueueResponse = await fetch(`${baseUrl}/api/admin/verifications`, {
      headers: { cookie: reviewerCookie }
    });
    const verificationQueueBody = await verificationQueueResponse.json();
    const verification = verificationQueueBody.verifications.find((item) => item.experience.id === experienceId);

    assert.equal(verificationQueueResponse.status, 200);
    assert.ok(verification.material.storageKeyPresent);
    assert.doesNotMatch(JSON.stringify(verificationQueueBody), /private\/e2e\/admission-result/);

    const verifyResponse = await fetch(`${baseUrl}/api/admin/verifications/${encodeURIComponent(verification.material.id)}/review`, {
      method: "POST",
      headers: {
        cookie: reviewerCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "approve",
        note: "E2E verification checked."
      })
    });
    const verifyBody = await verifyResponse.json();

    assert.equal(verifyResponse.status, 200);
    assert.equal(verifyBody.status, "verified");

    const publicResponse = await fetch(`${baseUrl}/api/experiences?schoolId=${seedIds.schools.sysu}&year=2026&sort=newest`);
    const publicBody = await publicResponse.json();
    const publicExperience = publicBody.experiences.find((experience) => experience.id === experienceId);
    const publicSerialized = JSON.stringify(publicBody);

    assert.equal(publicResponse.status, 200);
    assert.equal(publicExperience.summary.includes("E2E approved experience"), true);
    assert.equal(publicExperience.verificationStatus, "verified");
    assert.doesNotMatch(publicSerialized, /verificationMaterials|sourceAccount|realName|private\/e2e/i);
  });
});
