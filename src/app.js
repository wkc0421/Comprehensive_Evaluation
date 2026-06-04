import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { AuthError, authService as defaultAuthService } from "./auth.js";
import {
  buildSiteTimelineReminders,
  calculateScore,
  getExperienceById,
  getGuideDetail,
  getSchoolById,
  getSchoolDetail,
  listGuides,
  listExperiences,
  listSchoolGuideCards,
  listTimelineNodes
} from "./db/data-access.js";
import {
  experienceSubmissionStore as defaultExperienceSubmissionStore
} from "./experience-submissions.js";
import { interactionStore as defaultInteractionStore } from "./interactions.js";
import {
  renderAdminPage,
  renderExperienceListPage,
  renderExperienceSubmissionPage,
  renderNotFound,
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
    "Experience submissions must use JSON or URL-encoded form data.",
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

function calculateScoreFromBody(body) {
  return calculateScore({
    schoolId: body.schoolId,
    year: body.year,
    scores: body.scores
  });
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

  if (url.pathname === "/api/me" && request.method === "GET") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    sendJson(response, 200, { user });
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
    sendHtml(response, 200, renderAdminPage());
    return;
  }

  if (await sendPublicAsset(url.pathname, response)) {
    return;
  }

  sendHtml(response, 404, renderNotFound());
}
