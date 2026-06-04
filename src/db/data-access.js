import { randomUUID } from "node:crypto";

import { seedData } from "./seed-data.js";

const publishedStatus = "published";
const reviewQueueStatuses = new Set(["draft", "pending_review"]);
const officialDataStatuses = new Set(["draft", "pending_review", "published", "archived"]);
const formulaDraftStatuses = new Set(["draft", "pending_review"]);
const formulaTypes = new Set(["weighted_sum", "custom"]);
const guideSourceTypes = new Set([
  "official_notice",
  "admission_guide",
  "application_portal",
  "education_exam_authority",
  "manual_upload"
]);
const dueSoonWindowMs = 7 * 24 * 60 * 60 * 1000;
const sampleScoreTolerance = 0.01;
let admissionGuideRecords = seedData.admissionGuides.map(cloneAdmissionGuide);
let timelineEventRecords = seedData.timelineEvents.map(cloneTimelineEvent);
let scoreFormulaRecords = seedData.scoreFormulas.map(cloneScoreFormula);

export const timelineEventDefinitions = Object.freeze([
  { eventKey: "guide_publication", title: "Guide published", dateField: "publishedAt" },
  { eventKey: "application_start", title: "Application opens", dateField: "applicationStartAt" },
  { eventKey: "application_deadline", title: "Application deadline", dateField: "applicationDeadlineAt" },
  { eventKey: "preliminary_review_result", title: "Preliminary review result", dateField: null },
  { eventKey: "confirmation_or_payment", title: "Confirmation or payment", dateField: null },
  { eventKey: "school_assessment", title: "School assessment", dateField: null },
  { eventKey: "shortlist_publication", title: "Shortlist publication", dateField: null },
  { eventKey: "volunteer_application", title: "Volunteer application", dateField: null },
  { eventKey: "admission_publication", title: "Admission publication", dateField: null }
]);
const timelineEventDefinitionOrder = new Map(
  timelineEventDefinitions.map((definition, index) => [definition.eventKey, index])
);

/**
 * @typedef {object} SchoolFilters
 * @property {number} [year]
 * @property {string} [keyword]
 *
 * @typedef {object} GuideFilters
 * @property {string} [schoolId]
 * @property {number} [year]
 * @property {string} [status]
 * @property {string} [keyword]
 *
 * @typedef {object} SchoolGuideCardFilters
 * @property {number} [year]
 * @property {string} [status]
 * @property {string} [keyword]
 * @property {string} [applicationStatus]
 * @property {string} [schoolType]
 * @property {"deadline" | "updated" | "name"} [sort]
 *
 * @typedef {object} SchoolDetailFilters
 * @property {string} schoolId
 * @property {number} [year]
 * @property {number} [currentYear]
 *
 * @typedef {object} TimelineFilters
 * @property {string} [admissionGuideId]
 * @property {string} [schoolId]
 * @property {ReadonlyArray<string>} [schoolIds]
 * @property {number} [year]
 * @property {string} [eventKey]
 * @property {Date | string | number} [referenceDate]
 *
 * @typedef {"not_started" | "active" | "due_soon" | "ended"} TimelineNodeStatus
 *
 * @typedef {object} ExperienceFilters
 * @property {string} [schoolId]
 * @property {number} [year]
 * @property {string} [stage]
 * @property {string} [assessmentType]
 * @property {boolean} [verified]
 * @property {"newest" | "useful" | "useful_count" | "verified" | "verified_first"} [sort]
 */

export class ScoreCalculationError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "ScoreCalculationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AdminGuideReviewError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "AdminGuideReviewError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AdminTimelineReviewError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "AdminTimelineReviewError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AdminFormulaReviewError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "AdminFormulaReviewError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function isPublished(record) {
  return record.status === publishedStatus;
}

function compareSchoolNames(left, right) {
  return left.name.localeCompare(right.name, "en");
}

function compareGuideRecency(left, right) {
  if (right.admissionYear !== left.admissionYear) {
    return right.admissionYear - left.admissionYear;
  }

  if (right.version !== left.version) {
    return right.version - left.version;
  }

  const leftSchool = getPublishedSchoolById(left.schoolId);
  const rightSchool = getPublishedSchoolById(right.schoolId);

  return (leftSchool?.name ?? "").localeCompare(rightSchool?.name ?? "", "en");
}

function compareEventTime(left, right) {
  const leftTime = left.startsAt ?? left.endsAt ?? "";
  const rightTime = right.startsAt ?? right.endsAt ?? "";

  if (leftTime !== rightTime) {
    return leftTime.localeCompare(rightTime);
  }

  return left.title.localeCompare(right.title, "en");
}

function compareExperienceRecency(left, right) {
  if (right.createdAt !== left.createdAt) {
    return right.createdAt.localeCompare(left.createdAt);
  }

  return right.usefulCount - left.usefulCount;
}

function compareExperienceUsefulCount(left, right) {
  if (right.usefulCount !== left.usefulCount) {
    return right.usefulCount - left.usefulCount;
  }

  return compareExperienceRecency(left, right);
}

function compareExperienceVerifiedFirst(left, right) {
  const verifiedDifference =
    Number(right.verificationStatus === "verified") - Number(left.verificationStatus === "verified");

  if (verifiedDifference !== 0) {
    return verifiedDifference;
  }

  return compareExperienceRecency(left, right);
}

function compareFeaturedExperiences(left, right, schoolId, year) {
  const sameSchoolDifference =
    Number(right.schoolId === schoolId) - Number(left.schoolId === schoolId);

  if (sameSchoolDifference !== 0) {
    return sameSchoolDifference;
  }

  const recentDifference =
    Number(isRecentExperience(right, year)) - Number(isRecentExperience(left, year));

  if (recentDifference !== 0) {
    return recentDifference;
  }

  const verifiedDifference =
    Number(right.verificationStatus === "verified") - Number(left.verificationStatus === "verified");

  if (verifiedDifference !== 0) {
    return verifiedDifference;
  }

  if (right.usefulCount !== left.usefulCount) {
    return right.usefulCount - left.usefulCount;
  }

  return compareExperienceRecency(left, right);
}

function compareSchoolCardNames(left, right) {
  const schoolDifference = compareSchoolNames(left.school, right.school);

  if (schoolDifference !== 0) {
    return schoolDifference;
  }

  return right.guide.admissionYear - left.guide.admissionYear;
}

function timestampFor(value, fallback) {
  const timestamp = Date.parse(value ?? "");
  return Number.isNaN(timestamp) ? fallback : timestamp;
}

function nullableTimestamp(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isNaN(timestamp) ? null : timestamp;
}

function referenceTimestamp(referenceDate) {
  if (referenceDate instanceof Date) {
    return referenceDate.getTime();
  }

  if (typeof referenceDate === "number") {
    return referenceDate;
  }

  if (typeof referenceDate === "string") {
    const timestamp = Date.parse(referenceDate);
    return Number.isNaN(timestamp) ? Date.now() : timestamp;
  }

  return Date.now();
}

function eventDefinitionIndex(eventKey) {
  return timelineEventDefinitionOrder.get(eventKey) ?? Number.MAX_SAFE_INTEGER;
}

function compareTimelineNodes(left, right) {
  const dateDifference =
    timestampFor(left.endsAt ?? left.startsAt, Number.MAX_SAFE_INTEGER) -
    timestampFor(right.endsAt ?? right.startsAt, Number.MAX_SAFE_INTEGER);

  if (dateDifference !== 0) {
    return dateDifference;
  }

  if (right.guide.admissionYear !== left.guide.admissionYear) {
    return right.guide.admissionYear - left.guide.admissionYear;
  }

  const schoolDifference = compareSchoolNames(left.school, right.school);

  if (schoolDifference !== 0) {
    return schoolDifference;
  }

  return eventDefinitionIndex(left.eventKey) - eventDefinitionIndex(right.eventKey);
}

function timelineDatesFor(definition, guide, explicitEvent) {
  if (explicitEvent) {
    return {
      startsAt: explicitEvent.startsAt,
      endsAt: explicitEvent.endsAt
    };
  }

  if (!definition.dateField) {
    return {
      startsAt: null,
      endsAt: null
    };
  }

  const dateValue = guide[definition.dateField] ?? null;

  return {
    startsAt: dateValue,
    endsAt: dateValue
  };
}

function compareSchoolCardsByDeadline(left, right) {
  const deadlineDifference =
    timestampFor(left.guide.applicationDeadlineAt, Number.MAX_SAFE_INTEGER) -
    timestampFor(right.guide.applicationDeadlineAt, Number.MAX_SAFE_INTEGER);

  if (deadlineDifference !== 0) {
    return deadlineDifference;
  }

  return compareSchoolCardNames(left, right);
}

function compareSchoolCardsByUpdateTime(left, right) {
  const updateDifference =
    timestampFor(right.guide.updatedAt, 0) - timestampFor(left.guide.updatedAt, 0);

  if (updateDifference !== 0) {
    return updateDifference;
  }

  return compareSchoolCardNames(left, right);
}

function normalizeKeyword(keyword) {
  return typeof keyword === "string" ? keyword.trim().toLowerCase() : "";
}

