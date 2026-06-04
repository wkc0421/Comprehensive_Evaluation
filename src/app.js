import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { AuthError, authService as defaultAuthService } from "./auth.js";
import {
  archiveAdminGuide,
  buildSiteTimelineReminders,
  calculateScore,
  createAdminGuideDraft,
  getAdminFormulaDetail,
  getExperienceById,
  getAdminGuideReviewDetail,
  getGuideDetail,
  getSchoolById,
  getSchoolDetail,
  listAdminFormulas,
  listAdminGuideReviews,
  listAdminTimelineNodes,
  listGuides,
  listExperiences,
  listSchoolGuideCards,
  listTimelineNodes,
  markAdminGuidePendingSupplement,
  moderatePublishedExperience,
  overrideAdminTimelineNode,
  publishAdminFormula,
  publishAdminGuide,
  returnAdminGuide,
  submitAdminGuideReview,
  upsertAdminFormulaDraft
} from "./db/data-access.js";
import {
  experienceSubmissionStore as defaultExperienceSubmissionStore
} from "./experience-submissions.js";
import { interactionStore as defaultInteractionStore } from "./interactions.js";
import {
  renderAdminPage,
  renderAdminExperienceModerationPage,
  renderAdminFormulaManagementPage,
  renderAdminGuideReviewPage,
  renderAdminReportReviewPage,
  renderAdminTimelineManagementPage,
  renderAdminVerificationReviewPage,
  renderExperienceListPage,
  renderExperienceSubmissionPage,
  renderNotFound,
  renderPersonalCenterPage,
  renderSchoolDetailPage,
  renderSchoolListPage,
  renderScoreCalculatorPage,
  renderStudentHome,
  renderTimelinePage
} from "./pages.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(rootDir, "public");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);
const guideStatuses = new Set(["draft", "pending_review", "published", "archived"]);
const schoolSorts = new Set(["deadline", "updated", "name"]);
const experienceSortAliases = new Map([
  ["newest", "newest"],
  ["useful", "useful"],
  ["useful_count", "useful"],
  ["verified", "verified"],
  ["verified_first", "verified"]
]);
const favoriteTargetTypes = new Set(["school", "experience"]);
const reportTargetTypes = new Set(["experience", "user"]);
const officialGuideReviewerRoles = ["data_reviewer", "admin"];
const contentModeratorRoles = ["content_reviewer", "data_reviewer", "admin"];
const moderationStatuses = new Set([
  "pending_review",
  "published",
  "returned",
  "hidden",
  "banned"
]);
const verificationStatuses = new Set([
  "pending_review",
  "verified",
  "rejected",
  "returned"
]);
const reportStatuses = new Set(["pending", "resolved"]);
const moderationReviewActions = new Set(["approve", "return", "hide", "ban"]);
const verificationReviewActions = new Set(["approve", "reject", "return"]);
const reportResolutionActions = new Set(["keep", "hide", "delete", "limit_account"]);
const submissionStatusLabels = Object.freeze({
  draft: "Draft",
  pending_review: "Pending Review",
  published: "Published",
  rejected: "Rejected",
  returned: "Returned",
  hidden: "Hidden",
  banned: "Banned"
});

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(html);
}

class RequestError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "RequestError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, error, message, extra = {}) {
  sendJson(response, statusCode, { error, message, ...extra });
}

function errorStatus(error) {
  return Number.isInteger(error.statusCode) ? error.statusCode : 500;
}

async function readJsonBody(request) {
  const rawBody = await readRawBody(request);

  if (rawBody.length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new RequestError("invalid_json", "Request body must be valid JSON.");
  }
}

