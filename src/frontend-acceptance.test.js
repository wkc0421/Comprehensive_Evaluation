import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

function textOf(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function createSessionCookie(authService, profile) {
  const user = authService.createUserForTesting(profile);
  const session = authService.createSessionForUser(user.id);

  return {
    user,
    cookie: authService.serializeSessionCookie(session).split(";")[0]
  };
}

function assertStudentBottomNav(body, currentHref) {
  const match = body.match(/<nav class="student-bottom-nav"[\s\S]*?<\/nav>/);

  assert.ok(match, "Expected student bottom navigation");
  assert.deepEqual([...match[0].matchAll(/<span>(首页|院校|面经|我的)<\/span>/g)].map((item) => item[1]), [
    "首页",
    "院校",
    "面经",
    "我的"
  ]);
  assert.match(match[0], new RegExp(`href="${currentHref}" aria-current="page"`));
  assert.doesNotMatch(match[0], />Timeline<|>Calculator</);
}

function assertNoPublicPrivacyLeaks(label, value) {
  const serialized = textOf(value);

  for (const pattern of [
    /phone(Hash|Ciphertext|Number)\b/i,
    /\+8613\d{9}/,
    /13812345678/,
    /realName|sourceAccount|verificationMaterials|objectStorageKey/i,
    /private\/|private reporter|reviewer-only material URL/i
  ]) {
    assert.doesNotMatch(serialized, pattern, `${label} leaked ${pattern}`);
  }
}

function assertNoBlockedPublicClaims(label, value) {
  const serialized = textOf(value);

  for (const pattern of [
    /admission probability prediction/i,
    /estimated admission probability/i,
    /ranking prediction/i,
    /guaranteed admission/i,
    /internal news/i,
    /paid consulting/i,
    /open comments/i,
    /private messaging/i,
    /unpublicized original exam question/i,
    /true-question sales/i,
    /third-party[^.]{0,80}official/i
  ]) {
    assert.doesNotMatch(serialized, pattern, `${label} exposed blocked product copy ${pattern}`);
  }
}

function validExperienceSubmissionPayload(overrides = {}) {
  return {
    schoolId: seedIds.schools.sysu,
    year: 2026,
    majorGroup: "Acceptance anonymous group",
    candidateTrack: "physics",
    stage: "school_assessment",
    shortlistedStatus: true,
    admittedStatus: null,
    assessmentTypes: ["structured_interview", "group_discussion"],
    location: "Guangzhou campus",
    processSummary: "Structured panel and group discussion with no private identity details.",
    questionTypes: ["motivation", "experiment_design"],
    preparationSummary: "Prepared official guide fields and concise coursework examples.",
    difficultyScore: 4,
    pressureScore: 3,
    differentiationScore: 4,
    advice: "Focus on preparation quality without predicting outcomes.",
    isAnonymous: true,
    verificationMaterials: [
      {
        materialType: "shortlist_notice",
        objectStorageKey: "private/frontend-acceptance/shortlist.png",
        metadata: {
          sourceAccount: "frontend-acceptance-source",
          realName: "Frontend Acceptance Student"
        }
      }
    ],
    ...overrides
  };
}

describe("frontend PRD acceptance gates", () => {
  let authService;
  let baseUrl;
  let experienceSubmissionStore;
  let interactionStore;
  let server;

  before(async () => {
    const now = () => new Date("2026-04-18T00:00:00.000Z");
    authService = createAuthService({
      env: {
        NODE_ENV: "test",
        AUTH_SECRET: "frontend-acceptance-secret",
        AUTH_SESSION_COOKIE_NAME: "frontend_acceptance_session",
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

  it("records a complete deterministic acceptance matrix for US-028", async () => {
    const matrix = await readFile(new URL("../docs/frontend-acceptance-matrix.md", import.meta.url), "utf8");

    for (let index = 1; index <= 10; index += 1) {
      assert.match(matrix, new RegExp(`US-028-AC${index}\\b`));
    }

    for (const column of ["Implementation surfaces", "Verification", "Negative checks", "Artifacts"]) {
      assert.match(matrix, new RegExp(column));
    }

    assert.match(matrix, /npm test/);
    assert.match(matrix, /npm run data-quality/);
    assert.match(matrix, /npm run browser-test/);
  });

  it("enforces visual direction, loading, accessibility, and browser-gate coverage statically", async () => {
    const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
    const studentJs = await readFile(new URL("../public/student.js", import.meta.url), "utf8");
    const pages = await readFile(new URL("./pages.js", import.meta.url), "utf8");
    const browserScript = await readFile(new URL("../scripts/browser-core-pages.mjs", import.meta.url), "utf8");

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
      "--shadow-card: 0 1px 2px rgba(17, 24, 39, 0.06);",
      "--radius-card: 8px;",
      "--radius-control: 8px;"
    ]) {
      assert.match(css, new RegExp(token.replaceAll("(", "\\(").replaceAll(")", "\\)")));
    }

    assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient/);
    assert.doesNotMatch(css, /font-size:\s*[^;]*(?:vw|svw|dvw|clamp\()/);
    assert.doesNotMatch(css, /letter-spacing:\s*-/);
    assert.doesNotMatch(css, /border-radius:\s*(?:9|[1-9]\d)px/);
    assert.doesNotMatch(css, /\.(?:info-card|compact-card|detail-panel|school-card|experience-card)\s+\.(?:info-card|compact-card|detail-panel|school-card|experience-card)/);
    assert.match(css, /\.icon-button[\s\S]*width: 44px;[\s\S]*height: 44px;/);
    assert.match(css, /\.student-nav-item[\s\S]*min-height: 48px;[\s\S]*min-width: 44px;/);
    assert.match(css, /\.primary-action,[\s\S]*\.secondary-action[\s\S]*min-height: 44px;/);
    assert.match(css, /\.status-badge[\s\S]*font-size: 12px;/);

    assert.match(pages, /data-list-skeleton="school"/);
    assert.match(studentJs, /setSchoolListStatus\("正在加载院校\.\.\."/);
    assert.match(studentJs, /setSchoolListLoading\(true\)/);
    assert.match(studentJs, /aria-busy/);
    assert.match(browserScript, /data-list-skeleton='school'/);
    assert.match(browserScript, /overlappingText/);
    assert.match(browserScript, /obstructedPrimaryActions/);
  });

  it("checks student-facing acceptance, public product boundaries, and anonymous privacy", async () => {
    const homeResponse = await fetch(`${baseUrl}/`, { headers: { accept: "text/html" } });
    const homeBody = await homeResponse.text();
    const schoolDetailResponse = await fetch(`${baseUrl}/schools/${seedIds.schools.sysu}?year=2026`, {
      headers: { accept: "text/html" }
    });
    const schoolDetailBody = await schoolDetailResponse.text();
    const noFormulaDetailResponse = await fetch(`${baseUrl}/schools/${seedIds.schools.scut}?year=2026`, {
      headers: { accept: "text/html" }
    });
    const noFormulaDetailBody = await noFormulaDetailResponse.text();
    const calculatorUnavailableResponse = await fetch(
      `${baseUrl}/calculator?schoolId=${seedIds.schools.scut}&year=2025`,
      { headers: { accept: "text/html" } }
    );
    const calculatorUnavailableBody = await calculatorUnavailableResponse.text();
    const pendingExperienceResponse = await fetch(`${baseUrl}/api/experiences/${seedIds.experiences.pending}`);
    const pendingExperienceBody = await pendingExperienceResponse.json();
    const experienceDetailResponse = await fetch(`${baseUrl}/api/experiences/${seedIds.experiences.sysu2026}`);
    const experienceDetailBody = await experienceDetailResponse.json();

    assert.equal(homeResponse.status, 200);
    assert.match(homeBody, /class="home-first-screen"/);
    assert.match(homeBody, /核心任务/);
    assert.match(homeBody, /最新简章/);
    assert.match(homeBody, /最新面经/);
    assertStudentBottomNav(homeBody, "/");

    assert.equal(schoolDetailResponse.status, 200);
    for (const expected of ["官方简章", "报名入口", "综合分计算器", "精选面经", "发布面经"]) {
      assert.match(schoolDetailBody, new RegExp(expected));
    }

    assert.equal(noFormulaDetailResponse.status, 200);
    assert.match(noFormulaDetailBody, /历史参考/);
    assert.match(noFormulaDetailBody, /暂无已发布公式，综合分计算等待官方明确。/);
    assert.doesNotMatch(noFormulaDetailBody, new RegExp(`/calculator\\?schoolId=${seedIds.schools.scut}`));

    assert.equal(calculatorUnavailableResponse.status, 200);
    assert.match(calculatorUnavailableBody, /暂无明确已发布公式/);
    assert.match(calculatorUnavailableBody, /计算表单已隐藏/);
    assert.doesNotMatch(calculatorUnavailableBody, /id="score-input-form"/);

    assert.equal(pendingExperienceResponse.status, 404);
    assert.equal(pendingExperienceBody.error, "experience_not_found");
    assert.equal(experienceDetailResponse.status, 200);
    assertNoPublicPrivacyLeaks("published experience API", experienceDetailBody);

    const { cookie } = createSessionCookie(authService, {
      phoneNumber: "+8613900005501",
      nickname: "Frontend acceptance private student",
      defaultAnonymous: true
    });
    const anonymousResponse = await fetch(`${baseUrl}/api/experiences`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify(validExperienceSubmissionPayload())
    });
    const anonymousBody = await anonymousResponse.json();

    assert.equal(anonymousResponse.status, 201);
    assert.equal(anonymousBody.experience.author.displayName, "匿名考生");
    assert.equal(anonymousBody.experience.verification.materialCount, 1);
    assertNoPublicPrivacyLeaks("anonymous submission response", anonymousBody);

    const hiddenSubmittedResponse = await fetch(`${baseUrl}/api/experiences?keyword=Acceptance%20anonymous`);
    const hiddenSubmittedBody = await hiddenSubmittedResponse.json();

    assert.equal(hiddenSubmittedResponse.status, 200);
    assert.equal(hiddenSubmittedBody.count, 0);

    for (const [label, body] of [
      ["home", homeBody],
      ["school detail", schoolDetailBody],
      ["no formula detail", noFormulaDetailBody],
      ["calculator unavailable", calculatorUnavailableBody],
      ["published experience API", experienceDetailBody],
      ["anonymous submission response", anonymousBody]
    ]) {
      assertNoPublicPrivacyLeaks(label, body);
      assertNoBlockedPublicClaims(label, body);
    }
  });

  it("checks accessibility hooks for icon controls, inline errors, and text-visible statuses", async () => {
    const htmlPages = [];
    const loggedIn = createSessionCookie(authService, {
      phoneNumber: "+8613900005502",
      nickname: "Frontend accessibility student"
    });

    for (const [label, path, cookie] of [
      ["home", "/", ""],
      ["schools", "/schools?year=2025&sort=name", ""],
      ["school detail", `/schools/${seedIds.schools.sysu}?year=2026`, ""],
      ["timeline", "/timeline?year=2026", ""],
      ["calculator", `/calculator?schoolId=${seedIds.schools.sysu}&year=2026`, ""],
      ["experiences", "/experiences", ""],
      ["experience detail", `/experiences/${seedIds.experiences.sysu2026}`, ""],
      ["submission form", "/experiences/new", loggedIn.cookie]
    ]) {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: {
          accept: "text/html",
          ...(cookie ? { cookie } : {})
        }
      });
      const body = await response.text();

      assert.equal(response.status, 200, label);
      htmlPages.push([label, body]);
    }

    for (const [label, body] of htmlPages) {
      for (const tag of body.match(/<(?:button|a)\b(?=[^>]*class="[^"]*icon-button)[^>]*>/g) ?? []) {
        assert.match(tag, /aria-label="[^"]+"/, `${label} icon control missing an accessible name: ${tag}`);
      }
    }

    const calculator = htmlPages.find(([label]) => label === "calculator")[1];
    const timeline = htmlPages.find(([label]) => label === "timeline")[1];
    const submissionForm = htmlPages.find(([label]) => label === "submission form")[1];

    assert.match(calculator, /aria-describedby="[^"]*score-gaokao-error[^"]*"/);
    assert.match(calculator, /data-score-error-for="gaokao"/);
    assert.match(timeline, /即将截止|已结束|待公布/);
    assert.match(timeline, /class="status-badge status-/);
    assert.match(submissionForm, /aria-label="必填"/);
    assert.match(submissionForm, /data-char-count-for="processSummary"/);
  });

  it("checks admin frontend acceptance gates for draft, source, formula, moderation, and verification workflows", async () => {
    const dataReviewer = createSessionCookie(authService, {
      phoneNumber: "+8613900005503",
      nickname: "Frontend data reviewer",
      role: "data_reviewer"
    });
    const contentReviewer = createSessionCookie(authService, {
      phoneNumber: "+8613900005504",
      nickname: "Frontend content reviewer",
      role: "content_reviewer"
    });
    const student = createSessionCookie(authService, {
      phoneNumber: "+8613900005505",
      nickname: "Frontend moderation submitter"
    });

    const ingestionResponse = await fetch(`${baseUrl}/api/admin/ingestion-runs`, {
      method: "POST",
      headers: {
        cookie: dataReviewer.cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "frontend-acceptance-ingestion",
        schoolId: seedIds.schools.sysu,
        year: 2031,
        keyword: "Frontend acceptance official source",
        sourceDocuments: [
          {
            id: "frontend-acceptance-source",
            sourceUrl: "https://eea.gd.gov.cn/frontend-acceptance-2031",
            title: "Guangdong Education Examination Authority frontend acceptance notice",
            sourceType: "guangdong_education_exam_authority",
            status: "accepted"
          }
        ],
        extractedGuideFields: {
          guideTitle: {
            value: "Frontend Acceptance 2031 Guide",
            sourceDocumentId: "frontend-acceptance-source"
          },
          summary: {
            value: "Draft-only frontend acceptance guide.",
            sourceDocumentId: "frontend-acceptance-source"
          }
        }
      })
    });
    const ingestionBody = await ingestionResponse.json();

    assert.equal(ingestionResponse.status, 201);
    assert.equal(ingestionBody.ingestionRun.draftGuide.status, "draft");

    const publicDraftResponse = await fetch(`${baseUrl}/api/guides?schoolId=${seedIds.schools.sysu}&year=2031`);
    const publicDraftBody = await publicDraftResponse.json();

    assert.equal(publicDraftResponse.status, 200);
    assert.equal(publicDraftBody.count, 0);

    const rejectedThirdPartyResponse = await fetch(`${baseUrl}/api/admin/ingestion-runs`, {
      method: "POST",
      headers: {
        cookie: dataReviewer.cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        keyword: "frontend third-party final authority",
        sourceDocuments: [
          {
            id: "frontend-acceptance-third-party",
            sourceUrl: "https://example-info.invalid/frontend",
            title: "Third-party info site",
            sourceType: "third_party_info",
            status: "accepted"
          }
        ]
      })
    });
    const rejectedThirdPartyBody = await rejectedThirdPartyResponse.json();

    assert.equal(rejectedThirdPartyResponse.status, 400);
    assert.equal(rejectedThirdPartyBody.error, "third_party_final_authority_rejected");

    const formulaResponse = await fetch(`${baseUrl}/api/admin/formulas`, {
      method: "POST",
      headers: {
        cookie: dataReviewer.cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        schoolId: seedIds.schools.scut,
        year: 2025,
        formulaName: "Frontend acceptance sample-gated formula",
        formulaType: "weighted_sum",
        formulaConfig: {
          inputs: [
            { key: "gaokao", label: "Gaokao score", maxScore: 750, weight: 0.85 },
            { key: "schoolAssessment", label: "School assessment", maxScore: 100, weight: 0.15 }
          ],
          outputMaxScore: 100
        },
        explanation: "Official source-backed formula for frontend acceptance gating.",
        officialSourceUrl: "https://example.edu/scut/frontend-acceptance-formula",
        sampleTests: [
          {
            name: "Failing sample",
            scores: { gaokao: 750, schoolAssessment: 100 },
            expectedTotalScore: 99
          }
        ]
      })
    });
    const formulaBody = await formulaResponse.json();
    const publishFormulaResponse = await fetch(
      `${baseUrl}/api/admin/formulas/${encodeURIComponent(formulaBody.formula.formula.id)}/publish`,
      {
        method: "POST",
        ...jsonRequest({ note: "Should remain blocked until sample passes." }),
        headers: {
          cookie: dataReviewer.cookie,
          "content-type": "application/json"
        }
      }
    );
    const publishFormulaBody = await publishFormulaResponse.json();

    assert.equal(formulaResponse.status, 201);
    assert.equal(formulaBody.formula.sampleResults[0].passed, false);
    assert.equal(publishFormulaResponse.status, 422);
    assert.equal(publishFormulaBody.error, "formula_sample_failed");

    const submitResponse = await fetch(`${baseUrl}/api/experiences`, {
      method: "POST",
      headers: {
        cookie: student.cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify(validExperienceSubmissionPayload({
        majorGroup: "Frontend moderation group",
        verificationMaterials: [
          {
            materialType: "admission_result",
            objectStorageKey: "private/frontend-acceptance/moderation.png",
            metadata: {
              sourceAccount: "frontend-moderation-source",
              realName: "Frontend Moderation Student"
            }
          }
        ]
      }))
    });
    const submitBody = await submitResponse.json();

    assert.equal(submitResponse.status, 201);

    const moderationQueueResponse = await fetch(`${baseUrl}/api/admin/experiences`, {
      headers: { cookie: contentReviewer.cookie }
    });
    const moderationQueueBody = await moderationQueueResponse.json();
    const queued = moderationQueueBody.experiences.find((experience) => experience.id === submitBody.experience.id);

    assert.equal(moderationQueueResponse.status, 200);
    assert.equal(queued.status, "pending_review");
    assert.ok(queued.moderation.warnings.some((warning) => warning.code === "verification_privacy_warning"));

    const verificationQueueResponse = await fetch(`${baseUrl}/api/admin/verifications`, {
      headers: { cookie: contentReviewer.cookie }
    });
    const verificationQueueBody = await verificationQueueResponse.json();
    const serializedVerificationQueue = JSON.stringify(verificationQueueBody);

    assert.equal(verificationQueueResponse.status, 200);
    assert.ok(verificationQueueBody.verifications.some((item) => item.experience.id === submitBody.experience.id));
    assert.doesNotMatch(serializedVerificationQueue, /private\/frontend-acceptance\/moderation/);

    const adminPages = [
      ["/admin/ingestion-runs", dataReviewer.cookie, /简章草稿创建|来源文档候选/],
      ["/admin/guides", dataReviewer.cookie, /官方来源预览或链接|学生端预览/],
      ["/admin/formulas", dataReviewer.cookie, /官方来源与发布门槛|样例测试区/],
      ["/admin/experiences", contentReviewer.cookie, /敏感内容与隐私警告|学生端预览/],
      ["/admin/verifications", contentReviewer.cookie, /仅后端可见材料预览|学生端认证标签预览/]
    ];

    for (const [path, cookie, pattern] of adminPages) {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: {
          accept: "text/html",
          cookie
        }
      });
      const body = await response.text();

      assert.equal(response.status, 200, path);
      assert.match(body, /data-admin-shell="desktop"/);
      assert.match(body, pattern);
      assert.doesNotMatch(body, /学生底部导航/);
    }
  });
});