function normalizeFilterValue(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function cloneAdmissionGuide(guide) {
  return {
    ...guide,
    majors: Array.isArray(guide.majors)
      ? guide.majors.map((major) => ({ ...major }))
      : [],
    subjectRequirements: Array.isArray(guide.subjectRequirements)
      ? [...guide.subjectRequirements]
      : [],
    fees: guide.fees ? { ...guide.fees } : {},
    contact: guide.contact ? { ...guide.contact } : {},
    reviewAudit: Array.isArray(guide.reviewAudit)
      ? guide.reviewAudit.map((entry) => ({ ...entry }))
      : [],
    supplementStatus: guide.supplementStatus ?? null,
    reviewStatus: guide.reviewStatus ?? guide.status
  };
}

function cloneTimelineEvent(event) {
  return {
    ...event,
    description: event.description ?? "",
    overrideReason: event.overrideReason ?? null,
    updatedAt: event.updatedAt ?? null,
    reviewAudit: Array.isArray(event.reviewAudit)
      ? event.reviewAudit.map((entry) => ({ ...entry }))
      : []
  };
}

function cloneFormulaConfig(config) {
  return {
    ...config,
    inputs: Array.isArray(config?.inputs)
      ? config.inputs.map((input) => ({ ...input }))
      : [],
    customConfig: config?.customConfig && typeof config.customConfig === "object"
      ? { ...config.customConfig }
      : undefined
  };
}

function cloneScoreFormula(formula) {
  return {
    ...formula,
    formulaConfig: cloneFormulaConfig(formula.formulaConfig),
    sampleTests: Array.isArray(formula.sampleTests)
      ? formula.sampleTests.map((sample) => ({
          ...sample,
          scores: sample.scores && typeof sample.scores === "object" ? { ...sample.scores } : {}
        }))
      : [],
    publishedAt: formula.publishedAt ?? null,
    updatedAt: formula.updatedAt ?? null,
    reviewAudit: Array.isArray(formula.reviewAudit)
      ? formula.reviewAudit.map((entry) => ({ ...entry }))
      : []
  };
}

function admissionGuides() {
  return admissionGuideRecords;
}

function timelineEvents() {
  return timelineEventRecords;
}

function scoreFormulas() {
  return scoreFormulaRecords;
}

function currentIsoDate(now) {
  if (typeof now !== "function") {
    return new Date().toISOString();
  }

  const value = now();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function normalizeAdminText(value, label, options = {}) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

  if (text.length === 0) {
    if (options.optional) {
      return options.fallback ?? null;
    }

    throw new AdminGuideReviewError("missing_guide_field", `${label} is required.`);
  }

  if (text.length > (options.maxLength ?? 4000)) {
    throw new AdminGuideReviewError("guide_field_too_long", `${label} is too long.`);
  }

  return text;
}

function normalizeAdminDate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    throw new AdminGuideReviewError("invalid_guide_date", "Guide date fields must be valid dates.");
  }

  return new Date(timestamp).toISOString();
}

function normalizeAdminYear(value) {
  const year = Number(value);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AdminGuideReviewError("invalid_guide_year", "Admission year must be a four-digit year.");
  }

  return year;
}

function normalizeAdminArray(value, label) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  throw new AdminGuideReviewError("invalid_guide_field", `${label} must be a list.`);
}

function normalizeAdminMajors(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new AdminGuideReviewError("invalid_guide_field", "Majors must be a list.");
  }

  return value
    .map((major) => {
      if (!major || typeof major !== "object" || Array.isArray(major)) {
        throw new AdminGuideReviewError("invalid_guide_field", "Each major must be an object.");
      }

      return {
        name: normalizeAdminText(major.name, "Major name"),
        track: normalizeAdminText(major.track, "Major track", {
          optional: true,
          fallback: "official not specified"
        })
      };
    });
}

function normalizeAdminObject(value, label) {
  if (value === undefined || value === null || value === "") {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new AdminGuideReviewError("invalid_guide_field", `${label} must be an object.`);
  }

  return { ...value };
}

function normalizeSourceType(value) {
  const sourceType = normalizeAdminText(value ?? "manual_upload", "Source type");

  if (!guideSourceTypes.has(sourceType)) {
    throw new AdminGuideReviewError("invalid_source_type", "Guide source type is not supported.");
  }

  return sourceType;
}

function assertOfficialStatus(status) {
  if (!officialDataStatuses.has(status)) {
    throw new AdminGuideReviewError("invalid_guide_status", "Guide status is not supported.");
  }
}

function assertPublishedSchoolForAdmin(schoolId) {
  const school = getPublishedSchoolById(schoolId);

  if (!school) {
    throw new AdminGuideReviewError("school_not_found", "A published school is required for guide review.", 404);
  }

  return school;
}

function requireAdminOperator(operator, ErrorClass, code) {
  if (!operator?.id || !operator?.nickname || !operator?.role) {
    throw new ErrorClass(code, "Operator identity is required for this admin action.", 403);
  }
}

function operatorAuditFields(operator) {
  return {
    operatorId: operator.id,
    operatorNickname: operator.nickname,
    operatorRole: operator.role
  };
}

function auditEntry({ operation, operator, operatedAt, note }) {
  return {
    operation,
    ...operatorAuditFields(operator),
    operatedAt,
    note: note ?? null
  };
}

function appendGuideAudit(guide, operation, operator, operatedAt, note) {
  return {
    ...guide,
    reviewAudit: [
      ...(guide.reviewAudit ?? []),
      auditEntry({ operation, operator, operatedAt, note })
    ]
  };
}

function appendTimelineAudit(event, operation, operator, operatedAt, note) {
  return {
    ...event,
    reviewAudit: [
      ...(event.reviewAudit ?? []),
      auditEntry({ operation, operator, operatedAt, note })
    ]
  };
}

function appendFormulaAudit(formula, operation, operator, operatedAt, note) {
  return {
    ...formula,
    reviewAudit: [
      ...(formula.reviewAudit ?? []),
      auditEntry({ operation, operator, operatedAt, note })
    ]
  };
}

function guideSeriesFor(guide, guides = admissionGuides()) {
  return guides.filter((candidate) => sameGuideSeries(candidate, guide));
}

function nextGuideVersion({ schoolId, admissionYear, provinceScope }) {
  const versions = admissionGuides()
    .filter((guide) => {
      return guide.schoolId === schoolId &&
        guide.admissionYear === admissionYear &&
        guide.provinceScope === provinceScope;
    })
    .map((guide) => guide.version);

  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
}

function nextFormulaVersion({ schoolId, admissionYear, provinceScope }) {
  const versions = scoreFormulas()
    .filter((formula) => {
      return formula.schoolId === schoolId &&
        formula.admissionYear === admissionYear &&
        formula.provinceScope === provinceScope;
    })
    .map((formula) => formula.version);

  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
}

function normalizedGuideDraft(body, operator, now) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AdminGuideReviewError("invalid_guide_body", "Guide draft payload must be an object.");
  }

  const structuredFields = body.structuredFields && typeof body.structuredFields === "object"
    ? body.structuredFields
    : body;
  const schoolId = normalizeAdminText(body.schoolId, "School id");
  const admissionYear = normalizeAdminYear(body.year ?? body.admissionYear);
  const provinceScope = "guangdong";
  const createdAt = currentIsoDate(now);

  assertPublishedSchoolForAdmin(schoolId);

  const guide = {
    id: body.id ? normalizeAdminText(body.id, "Guide id") : randomUUID(),
    schoolId,
    admissionYear,
    provinceScope,
    status: "draft",
    version: nextGuideVersion({ schoolId, admissionYear, provinceScope }),
    isCurrent: false,
    officialSourceUrl: normalizeAdminText(body.officialSourceUrl, "Official source URL"),
    sourceType: normalizeSourceType(body.sourceType),
    sourceTitle: normalizeAdminText(body.sourceTitle ?? body.guideTitle, "Source title"),
    sourcePublishedAt: normalizeAdminDate(body.sourcePublishedAt),
    sourceUpdatedAt: normalizeAdminDate(body.sourceUpdatedAt ?? body.updatedAt),
    applicationUrl: normalizeAdminText(structuredFields.applicationUrl, "Application URL", {
      optional: true,
      fallback: ""
    }),
    guideTitle: normalizeAdminText(body.guideTitle, "Guide title"),
    summary: normalizeAdminText(body.summary, "Guide summary"),
    applicationStatus: normalizeAdminText(structuredFields.applicationStatus ?? "open", "Application status"),
    applicationStartAt: normalizeAdminDate(structuredFields.applicationStartAt),
    applicationDeadlineAt: normalizeAdminDate(structuredFields.applicationDeadlineAt),
    majors: normalizeAdminMajors(structuredFields.majors),
    subjectRequirements: normalizeAdminArray(structuredFields.subjectRequirements, "Subject requirements"),
    academicTestRequirements: normalizeAdminText(
      structuredFields.academicTestRequirements,
      "Academic test requirements",
      { optional: true, fallback: "" }
    ),
    assessmentMethod: normalizeAdminText(structuredFields.assessmentMethod, "Assessment method", {
      optional: true,
      fallback: ""
    }),
    admissionRule: normalizeAdminText(structuredFields.admissionRule, "Admission rule", {
      optional: true,
      fallback: ""
    }),
    fees: normalizeAdminObject(structuredFields.fees, "Fees"),
    contact: normalizeAdminObject(structuredFields.contact, "Contact"),
    versionNotes: normalizeAdminText(body.versionNotes, "Version notes", {
      optional: true,
      fallback: "Draft created for official guide review."
    }),
    publishedAt: null,
    updatedAt: createdAt,
    reviewStatus: "draft",
    supplementStatus: null,
    reviewAudit: []
  };

  return appendGuideAudit(guide, "create_draft", operator, createdAt, body.note);
}