async function readRawBody(request) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of request) {
    bytes += chunk.length;

    if (bytes > 64 * 1024) {
      throw new RequestError("request_too_large", "Request body is too large.", 413);
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return "";
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();

  return rawBody;
}

function formBodyFromParams(params) {
  const body = {};

  for (const [key, value] of params) {
    if (Object.hasOwn(body, key)) {
      body[key] = Array.isArray(body[key]) ? [...body[key], value] : [body[key], value];
      continue;
    }

    body[key] = value;
  }

  return body;
}

async function readStructuredBody(request) {
  const rawBody = await readRawBody(request);

  if (rawBody.length === 0) {
    return {};
  }

  const contentType = (headerValue(request.headers, "content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType === "application/x-www-form-urlencoded") {
    return formBodyFromParams(new URLSearchParams(rawBody));
  }

  if (!contentType || contentType === "application/json" || contentType.endsWith("+json")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      throw new RequestError("invalid_json", "Request body must be valid JSON.");
    }
  }

  throw new RequestError(
    "unsupported_media_type",
    "Request body must use JSON or URL-encoded form data.",
    415
  );
}

function headerValue(headers, name) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function optionalStringParam(url, name) {
  const value = url.searchParams.get(name);

  if (value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalYearParam(url) {
  const value = optionalStringParam(url, "year");

  if (!value) {
    return undefined;
  }

  const year = Number(value);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new RequestError("invalid_year", "Year must be a four-digit admission year.");
  }

  return year;
}

function parseSchoolListFilters(url) {
  const status = optionalStringParam(url, "status");
  const sort = optionalStringParam(url, "sort") ?? "deadline";

  if (status && !guideStatuses.has(status)) {
    throw new RequestError("invalid_status", "Guide status is not supported.");
  }

  if (!schoolSorts.has(sort)) {
    throw new RequestError("invalid_sort", "School list sort is not supported.");
  }

  return {
    year: optionalYearParam(url),
    status,
    keyword: optionalStringParam(url, "keyword"),
    applicationStatus: optionalStringParam(url, "applicationStatus"),
    schoolType: optionalStringParam(url, "schoolType"),
    sort
  };
}

function parseGuideListFilters(url) {
  const status = optionalStringParam(url, "status");

  if (status && !guideStatuses.has(status)) {
    throw new RequestError("invalid_status", "Guide status is not supported.");
  }

  return {
    year: optionalYearParam(url),
    schoolId: optionalStringParam(url, "schoolId"),
    status,
    keyword: optionalStringParam(url, "keyword")
  };
}

function parseAdminGuideFilters(url) {
  const status = optionalStringParam(url, "status");

  if (status && !guideStatuses.has(status)) {
    throw new RequestError("invalid_status", "Guide status is not supported.");
  }

  return { status };
}

function parseAdminTimelineFilters(url) {
  return {
    year: optionalYearParam(url),
    schoolId: optionalStringParam(url, "schoolId"),
    eventKey: optionalStringParam(url, "eventKey")
  };
}

function parseAdminFormulaFilters(url) {
  const status = optionalStringParam(url, "status");

  if (status && !guideStatuses.has(status)) {
    throw new RequestError("invalid_status", "Formula status is not supported.");
  }

  return {
    year: optionalYearParam(url),
    schoolId: optionalStringParam(url, "schoolId"),
    status
  };
}

function parseAdminExperienceFilters(url) {
  const status = optionalStringParam(url, "status");

  if (status && !moderationStatuses.has(status)) {
    throw new RequestError("invalid_status", "Experience moderation status is not supported.");
  }

  return { status };
}

function parseAdminVerificationFilters(url) {
  const status = optionalStringParam(url, "status");

  if (status && !verificationStatuses.has(status)) {
    throw new RequestError("invalid_status", "Verification status is not supported.");
  }

  return { status };
}

function parseAdminReportFilters(url) {
  const status = optionalStringParam(url, "status");
  const targetType = optionalStringParam(url, "targetType");

  if (status && !reportStatuses.has(status)) {
    throw new RequestError("invalid_status", "Report status is not supported.");
  }

  if (targetType && !reportTargetTypes.has(targetType)) {
    throw new RequestError("invalid_report_target", "Report target type is not supported.");
  }

  return { status: status ?? "pending", targetType };
}

function optionalBooleanParam(url, name) {
  const value = optionalStringParam(url, name);

  if (!value) {
    return false;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new RequestError("invalid_boolean", `${name} must be true or false.`);
}

function optionalBooleanFilterParam(url, name) {
  const value = optionalStringParam(url, name);

  if (!value) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new RequestError("invalid_boolean", `${name} must be true or false.`);
}

function parseSchoolIdsParam(url) {
  return url.searchParams
    .getAll("schoolIds")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseTimelineFilters(url) {
  return {
    year: optionalYearParam(url),
    schoolIds: parseSchoolIdsParam(url),
    mine: optionalBooleanParam(url, "mine")
  };
}

function parseCalculatorFilters(url) {
  return {
    schoolId: optionalStringParam(url, "schoolId"),
    year: optionalYearParam(url)
  };
}

function parseExperienceFilters(url) {
  const requestedSort = optionalStringParam(url, "sort") ?? "newest";
  const sort = experienceSortAliases.get(requestedSort);

  if (!sort) {
    throw new RequestError("invalid_sort", "Experience list sort is not supported.");
  }

  return {
    schoolId: optionalStringParam(url, "schoolId"),
    year: optionalYearParam(url),
    stage: optionalStringParam(url, "stage"),
    assessmentType: optionalStringParam(url, "assessmentType"),
    verified: optionalBooleanFilterParam(url, "verified"),
    sort
  };
}

function shouldSendSchoolListJson(request, url) {
  if (url.pathname === "/api/schools" || url.searchParams.get("format") === "json") {
    return true;
  }

  const accept = headerValue(request.headers, "accept") ?? "";

  if (accept.includes("text/html")) {
    return false;
  }

  return accept.length === 0 || accept.includes("*/*") || accept.includes("application/json");
}

function shouldSendTimelineJson(request, url) {
  if (url.pathname === "/api/timeline" || url.searchParams.get("format") === "json") {
    return true;
  }

  const accept = headerValue(request.headers, "accept") ?? "";

  if (accept.includes("text/html")) {
    return false;
  }

  return accept.length === 0 || accept.includes("*/*") || accept.includes("application/json");
}

function shouldSendExperienceListJson(request, url) {
  if (url.pathname === "/api/experiences" || url.searchParams.get("format") === "json") {
    return true;
  }

  const accept = headerValue(request.headers, "accept") ?? "";

  if (accept.includes("text/html")) {
    return false;
  }

  return accept.length === 0 || accept.includes("*/*") || accept.includes("application/json");
}

function shouldSendExperienceSubmissionJson(request, url) {
  if (url.pathname === "/api/experiences" || url.searchParams.get("format") === "json") {
    return true;
  }

  const accept = headerValue(request.headers, "accept") ?? "";

  if (accept.includes("text/html")) {
    return false;
  }

  return accept.length === 0 || accept.includes("*/*") || accept.includes("application/json");
}

function shouldSendPersonalCenterJson(request, url) {
  if (url.pathname.startsWith("/api/") || url.searchParams.get("format") === "json") {
    return true;
  }

  const accept = headerValue(request.headers, "accept") ?? "";

  if (accept.includes("text/html")) {
    return false;
  }

  return accept.length === 0 || accept.includes("*/*") || accept.includes("application/json");
}

function shouldSendAdminJson(request, url) {
  if (url.pathname.startsWith("/api/") || url.searchParams.get("format") === "json") {
    return true;
  }

  const accept = headerValue(request.headers, "accept") ?? "";

  if (accept.includes("text/html")) {
    return false;
  }

  return accept.length === 0 || accept.includes("*/*") || accept.includes("application/json");
}

function guideSourceJson(guide) {
  return {
    officialSourceUrl: guide.officialSourceUrl,
    sourceType: guide.sourceType,
    sourceTitle: guide.sourceTitle,
    publishedAt: guide.sourcePublishedAt,
    updatedAt: guide.sourceUpdatedAt
  };
}

function guideListItemJson(guide) {
  return {
    id: guide.id,
    schoolId: guide.schoolId,
    year: guide.admissionYear,
    provinceScope: guide.provinceScope,
    status: guide.status,
    version: guide.version,
    isCurrent: guide.isCurrent,
    guideTitle: guide.guideTitle,
    summary: guide.summary,
    applicationStatus: guide.applicationStatus,
    applicationStartAt: guide.applicationStartAt,
    applicationDeadlineAt: guide.applicationDeadlineAt,
    source: guideSourceJson(guide),
    publishedAt: guide.publishedAt,
    updatedAt: guide.updatedAt
  };
}

function schoolCardJson(card) {
  return {
    school: {
      id: card.school.id,
      name: card.school.name,
      provinceScope: card.school.provinceScope,
      city: card.school.city,
      schoolType: card.school.schoolType,
      officialWebsiteUrl: card.school.officialWebsiteUrl,
      updatedAt: card.school.updatedAt
    },
    guide: {
      id: card.guide.id,
      year: card.guide.admissionYear,
      status: card.guide.status,
      applicationStatus: card.guide.applicationStatus,
      applicationStartAt: card.guide.applicationStartAt,
      applicationDeadlineAt: card.guide.applicationDeadlineAt,
      updatedAt: card.guide.updatedAt,
      summary: card.guide.summary,
      officialSourceUrl: card.guide.officialSourceUrl
    },
    keyTimelineNodes: card.keyTimelineNodes.map((node) => ({
      id: node.id,
      eventKey: node.eventKey,
      title: node.title,
      startsAt: node.startsAt,
      endsAt: node.endsAt
    })),
    formula: card.formula,
    experiences: card.experiences
  };
}

function formulaJson(formula) {
  if (!formula) {
    return null;
  }

  return {
    id: formula.id,
    formulaName: formula.formulaName,
    formulaType: formula.formulaType,
    inputs: formula.formulaConfig.inputs,
    outputMaxScore: formula.formulaConfig.outputMaxScore,
    explanation: formula.explanation,
    officialSourceUrl: formula.officialSourceUrl
  };
}

function schoolDetailJson(detail) {
  return {
    school: {
      id: detail.school.id,
      name: detail.school.name,
      provinceScope: detail.school.provinceScope,
      city: detail.school.city,
      schoolType: detail.school.schoolType,
      officialWebsiteUrl: detail.school.officialWebsiteUrl,
      updatedAt: detail.school.updatedAt
    },
    availableYears: detail.availableYears,
    selectedYear: detail.selectedYear,
    guide: {
      id: detail.guide.id,
      year: detail.guide.admissionYear,
      status: detail.guide.status,
      version: detail.guide.version,
      applicationStatus: detail.guide.applicationStatus,
      applicationStartAt: detail.guide.applicationStartAt,
      applicationDeadlineAt: detail.guide.applicationDeadlineAt,
      officialSourceUrl: detail.guide.officialSourceUrl,
      applicationUrl: detail.guide.applicationUrl,
      sourceType: detail.guide.sourceType,
      sourceTitle: detail.guide.sourceTitle,
      sourcePublishedAt: detail.guide.sourcePublishedAt,
      sourceUpdatedAt: detail.guide.sourceUpdatedAt,
      guideTitle: detail.guide.guideTitle,
      summary: detail.guide.summary,
      majors: detail.guide.majors,
      subjectRequirements: detail.guide.subjectRequirements,
      academicTestRequirements: detail.guide.academicTestRequirements,
      assessmentMethod: detail.guide.assessmentMethod,
      admissionRule: detail.guide.admissionRule,
      fees: detail.guide.fees,
      contact: detail.guide.contact,
      publishedAt: detail.guide.publishedAt,
      updatedAt: detail.guide.updatedAt
    },
    timeline: detail.timeline.map((node) => ({
      id: node.id,
      eventKey: node.eventKey,
      title: node.title,
      startsAt: node.startsAt,
      endsAt: node.endsAt
    })),
    formula: formulaJson(detail.formula),
    featuredExperiences: detail.featuredExperiences.map((experience) => ({
      id: experience.id,
      schoolId: experience.schoolId,
      year: experience.admissionYear,
      stage: experience.stage,
      assessmentTypes: experience.assessmentTypes,
      summary: experience.summary,
      verificationStatus: experience.verificationStatus,
      usefulCount: experience.usefulCount,
      createdAt: experience.createdAt
    }))
  };
}

function guideDetailJson(detail) {
  return {
    school: {
      id: detail.school.id,
      name: detail.school.name,
      provinceScope: detail.school.provinceScope,
      city: detail.school.city,
      schoolType: detail.school.schoolType,
      officialWebsiteUrl: detail.school.officialWebsiteUrl
    },
    guide: {
      id: detail.guide.id,
      schoolId: detail.guide.schoolId,
      year: detail.guide.admissionYear,
      provinceScope: detail.guide.provinceScope,
      status: detail.guide.status,
      version: detail.guide.version,
      isCurrent: detail.guide.isCurrent,
      guideTitle: detail.guide.guideTitle,
      summary: detail.guide.summary,
      applicationStatus: detail.guide.applicationStatus,
      publishedAt: detail.guide.publishedAt,
      updatedAt: detail.guide.updatedAt
    },
    source: guideSourceJson(detail.guide),
    structuredFields: {
      applicationUrl: detail.guide.applicationUrl,
      applicationStartAt: detail.guide.applicationStartAt,
      applicationDeadlineAt: detail.guide.applicationDeadlineAt,
      majors: detail.guide.majors,
      subjectRequirements: detail.guide.subjectRequirements,
      academicTestRequirements: detail.guide.academicTestRequirements,
      assessmentMethod: detail.guide.assessmentMethod,
      admissionRule: detail.guide.admissionRule,
      fees: detail.guide.fees,
      contact: detail.guide.contact
    },
    versionSummary: {
      currentVersion: detail.guide.version,
      currentGuideId: detail.versionHistory.find((guide) => guide.isCurrent)?.id ?? detail.guide.id,
      versions: detail.versionHistory.map((guide) => ({
        id: guide.id,
        version: guide.version,
        status: guide.status,
        isCurrent: guide.isCurrent,
        publishedAt: guide.publishedAt,
        updatedAt: guide.updatedAt,
        sourceUpdatedAt: guide.sourceUpdatedAt,
        versionNotes: guide.versionNotes
      }))
    }
  };
}

function adminGuideJson(detailOrGuide) {
  const detail = detailOrGuide.school
    ? detailOrGuide
    : getAdminGuideReviewDetail({ guideId: detailOrGuide.id });

  if (!detail) {
    return null;
  }

  const guide = detail.guide;

  return {
    school: {
      id: detail.school.id,
      name: detail.school.name,
      provinceScope: detail.school.provinceScope,
      city: detail.school.city,
      schoolType: detail.school.schoolType,
      officialWebsiteUrl: detail.school.officialWebsiteUrl
    },
    guide: {
      id: guide.id,
      schoolId: guide.schoolId,
      year: guide.admissionYear,
      provinceScope: guide.provinceScope,
      status: guide.status,
      version: guide.version,
      isCurrent: guide.isCurrent,
      reviewStatus: guide.reviewStatus,
      supplementStatus: guide.supplementStatus,
      guideTitle: guide.guideTitle,
      summary: guide.summary,
      applicationStatus: guide.applicationStatus,
      publishedAt: guide.publishedAt,
      updatedAt: guide.updatedAt
    },
    source: guideSourceJson(guide),
    structuredFields: {
      applicationUrl: guide.applicationUrl,
      applicationStartAt: guide.applicationStartAt,
      applicationDeadlineAt: guide.applicationDeadlineAt,
      majors: guide.majors,
      subjectRequirements: guide.subjectRequirements,
      academicTestRequirements: guide.academicTestRequirements,
      assessmentMethod: guide.assessmentMethod,
      admissionRule: guide.admissionRule,
      fees: guide.fees,
      contact: guide.contact
    },
    reviewAudit: guide.reviewAudit ?? [],
    versionSummary: {
      currentVersion: guide.version,
      versions: (detail.versionHistory ?? [guide]).map((version) => ({
        id: version.id,
        version: version.version,
        status: version.status,
        isCurrent: version.isCurrent,
        reviewStatus: version.reviewStatus,
        supplementStatus: version.supplementStatus,
        publishedAt: version.publishedAt,
        updatedAt: version.updatedAt,
        versionNotes: version.versionNotes
      }))
    }
  };
}

function adminTimelineNodeJson(node) {
  return {
    id: node.id,
    admissionGuideId: node.admissionGuideId,
    schoolId: node.schoolId,
    eventKey: node.eventKey,
    title: node.title,
    description: node.description,
    startsAt: node.startsAt,
    endsAt: node.endsAt,
    dateLabel: formatTimelineDateLabel(node),
    status: node.status,
    statusLabel: timelineStatusLabel(node.status),
    officialDataStatus: node.officialDataStatus,
    source: node.source,
    generated: node.generated,
    override: node.override,
    school: {
      id: node.school.id,
      name: node.school.name,
      city: node.school.city,
      schoolType: node.school.schoolType
    },
    guide: {
      id: node.guide.id,
      year: node.guide.admissionYear,
      title: node.guide.guideTitle,
      applicationStatus: node.guide.applicationStatus,
      officialSourceUrl: node.guide.officialSourceUrl
    }
  };
}

function adminFormulaJson(detail) {
  const formula = detail.formula;

  return {
    school: {
      id: detail.school.id,
      name: detail.school.name,
      city: detail.school.city,
      schoolType: detail.school.schoolType
    },
    guide: {
      id: detail.guide.id,
      year: detail.guide.admissionYear,
      title: detail.guide.guideTitle,
      status: detail.guide.status,
      officialSourceUrl: detail.guide.officialSourceUrl
    },
    formula: {
      id: formula.id,
      admissionGuideId: formula.admissionGuideId,
      schoolId: formula.schoolId,
      year: formula.admissionYear,
      provinceScope: formula.provinceScope,
      status: formula.status,
      version: formula.version,
      formulaName: formula.formulaName,
      formulaType: formula.formulaType,
      formulaConfig: formula.formulaConfig,
      explanation: formula.explanation,
      officialSourceUrl: formula.officialSourceUrl,
      sampleTests: formula.sampleTests ?? [],
      publishedAt: formula.publishedAt ?? null,
      updatedAt: formula.updatedAt ?? null
    },
    sampleResults: detail.sampleResults ?? [],
    reviewAudit: formula.reviewAudit ?? []
  };
}

function adminModerationSchoolJson(schoolId) {
  const school = getSchoolById(schoolId);

  return school
    ? {
        id: school.id,
        name: school.name,
        provinceScope: school.provinceScope,
        city: school.city,
        schoolType: school.schoolType
      }
    : null;
}

function adminExperienceJson(experience) {
  return {
    id: experience.id,
    userId: experience.userId,
    authorNickname: experience.authorNickname,
    schoolId: experience.schoolId,
    school: adminModerationSchoolJson(experience.schoolId),
    year: experience.year,
    provinceScope: experience.provinceScope,
    status: experience.status,
    statusLabel: submissionStatusLabel(experience.status),
    majorGroup: experience.majorGroup,
    candidateTrack: experience.candidateTrack,
    stage: experience.stage,
    stageLabel: humanizeToken(experience.stage),
    shortlistedStatus: experience.shortlistedStatus,
    admittedStatus: experience.admittedStatus,
    assessmentTypes: experience.assessmentTypes,
    assessmentFormat: experience.assessmentTypes.map(humanizeToken).join(", "),
    location: experience.location,
    summary: experience.summary,
    processSummary: experience.processSummary,
    questionTypes: experience.questionTypes,
    preparationSummary: experience.preparationSummary,
    difficultyScore: experience.difficultyScore,
    pressureScore: experience.pressureScore,
    differentiationScore: experience.differentiationScore,
    advice: experience.advice,
    isAnonymous: experience.isAnonymous,
    verificationStatus: experience.verificationStatus,
    verificationMaterials: experience.verificationMaterials,
    usefulCount: experience.usefulCount,
    moderation: experience.moderation,
    reviewAudit: experience.reviewAudit,
    createdAt: experience.createdAt,
    updatedAt: experience.updatedAt
  };
}

function adminVerificationJson(review) {
  return {
    material: review.material,
    experience: adminExperienceJson(review.experience),
    moderation: review.moderation
  };
}

function reportTargetJson(report, authService) {
  if (report.targetType === "experience") {
    const experience = getExperienceById(report.targetId);

    return {
      type: "experience",
      visible: Boolean(experience),
      experience: experience ? experienceListItemJson(experience) : null
    };
  }

  const user = typeof authService.getUserById === "function"
    ? authService.getUserById(report.targetId)
    : null;

  return {
    type: "user",
    visible: Boolean(user),
    user
  };
}

function adminReportJson(report, authService) {
  return {
    id: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
    target: reportTargetJson(report, authService),
    reason: report.reason,
    description: report.description,
    status: report.status,
    resolution: report.resolution,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt
  };
}

function formatTimelineDateLabel(node) {
  if (!node.startsAt && !node.endsAt) {
    return "To be announced";
  }

  return node.endsAt ?? node.startsAt;
}

function timelineStatusLabel(status) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeToken(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function latestPublishedAdmissionYear() {
  const years = listGuides().map((guide) => guide.admissionYear);

  return Math.max(new Date().getUTCFullYear(), ...years);
}

function experienceVerifiedLabel(experience) {
  return experience.verificationStatus === "verified" ? "Verified experience" : "Verification pending";
}

function experienceHistoricalReferenceNotice(experience) {
  if (latestPublishedAdmissionYear() - experience.admissionYear < 2) {
    return null;
  }

  return `Historical reference: this ${experience.admissionYear} experience may not reflect current assessment rules.`;
}

function timelineNodeJson(node) {
  return {
    id: node.id,
    admissionGuideId: node.admissionGuideId,
    schoolId: node.schoolId,
    eventKey: node.eventKey,
    title: node.title,
    description: node.description ?? "",
    startsAt: node.startsAt,
    endsAt: node.endsAt,
    dateLabel: formatTimelineDateLabel(node),
    isDateKnown: node.isDateKnown,
    status: node.status,
    statusLabel: timelineStatusLabel(node.status),
    officialDataStatus: node.officialDataStatus,
    school: {
      id: node.school.id,
      name: node.school.name,
      provinceScope: node.school.provinceScope,
      city: node.school.city,
      schoolType: node.school.schoolType
    },
    guide: {
      id: node.guide.id,
      year: node.guide.admissionYear,
      title: node.guide.guideTitle,
      applicationStatus: node.guide.applicationStatus,
      officialSourceUrl: node.guide.officialSourceUrl
    }
  };
}

function experienceListItemJson(experience) {
  const school = getSchoolById(experience.schoolId);

  return {
    id: experience.id,
    schoolId: experience.schoolId,
    school: school
      ? {
          id: school.id,
          name: school.name,
          provinceScope: school.provinceScope,
          city: school.city,
          schoolType: school.schoolType
        }
      : null,
    year: experience.admissionYear,
    provinceScope: experience.provinceScope,
    stage: experience.stage,
    stageLabel: humanizeToken(experience.stage),
    assessmentTypes: experience.assessmentTypes,
    assessmentFormat: experience.assessmentTypes.map(humanizeToken).join(", "),
    summary: experience.summary,
    verificationStatus: experience.verificationStatus,
    verified: experience.verificationStatus === "verified",
    verifiedLabel: experienceVerifiedLabel(experience),
    usefulCount: experience.usefulCount,
    historicalReferenceNotice: experienceHistoricalReferenceNotice(experience),
    createdAt: experience.createdAt
  };
}

function favoriteJson(favorite) {
  return {
    id: favorite.id,
    targetType: favorite.targetType,
    targetId: favorite.targetId,
    createdAt: favorite.createdAt
  };
}

function schoolSummaryJson(school) {
  if (!school) {
    return null;
  }

  return {
    id: school.id,
    name: school.name,
    provinceScope: school.provinceScope,
    city: school.city,
    schoolType: school.schoolType,
    officialWebsiteUrl: school.officialWebsiteUrl
  };
}

function guideSummaryJson(guide) {
  if (!guide) {
    return null;
  }

  return {
    id: guide.id,
    year: guide.admissionYear,
    guideTitle: guide.guideTitle,
    applicationStatus: guide.applicationStatus,
    applicationDeadlineAt: guide.applicationDeadlineAt,
    officialSourceUrl: guide.officialSourceUrl,
    updatedAt: guide.updatedAt
  };
}

function favoriteSchoolJson(favorite) {
  const detail = getSchoolDetail({ schoolId: favorite.targetId });

  return {
    ...favoriteJson(favorite),
    visibility: detail ? "published" : "unavailable",
    school: schoolSummaryJson(detail?.school ?? getSchoolById(favorite.targetId)),
    guide: guideSummaryJson(detail?.guide)
  };
}

function favoriteExperienceJson(favorite) {
  const experience = getExperienceById(favorite.targetId);

  return {
    ...favoriteJson(favorite),
    visibility: experience ? "published" : "unavailable",
    experience: experience ? experienceListItemJson(experience) : null
  };
}

function buildFavoriteGroups(user, interactionStore) {
  const favorites = interactionStore.listFavorites({ userId: user.id });
  const schools = favorites
    .filter((favorite) => favorite.targetType === "school")
    .map(favoriteSchoolJson);
  const experiences = favorites
    .filter((favorite) => favorite.targetType === "experience")
    .map(favoriteExperienceJson);

  return {
    count: favorites.length,
    schools,
    experiences,
    all: [...schools, ...experiences]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  };
}

function submissionStatusLabel(status) {
  return submissionStatusLabels[status] ?? humanizeToken(status);
}

function submittedExperienceJson(experience) {
  const school = getSchoolById(experience.schoolId);

  return {
    ...experience,
    school: schoolSummaryJson(school),
    statusLabel: submissionStatusLabel(experience.status),
    verification: {
      ...experience.verification,
      statusLabel: submissionStatusLabel(experience.verification.status)
    }
  };
}

function listPersonalSubmissions(user, experienceSubmissionStore) {
  return experienceSubmissionStore
    .listSubmissions({ userId: user.id })
    .map(submittedExperienceJson);
}

function siteNotificationJson(reminder) {
  return {
    ...reminder,
    statusLabel: timelineStatusLabel(reminder.status),
    school: schoolSummaryJson(getSchoolById(reminder.schoolId))
  };
}

function buildPersonalNotifications(user, interactionStore, now) {
  const favoriteSchoolIds = interactionStore.listFavoriteSchoolIds(user.id);

  if (favoriteSchoolIds.length === 0) {
    return [];
  }

  const events = listTimelineNodes({
    year: latestPublishedAdmissionYear(),
    schoolIds: favoriteSchoolIds,
    referenceDate: currentReferenceDate(now)
  });

  return buildSiteTimelineReminders(events).map(siteNotificationJson);
}

function personalPreferencesJson(user) {
  return {
    nickname: user.nickname,
    grade: user.grade,
    defaultAnonymous: user.defaultAnonymous
  };
}

function buildPersonalCenterResult({ user, interactionStore, experienceSubmissionStore, now }) {
  const submittedExperiences = listPersonalSubmissions(user, experienceSubmissionStore);

  return {
    user,
    preferences: personalPreferencesJson(user),
    favorites: buildFavoriteGroups(user, interactionStore),
    submittedExperiences,
    notifications: buildPersonalNotifications(user, interactionStore, now),
    statusLabels: submissionStatusLabels
  };
}

function currentReferenceDate(now) {
  if (typeof now !== "function") {
    return new Date();
  }

  const value = now();
  return value instanceof Date ? value : new Date(value);
}

function timelineSchoolIdsFor(filters, user, interactionStore) {
  if (!filters.mine) {
    return filters.schoolIds;
  }

  const favoriteSchoolIds = interactionStore.listFavoriteSchoolIds(user.id);

  if (filters.schoolIds.length === 0) {
    return favoriteSchoolIds;
  }

  const requestedSchoolIds = new Set(filters.schoolIds);
  return favoriteSchoolIds.filter((schoolId) => requestedSchoolIds.has(schoolId));
}

function buildTimelineResult({ filters, user, interactionStore, now }) {
  const schoolIds = timelineSchoolIdsFor(filters, user, interactionStore);
  const events = filters.mine && schoolIds.length === 0
    ? []
    : listTimelineNodes({
        year: filters.year,
        schoolIds,
        referenceDate: currentReferenceDate(now)
      });
  const reminders = buildSiteTimelineReminders(events);

  return {
    mine: filters.mine,
    filters: {
      year: filters.year,
      schoolIds: filters.schoolIds,
      mine: filters.mine
    },
    favorites: filters.mine && user
      ? interactionStore.listFavorites({ userId: user.id, targetType: "school" }).map(favoriteJson)
      : [],
    count: events.length,
    events,
    reminders
  };
}

function sendSchoolListJson(response, filters) {
  const schools = listSchoolGuideCards(filters).map(schoolCardJson);

  sendJson(response, 200, {
    filters,
    count: schools.length,
    schools
  });
}

function sendGuideListJson(response, filters) {
  const guides = listGuides(filters).map(guideListItemJson);

  sendJson(response, 200, {
    filters,
    count: guides.length,
    guides
  });
}

function sendAdminGuideReviewListJson(response, filters = {}) {
  const reviews = listAdminGuideReviews(filters).map(adminGuideJson);

  sendJson(response, 200, {
    filters,
    count: reviews.length,
    guides: reviews
  });
}

function sendAdminTimelineListJson(response, filters = {}) {
  const timelineNodes = listAdminTimelineNodes(filters).map(adminTimelineNodeJson);

  sendJson(response, 200, {
    filters,
    count: timelineNodes.length,
    timelineNodes
  });
}

function sendAdminFormulaListJson(response, filters = {}) {
  const formulas = listAdminFormulas(filters).map(adminFormulaJson);

  sendJson(response, 200, {
    filters,
    count: formulas.length,
    formulas
  });
}

function sendAdminExperienceModerationListJson(response, experienceSubmissionStore, filters = {}) {
  const experiences = experienceSubmissionStore
    .listModerationExperiences(filters)
    .map(adminExperienceJson);

  sendJson(response, 200, {
    filters,
    count: experiences.length,
    experiences
  });
}

function sendAdminVerificationListJson(response, experienceSubmissionStore, filters = {}) {
  const verifications = experienceSubmissionStore
    .listVerificationReviews(filters)
    .map(adminVerificationJson);

  sendJson(response, 200, {
    filters,
    count: verifications.length,
    verifications
  });
}

function sendAdminReportListJson(response, interactionStore, authService, filters = {}) {
  const reports = interactionStore
    .listReports(filters)
    .map((report) => adminReportJson(report, authService));

  sendJson(response, 200, {
    filters,
    count: reports.length,
    reports
  });
}

function sendTimelineJson(response, timeline) {
  sendJson(response, 200, {
    mine: timeline.mine,
    filters: timeline.filters,
    favorites: timeline.favorites,
    count: timeline.count,
    events: timeline.events.map(timelineNodeJson),
    reminders: timeline.reminders
  });
}

function sendExperienceListJson(response, filters) {
  const experiences = listExperiences(filters).map(experienceListItemJson);

  sendJson(response, 200, {
    filters,
    count: experiences.length,
    experiences
  });
}

function parseSchoolDetailPath(pathname) {
  const match = pathname.match(/^\/(?:api\/)?schools\/(?<schoolId>[^/]+)$/);

  if (!match?.groups?.schoolId) {
    return null;
  }

  try {
    return decodeURIComponent(match.groups.schoolId);
  } catch {
    throw new RequestError("invalid_school_id", "School id must be URL encoded correctly.");
  }
}

function parseGuideDetailPath(pathname) {
  const match = pathname.match(/^\/(?:api\/)?guides\/(?<guideId>[^/]+)$/);

  if (!match?.groups?.guideId) {
    return null;
  }

  try {
    return decodeURIComponent(match.groups.guideId);
  } catch {
    throw new RequestError("invalid_guide_id", "Guide id must be URL encoded correctly.");
  }
}

function parseAdminGuideActionPath(pathname) {
  const match = pathname.match(
    /^\/(?:api\/)?admin\/guides\/(?<guideId>[^/]+)(?:\/(?<action>submit-review|publish|archive|return|pending-supplement|mark-pending-supplement))?$/
  );

  if (!match?.groups?.guideId) {
    return null;
  }

  try {
    return {
      guideId: decodeURIComponent(match.groups.guideId),
      action: match.groups.action ?? "detail"
    };
  } catch {
    throw new RequestError("invalid_guide_id", "Guide id must be URL encoded correctly.");
  }
}

function parseAdminFormulaActionPath(pathname) {
  const match = pathname.match(/^\/(?:api\/)?admin\/formulas\/(?<formulaId>[^/]+)(?:\/(?<action>publish))?$/);

  if (!match?.groups?.formulaId) {
    return null;
  }

  try {
    return {
      formulaId: decodeURIComponent(match.groups.formulaId),
      action: match.groups.action ?? "detail"
    };
  } catch {
    throw new RequestError("invalid_formula_id", "Formula id must be URL encoded correctly.");
  }
}

function parseAdminExperienceActionPath(pathname) {
  const match = pathname.match(/^\/(?:api\/)?admin\/experiences\/(?<experienceId>[^/]+)\/review$/);

  if (!match?.groups?.experienceId) {
    return null;
  }

  try {
    return decodeURIComponent(match.groups.experienceId);
  } catch {
    throw new RequestError("invalid_experience_id", "Experience id must be URL encoded correctly.");
  }
}

function parseAdminVerificationActionPath(pathname) {
  const match = pathname.match(/^\/(?:api\/)?admin\/verifications\/(?<verificationId>[^/]+)\/review$/);

  if (!match?.groups?.verificationId) {
    return null;
  }

  try {
    return decodeURIComponent(match.groups.verificationId);
  } catch {
    throw new RequestError("invalid_verification_id", "Verification id must be URL encoded correctly.");
  }
}

function parseAdminReportActionPath(pathname) {
  const match = pathname.match(/^\/(?:api\/)?admin\/reports\/(?<reportId>[^/]+)\/resolve$/);

  if (!match?.groups?.reportId) {
    return null;
  }

  try {
    return decodeURIComponent(match.groups.reportId);
  } catch {
    throw new RequestError("invalid_report_id", "Report id must be URL encoded correctly.");
  }
}

function parseFavoriteDetailPath(pathname) {
  const match = pathname.match(/^\/(?:api\/)?favorites\/(?<favoriteId>[^/]+)$/);

  if (!match?.groups?.favoriteId) {
    return null;
  }

  try {
    return decodeURIComponent(match.groups.favoriteId);
  } catch {
    throw new RequestError("invalid_favorite_id", "Favorite id must be URL encoded correctly.");
  }
}

function parseUsefulExperiencePath(pathname) {
  const match = pathname.match(/^\/(?:api\/)?experiences\/(?<experienceId>[^/]+)\/useful$/);

  if (!match?.groups?.experienceId) {
    return null;
  }

  try {
    return decodeURIComponent(match.groups.experienceId);
  } catch {
    throw new RequestError("invalid_experience_id", "Experience id must be URL encoded correctly.");
  }
}

function shouldSendSchoolDetailJson(request, url) {
  if (url.pathname.startsWith("/api/") || url.searchParams.get("format") === "json") {
    return true;
  }

  const accept = headerValue(request.headers, "accept") ?? "";

  if (accept.includes("text/html")) {
    return false;
  }

  return accept.length === 0 || accept.includes("*/*") || accept.includes("application/json");
}

function sessionTokenFromRequest(request, authService) {
  const authorization = headerValue(request.headers, "authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(?<token>.+)$/i)?.groups?.token;

  if (bearerToken) {
    return bearerToken;
  }

  const cookieHeader = headerValue(request.headers, "cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${authService.sessionCookieName}=`));

  return cookie ? decodeURIComponent(cookie.slice(authService.sessionCookieName.length + 1)) : "";
}

function currentUserFromRequest(request, authService) {
  const token = sessionTokenFromRequest(request, authService);
  return authService.getSession(token)?.user ?? null;
}

function requireActiveUser(request, response, authService, options = {}) {
  const user = currentUserFromRequest(request, authService);

  if (!user) {
    sendError(response, 401, "login_required", "Login is required for this action.");
    return null;
  }

  if (user.accountStatus !== "active") {
    sendError(response, 403, "account_restricted", "This account cannot perform restricted actions.", {
      accountStatus: user.accountStatus
    });
    return null;
  }

  if (options.roles && !options.roles.includes(user.role)) {
    sendError(response, 403, "forbidden", "This account does not have access to this API.");
    return null;
  }

  return user;
}

function requireOfficialGuideReviewer(request, response, authService) {
  return requireActiveUser(request, response, authService, {
    roles: officialGuideReviewerRoles
  });
}

function requireContentModerator(request, response, authService) {
  return requireActiveUser(request, response, authService, {
    roles: contentModeratorRoles
  });
}

function normalizedActionBody(body, allowedActions, label) {
  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (!allowedActions.has(action)) {
    throw new RequestError("invalid_review_action", `${label} action is not supported.`);
  }

  return {
    action,
    note: adminGuideNoteFromBody(body)
  };
}

function reportResolutionNoteFromBody(body) {
  const note = typeof body.resolutionNote === "string" && body.resolutionNote.trim().length > 0
    ? body.resolutionNote.trim()
    : adminGuideNoteFromBody(body);

  if (!note) {
    throw new RequestError("missing_resolution_note", "Resolution note is required.");
  }

  return note;
}

function reportResolutionFromBody(body) {
  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (!reportResolutionActions.has(action)) {
    throw new RequestError("invalid_resolution_action", "Report resolution action is not supported.");
  }

  return {
    action,
    note: reportResolutionNoteFromBody(body)
  };
}

function assertFavoriteTarget(body) {
  const targetType = typeof body.targetType === "string" ? body.targetType.trim() : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";

  if (!favoriteTargetTypes.has(targetType)) {
    throw new RequestError("invalid_favorite_target", "Favorites can target schools or experiences.");
  }

  if (!targetId) {
    throw new RequestError("invalid_favorite_target", "Favorite target id is required.");
  }

  if (targetType === "school" && !getSchoolById(targetId)) {
    throw new RequestError("favorite_target_not_found", "No published school was found for this favorite.", 404);
  }

  if (targetType === "experience" && !getExperienceById(targetId)) {
    throw new RequestError("favorite_target_not_found", "No published experience was found for this favorite.", 404);
  }

  return { targetType, targetId };
}

function normalizedReportText(value, label, options = {}) {
  const maxLength = options.maxLength ?? 2000;
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

  if (text.length === 0) {
    if (options.optional) {
      return null;
    }

    throw new RequestError("missing_report_field", `${label} is required.`);
  }

  if (text.length > maxLength) {
    throw new RequestError("report_field_too_long", `${label} must be ${maxLength} characters or fewer.`);
  }

  return text;
}

function assertReportTarget(body, authService) {
  const targetType = typeof body.targetType === "string" ? body.targetType.trim() : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";

  if (!reportTargetTypes.has(targetType)) {
    throw new RequestError("invalid_report_target", "Reports can target experiences or users.");
  }

  if (!targetId) {
    throw new RequestError("invalid_report_target", "Report target id is required.");
  }

  if (targetType === "experience" && !getExperienceById(targetId)) {
    throw new RequestError("report_target_not_found", "No published experience was found for this report.", 404);
  }

  if (targetType === "user" && typeof authService.getUserById === "function" && !authService.getUserById(targetId)) {
    throw new RequestError("report_target_not_found", "No user was found for this report.", 404);
  }

  return { targetType, targetId };
}

function assertReportBody(body, authService) {
  const target = assertReportTarget(body, authService);

  return {
    ...target,
    reason: normalizedReportText(body.reason, "Report reason", { maxLength: 120 }),
    description: normalizedReportText(body.description, "Report description", {
      maxLength: 2000,
      optional: true
    })
  };
}

function scalarBodyValue(value) {
  if (Array.isArray(value)) {
    return value.find((item) => String(item ?? "").trim().length > 0) ?? value[0];
  }

  return value;
}

function profileBoolean(value, label) {
  const rawValue = scalarBodyValue(value);

  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  const normalized = String(rawValue ?? "").trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new RequestError("invalid_profile", `${label} must be true or false.`);
}

function profileUpdateFromBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestError("invalid_profile", "Profile updates must be provided as an object.");
  }

  const profile = {};

  if (Object.hasOwn(body, "nickname")) {
    profile.nickname = scalarBodyValue(body.nickname);
  }

  if (Object.hasOwn(body, "grade")) {
    profile.grade = scalarBodyValue(body.grade);
  }

  if (Object.hasOwn(body, "defaultAnonymous")) {
    profile.defaultAnonymous = profileBoolean(body.defaultAnonymous, "Default anonymous preference");
  }

  return profile;
}

function calculateScoreFromBody(body) {
  return calculateScore({
    schoolId: body.schoolId,
    year: body.year,
    scores: body.scores
  });
}

function adminGuideNoteFromBody(body) {
  const note = typeof body.note === "string" ? body.note.trim() : "";
  return note.length > 0 ? note : undefined;
}

function runAdminGuideAction({ action, guideId, body, user, now }) {
  const input = {
    guideId,
    operator: user,
    now,
    note: adminGuideNoteFromBody(body)
  };

  if (action === "submit-review") {
    return {
      status: "pending_review",
      guide: submitAdminGuideReview(input)
    };
  }

  if (action === "publish") {
    return {
      status: "published",
      guide: publishAdminGuide(input)
    };
  }

  if (action === "archive") {
    return {
      status: "archived",
      guide: archiveAdminGuide(input)
    };
  }

  if (action === "return") {
    return {
      status: "returned",
      guide: returnAdminGuide(input)
    };
  }

  if (action === "pending-supplement" || action === "mark-pending-supplement") {
    return {
      status: "pending_supplement",
      guide: markAdminGuidePendingSupplement(input)
    };
  }

  throw new RequestError("invalid_admin_guide_action", "Admin guide action is not supported.", 404);
}

function applyReportResolutionSideEffect({ report, action, authService }) {
  if (action === "hide" && report.targetType === "experience") {
    return moderatePublishedExperience({
      experienceId: report.targetId,
      action: "hidden"
    });
  }

  if (action === "delete" && report.targetType === "experience") {
    return moderatePublishedExperience({
      experienceId: report.targetId,
      action: "deleted"
    });
  }

  if (
    action === "limit_account" &&
    report.targetType === "user" &&
    typeof authService.updateUserAccountStatus === "function"
  ) {
    return authService.updateUserAccountStatus(report.targetId, "limited");
  }

  return null;
}

async function sendPublicAsset(requestPath, response) {
  const normalizedPath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const assetPath = join(publicDir, normalizedPath);
  const assetStats = await stat(assetPath).catch(() => null);

  if (!assetStats?.isFile()) {
    return false;
  }

  response.writeHead(200, {
    "content-type": contentTypes.get(extname(assetPath)) ?? "application/octet-stream",
    "cache-control": "public, max-age=300"
  });
  createReadStream(assetPath).pipe(response);
  return true;
}

export async function handleRequest(request, response, context = {}) {
  const authService = context.authService ?? defaultAuthService;
  const experienceSubmissionStore = context.experienceSubmissionStore ?? defaultExperienceSubmissionStore;
  const interactionStore = context.interactionStore ?? defaultInteractionStore;
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/api/auth/otp" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const result = await authService.requestPhoneOtp({ phoneNumber: body.phoneNumber });
      sendJson(response, 200, result);
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "auth_error", error.message);
    }

    return;
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const result = await authService.loginWithPhoneOtp({
        phoneNumber: body.phoneNumber,
        otpCode: body.otpCode,
        profile: {
          nickname: body.nickname,
          grade: body.grade,
          defaultAnonymous: body.defaultAnonymous
        }
      });

      sendJson(response, 200, {
        user: result.user,
        session: { expiresAt: result.session.expiresAt }
      }, {
        "set-cookie": authService.serializeSessionCookie(result.session)
      });
    } catch (error) {
      const statusCode = error instanceof AuthError || error instanceof RequestError ? errorStatus(error) : 500;
      sendError(response, statusCode, error.code ?? "auth_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/me" || url.pathname === "/api/me") && request.method === "GET") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    const personalCenter = buildPersonalCenterResult({
      user,
      interactionStore,
      experienceSubmissionStore,
      now: context.now
    });

    if (shouldSendPersonalCenterJson(request, url)) {
      sendJson(response, 200, personalCenter);
      return;
    }

    sendHtml(response, 200, renderPersonalCenterPage({ personalCenter }));
    return;
  }

  if ((url.pathname === "/me/favorites" || url.pathname === "/api/me/favorites") && request.method === "GET") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    const favorites = buildFavoriteGroups(user, interactionStore);

    sendJson(response, 200, {
      count: favorites.count,
      favorites
    });
    return;
  }

  if ((url.pathname === "/me/experiences" || url.pathname === "/api/me/experiences") && request.method === "GET") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    const experiences = listPersonalSubmissions(user, experienceSubmissionStore);

    sendJson(response, 200, {
      count: experiences.length,
      experiences,
      statusLabels: submissionStatusLabels
    });
    return;
  }

  if (
    (
      url.pathname === "/me" ||
      url.pathname === "/api/me" ||
      url.pathname === "/me/preferences" ||
      url.pathname === "/api/me/preferences"
    ) &&
    (request.method === "PATCH" || request.method === "POST")
  ) {
    let user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const body = await readStructuredBody(request);
      user = authService.updateUserProfile(user.id, profileUpdateFromBody(body));
      const personalCenter = buildPersonalCenterResult({
        user,
        interactionStore,
        experienceSubmissionStore,
        now: context.now
      });

      if (shouldSendPersonalCenterJson(request, url)) {
        sendJson(response, 200, personalCenter);
        return;
      }

      sendHtml(response, 200, renderPersonalCenterPage({
        personalCenter,
        notice: "Preferences updated"
      }));
    } catch (error) {
      if (!shouldSendPersonalCenterJson(request, url)) {
        const personalCenter = buildPersonalCenterResult({
          user,
          interactionStore,
          experienceSubmissionStore,
          now: context.now
        });

        sendHtml(response, errorStatus(error), renderPersonalCenterPage({
          personalCenter,
          error: error.message
        }));
        return;
      }

      const statusCode = error instanceof AuthError || error instanceof RequestError ? errorStatus(error) : 500;
      sendError(response, statusCode, error.code ?? "profile_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/admin/guides" || url.pathname === "/api/admin/guides") && request.method === "GET") {
    const user = requireOfficialGuideReviewer(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const filters = parseAdminGuideFilters(url);

      if (shouldSendAdminJson(request, url)) {
        sendAdminGuideReviewListJson(response, filters);
        return;
      }

      sendHtml(response, 200, renderAdminGuideReviewPage({
        filters,
        reviews: listAdminGuideReviews(filters),
        user
      }));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_guide_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/admin/guides" || url.pathname === "/api/admin/guides") && request.method === "POST") {
    const user = requireOfficialGuideReviewer(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const body = await readStructuredBody(request);
      const result = createAdminGuideDraft({
        body,
        operator: user,
        now: context.now
      });
      const detail = getAdminGuideReviewDetail({ guideId: result.guide.id });

      sendJson(response, 201, {
        status: "draft",
        guide: adminGuideJson(detail)
      });
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_guide_error", error.message);
    }

    return;
  }

  let adminGuideActionPath;

  try {
    adminGuideActionPath = parseAdminGuideActionPath(url.pathname);
  } catch (error) {
    sendError(response, errorStatus(error), error.code ?? "admin_guide_error", error.message);
    return;
  }

  if (adminGuideActionPath && request.method === "GET") {
    const user = requireOfficialGuideReviewer(request, response, authService);

    if (!user) {
      return;
    }

    const detail = getAdminGuideReviewDetail({ guideId: adminGuideActionPath.guideId });

    if (!detail) {
      sendError(response, 404, "not_found", "No guide was found for admin review.");
      return;
    }

    sendJson(response, 200, adminGuideJson(detail));
    return;
  }

  if (adminGuideActionPath && request.method === "POST") {
    const user = requireOfficialGuideReviewer(request, response, authService);

    if (!user) {
      return;
    }

    if (adminGuideActionPath.action === "detail") {
      sendError(response, 405, "method_not_allowed", "Admin guide detail does not support POST without an action.");
      return;
    }

    try {
      const body = await readJsonBody(request);
      const actionResult = runAdminGuideAction({
        action: adminGuideActionPath.action,
        guideId: adminGuideActionPath.guideId,
        body,
        user,
        now: context.now
      });
      const detail = getAdminGuideReviewDetail({ guideId: actionResult.guide.id });

      sendJson(response, 200, {
        status: actionResult.status,
        guide: adminGuideJson(detail)
      });
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_guide_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/admin/timeline" || url.pathname === "/api/admin/timeline") && request.method === "GET") {
    const user = requireOfficialGuideReviewer(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const filters = parseAdminTimelineFilters(url);

      if (shouldSendAdminJson(request, url)) {
        sendAdminTimelineListJson(response, filters);
        return;
      }

      sendHtml(response, 200, renderAdminTimelineManagementPage({
        filters,
        timelineNodes: listAdminTimelineNodes(filters),
        user
      }));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_timeline_error", error.message);
    }

    return;
  }

  if (
    (url.pathname === "/admin/timeline/overrides" || url.pathname === "/api/admin/timeline/overrides") &&
    request.method === "POST"
  ) {
    const user = requireOfficialGuideReviewer(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const body = await readStructuredBody(request);
      const node = overrideAdminTimelineNode({
        body,
        operator: user,
        now: context.now
      });

      sendJson(response, 200, {
        status: "overridden",
        timelineNode: adminTimelineNodeJson(node)
      });
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_timeline_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/admin/formulas" || url.pathname === "/api/admin/formulas") && request.method === "GET") {
    const user = requireOfficialGuideReviewer(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const filters = parseAdminFormulaFilters(url);

      if (shouldSendAdminJson(request, url)) {
        sendAdminFormulaListJson(response, filters);
        return;
      }

      sendHtml(response, 200, renderAdminFormulaManagementPage({
        filters,
        formulas: listAdminFormulas(filters),
        user
      }));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_formula_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/admin/formulas" || url.pathname === "/api/admin/formulas") && request.method === "POST") {
    const user = requireOfficialGuideReviewer(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const body = await readStructuredBody(request);
      const result = upsertAdminFormulaDraft({
        body,
        operator: user,
        now: context.now
      });

      sendJson(response, result.created ? 201 : 200, {
        status: result.created ? "draft_created" : "draft_updated",
        formula: adminFormulaJson(result)
      });
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_formula_error", error.message);
    }

    return;
  }

  let adminFormulaActionPath;

  try {
    adminFormulaActionPath = parseAdminFormulaActionPath(url.pathname);
  } catch (error) {
    sendError(response, errorStatus(error), error.code ?? "admin_formula_error", error.message);
    return;
  }

  if (adminFormulaActionPath && request.method === "GET") {
    const user = requireOfficialGuideReviewer(request, response, authService);

    if (!user) {
      return;
    }

    const detail = getAdminFormulaDetail({ formulaId: adminFormulaActionPath.formulaId });

    if (!detail) {
      sendError(response, 404, "not_found", "No formula was found for admin management.");
      return;
    }

    sendJson(response, 200, adminFormulaJson(detail));
    return;
  }

  if (adminFormulaActionPath && request.method === "POST") {
    const user = requireOfficialGuideReviewer(request, response, authService);

    if (!user) {
      return;
    }

    if (adminFormulaActionPath.action !== "publish") {
      sendError(response, 405, "method_not_allowed", "Admin formula detail does not support POST without an action.");
      return;
    }

    try {
      const body = await readStructuredBody(request);
      const result = publishAdminFormula({
        formulaId: adminFormulaActionPath.formulaId,
        operator: user,
        now: context.now,
        note: adminGuideNoteFromBody(body)
      });

      sendJson(response, 200, {
        status: "published",
        formula: adminFormulaJson(result)
      });
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_formula_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/admin/experiences" || url.pathname === "/api/admin/experiences") && request.method === "GET") {
    const user = requireContentModerator(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const filters = parseAdminExperienceFilters(url);

      if (shouldSendAdminJson(request, url)) {
        sendAdminExperienceModerationListJson(response, experienceSubmissionStore, filters);
        return;
      }

      sendHtml(response, 200, renderAdminExperienceModerationPage({
        filters,
        experiences: experienceSubmissionStore.listModerationExperiences(filters).map(adminExperienceJson),
        user
      }));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_experience_error", error.message);
    }

    return;
  }

  let adminExperienceReviewId;

  try {
    adminExperienceReviewId = parseAdminExperienceActionPath(url.pathname);
  } catch (error) {
    sendError(response, errorStatus(error), error.code ?? "admin_experience_error", error.message);
    return;
  }

  if (adminExperienceReviewId && request.method === "POST") {
    const user = requireContentModerator(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const body = await readStructuredBody(request);
      const review = normalizedActionBody(body, moderationReviewActions, "Experience review");
      const experience = experienceSubmissionStore.reviewExperience({
        experienceId: adminExperienceReviewId,
        action: review.action,
        operator: user,
        note: review.note
      });

      sendJson(response, 200, {
        status: experience.status,
        experience: adminExperienceJson(experience)
      });
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_experience_error", error.message, {
        moderation: error.moderation
      });
    }

    return;
  }

  if ((url.pathname === "/admin/verifications" || url.pathname === "/api/admin/verifications") && request.method === "GET") {
    const user = requireContentModerator(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const filters = parseAdminVerificationFilters(url);

      if (shouldSendAdminJson(request, url)) {
        sendAdminVerificationListJson(response, experienceSubmissionStore, filters);
        return;
      }

      sendHtml(response, 200, renderAdminVerificationReviewPage({
        filters,
        verifications: experienceSubmissionStore.listVerificationReviews(filters).map(adminVerificationJson),
        user
      }));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_verification_error", error.message);
    }

    return;
  }

  let adminVerificationReviewId;

  try {
    adminVerificationReviewId = parseAdminVerificationActionPath(url.pathname);
  } catch (error) {
    sendError(response, errorStatus(error), error.code ?? "admin_verification_error", error.message);
    return;
  }

  if (adminVerificationReviewId && request.method === "POST") {
    const user = requireContentModerator(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const body = await readStructuredBody(request);
      const review = normalizedActionBody(body, verificationReviewActions, "Verification review");
      const result = experienceSubmissionStore.reviewVerification({
        verificationId: adminVerificationReviewId,
        action: review.action,
        operator: user,
        note: review.note
      });

      sendJson(response, 200, {
        status: result.material.status,
        verification: adminVerificationJson(result)
      });
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_verification_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/admin/reports" || url.pathname === "/api/admin/reports") && request.method === "GET") {
    const user = requireContentModerator(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const filters = parseAdminReportFilters(url);

      if (shouldSendAdminJson(request, url)) {
        sendAdminReportListJson(response, interactionStore, authService, filters);
        return;
      }

      sendHtml(response, 200, renderAdminReportReviewPage({
        filters,
        reports: interactionStore.listReports(filters).map((report) => adminReportJson(report, authService)),
        user
      }));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_report_error", error.message);
    }

    return;
  }

  let adminReportResolveId;

  try {
    adminReportResolveId = parseAdminReportActionPath(url.pathname);
  } catch (error) {
    sendError(response, errorStatus(error), error.code ?? "admin_report_error", error.message);
    return;
  }

  if (adminReportResolveId && request.method === "POST") {
    const user = requireContentModerator(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const body = await readStructuredBody(request);
      const resolution = reportResolutionFromBody(body);
      const report = interactionStore.getReport(adminReportResolveId);

      if (!report) {
        sendError(response, 404, "report_not_found", "No report was found for review.");
        return;
      }

      const sideEffect = applyReportResolutionSideEffect({
        report,
        action: resolution.action,
        authService
      });
      const resolvedReport = interactionStore.resolveReport({
        reportId: adminReportResolveId,
        action: resolution.action,
        resolutionNote: resolution.note,
        operator: user
      });

      sendJson(response, 200, {
        status: "resolved",
        report: adminReportJson(resolvedReport, authService),
        sideEffect
      });
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "admin_report_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/score/calculate" || url.pathname === "/api/score/calculate") && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      sendJson(response, 200, calculateScoreFromBody(body));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "score_calculation_error", error.message);
    }

    return;
  }

  if (url.pathname === "/calculator" && request.method === "GET") {
    try {
      sendHtml(response, 200, renderScoreCalculatorPage(parseCalculatorFilters(url)));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "calculator_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/experiences" || url.pathname === "/api/experiences") && request.method === "GET") {
    try {
      const filters = parseExperienceFilters(url);

      if (shouldSendExperienceListJson(request, url)) {
        sendExperienceListJson(response, filters);
        return;
      }

      sendHtml(response, 200, renderExperienceListPage(filters));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "experience_list_error", error.message);
    }

    return;
  }

  if (url.pathname === "/experiences/new" && request.method === "GET") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    sendHtml(response, 200, renderExperienceSubmissionPage({ user }));
    return;
  }

  if ((url.pathname === "/experiences" || url.pathname === "/api/experiences") && request.method === "POST") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const body = await readStructuredBody(request);
      const experience = experienceSubmissionStore.submitExperience({ user, body });

      if (shouldSendExperienceSubmissionJson(request, url)) {
        sendJson(response, 201, {
          status: "pending_review",
          experience
        });
        return;
      }

      sendHtml(response, 201, renderExperienceSubmissionPage({ user, submission: experience }));
    } catch (error) {
      if (!shouldSendExperienceSubmissionJson(request, url)) {
        sendHtml(response, errorStatus(error), renderExperienceSubmissionPage({
          user,
          error: error.message
        }));
        return;
      }

      sendError(response, errorStatus(error), error.code ?? "experience_submission_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/favorites" || url.pathname === "/api/favorites") && request.method === "POST") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const body = await readJsonBody(request);
      const target = assertFavoriteTarget(body);
      const result = interactionStore.addFavorite({
        userId: user.id,
        targetType: target.targetType,
        targetId: target.targetId
      });

      sendJson(response, result.created ? 201 : 200, {
        status: result.created ? "favorited" : "already_favorited",
        favorite: favoriteJson(result.favorite)
      });
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "favorite_error", error.message);
    }

    return;
  }

  let favoriteId;

  try {
    favoriteId = parseFavoriteDetailPath(url.pathname);
  } catch (error) {
    sendError(response, errorStatus(error), error.code ?? "favorite_error", error.message);
    return;
  }

  if (favoriteId && request.method === "DELETE") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    const favorite = interactionStore.removeFavorite({ userId: user.id, favoriteId });

    if (!favorite) {
      sendError(response, 404, "favorite_not_found", "No favorite was found for this user.");
      return;
    }

    sendJson(response, 200, {
      status: "unfavorited",
      favorite: favoriteJson(favorite)
    });
    return;
  }

  let usefulExperienceId;

  try {
    usefulExperienceId = parseUsefulExperiencePath(url.pathname);
  } catch (error) {
    sendError(response, errorStatus(error), error.code ?? "useful_vote_error", error.message);
    return;
  }

  if (usefulExperienceId && request.method === "POST") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    const experience = getExperienceById(usefulExperienceId);

    if (!experience) {
      sendError(response, 404, "experience_not_found", "No published experience was found.");
      return;
    }

    const result = interactionStore.markExperienceUseful({
      userId: user.id,
      experienceId: experience.id
    });
    const usefulCount = experience.usefulCount + result.voteCount;

    if (!result.created) {
      sendError(response, 409, "duplicate_useful_vote", "This experience was already marked useful by this user.", {
        usefulCount
      });
      return;
    }

    sendJson(response, 201, {
      status: "marked_useful",
      experienceId: experience.id,
      usefulCount,
      usefulVote: result.vote
    });
    return;
  }

  if ((url.pathname === "/reports" || url.pathname === "/api/reports") && request.method === "POST") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    try {
      const body = await readJsonBody(request);
      const reportBody = assertReportBody(body, authService);
      const report = interactionStore.createReport({
        reporterId: user.id,
        targetType: reportBody.targetType,
        targetId: reportBody.targetId,
        reason: reportBody.reason,
        description: reportBody.description
      });

      sendJson(response, 201, {
        status: "pending",
        report
      });
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "report_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/timeline" || url.pathname === "/api/timeline") && request.method === "GET") {
    try {
      const filters = parseTimelineFilters(url);
      const user = filters.mine ? requireActiveUser(request, response, authService) : null;

      if (filters.mine && !user) {
        return;
      }

      const timeline = buildTimelineResult({
        filters,
        user,
        interactionStore,
        now: context.now
      });

      if (shouldSendTimelineJson(request, url)) {
        sendTimelineJson(response, timeline);
        return;
      }

      sendHtml(response, 200, renderTimelinePage(timeline));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "timeline_error", error.message);
    }

    return;
  }

  if ((url.pathname === "/guides" || url.pathname === "/api/guides") && request.method === "GET") {
    try {
      sendGuideListJson(response, parseGuideListFilters(url));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "guide_list_error", error.message);
    }

    return;
  }

  let guideId;

  try {
    guideId = parseGuideDetailPath(url.pathname);
  } catch (error) {
    sendError(response, errorStatus(error), error.code ?? "guide_detail_error", error.message);
    return;
  }

  if (guideId && request.method === "GET") {
    const detail = getGuideDetail({ guideId });

    if (!detail) {
      sendError(response, 404, "not_found", "No published admission guide was found.");
      return;
    }

    sendJson(response, 200, guideDetailJson(detail));
    return;
  }

  if ((url.pathname === "/schools" || url.pathname === "/api/schools") && request.method === "GET") {
    try {
      const filters = parseSchoolListFilters(url);

      if (shouldSendSchoolListJson(request, url)) {
        sendSchoolListJson(response, filters);
        return;
      }

      sendHtml(response, 200, renderSchoolListPage(filters));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "school_list_error", error.message);
    }

    return;
  }

  let schoolId;

  try {
    schoolId = parseSchoolDetailPath(url.pathname);
  } catch (error) {
    sendError(response, errorStatus(error), error.code ?? "school_detail_error", error.message);
    return;
  }

  if (schoolId && request.method === "GET") {
    try {
      const detail = getSchoolDetail({
        schoolId,
        year: optionalYearParam(url)
      });

      if (!detail) {
        if (shouldSendSchoolDetailJson(request, url)) {
          sendError(response, 404, "not_found", "No published school guide was found for this school and year.");
          return;
        }

        sendHtml(response, 404, renderNotFound());
        return;
      }

      if (shouldSendSchoolDetailJson(request, url)) {
        sendJson(response, 200, schoolDetailJson(detail));
        return;
      }

      sendHtml(response, 200, renderSchoolDetailPage(detail));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "school_detail_error", error.message);
    }

    return;
  }

  if (url.pathname.startsWith("/api/admin")) {
    const user = requireActiveUser(request, response, authService, {
      roles: ["content_reviewer", "data_reviewer", "admin"]
    });

    if (!user) {
      return;
    }

    sendJson(response, 200, { ok: true, user });
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "guangdong-comprehensive-evaluation",
      database: "postgresql"
    });
    return;
  }

  if (url.pathname === "/") {
    sendHtml(response, 200, renderStudentHome());
    return;
  }

  if (url.pathname === "/admin") {
    const user = requireActiveUser(request, response, authService, {
      roles: ["content_reviewer", "data_reviewer", "admin"]
    });

    if (!user) {
      return;
    }

    sendHtml(response, 200, renderAdminPage({ user }));
    return;
  }

  if (await sendPublicAsset(url.pathname, response)) {
    return;
  }

  sendHtml(response, 404, renderNotFound());
}
