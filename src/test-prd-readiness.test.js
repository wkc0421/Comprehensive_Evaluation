import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import { createAuthService } from "./auth.js";
import { handleRequest } from "./app.js";
import { seedIds } from "./db/seed-data.js";
import { createExperienceSubmissionStore } from "./experience-submissions.js";
import { createInteractionStore } from "./interactions.js";

function jsonRequest(body = {}, headers = {}) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
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

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json()
  };
}

function assertErrorShape(result, status, code) {
  assert.equal(result.status, status);
  assert.equal(result.body.error, code);
  assert.equal(typeof result.body.message, "string");
  assert.ok(result.body.message.length > 0);
}

function assertNoSensitiveLeak(label, value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  for (const pattern of [
    /phone(Hash|Ciphertext|Number)\b/i,
    /\+8613\d{9}/,
    /13812345678/,
    /realName|sourceAccount|verificationMaterials|objectStorageKey/i,
    /private\/|reviewer-only material URL/i,
    /\b\d{17}[\dXx]\b/,
    /examCandidateNumber|candidateNumber|backend review note|internal risk label|private reporter/i
  ]) {
    assert.doesNotMatch(serialized, pattern, `${label} leaked ${pattern}`);
  }
}

function assertNoBlockedProductCopy(label, value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  for (const pattern of [
    /estimated admission probability/i,
    /ranking prediction/i,
    /recommended application/i,
    /guaranteed admission/i,
    /paid consulting/i,
    /open comments/i,
    /private messaging/i
  ]) {
    assert.doesNotMatch(serialized, pattern, `${label} exposed blocked copy ${pattern}`);
  }
}

function validExperiencePayload(overrides = {}) {
  return {
    schoolId: seedIds.schools.sysu,
    year: 2026,
    majorGroup: "Readiness science group",
    candidateTrack: "physics",
    stage: "school_assessment",
    shortlistedStatus: true,
    admittedStatus: null,
    assessmentTypes: ["structured_interview", "group_discussion"],
    location: "Guangzhou campus",
    processSummary: "Readiness submission used a structured panel and group discussion summary.",
    questionTypes: ["motivation", "experiment_design"],
    preparationSummary: "Prepared official guide fields and concise coursework examples.",
    difficultyScore: 4,
    pressureScore: 3,
    differentiationScore: 4,
    advice: "Focus on preparation quality without predicting admission outcomes.",
    isAnonymous: true,
    verificationMaterials: [
      {
        materialType: "shortlist_notice",
        objectStorageKey: "private/readiness/shortlist.png",
        metadata: {
          sourceAccount: "readiness-source-account",
          realName: "Readiness Private Name",
          idCardNumber: "440100200001010018",
          examCandidateNumber: "EXAM-READINESS-001"
        }
      }
    ],
    ...overrides
  };
}

function validGuideDraft(overrides = {}) {
  return {
    schoolId: seedIds.schools.sysu,
    year: 2027,
    officialSourceUrl: "https://example.edu/sysu/2027-readiness-guide",
    sourceType: "admission_guide",
    sourceTitle: "SYSU 2027 readiness guide official source",
    sourcePublishedAt: "2026-06-01T00:00:00.000Z",
    sourceUpdatedAt: "2026-06-02T00:00:00.000Z",
    guideTitle: "Sun Yat-sen University 2027 Readiness Guide",
    summary: "Readiness official guide with dates and source-backed admissions details.",
    applicationUrl: "https://example.edu/sysu/2027-apply",
    applicationStatus: "open",
    applicationStartAt: "2027-03-10T00:00:00.000Z",
    applicationDeadlineAt: "2027-04-20T15:59:59.000Z",
    majors: [{ name: "Readiness science program", track: "physics" }],
    subjectRequirements: ["Physics track"],
    academicTestRequirements: "Academic level requirements follow the official source.",
    assessmentMethod: "Materials review plus school assessment.",
    admissionRule: "Comprehensive score follows the published school rule.",
    fees: { applicationFeeCny: 0 },
    contact: { email: "readiness@example.edu" },
    versionNotes: "Readiness gate draft.",
    ...overrides
  };
}