function normalizeTimelineText(value, label, options = {}) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

  if (text.length === 0) {
    if (options.optional) {
      return options.fallback ?? "";
    }

    throw new AdminTimelineReviewError("missing_timeline_field", `${label} is required.`);
  }

  if (text.length > (options.maxLength ?? 2000)) {
    throw new AdminTimelineReviewError("timeline_field_too_long", `${label} is too long.`);
  }

  return text;
}

function normalizeOverrideReason(value) {
  const reason = normalizeTimelineText(value, "Override reason", {
    optional: true,
    fallback: ""
  });

  if (!reason) {
    throw new AdminTimelineReviewError("missing_override_reason", "Override reason is required.");
  }

  return reason;
}

function fieldWasProvided(body, fieldName) {
  return Object.hasOwn(body, fieldName);
}

function overrideDateValue(body, fieldName, fallback) {
  if (!fieldWasProvided(body, fieldName)) {
    return fallback;
  }

  return normalizeAdminDate(body[fieldName]);
}

function generatedTimelineDatesFor(definition, guide) {
  if (!definition.dateField) {
    return {
      startsAt: null,
      endsAt: null
    };
  }

  const dateValue = guide[definition.dateField] ?? null;

  return {
    startsAt: dateValue,
    endsAt: dateValue
  };
}

function generatedTimelineNodeFor(admissionGuideId, eventKey) {
  const guide = visibleGuides().find((candidate) => candidate.id === admissionGuideId);
  const definition = timelineEventDefinitions.find((candidate) => candidate.eventKey === eventKey);

  if (!guide || !definition) {
    return null;
  }

  const school = getPublishedSchoolById(guide.schoolId);

  if (!school) {
    return null;
  }

  const generatedDates = generatedTimelineDatesFor(definition, guide);

  return {
    guide,
    school,
    definition,
    generated: {
      title: definition.title,
      startsAt: generatedDates.startsAt,
      endsAt: generatedDates.endsAt,
      description: ""
    }
  };
}

function normalizeFormulaText(value, label, options = {}) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

  if (text.length === 0) {
    if (options.optional) {
      return options.fallback ?? "";
    }

    throw new AdminFormulaReviewError("missing_formula_field", `${label} is required.`);
  }

  if (text.length > (options.maxLength ?? 4000)) {
    throw new AdminFormulaReviewError("formula_field_too_long", `${label} is too long.`);
  }

  return text;
}

function parseFormulaJsonValue(value, label, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new AdminFormulaReviewError("invalid_formula_json", `${label} must be valid JSON.`);
  }
}

function normalizeFormulaNumber(value, label) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new AdminFormulaReviewError("invalid_formula_number", `${label} must be greater than 0.`);
  }

  return number;
}

function normalizeFormulaWeight(value, label) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new AdminFormulaReviewError("invalid_formula_weight", `${label} must be 0 or greater.`);
  }

  return number;
}

function normalizeFormulaType(value) {
  const formulaType = normalizeFormulaText(value ?? "weighted_sum", "Formula type");

  if (!formulaTypes.has(formulaType)) {
    throw new AdminFormulaReviewError("invalid_formula_type", "Formula type is not supported.");
  }

  return formulaType;
}

function normalizeFormulaDraftStatus(value) {
  const status = normalizeFormulaText(value ?? "draft", "Formula status");

  if (!formulaDraftStatuses.has(status)) {
    throw new AdminFormulaReviewError(
      "invalid_formula_status",
      "Formula drafts can only use draft or pending_review before publication."
    );
  }

  return status;
}

function normalizeFormulaConfig(value) {
  const config = parseFormulaJsonValue(value, "Formula config", {});

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new AdminFormulaReviewError("invalid_formula_config", "Formula config must be an object.");
  }

  if (!Array.isArray(config.inputs) || config.inputs.length === 0) {
    throw new AdminFormulaReviewError("invalid_formula_config", "Formula config must include at least one input.");
  }

  const inputs = config.inputs.map((input, index) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new AdminFormulaReviewError("invalid_formula_config", "Formula inputs must be objects.");
    }

    return {
      key: normalizeFormulaText(input.key, `Input ${index + 1} key`, { maxLength: 80 }),
      label: normalizeFormulaText(input.label, `Input ${index + 1} label`, { maxLength: 120 }),
      maxScore: normalizeFormulaNumber(input.maxScore, `Input ${index + 1} max score`),
      weight: normalizeFormulaWeight(input.weight, `Input ${index + 1} weight`)
    };
  });
  const weightTotal = inputs.reduce((total, input) => total + input.weight, 0);

  if (weightTotal <= 0) {
    throw new AdminFormulaReviewError("invalid_formula_config", "At least one formula weight must be greater than 0.");
  }

  return {
    inputs,
    outputMaxScore: normalizeFormulaNumber(config.outputMaxScore ?? 100, "Output max score"),
    customConfig: config.customConfig && typeof config.customConfig === "object" && !Array.isArray(config.customConfig)
      ? { ...config.customConfig }
      : undefined
  };
}

function normalizeFormulaScores(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminFormulaReviewError("invalid_formula_sample", `${label} scores must be an object.`);
  }

  return { ...value };
}

function normalizeFormulaSampleTests(value) {
  const samples = parseFormulaJsonValue(value, "Formula sample tests", []);

  if (!Array.isArray(samples)) {
    throw new AdminFormulaReviewError("invalid_formula_sample", "Formula sample tests must be a list.");
  }

  return samples.map((sample, index) => {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      throw new AdminFormulaReviewError("invalid_formula_sample", "Each formula sample test must be an object.");
    }

    const expectedTotalScore = Number(sample.expectedTotalScore ?? sample.expectedTotal);

    if (!Number.isFinite(expectedTotalScore)) {
      throw new AdminFormulaReviewError(
        "invalid_formula_sample",
        `Sample test ${index + 1} must include an expected total score.`
      );
    }

    return {
      name: normalizeFormulaText(sample.name ?? `Sample ${index + 1}`, "Sample name", {
        maxLength: 120
      }),
      scores: normalizeFormulaScores(sample.scores, `Sample ${index + 1}`),
      expectedTotalScore
    };
  });
}

function visibleGuideForFormula({ admissionGuideId, schoolId, admissionYear }) {
  if (admissionGuideId) {
    const guide = visibleGuides().find((candidate) => candidate.id === admissionGuideId);

    if (!guide) {
      throw new AdminFormulaReviewError(
        "formula_guide_not_found",
        "A published current admission guide is required for formula management.",
        404
      );
    }

    if (schoolId && guide.schoolId !== schoolId) {
      throw new AdminFormulaReviewError("formula_guide_mismatch", "Formula school does not match the guide.");
    }

    if (admissionYear && guide.admissionYear !== admissionYear) {
      throw new AdminFormulaReviewError("formula_guide_mismatch", "Formula year does not match the guide.");
    }

    return guide;
  }

  const guide = visibleGuides().find((candidate) => {
    return candidate.schoolId === schoolId && candidate.admissionYear === admissionYear;
  });

  if (!guide) {
    throw new AdminFormulaReviewError(
      "formula_guide_not_found",
      "A published current admission guide is required for formula management.",
      404
    );
  }

  return guide;
}

function normalizeFormulaYear(value) {
  const year = Number(value);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AdminFormulaReviewError("invalid_formula_year", "Formula year must be a four-digit admission year.");
  }

  return year;
}

function formulaGuideFromDraftBody(body, existing) {
  const admissionGuideId = body.admissionGuideId
    ? normalizeFormulaText(body.admissionGuideId, "Admission guide id")
    : existing?.admissionGuideId;
  const schoolId = body.schoolId
    ? normalizeFormulaText(body.schoolId, "School id")
    : existing?.schoolId;
  const admissionYear = body.year || body.admissionYear
    ? normalizeFormulaYear(body.year ?? body.admissionYear)
    : existing?.admissionYear;

  if (!admissionGuideId && (!schoolId || !admissionYear)) {
    throw new AdminFormulaReviewError(
      "missing_formula_guide",
      "Formula draft requires admissionGuideId or schoolId plus year."
    );
  }

  return visibleGuideForFormula({ admissionGuideId, schoolId, admissionYear });
}

