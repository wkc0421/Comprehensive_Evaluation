import { seedData } from "./seed-data.js";

const publishedStatus = "published";
const dueSoonWindowMs = 7 * 24 * 60 * 60 * 1000;

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

function getPublishedSchoolById(schoolId) {
  return seedData.schools.find((school) => school.id === schoolId && isPublished(school)) ?? null;
}

function publishedGuides() {
  return seedData.admissionGuides.filter((guide) => isPublished(guide) && getPublishedSchoolById(guide.schoolId));
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
  const guides = input.guides ?? seedData.admissionGuides;
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

  return seedData.timelineEvents
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
            startsAt: dates.startsAt,
            endsAt: dates.endsAt,
            officialDataStatus: explicitEvent?.status ?? guide.status,
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

  return seedData.scoreFormulas
    .filter((formula) => isPublished(formula))
    .filter((formula) => guideIds.has(formula.admissionGuideId))
    .filter((formula) => !filters.schoolId || formula.schoolId === filters.schoolId)
    .filter((formula) => !filters.year || formula.admissionYear === filters.year)
    .sort((left, right) => right.admissionYear - left.admissionYear);
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
  const totalScore = roundScore(breakdown.reduce((total, item) => total + item.contribution, 0));

  return {
    schoolId: formula.schoolId,
    year: formula.admissionYear,
    formulaId: formula.id,
    formulaName: formula.formulaName,
    formulaType: formula.formulaType,
    totalScore,
    outputMaxScore,
    breakdown,
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