function formulaDraftWithoutSamples() {
  return {
    schoolId: seedIds.schools.scut,
    year: 2025,
    formulaName: "Readiness 50/50 score",
    formulaType: "weighted_sum",
    formulaConfig: {
      inputs: [
        { key: "gaokao", label: "Gaokao score", maxScore: 750, weight: 0.5 },
        { key: "schoolAssessment", label: "School assessment", maxScore: 100, weight: 0.5 }
      ],
      outputMaxScore: 100
    },
    explanation: "Readiness draft formula requiring sample validation before publication.",
    officialSourceUrl: "https://example.edu/scut/2025-readiness-formula"
  };
}

describe("complete test PRD readiness gates", () => {
  let authService;
  let baseUrl;
  let contentReviewer;
  let dataReviewer;
  let experienceSubmissionStore;
  let interactionStore;
  let server;
  let student;

  before(async () => {
    const now = () => new Date("2026-04-18T00:00:00.000Z");
    authService = createAuthService({
      env: {
        NODE_ENV: "test",
        AUTH_SECRET: "test-prd-readiness-secret",
        AUTH_SESSION_COOKIE_NAME: "test_prd_readiness_session",
        LOCAL_OTP_ENABLED: "true",
        LOCAL_OTP_CODE: "246810"
      },
      now
    });
    experienceSubmissionStore = createExperienceSubmissionStore({ now });
    interactionStore = createInteractionStore({ now });
    student = createCookie(authService, {
      phoneNumber: "+8613900006101",
      nickname: "Readiness student",
      grade: "high_school_g3"
    });
    dataReviewer = createCookie(authService, {
      phoneNumber: "+8613900006102",
      nickname: "Readiness data reviewer",
      role: "data_reviewer"
    });
    contentReviewer = createCookie(authService, {
      phoneNumber: "+8613900006103",
      nickname: "Readiness content reviewer",
      role: "content_reviewer"
    });
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

  it("covers public, logged-in, score, and admin API contracts with stable JSON errors", async () => {
    const schools = await readJson(await fetch(`${baseUrl}/api/schools?year=2026`));
    const guides = await readJson(await fetch(`${baseUrl}/api/guides?year=2026`));
    const draftGuide = await readJson(await fetch(`${baseUrl}/api/guides/${seedIds.guides.scut2026Pending}`));
    const timeline = await readJson(await fetch(`${baseUrl}/api/timeline?year=2026`));
    const experiences = await readJson(await fetch(`${baseUrl}/api/experiences?schoolId=${seedIds.schools.sysu}`));
    const missingSchool = await readJson(await fetch(`${baseUrl}/api/schools/not-found?year=2026`));

    assert.equal(schools.status, 200);
    assert.ok(schools.body.schools.every((card) => card.guide.status === "published"));
    assertNoSensitiveLeak("public schools", schools.body);
    assert.equal(guides.status, 200);
    assert.ok(guides.body.guides.every((guide) => guide.status === "published"));
    assertErrorShape(draftGuide, 404, "not_found");
    assert.equal(timeline.status, 200);
    assert.ok(timeline.body.events.every((event) => event.officialDataStatus === "published"));
    assert.equal(experiences.status, 200);
    assert.equal(experiences.body.experiences.some((experience) => experience.id === seedIds.experiences.pending), false);
    assertNoSensitiveLeak("public experiences", experiences.body);
    assertErrorShape(missingSchool, 404, "not_found");

    const unauthenticatedSubmit = await readJson(await fetch(`${baseUrl}/api/experiences`, jsonRequest(validExperiencePayload())));
    assertErrorShape(unauthenticatedSubmit, 401, "login_required");

    const invalidSubmit = await readJson(await fetch(`${baseUrl}/api/experiences`, jsonRequest({
      schoolId: seedIds.schools.sysu
    }, { cookie: student.cookie })));
    assertErrorShape(invalidSubmit, 400, "missing_required_field");

    const submit = await readJson(await fetch(`${baseUrl}/api/experiences`, jsonRequest(
      validExperiencePayload({ majorGroup: `Contract group ${randomUUID()}` }),
      { cookie: student.cookie }
    )));
    assert.equal(submit.status, 201);
    assert.equal(submit.body.status, "pending_review");
    assertNoSensitiveLeak("submission response", submit.body);

    const useful = await readJson(await fetch(
      `${baseUrl}/api/experiences/${seedIds.experiences.sysu2026}/useful`,
      jsonRequest({}, { cookie: student.cookie })
    ));
    assert.equal(useful.status, 201);
    assert.equal(useful.body.status, "marked_useful");

    const duplicateUseful = await readJson(await fetch(
      `${baseUrl}/api/experiences/${seedIds.experiences.sysu2026}/useful`,
      jsonRequest({}, { cookie: student.cookie })
    ));
    assertErrorShape(duplicateUseful, 409, "duplicate_useful_vote");
    assert.equal(typeof duplicateUseful.body.usefulCount, "number");

    const favorite = await readJson(await fetch(`${baseUrl}/api/favorites`, jsonRequest({
      targetType: "school",
      targetId: seedIds.schools.sysu
    }, { cookie: student.cookie })));
    assert.equal(favorite.status, 201);
    assert.equal(favorite.body.status, "favorited");

    const unfavorite = await readJson(await fetch(`${baseUrl}/api/favorites/${favorite.body.favorite.id}`, {
      method: "DELETE",
      headers: { cookie: student.cookie }
    }));
    assert.equal(unfavorite.status, 200);
    assert.equal(unfavorite.body.status, "unfavorited");

    const missingFavorite = await readJson(await fetch(`${baseUrl}/api/favorites/${favorite.body.favorite.id}`, {
      method: "DELETE",
      headers: { cookie: student.cookie }
    }));
    assertErrorShape(missingFavorite, 404, "favorite_not_found");

    const report = await readJson(await fetch(`${baseUrl}/api/reports`, jsonRequest({
      targetType: "experience",
      targetId: seedIds.experiences.sysu2026,
      reason: "inaccurate",
      description: "Readiness contract report."
    }, { cookie: student.cookie })));
    assert.equal(report.status, 201);
    assert.equal(report.body.status, "pending");
    assertNoSensitiveLeak("report response", report.body);

    const mySubmissions = await readJson(await fetch(`${baseUrl}/api/me/experiences`, {
      headers: { cookie: student.cookie }
    }));
    assert.equal(mySubmissions.status, 200);
    assert.ok(mySubmissions.body.experiences.some((experience) => experience.id === submit.body.experience.id));
    assertNoSensitiveLeak("my submissions", mySubmissions.body);

    const unauthorizedAdmin = await readJson(await fetch(`${baseUrl}/api/admin/ingestion-runs`, jsonRequest({
      schoolId: seedIds.schools.sysu,
      year: 2026,
      keyword: "readiness"
    }, { cookie: student.cookie })));
    assertErrorShape(unauthorizedAdmin, 403, "forbidden");

    const ingestion = await readJson(await fetch(`${baseUrl}/api/admin/ingestion-runs`, jsonRequest({
      schoolId: seedIds.schools.sysu,
      year: 2026,
      keyword: "readiness",
      sourceDocuments: [
        {
          sourceType: "university_admissions",
          title: "Readiness official source",
          sourceUrl: "https://example.edu/sysu/readiness-source",
          fetchedAt: "2026-06-01T00:00:00.000Z",
          extractedText: "Readiness official source text"
        },
        {
          sourceType: "third_party_info",
          title: "Readiness third party clue",
          sourceUrl: "https://example.com/clue",
          fetchedAt: "2026-06-01T00:00:00.000Z",
          extractedText: "Discovery clue only"
        }
      ]
    }, { cookie: dataReviewer.cookie })));
    assert.equal(ingestion.status, 201);
    assert.equal(ingestion.body.ingestionRun.sourceDocuments.some((source) => source.authorityRole === "discovery_clue"), true);

    const invalidGuide = await readJson(await fetch(`${baseUrl}/api/admin/guides`, jsonRequest({
      ...validGuideDraft(),
      officialSourceUrl: ""
    }, { cookie: dataReviewer.cookie })));
    assertErrorShape(invalidGuide, 400, "missing_guide_field");

    const invalidFormula = await readJson(await fetch(`${baseUrl}/api/admin/formulas`, jsonRequest({
      ...formulaDraftWithoutSamples(),
      officialSourceUrl: ""
    }, { cookie: dataReviewer.cookie })));
    assertErrorShape(invalidFormula, 400, "missing_formula_field");
  });

  it("covers score calculation success, invalid input, no-formula, and draft-formula hiding", async () => {
    const score631 = await readJson(await fetch(`${baseUrl}/api/score/calculate`, jsonRequest({
      schoolId: seedIds.schools.sysu,
      year: 2026,
      scores: {
        gaokao: 650,
        schoolAssessment: 90,
        academicLevel: 95
      }
    })));
    assert.equal(score631.status, 200);
    assert.equal(score631.body.totalScore, 88.5);
    assert.equal(score631.body.breakdown.length, 3);
    assert.match(score631.body.disclaimer, /not an admission probability/i);
    assertNoBlockedProductCopy("score result", score631.body);

    const score8515 = await readJson(await fetch(`${baseUrl}/api/score/calculate`, jsonRequest({
      schoolId: seedIds.schools.sysu,
      year: 2025,
      scores: {
        gaokao: 680,
        schoolAssessment: 80
      }
    })));
    assert.equal(score8515.status, 200);
    assert.equal(score8515.body.totalScore, 89.07);

    const missingScore = await readJson(await fetch(`${baseUrl}/api/score/calculate`, jsonRequest({
      schoolId: seedIds.schools.sysu,
      year: 2026,
      scores: {
        gaokao: 650
      }
    })));
    assertErrorShape(missingScore, 400, "missing_score");

    const outOfRange = await readJson(await fetch(`${baseUrl}/api/score/calculate`, jsonRequest({
      schoolId: seedIds.schools.sysu,
      year: 2026,
      scores: {
        gaokao: 800,
        schoolAssessment: 90,
        academicLevel: 95
      }
    })));
    assertErrorShape(outOfRange, 400, "score_out_of_range");

    const noFormula = await readJson(await fetch(`${baseUrl}/api/score/calculate`, jsonRequest({
      schoolId: seedIds.schools.scut,
      year: 2025,
      scores: {
        gaokao: 650,
        schoolAssessment: 90
      }
    })));
    assertErrorShape(noFormula, 404, "formula_not_available");

    const formulaDraft = await readJson(await fetch(`${baseUrl}/api/admin/formulas`, jsonRequest(
      formulaDraftWithoutSamples(),
      { cookie: dataReviewer.cookie }
    )));
    assert.equal(formulaDraft.status, 201);
    assert.equal(formulaDraft.body.formula.formula.status, "draft");

    const draftStillHidden = await readJson(await fetch(`${baseUrl}/api/score/calculate`, jsonRequest({
      schoolId: seedIds.schools.scut,
      year: 2025,
      scores: {
        gaokao: 650,
        schoolAssessment: 90
      }
    })));
    assertErrorShape(draftStillHidden, 404, "formula_not_available");

    const publishWithoutSample = await readJson(await fetch(
      `${baseUrl}/api/admin/formulas/${formulaDraft.body.formula.formula.id}/publish`,
      jsonRequest({ note: "Readiness publish should fail without sample." }, { cookie: dataReviewer.cookie })
    ));
    assertErrorShape(publishWithoutSample, 422, "missing_formula_sample");
  });

  it("covers official guide publishing, generated timeline override, moderation, verification, and report side effects", async () => {
    const createGuide = await readJson(await fetch(`${baseUrl}/api/admin/guides`, jsonRequest(
      validGuideDraft({ id: `40000000-0000-4000-8000-${randomUUID().slice(0, 12)}` }),
      { cookie: dataReviewer.cookie }
    )));
    assert.equal(createGuide.status, 201);
    assert.equal(createGuide.body.guide.guide.status, "draft");

    const publicBeforePublish = await readJson(await fetch(`${baseUrl}/api/guides?year=2027&schoolId=${seedIds.schools.sysu}`));
    assert.equal(publicBeforePublish.status, 200);
    assert.equal(publicBeforePublish.body.count, 0);

    const publishGuide = await readJson(await fetch(
      `${baseUrl}/api/admin/guides/${createGuide.body.guide.guide.id}/publish`,
      jsonRequest({ note: "Readiness publish with complete source." }, { cookie: dataReviewer.cookie })
    ));
    assert.equal(publishGuide.status, 200);
    assert.equal(publishGuide.body.status, "published");
    assert.equal(publishGuide.body.guide.reviewAudit.at(-1).operatorId, dataReviewer.user.id);
    assert.equal(publishGuide.body.guide.reviewAudit.at(-1).operatedAt, "2026-04-18T00:00:00.000Z");

    const publicAfterPublish = await readJson(await fetch(`${baseUrl}/api/guides?year=2027&schoolId=${seedIds.schools.sysu}`));
    assert.equal(publicAfterPublish.status, 200);
    assert.equal(publicAfterPublish.body.guides.some((guide) => guide.id === publishGuide.body.guide.guide.id), true);

    const secondGuide = await readJson(await fetch(`${baseUrl}/api/admin/guides`, jsonRequest(
      validGuideDraft({
        guideTitle: "Sun Yat-sen University 2027 Readiness Guide Version Two",
        summary: "Readiness official guide updated with a second version."
      }),
      { cookie: dataReviewer.cookie }
    )));
    assert.equal(secondGuide.status, 201);
    assert.equal(secondGuide.body.guide.guide.version, publishGuide.body.guide.guide.version + 1);

    const timeline = await readJson(await fetch(`${baseUrl}/api/timeline?year=2027`));
    assert.equal(timeline.status, 200);
    assert.ok(timeline.body.events.some((event) => {
      return event.admissionGuideId === publishGuide.body.guide.guide.id &&
        event.eventKey === "application_deadline" &&
        event.dateLabel === "2027-04-20T15:59:59.000Z";
    }));

    const override = await readJson(await fetch(`${baseUrl}/api/admin/timeline/overrides`, jsonRequest({
      admissionGuideId: publishGuide.body.guide.guide.id,
      eventKey: "application_deadline",
      startsAt: "2027-04-22T15:59:59.000Z",
      endsAt: "2027-04-22T15:59:59.000Z",
      overrideReason: "Readiness official correction."
    }, { cookie: dataReviewer.cookie })));
    assert.equal(override.status, 200);
    assert.equal(override.body.timelineNode.source, "manual_override");
    assert.equal(override.body.timelineNode.override.reason, "Readiness official correction.");
    assert.equal(override.body.timelineNode.override.reviewAudit.at(-1).operatorId, dataReviewer.user.id);

    const riskySubmit = await readJson(await fetch(`${baseUrl}/api/experiences`, jsonRequest(
      validExperiencePayload({
        majorGroup: `Risky readiness ${randomUUID()}`,
        processSummary: "This exact original question should be rewritten before approval."
      }),
      { cookie: student.cookie }
    )));
    const riskyApprove = await readJson(await fetch(
      `${baseUrl}/api/admin/experiences/${riskySubmit.body.experience.id}/review`,
      jsonRequest({ action: "approve", note: "Attempt risky approval." }, { cookie: contentReviewer.cookie })
    ));
    assertErrorShape(riskyApprove, 422, "moderation_blocked");
    assert.equal(riskyApprove.body.moderation.approvalBlocked, true);

    const approvedSubmit = await readJson(await fetch(`${baseUrl}/api/experiences`, jsonRequest(
      validExperiencePayload({ majorGroup: `Approved readiness ${randomUUID()}` }),
      { cookie: student.cookie }
    )));
    const approvedId = approvedSubmit.body.experience.id;
    const approve = await readJson(await fetch(
      `${baseUrl}/api/admin/experiences/${approvedId}/review`,
      jsonRequest({ action: "approve", note: "Readiness approval." }, { cookie: contentReviewer.cookie })
    ));
    assert.equal(approve.status, 200);
    assert.equal(approve.body.experience.reviewAudit.at(-1).operatorId, contentReviewer.user.id);
    assert.equal(approve.body.experience.reviewAudit.at(-1).operatedAt, "2026-04-18T00:00:00.000Z");

    const verificationQueue = await readJson(await fetch(`${baseUrl}/api/admin/verifications`, {
      headers: { cookie: contentReviewer.cookie }
    }));
    const verification = verificationQueue.body.verifications.find((item) => item.experience.id === approvedId);
    assert.ok(verification);
    assert.equal(verification.material.storageKeyPresent, true);
    assertNoSensitiveLeak("verification queue material", verification.material);

    const unauthorizedVerification = await readJson(await fetch(
      `${baseUrl}/api/admin/verifications/${verification.material.id}/review`,
      jsonRequest({ action: "approve", note: "Student should be blocked." }, { cookie: student.cookie })
    ));
    assertErrorShape(unauthorizedVerification, 403, "forbidden");

    const approveVerification = await readJson(await fetch(
      `${baseUrl}/api/admin/verifications/${verification.material.id}/review`,
      jsonRequest({ action: "approve", note: "Readiness verification approved." }, { cookie: contentReviewer.cookie })
    ));
    assert.equal(approveVerification.status, 200);
    assert.equal(approveVerification.body.verification.material.status, "verified");
    assert.equal(approveVerification.body.verification.material.reviewAudit.at(-1).operatorId, contentReviewer.user.id);

    const publicExperience = await readJson(await fetch(`${baseUrl}/api/experiences/${approvedId}`));
    assert.equal(publicExperience.status, 200);
    assert.equal(publicExperience.body.experience.verificationStatus, "verified");
    assertNoSensitiveLeak("approved public experience", publicExperience.body);

    const report = await readJson(await fetch(`${baseUrl}/api/reports`, jsonRequest({
      targetType: "experience",
      targetId: approvedId,
      reason: "privacy",
      description: "Readiness hide report."
    }, { cookie: student.cookie })));
    const hideReport = await readJson(await fetch(
      `${baseUrl}/api/admin/reports/${report.body.report.id}/resolve`,
      jsonRequest({ action: "hide", note: "Readiness hide accepted." }, { cookie: contentReviewer.cookie })
    ));
    assert.equal(hideReport.status, 200);
    assert.equal(hideReport.body.report.resolution.operatorId, contentReviewer.user.id);
    assert.equal(hideReport.body.report.resolution.resolvedAt, "2026-04-18T00:00:00.000Z");
    assert.equal(hideReport.body.sideEffect.action, "hidden");

    const hiddenPublicExperience = await readJson(await fetch(`${baseUrl}/api/experiences/${approvedId}`));
    assertErrorShape(hiddenPublicExperience, 404, "experience_not_found");

    const limitReport = await readJson(await fetch(`${baseUrl}/api/reports`, jsonRequest({
      targetType: "user",
      targetId: student.user.id,
      reason: "safety",
      description: "Readiness account limit report."
    }, { cookie: student.cookie })));
    const limitResolve = await readJson(await fetch(
      `${baseUrl}/api/admin/reports/${limitReport.body.report.id}/resolve`,
      jsonRequest({ action: "limit_account", note: "Readiness limit account." }, { cookie: contentReviewer.cookie })
    ));
    assert.equal(limitResolve.status, 200);
    assert.equal(limitResolve.body.sideEffect.accountStatus, "limited");
    assert.equal(authService.getUserById(student.user.id).accountStatus, "limited");
  });

  it("covers privacy/security scan surfaces and accessibility hooks", async () => {
    const freshStudent = createCookie(authService, {
      phoneNumber: "+8613900006199",
      nickname: "Readiness privacy student",
      grade: "high_school_g2"
    });
    const submit = await readJson(await fetch(`${baseUrl}/api/experiences`, jsonRequest(
      validExperiencePayload({ majorGroup: `Privacy readiness ${randomUUID()}` }),
      { cookie: freshStudent.cookie }
    )));
    const experienceId = submit.body.experience.id;

    await readJson(await fetch(
      `${baseUrl}/api/admin/experiences/${experienceId}/review`,
      jsonRequest({ action: "approve", note: "Backend review note internal risk label." }, { cookie: contentReviewer.cookie })
    ));

    const publicList = await readJson(await fetch(`${baseUrl}/api/experiences?keyword=Privacy%20readiness`));
    const publicDetail = await readJson(await fetch(`${baseUrl}/api/experiences/${experienceId}`));
    const myPage = await fetch(`${baseUrl}/me`, {
      headers: {
        accept: "text/html",
        cookie: freshStudent.cookie
      }
    });
    const adminExperiencePreview = await fetch(`${baseUrl}/admin/experiences`, {
      headers: {
        accept: "text/html",
        cookie: contentReviewer.cookie
      }
    });
    const adminVerificationPreview = await fetch(`${baseUrl}/admin/verifications`, {
      headers: {
        accept: "text/html",
        cookie: contentReviewer.cookie
      }
    });

    assertNoSensitiveLeak("public experience list", publicList.body);
    assertNoSensitiveLeak("public experience detail", publicDetail.body);
    assertNoSensitiveLeak("My page", await myPage.text());
    assertNoSensitiveLeak("admin student-side experience preview", await adminExperiencePreview.text());
    assertNoSensitiveLeak("admin verification preview", await adminVerificationPreview.text());

    const schoolHtml = await (await fetch(`${baseUrl}/schools`, { headers: { accept: "text/html" } })).text();
    const calculatorHtml = await (await fetch(
      `${baseUrl}/calculator?schoolId=${seedIds.schools.sysu}&year=2026`,
      { headers: { accept: "text/html" } }
    )).text();
    const timelineHtml = await (await fetch(`${baseUrl}/timeline?year=2026`, {
      headers: { accept: "text/html" }
    })).text();
    const submissionHtml = await (await fetch(`${baseUrl}/experiences/new`, {
      headers: {
        accept: "text/html",
        cookie: freshStudent.cookie
      }
    })).text();
    const invalidSubmissionHtml = await (await fetch(`${baseUrl}/experiences`, {
      method: "POST",
      headers: {
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
        cookie: freshStudent.cookie
      },
      body: new URLSearchParams({ schoolId: seedIds.schools.sysu }).toString()
    })).text();
    const loginHtml = await (await fetch(`${baseUrl}/login`, { headers: { accept: "text/html" } })).text();
    const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

    for (const [label, html] of [
      ["schools", schoolHtml],
      ["calculator", calculatorHtml],
      ["experience submission", submissionHtml],
      ["login", loginHtml]
    ]) {
      assertNoBlockedProductCopy(label, html);
      assert.doesNotMatch(html, /<button(?![^>]*(aria-label|>[^<]+<\/button>))/i, `${label} has unnamed button`);
    }

    const combinedFormHtml = `${schoolHtml}\n${calculatorHtml}\n${timelineHtml}\n${submissionHtml}\n${invalidSubmissionHtml}\n${loginHtml}`;

    for (const pattern of [
      /<span>School keyword<\/span>[\s\S]*<input[^>]+name="keyword"/,
      /<span>School<\/span>[\s\S]*<select[^>]+id="calculator-school"/,
      /<span>Gaokao score<\/span>[\s\S]*<input[^>]+id="score-gaokao"/,
      /<span>Mainland China phone<\/span>[\s\S]*<input[\s\S]*name="phoneNumber"/,
      /<span>Process[\s\S]*<\/span>[\s\S]*<textarea[^>]+name="processSummary"/
    ]) {
      assert.match(combinedFormHtml, pattern);
    }

    for (const expected of [
      "data-score-error-for",
      "data-login-error",
      "form-error",
      "data-school-list-status"
    ]) {
      assert.match(combinedFormHtml, new RegExp(expected));
    }

    assert.match(css, /\.icon-button[\s\S]*width: 44px;[\s\S]*height: 44px;/);
    assert.match(css, /\.student-nav-item[\s\S]*min-height: 48px;[\s\S]*min-width: 44px;/);
    assert.match(timelineHtml, /status-badge[\s\S]*(Due Soon|Ended|To be announced)/);
  });
});