function normalizedFormulaDraft(body, existing, operator, now) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AdminFormulaReviewError("invalid_formula_body", "Formula payload must be an object.");
  }

  if (existing?.status === publishedStatus && !body.id) {
    throw new AdminFormulaReviewError(
      "published_formula_update",
      "Published formulas must be replaced with a new draft version."
    );
  }

  const guide = formulaGuideFromDraftBody(body, existing);
  const operatedAt = currentIsoDate(now);
  const formulaConfig = fieldWasProvided(body, "formulaConfig")
    ? normalizeFormulaConfig(body.formulaConfig)
    : existing
      ? cloneFormulaConfig(existing.formulaConfig)
      : normalizeFormulaConfig(body.config);
  const sampleTests = fieldWasProvided(body, "sampleTests")
    ? normalizeFormulaSampleTests(body.sampleTests)
    : existing
      ? cloneScoreFormula(existing).sampleTests
      : [];
  const formula = {
    id: existing?.id ?? (body.id ? normalizeFormulaText(body.id, "Formula id") : randomUUID()),
    admissionGuideId: guide.id,
    schoolId: guide.schoolId,
    admissionYear: guide.admissionYear,
    provinceScope: guide.provinceScope,
    status: normalizeFormulaDraftStatus(body.status ?? existing?.status ?? "draft"),
    version: existing?.version ?? nextFormulaVersion({
      schoolId: guide.schoolId,
      admissionYear: guide.admissionYear,
      provinceScope: guide.provinceScope
    }),
    formulaName: fieldWasProvided(body, "formulaName")
      ? normalizeFormulaText(body.formulaName, "Formula name", { maxLength: 200 })
      : normalizeFormulaText(existing?.formulaName, "Formula name", { maxLength: 200 }),
    formulaType: fieldWasProvided(body, "formulaType")
      ? normalizeFormulaType(body.formulaType)
      : normalizeFormulaType(existing?.formulaType ?? "weighted_sum"),
    formulaConfig,
    explanation: fieldWasProvided(body, "explanation")
      ? normalizeFormulaText(body.explanation, "Formula explanation")
      : normalizeFormulaText(existing?.explanation, "Formula explanation"),
    officialSourceUrl: fieldWasProvided(body, "officialSourceUrl")
      ? normalizeFormulaText(body.officialSourceUrl, "Official source URL")
      : normalizeFormulaText(existing?.officialSourceUrl, "Official source URL"),
    sampleTests,
    publishedAt: existing?.publishedAt ?? null,
    updatedAt: operatedAt,
    reviewAudit: existing?.reviewAudit ?? []
  };

  return appendFormulaAudit(
    formula,
    existing ? "update_formula_draft" : "create_formula_draft",
    operator,
    operatedAt,
    body.note
  );
}

function guideReviewErrorForMissing() {
  return new AdminGuideReviewError("guide_not_found", "No guide was found for admin review.", 404);
}

function updateGuideRecord(guideId, updater) {
  const index = admissionGuideRecords.findIndex((guide) => guide.id === guideId);

  if (index === -1) {
    throw guideReviewErrorForMissing();
  }

  const nextGuide = updater(admissionGuideRecords[index]);
  admissionGuideRecords = admissionGuideRecords.map((guide, currentIndex) => {
    if (currentIndex === index) {
      return cloneAdmissionGuide(nextGuide);
    }

    if (nextGuide.status === publishedStatus && sameGuideSeries(guide, nextGuide)) {
      return {
        ...cloneAdmissionGuide(guide),
        isCurrent: false
      };
    }

    return guide;
  });

  return admissionGuideRecords[index];
}

function transitionGuideReview({ guideId, operation, status, operator, now, note, supplementStatus = null }) {
  assertOfficialStatus(status);

  const operatedAt = currentIsoDate(now);
  return updateGuideRecord(guideId, (guide) => {
    const nextGuide = {
      ...guide,
      status,
      reviewStatus: operation,
      supplementStatus,
      updatedAt: operatedAt
    };

    if (status === publishedStatus) {
      nextGuide.isCurrent = true;
      nextGuide.publishedAt = operatedAt;
      nextGuide.supplementStatus = null;
    }

    if (status === "archived") {
      nextGuide.isCurrent = false;
    }

    return appendGuideAudit(nextGuide, operation, operator, operatedAt, note);
  });
}

function roundScore(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isRecentExperience(experience, year) {
  return experience.admissionYear <= year && experience.admissionYear >= year - 1;
}

function normalizeCalculationYear(year) {
  const numericYear = Number(year);

  if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) {
    throw new ScoreCalculationError("invalid_year", "Year must be a four-digit admission year.");
  }

  return numericYear;
}

function assertCalculationScores(scores) {
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    throw new ScoreCalculationError("invalid_scores", "Scores must be provided as an object keyed by formula input.");
  }

  return scores;
}

function configuredScoreValue(scores, input) {
  if (!Object.hasOwn(scores, input.key) || scores[input.key] === null || scores[input.key] === "") {
    throw new ScoreCalculationError("missing_score", `${input.label} is required.`);
  }

  const score = Number(scores[input.key]);

  if (!Number.isFinite(score)) {
    throw new ScoreCalculationError("invalid_score", `${input.label} must be a number.`);
  }

  if (score < 0 || score > input.maxScore) {
    throw new ScoreCalculationError(
      "score_out_of_range",
      `${input.label} must be between 0 and ${input.maxScore}.`
    );
  }

  return score;
}

function assertWeightedFormulaConfig(formula) {
  if (formula.formulaType !== "weighted_sum" && formula.formulaType !== "custom") {
    throw new ScoreCalculationError(
      "unsupported_formula",
      "This score formula type is not supported by the public calculator.",
      422
    );
  }

  if (!Array.isArray(formula.formulaConfig.inputs) || formula.formulaConfig.inputs.length === 0) {
    throw new ScoreCalculationError("invalid_formula_config", "The score formula has no configured inputs.", 422);
  }

  const outputMaxScore = Number(formula.formulaConfig.outputMaxScore);

  if (!Number.isFinite(outputMaxScore) || outputMaxScore <= 0) {
    throw new ScoreCalculationError("invalid_formula_config", "The score formula output scale is invalid.", 422);
  }

  for (const input of formula.formulaConfig.inputs) {
    const maxScore = Number(input.maxScore);
    const weight = Number(input.weight);

    if (!input.key || !input.label || !Number.isFinite(maxScore) || maxScore <= 0) {
      throw new ScoreCalculationError("invalid_formula_config", "A score formula input is invalid.", 422);
    }

    if (!Number.isFinite(weight) || weight < 0) {
      throw new ScoreCalculationError("invalid_formula_config", "A score formula weight is invalid.", 422);
    }
  }

  return outputMaxScore;
}

function calculateFormulaRecordScore(formula, scores) {
  const outputMaxScore = assertWeightedFormulaConfig(formula);
  const breakdown = formula.formulaConfig.inputs.map((configuredInput) => {
    const score = configuredScoreValue(scores, configuredInput);
    const normalizedScore = (score / configuredInput.maxScore) * outputMaxScore;
    const contribution = normalizedScore * configuredInput.weight;

    return {
      key: configuredInput.key,
      label: configuredInput.label,
      score,
      maxScore: configuredInput.maxScore,
      normalizedScore: roundScore(normalizedScore),
      weight: configuredInput.weight,
      contribution: roundScore(contribution)
    };
  });

  return {
    outputMaxScore,
    breakdown,
    totalScore: roundScore(breakdown.reduce((total, item) => total + item.contribution, 0))
  };
}

function formulaSampleResults(formula) {
  return (formula.sampleTests ?? []).map((sample) => {
    try {
      const result = calculateFormulaRecordScore(formula, sample.scores);
      const difference = Math.abs(result.totalScore - sample.expectedTotalScore);

      return {
        name: sample.name,
        scores: { ...sample.scores },
        expectedTotalScore: sample.expectedTotalScore,
        actualTotalScore: result.totalScore,
        passed: difference <= sampleScoreTolerance
      };
    } catch (error) {
      return {
        name: sample.name,
        scores: { ...sample.scores },
        expectedTotalScore: sample.expectedTotalScore,
        actualTotalScore: null,
        passed: false,
        error: error.message
      };
    }
  });
}

function assertFormulaHasPassingSample(formula) {
  const sampleResults = formulaSampleResults(formula);

  if (sampleResults.length === 0) {
    throw new AdminFormulaReviewError(
      "missing_formula_sample",
      "Formula publication requires at least one sample calculation test.",
      422
    );
  }

  if (!sampleResults.some((sample) => sample.passed)) {
    throw new AdminFormulaReviewError(
      "formula_sample_failed",
      "Formula publication requires at least one passing sample calculation test.",
      422
    );
  }

  return sampleResults;
}

function getPublishedSchoolById(schoolId) {
  return seedData.schools.find((school) => school.id === schoolId && isPublished(school)) ?? null;
}

function publishedGuides() {
  return admissionGuides().filter((guide) => isPublished(guide) && getPublishedSchoolById(guide.schoolId));
}

function visibleGuides() {
  return publishedGuides().filter((guide) => guide.isCurrent);
}

function visibleGuideIds() {
  return new Set(visibleGuides().map((guide) => guide.id));
}

function sameGuideSeries(left, right) {
  return left.schoolId === right.schoolId &&
    left.admissionYear === right.admissionYear &&
    left.provinceScope === right.provinceScope;
}

function guideKeywordMatches(guide, keyword) {
  if (!keyword) {
    return true;
  }

  const school = getPublishedSchoolById(guide.schoolId);

  return [
    school?.name,
    school?.normalizedName,
    school?.city,
    guide.guideTitle,
    guide.summary,
    guide.sourceTitle,
    guide.sourceType,
    guide.applicationStatus
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(keyword));
}

function schoolGuideKeywordMatches(card, keyword) {
  if (!keyword) {
    return true;
  }

  return [
    card.school.name,
    card.school.normalizedName,
    card.school.city,
    card.school.schoolType,
    card.guide.guideTitle,
    card.guide.summary
  ].some((value) => value.toLowerCase().includes(keyword));
}

function keyTimelineNodesFor(guide) {
  const keyTimelineEventKeys = new Set([
    "application_start",
    "application_deadline",
    "school_assessment",
    "admission_publication"
  ]);

  return listTimelineEvents({ admissionGuideId: guide.id })
    .filter((event) => keyTimelineEventKeys.has(event.eventKey))
    .slice(0, 4);
}

function schoolGuideCardFor(guide) {
  const school = getPublishedSchoolById(guide.schoolId);
  const formula = getScoreFormula({
    schoolId: guide.schoolId,
    year: guide.admissionYear
  });
  const experiences = listExperiences({
    schoolId: guide.schoolId,
    year: guide.admissionYear
  });

  return {
    school,
    guide,
    keyTimelineNodes: keyTimelineNodesFor(guide),
    formula: formula
      ? {
          available: true,
          formulaType: formula.formulaType,
          formulaName: formula.formulaName
        }
      : {
          available: false,
          formulaType: null,
          formulaName: null
        },
    experiences: {
      exists: experiences.length > 0,
      count: experiences.length
    }
  };
}

function resolveDetailGuide(guides, filters) {
  if (guides.length === 0) {
    return null;
  }

  if (filters.year) {
    return guides.find((guide) => guide.admissionYear === filters.year) ?? null;
  }

  const currentYear = filters.currentYear ?? new Date().getUTCFullYear();
  return guides.find((guide) => guide.admissionYear === currentYear) ?? guides[0];
}

function featuredExperiencesFor(schoolId, year, limit = 3) {
  return [...listExperiences()]
    .sort((left, right) => compareFeaturedExperiences(left, right, schoolId, year))
    .slice(0, limit);
}

/**
 * Lists published schools, optionally narrowed to schools with a published guide
 * for the requested year.
 *
 * @param {SchoolFilters} [filters]
 * @returns {ReadonlyArray<import("./seed-data.js").SchoolSeed>}
 */
export function listSchools(filters = {}) {
  const keyword = normalizeKeyword(filters.keyword);
  const schoolIdsForYear = filters.year
    ? new Set(visibleGuides().filter((guide) => guide.admissionYear === filters.year).map((guide) => guide.schoolId))
    : null;

  return seedData.schools
    .filter((school) => isPublished(school))
    .filter((school) => !schoolIdsForYear || schoolIdsForYear.has(school.id))
    .filter((school) => {
      if (!keyword) {
        return true;
      }

      return [school.name, school.normalizedName, school.city, school.schoolType]
        .some((value) => value.toLowerCase().includes(keyword));
    })
    .sort(compareSchoolNames);
}

/**
 * Reads one published school by id.
 *
 * @param {string} schoolId
 * @returns {import("./seed-data.js").SchoolSeed | null}
 */
export function getSchoolById(schoolId) {
  return getPublishedSchoolById(schoolId);
}

/**
 * Lists published admission guides for public student views.
 *
 * @param {GuideFilters} [filters]
 * @returns {ReadonlyArray<import("./seed-data.js").AdmissionGuideSeed>}
 */
export function listGuides(filters = {}) {
  const keyword = normalizeKeyword(filters.keyword);

  return visibleGuides()
    .filter((guide) => !filters.schoolId || guide.schoolId === filters.schoolId)
    .filter((guide) => !filters.year || guide.admissionYear === filters.year)
    .filter((guide) => !filters.status || guide.status === filters.status)
    .filter((guide) => guideKeywordMatches(guide, keyword))
    .sort(compareGuideRecency);
}

/**
 * Lists published guide cards for the public school browsing experience.
 *
 * @param {SchoolGuideCardFilters} [filters]
 * @returns {ReadonlyArray<{
 *   school: import("./seed-data.js").SchoolSeed,
 *   guide: import("./seed-data.js").AdmissionGuideSeed,
 *   keyTimelineNodes: ReadonlyArray<import("./seed-data.js").TimelineEventSeed>,
 *   formula: {available: boolean, formulaType: string | null, formulaName: string | null},
 *   experiences: {exists: boolean, count: number}
 * }>}
 */
export function listSchoolGuideCards(filters = {}) {
  const keyword = normalizeKeyword(filters.keyword);
  const applicationStatus = normalizeFilterValue(filters.applicationStatus);
  const schoolType = normalizeFilterValue(filters.schoolType);
  const sort = filters.sort ?? "deadline";
  const cards = visibleGuides()
    .filter((guide) => !filters.year || guide.admissionYear === filters.year)
    .filter((guide) => !filters.status || guide.status === filters.status)
    .map(schoolGuideCardFor)
    .filter((card) => schoolGuideKeywordMatches(card, keyword))
    .filter((card) => !applicationStatus || normalizeFilterValue(card.guide.applicationStatus) === applicationStatus)
    .filter((card) => !schoolType || normalizeFilterValue(card.school.schoolType) === schoolType);

  if (sort === "updated") {
    return cards.sort(compareSchoolCardsByUpdateTime);
  }

  if (sort === "name") {
    return cards.sort(compareSchoolCardNames);
  }

  return cards.sort(compareSchoolCardsByDeadline);
}

/**
 * Reads the public school detail aggregate for one published school and guide
 * year. When no year is supplied, the current calendar year is preferred if a
 * published guide exists; otherwise the latest published guide year is used.
 *
 * @param {SchoolDetailFilters} filters
 * @returns {{
 *   school: import("./seed-data.js").SchoolSeed,
 *   availableYears: number[],
 *   selectedYear: number,
 *   guide: import("./seed-data.js").AdmissionGuideSeed,
 *   timeline: ReadonlyArray<import("./seed-data.js").TimelineEventSeed>,
 *   formula: import("./seed-data.js").ScoreFormulaSeed | null,
 *   featuredExperiences: ReadonlyArray<import("./seed-data.js").ExperienceSeed>
 * } | null}
 */
export function getSchoolDetail(filters) {
  const school = getPublishedSchoolById(filters.schoolId);

  if (!school) {
    return null;
  }

  const guides = listGuides({ schoolId: school.id });
  const guide = resolveDetailGuide(guides, filters);

  if (!guide) {
    return null;
  }

  return {
    school,
    availableYears: guides.map((visibleGuide) => visibleGuide.admissionYear),
    selectedYear: guide.admissionYear,
    guide,
    timeline: listTimelineEvents({ admissionGuideId: guide.id }),
    formula: getScoreFormula({ schoolId: school.id, year: guide.admissionYear }),
    featuredExperiences: featuredExperiencesFor(school.id, guide.admissionYear)
  };
}

/**
 * Reads one published admission guide by id.
 *
 * @param {string} guideId
 * @returns {import("./seed-data.js").AdmissionGuideSeed | null}
 */
export function getGuideById(guideId) {
  return publishedGuides().find((guide) => guide.id === guideId) ?? null;
}

/**
 * Reads one published admission guide with school context and a published
 * version history summary.
 *
 * @param {{guideId: string}} filters
 * @returns {{
 *   school: import("./seed-data.js").SchoolSeed,
 *   guide: import("./seed-data.js").AdmissionGuideSeed,
 *   versionHistory: ReadonlyArray<import("./seed-data.js").AdmissionGuideSeed>
 * } | null}
 */
export function getGuideDetail(filters) {
  const guide = getGuideById(filters.guideId);

  if (!guide) {
    return null;
  }

  const school = getPublishedSchoolById(guide.schoolId);

  if (!school) {
    return null;
  }

  return {
    school,
    guide,
    versionHistory: publishedGuides()
      .filter((versionedGuide) => sameGuideSeries(versionedGuide, guide))
      .sort((left, right) => right.version - left.version)
  };
}

/**
 * Lists draft and pending-review guide records for the admin review queue.
 *
 * @param {{status?: string}} [filters]
 * @returns {ReadonlyArray<{
 *   guide: import("./seed-data.js").AdmissionGuideSeed,
 *   school: import("./seed-data.js").SchoolSeed
 * }>}
 */
export function listAdminGuideReviews(filters = {}) {
  if (filters.status) {
    assertOfficialStatus(filters.status);
  }

  return admissionGuides()
    .filter((guide) => filters.status ? guide.status === filters.status : reviewQueueStatuses.has(guide.status))
    .map((guide) => ({
      guide,
      school: getPublishedSchoolById(guide.schoolId)
    }))
    .filter((item) => item.school)
    .sort((left, right) => {
      if (left.guide.status !== right.guide.status) {
        return left.guide.status === "pending_review" ? -1 : 1;
      }

      if (right.guide.updatedAt !== left.guide.updatedAt) {
        return String(right.guide.updatedAt ?? "").localeCompare(String(left.guide.updatedAt ?? ""));
      }

      return compareSchoolNames(left.school, right.school);
    });
}

/**
 * Reads any guide record for admin review, including draft, pending, and
 * archived guide versions hidden from student-facing helpers.
 *
 * @param {{guideId: string}} filters
 * @returns {{
 *   guide: import("./seed-data.js").AdmissionGuideSeed,
 *   school: import("./seed-data.js").SchoolSeed,
 *   versionHistory: ReadonlyArray<import("./seed-data.js").AdmissionGuideSeed>
 * } | null}
 */
export function getAdminGuideReviewDetail(filters) {
  const guide = admissionGuides().find((candidate) => candidate.id === filters.guideId) ?? null;

  if (!guide) {
    return null;
  }

  const school = getPublishedSchoolById(guide.schoolId);

  if (!school) {
    return null;
  }

  return {
    school,
    guide,
    versionHistory: guideSeriesFor(guide)
      .sort((left, right) => right.version - left.version)
  };
}

/**
 * Creates a review-only guide draft. The draft is hidden from student-facing
 * helpers until an admin publishes it.
 *
 * @param {{body: object, operator: object, now?: () => Date | string | number}} input
 * @returns {{guide: import("./seed-data.js").AdmissionGuideSeed, school: import("./seed-data.js").SchoolSeed}}
 */
export function createAdminGuideDraft(input) {
  const guide = normalizedGuideDraft(input.body, input.operator, input.now);

  admissionGuideRecords = [...admissionGuideRecords, cloneAdmissionGuide(guide)];

  return {
    guide,
    school: assertPublishedSchoolForAdmin(guide.schoolId)
  };
}

/**
 * Moves a guide draft into official data review.
 *
 * @param {{guideId: string, operator: object, now?: () => Date | string | number, note?: string}} input
 * @returns {import("./seed-data.js").AdmissionGuideSeed}
 */
export function submitAdminGuideReview(input) {
  return transitionGuideReview({
    guideId: input.guideId,
    operation: "submit_review",
    status: "pending_review",
    operator: input.operator,
    now: input.now,
    note: input.note
  });
}

/**
 * Publishes the reviewed guide version and makes it visible to public student
 * guide APIs.
 *
 * @param {{guideId: string, operator: object, now?: () => Date | string | number, note?: string}} input
 * @returns {import("./seed-data.js").AdmissionGuideSeed}
 */
export function publishAdminGuide(input) {
  return transitionGuideReview({
    guideId: input.guideId,
    operation: "publish",
    status: "published",
    operator: input.operator,
    now: input.now,
    note: input.note
  });
}

/**
 * Returns a guide to draft after manual review.
 *
 * @param {{guideId: string, operator: object, now?: () => Date | string | number, note?: string}} input
 * @returns {import("./seed-data.js").AdmissionGuideSeed}
 */
export function returnAdminGuide(input) {
  return transitionGuideReview({
    guideId: input.guideId,
    operation: "return",
    status: "draft",
    operator: input.operator,
    now: input.now,
    note: input.note
  });
}

/**
 * Marks a guide as requiring official-data supplementation while keeping it in
 * the review queue.
 *
 * @param {{guideId: string, operator: object, now?: () => Date | string | number, note?: string}} input
 * @returns {import("./seed-data.js").AdmissionGuideSeed}
 */
export function markAdminGuidePendingSupplement(input) {
  return transitionGuideReview({
    guideId: input.guideId,
    operation: "mark_pending_supplement",
    status: "draft",
    operator: input.operator,
    now: input.now,
    note: input.note,
    supplementStatus: "pending_supplement"
  });
}

/**
 * Archives a guide version so it is removed from review and public current
 * guide views.
 *
 * @param {{guideId: string, operator: object, now?: () => Date | string | number, note?: string}} input
 * @returns {import("./seed-data.js").AdmissionGuideSeed}
 */
export function archiveAdminGuide(input) {
  return transitionGuideReview({
    guideId: input.guideId,
    operation: "archive",
    status: "archived",
    operator: input.operator,
    now: input.now,
    note: input.note
  });
}

/**
 * Lists generated timeline nodes for admin review, including any reviewed
 * explicit event or manual override data attached to the generated guide node.
 *
 * @param {TimelineFilters} [filters]
 * @returns {ReadonlyArray<object>}
 */
export function listAdminTimelineNodes(filters = {}) {
  const requestedSchoolIds = new Set([
    ...(filters.schoolId ? [filters.schoolId] : []),
    ...(filters.schoolIds ?? [])
  ]);
  const explicitEvents = new Map(
    timelineEvents()
      .map((event) => [`${event.admissionGuideId}:${event.eventKey}`, event])
  );

  return visibleGuides()
    .filter((guide) => !filters.year || guide.admissionYear === filters.year)
    .filter((guide) => requestedSchoolIds.size === 0 || requestedSchoolIds.has(guide.schoolId))
    .flatMap((guide) => {
      const school = getPublishedSchoolById(guide.schoolId);

      if (!school) {
        return [];
      }

      return timelineEventDefinitions
        .filter((definition) => !filters.eventKey || definition.eventKey === filters.eventKey)
        .map((definition) => {
          const explicitEvent = explicitEvents.get(`${guide.id}:${definition.eventKey}`) ?? null;
          const generatedDates = generatedTimelineDatesFor(definition, guide);
          const dates = explicitEvent
            ? { startsAt: explicitEvent.startsAt, endsAt: explicitEvent.endsAt }
            : generatedDates;
          const node = {
            id: explicitEvent?.id ?? `${guide.id}:${definition.eventKey}`,
            admissionGuideId: guide.id,
            schoolId: guide.schoolId,
            eventKey: definition.eventKey,
            title: explicitEvent?.title ?? definition.title,
            description: explicitEvent?.description ?? "",
            startsAt: dates.startsAt,
            endsAt: dates.endsAt,
            officialDataStatus: explicitEvent?.status ?? guide.status,
            isDateKnown: Boolean(dates.startsAt ?? dates.endsAt),
            source: explicitEvent?.overrideReason
              ? "manual_override"
              : explicitEvent
                ? "reviewed_event"
                : "guide_generated",
            generated: {
              title: definition.title,
              startsAt: generatedDates.startsAt,
              endsAt: generatedDates.endsAt,
              description: ""
            },
            override: explicitEvent
              ? {
                  reason: explicitEvent.overrideReason ?? null,
                  updatedAt: explicitEvent.updatedAt ?? null,
                  reviewAudit: explicitEvent.reviewAudit ?? []
                }
              : null,
            school,
            guide
          };

          return {
            ...node,
            status: calculateTimelineNodeStatus(node, filters.referenceDate)
          };
        });
    })
    .sort(compareTimelineNodes);
}

/**
 * Applies a manual timeline override to one generated guide event. The override
 * is immediately published to the public timeline and keeps an audit entry.
 *
 * @param {{body: object, operator: object, now?: () => Date | string | number}} input
 * @returns {object}
 */
export function overrideAdminTimelineNode(input) {
  requireAdminOperator(input.operator, AdminTimelineReviewError, "missing_timeline_operator");

  const body = input.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AdminTimelineReviewError("invalid_timeline_body", "Timeline override payload must be an object.");
  }

  const admissionGuideId = normalizeTimelineText(body.admissionGuideId, "Admission guide id");
  const eventKey = normalizeTimelineText(body.eventKey, "Timeline event key");
  const baseNode = generatedTimelineNodeFor(admissionGuideId, eventKey);

  if (!baseNode) {
    throw new AdminTimelineReviewError("timeline_node_not_found", "No generated timeline node was found.", 404);
  }

  const existing = timelineEvents()
    .find((event) => event.admissionGuideId === admissionGuideId && event.eventKey === eventKey);
  const operatedAt = currentIsoDate(input.now);
  const reason = normalizeOverrideReason(body.overrideReason ?? body.reason);
  let startsAt = existing?.startsAt ?? baseNode.generated.startsAt;
  let endsAt = existing?.endsAt ?? baseNode.generated.endsAt;

  if (fieldWasProvided(body, "date")) {
    const date = normalizeAdminDate(body.date);
    startsAt = date;
    endsAt = date;
  } else {
    startsAt = overrideDateValue(body, "startsAt", startsAt);
    endsAt = overrideDateValue(body, "endsAt", endsAt);
  }

  const event = appendTimelineAudit({
    id: existing?.id ?? randomUUID(),
    admissionGuideId,
    schoolId: baseNode.guide.schoolId,
    eventKey,
    title: fieldWasProvided(body, "title")
      ? normalizeTimelineText(body.title, "Timeline title")
      : existing?.title ?? baseNode.generated.title,
    description: fieldWasProvided(body, "description")
      ? normalizeTimelineText(body.description, "Timeline description", { optional: true, fallback: "" })
      : existing?.description ?? "",
    startsAt,
    endsAt,
    status: "published",
    overrideReason: reason,
    updatedAt: operatedAt,
    reviewAudit: existing?.reviewAudit ?? []
  }, "override_timeline", input.operator, operatedAt, reason);
  const existingIndex = timelineEventRecords.findIndex((candidate) => candidate.id === event.id);

  if (existingIndex === -1) {
    timelineEventRecords = [...timelineEventRecords, cloneTimelineEvent(event)];
  } else {
    timelineEventRecords = timelineEventRecords.map((candidate, index) => {
      return index === existingIndex ? cloneTimelineEvent(event) : candidate;
    });
  }

  return listAdminTimelineNodes({
    admissionGuideId,
    eventKey,
    referenceDate: input.now ? currentIsoDate(input.now) : undefined
  }).find((node) => node.admissionGuideId === admissionGuideId && node.eventKey === eventKey);
}

/**
 * Lists formula records for admin management, including draft and pending
 * records hidden from student-facing calculator helpers.
 *
 * @param {{schoolId?: string, year?: number, status?: string}} [filters]
 * @returns {ReadonlyArray<object>}
 */
export function listAdminFormulas(filters = {}) {
  if (filters.status && !officialDataStatuses.has(filters.status)) {
    throw new AdminFormulaReviewError("invalid_formula_status", "Formula status is not supported.");
  }

  return scoreFormulas()
    .filter((formula) => !filters.schoolId || formula.schoolId === filters.schoolId)
    .filter((formula) => !filters.year || formula.admissionYear === filters.year)
    .filter((formula) => !filters.status || formula.status === filters.status)
    .map((formula) => {
      const school = getPublishedSchoolById(formula.schoolId);
      const guide = admissionGuides().find((candidate) => candidate.id === formula.admissionGuideId) ?? null;

      return {
        formula,
        school,
        guide,
        sampleResults: formulaSampleResults(formula)
      };
    })
    .filter((item) => item.school && item.guide)
    .sort((left, right) => {
      if (left.formula.status !== right.formula.status) {
        return left.formula.status.localeCompare(right.formula.status, "en");
      }

      if (right.formula.admissionYear !== left.formula.admissionYear) {
        return right.formula.admissionYear - left.formula.admissionYear;
      }

      const schoolDifference = compareSchoolNames(left.school, right.school);

      if (schoolDifference !== 0) {
        return schoolDifference;
      }

      return right.formula.version - left.formula.version;
    });
}

/**
 * Reads one formula record for admin management.
 *
 * @param {{formulaId: string}} filters
 * @returns {object | null}
 */
export function getAdminFormulaDetail(filters) {
  return listAdminFormulas().find((item) => item.formula.id === filters.formulaId) ?? null;
}

/**
 * Creates or updates a formula draft. Formula drafts stay hidden from public
 * calculator helpers until the publish transition succeeds.
 *
 * @param {{body: object, operator: object, now?: () => Date | string | number}} input
 * @returns {{created: boolean, formula: object, school: object, guide: object, sampleResults: object[]}}
 */
export function upsertAdminFormulaDraft(input) {
  requireAdminOperator(input.operator, AdminFormulaReviewError, "missing_formula_operator");

  const formulaId = input.body?.id ? normalizeFormulaText(input.body.id, "Formula id") : "";
  const existing = formulaId
    ? scoreFormulas().find((formula) => formula.id === formulaId) ?? null
    : null;

  if (existing?.status === publishedStatus) {
    throw new AdminFormulaReviewError(
      "published_formula_update",
      "Published formulas must be replaced with a new draft version."
    );
  }

  const formula = normalizedFormulaDraft(input.body, existing, input.operator, input.now);

  if (existing) {
    scoreFormulaRecords = scoreFormulaRecords.map((candidate) => {
      return candidate.id === formula.id ? cloneScoreFormula(formula) : candidate;
    });
  } else {
    scoreFormulaRecords = [...scoreFormulaRecords, cloneScoreFormula(formula)];
  }

  return {
    created: !existing,
    ...getAdminFormulaDetail({ formulaId: formula.id })
  };
}

/**
 * Publishes a formula draft after at least one configured sample calculation
 * passes against the formula configuration.
 *
 * @param {{formulaId: string, operator: object, now?: () => Date | string | number, note?: string}} input
 * @returns {{formula: object, school: object, guide: object, sampleResults: object[]}}
 */
export function publishAdminFormula(input) {
  requireAdminOperator(input.operator, AdminFormulaReviewError, "missing_formula_operator");

  const index = scoreFormulaRecords.findIndex((formula) => formula.id === input.formulaId);

  if (index === -1) {
    throw new AdminFormulaReviewError("formula_not_found", "No formula draft was found.", 404);
  }

  const formula = scoreFormulaRecords[index];
  const sampleResults = assertFormulaHasPassingSample(formula);
  const operatedAt = currentIsoDate(input.now);
  const nextFormula = appendFormulaAudit({
    ...formula,
    status: "published",
    publishedAt: operatedAt,
    updatedAt: operatedAt
  }, "publish_formula", input.operator, operatedAt, input.note);

  scoreFormulaRecords = scoreFormulaRecords.map((candidate, candidateIndex) => {
    if (candidateIndex === index) {
      return cloneScoreFormula(nextFormula);
    }

    return candidate;
  });

  return {
    ...getAdminFormulaDetail({ formulaId: nextFormula.id }),
    sampleResults
  };
}

/**
 * Creates the next immutable guide version for dependency-free tests and local
 * draft workflows. The input guide is never modified; older records in the same
 * school/year/scope series are returned with `isCurrent: false`.
 *
 * @param {{
 *   guideId: string,
 *   fields?: Partial<import("./seed-data.js").AdmissionGuideSeed>,
 *   guides?: ReadonlyArray<import("./seed-data.js").AdmissionGuideSeed>,
 *   id?: string,
 *   updatedAt?: string,
 *   versionNotes?: string
 * }} input
 * @returns {{
 *   guide: import("./seed-data.js").AdmissionGuideSeed,
 *   guides: ReadonlyArray<import("./seed-data.js").AdmissionGuideSeed>
 * } | null}
 */
export function createGuideVersion(input) {
  const guides = input.guides ?? admissionGuides();
  const sourceGuide = guides.find((guide) => guide.id === input.guideId);

  if (!sourceGuide) {
    return null;
  }

  const series = guides.filter((guide) => sameGuideSeries(guide, sourceGuide));
  const nextVersion = Math.max(...series.map((guide) => guide.version)) + 1;
  const {
    id: ignoredFieldId,
    isCurrent: ignoredIsCurrent,
    version: ignoredVersion,
    ...fieldUpdates
  } = input.fields ?? {};
  void ignoredFieldId;
  void ignoredIsCurrent;
  void ignoredVersion;

  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const nextGuide = {
    ...sourceGuide,
    ...fieldUpdates,
    id: input.id ?? `${sourceGuide.id}-v${nextVersion}`,
    version: nextVersion,
    isCurrent: true,
    updatedAt,
    sourceUpdatedAt: fieldUpdates.sourceUpdatedAt ?? updatedAt,
    versionNotes: input.versionNotes ?? fieldUpdates.versionNotes ?? "Structured guide fields updated."
  };
  const nextGuides = guides.map((guide) => {
    if (!sameGuideSeries(guide, sourceGuide)) {
      return guide;
    }

    return {
      ...guide,
      isCurrent: false
    };
  });

  return {
    guide: nextGuide,
    guides: [...nextGuides, nextGuide]
  };
}

/**
 * Lists published timeline nodes whose parent guide and school are also visible.
 *
 * @param {TimelineFilters} [filters]
 * @returns {ReadonlyArray<import("./seed-data.js").TimelineEventSeed>}
 */
export function listTimelineEvents(filters = {}) {
  const guideIds = visibleGuideIds();
  const guidesById = new Map(visibleGuides().map((guide) => [guide.id, guide]));

  return timelineEvents()
    .filter((event) => isPublished(event))
    .filter((event) => guideIds.has(event.admissionGuideId))
    .filter((event) => !filters.admissionGuideId || event.admissionGuideId === filters.admissionGuideId)
    .filter((event) => !filters.schoolId || event.schoolId === filters.schoolId)
    .filter((event) => !filters.eventKey || event.eventKey === filters.eventKey)
    .filter((event) => !filters.year || guidesById.get(event.admissionGuideId)?.admissionYear === filters.year)
    .sort(compareEventTime);
}

/**
 * Calculates the student-facing status for a timeline node from its official
 * dates. Missing official dates stay in the future-looking not-started state.
 *
 * @param {{startsAt?: string | null, endsAt?: string | null}} node
 * @param {Date | string | number} [referenceDate]
 * @returns {TimelineNodeStatus}
 */
export function calculateTimelineNodeStatus(node, referenceDate = new Date()) {
  const now = referenceTimestamp(referenceDate);
  const startsAt = nullableTimestamp(node.startsAt);
  const endsAt = nullableTimestamp(node.endsAt);

  if (startsAt === null && endsAt === null) {
    return "not_started";
  }

  if (endsAt !== null && now > endsAt) {
    return "ended";
  }

  if (startsAt !== null && now >= startsAt && (endsAt === null || now <= endsAt)) {
    return "active";
  }

  const nextTimestamp = startsAt ?? endsAt;

  if (nextTimestamp !== null && now < nextTimestamp && nextTimestamp - now <= dueSoonWindowMs) {
    return "due_soon";
  }

  return "not_started";
}

/**
 * Generates the full public Guangdong admissions timeline from each visible
 * guide. Official guide fields provide guide publication and application dates;
 * reviewed timeline seed records override generated titles and dates; unknown
 * dates remain null.
 *
 * @param {TimelineFilters} [filters]
 * @returns {ReadonlyArray<{
 *   id: string,
 *   admissionGuideId: string,
 *   schoolId: string,
 *   eventKey: string,
 *   title: string,
 *   startsAt: string | null,
 *   endsAt: string | null,
 *   status: TimelineNodeStatus,
 *   officialDataStatus: string,
 *   isDateKnown: boolean,
 *   school: import("./seed-data.js").SchoolSeed,
 *   guide: import("./seed-data.js").AdmissionGuideSeed
 * }>}
 */
export function listTimelineNodes(filters = {}) {
  const requestedSchoolIds = new Set([
    ...(filters.schoolId ? [filters.schoolId] : []),
    ...(filters.schoolIds ?? [])
  ]);
  const explicitEvents = new Map(
    listTimelineEvents()
      .map((event) => [`${event.admissionGuideId}:${event.eventKey}`, event])
  );

  return visibleGuides()
    .filter((guide) => !filters.year || guide.admissionYear === filters.year)
    .filter((guide) => requestedSchoolIds.size === 0 || requestedSchoolIds.has(guide.schoolId))
    .flatMap((guide) => {
      const school = getPublishedSchoolById(guide.schoolId);

      if (!school) {
        return [];
      }

      return timelineEventDefinitions
        .filter((definition) => !filters.eventKey || definition.eventKey === filters.eventKey)
        .map((definition) => {
          const explicitEvent = explicitEvents.get(`${guide.id}:${definition.eventKey}`) ?? null;
          const dates = timelineDatesFor(definition, guide, explicitEvent);
          const node = {
            id: explicitEvent?.id ?? `${guide.id}:${definition.eventKey}`,
            admissionGuideId: guide.id,
            schoolId: guide.schoolId,
            eventKey: definition.eventKey,
            title: explicitEvent?.title ?? definition.title,
            description: explicitEvent?.description ?? "",
            startsAt: dates.startsAt,
            endsAt: dates.endsAt,
            officialDataStatus: explicitEvent?.status ?? guide.status,
            reviewAudit: explicitEvent?.reviewAudit ?? [],
            isDateKnown: Boolean(dates.startsAt ?? dates.endsAt),
            school,
            guide
          };

          return {
            ...node,
            status: calculateTimelineNodeStatus(node, filters.referenceDate)
          };
        });
    })
    .sort(compareTimelineNodes);
}

/**
 * Builds MVP site-only reminder indicators from active or due-soon timeline
 * nodes. No external notification channel is represented or triggered here.
 *
 * @param {ReadonlyArray<ReturnType<typeof listTimelineNodes>[number]>} nodes
 * @returns {ReadonlyArray<{
 *   id: string,
 *   eventId: string,
 *   schoolId: string,
 *   eventKey: string,
 *   title: string,
 *   dueAt: string | null,
 *   status: TimelineNodeStatus,
 *   delivery: "site_only",
 *   channels: string[]
 * }>}
 */
export function buildSiteTimelineReminders(nodes) {
  return nodes
    .filter((node) => node.status === "active" || node.status === "due_soon")
    .map((node) => ({
      id: `site-reminder:${node.id}`,
      eventId: node.id,
      schoolId: node.schoolId,
      eventKey: node.eventKey,
      title: node.title,
      dueAt: node.endsAt ?? node.startsAt,
      status: node.status,
      delivery: "site_only",
      channels: ["timeline", "personal_center"]
    }));
}

/**
 * Reads one published timeline node by id.
 *
 * @param {string} timelineEventId
 * @returns {import("./seed-data.js").TimelineEventSeed | null}
 */
export function getTimelineEventById(timelineEventId) {
  return listTimelineEvents().find((event) => event.id === timelineEventId) ?? null;
}

/**
 * Lists published score formulas whose parent guide and school are visible.
 *
 * @param {GuideFilters} [filters]
 * @returns {ReadonlyArray<import("./seed-data.js").ScoreFormulaSeed>}
 */
export function listScoreFormulas(filters = {}) {
  const guideIds = visibleGuideIds();

  return scoreFormulas()
    .filter((formula) => isPublished(formula))
    .filter((formula) => guideIds.has(formula.admissionGuideId))
    .filter((formula) => !filters.schoolId || formula.schoolId === filters.schoolId)
    .filter((formula) => !filters.year || formula.admissionYear === filters.year)
    .sort((left, right) => {
      if (right.admissionYear !== left.admissionYear) {
        return right.admissionYear - left.admissionYear;
      }

      if (right.version !== left.version) {
        return right.version - left.version;
      }

      return String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
    });
}

/**
 * Reads the published score formula for one school year, if the official data
 * includes an explicit formula.
 *
 * @param {{schoolId: string, year: number}} filters
 * @returns {import("./seed-data.js").ScoreFormulaSeed | null}
 */
export function getScoreFormula(filters) {
  return listScoreFormulas({ schoolId: filters.schoolId, year: filters.year })[0] ?? null;
}

/**
 * Reads one published score formula by id.
 *
 * @param {string} formulaId
 * @returns {import("./seed-data.js").ScoreFormulaSeed | null}
 */
export function getScoreFormulaById(formulaId) {
  return listScoreFormulas().find((formula) => formula.id === formulaId) ?? null;
}

/**
 * Calculates a public comprehensive score from a published school-year formula.
 * Each input score is normalized to the formula output scale before applying
 * the configured weight, so differently scaled inputs can be combined.
 *
 * @param {{schoolId: string, year: number | string, scores: Record<string, number | string>}} input
 * @returns {{
 *   schoolId: string,
 *   year: number,
 *   formulaId: string,
 *   formulaName: string,
 *   formulaType: string,
 *   totalScore: number,
 *   outputMaxScore: number,
 *   breakdown: Array<{
 *     key: string,
 *     label: string,
 *     score: number,
 *     maxScore: number,
 *     normalizedScore: number,
 *     weight: number,
 *     contribution: number
 *   }>,
 *   explanation: string,
 *   officialSourceUrl: string,
 *   disclaimer: string
 * }}
 */
export function calculateScore(input = {}) {
  const schoolId = typeof input.schoolId === "string" ? input.schoolId.trim() : "";
  const year = normalizeCalculationYear(input.year);
  const scores = assertCalculationScores(input.scores);

  if (!schoolId) {
    throw new ScoreCalculationError("missing_school", "School id is required.");
  }

  const formula = getScoreFormula({ schoolId, year });

  if (!formula) {
    throw new ScoreCalculationError(
      "formula_not_available",
      "No published score formula is available for this school and year.",
      404
    );
  }

  const calculation = calculateFormulaRecordScore(formula, scores);

  return {
    schoolId: formula.schoolId,
    year: formula.admissionYear,
    formulaId: formula.id,
    formulaName: formula.formulaName,
    formulaType: formula.formulaType,
    totalScore: calculation.totalScore,
    outputMaxScore: calculation.outputMaxScore,
    breakdown: calculation.breakdown,
    explanation: formula.explanation,
    officialSourceUrl: formula.officialSourceUrl,
    disclaimer: "This calculation follows published formula fields for reference only and is not an admission probability or ranking prediction."
  };
}

/**
 * Lists published interview experiences for public student views.
 *
 * @param {ExperienceFilters} [filters]
 * @returns {ReadonlyArray<import("./seed-data.js").ExperienceSeed>}
 */
export function listExperiences(filters = {}) {
  const sort = filters.sort ?? "newest";
  const experiences = seedData.experiences
    .filter((experience) => experience.status === publishedStatus)
    .filter((experience) => getPublishedSchoolById(experience.schoolId))
    .filter((experience) => !filters.schoolId || experience.schoolId === filters.schoolId)
    .filter((experience) => !filters.year || experience.admissionYear === filters.year)
    .filter((experience) => !filters.stage || experience.stage === filters.stage)
    .filter((experience) => !filters.assessmentType || experience.assessmentTypes.includes(filters.assessmentType))
    .filter((experience) => {
      if (typeof filters.verified !== "boolean") {
        return true;
      }

      return (experience.verificationStatus === "verified") === filters.verified;
    })
    .sort(compareExperienceRecency);

  if (sort === "useful" || sort === "useful_count") {
    return experiences.sort(compareExperienceUsefulCount);
  }

  if (sort === "verified" || sort === "verified_first") {
    return experiences.sort(compareExperienceVerifiedFirst);
  }

  return experiences;
}

/**
 * Reads one published interview experience by id.
 *
 * @param {string} experienceId
 * @returns {import("./seed-data.js").ExperienceSeed | null}
 */
export function getExperienceById(experienceId) {
  return listExperiences().find((experience) => experience.id === experienceId) ?? null;
}
