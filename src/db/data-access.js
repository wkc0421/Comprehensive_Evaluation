import { seedData } from "./seed-data.js";

const publishedStatus = "published";

/**
 * @typedef {object} SchoolFilters
 * @property {number} [year]
 * @property {string} [keyword]
 *
 * @typedef {object} GuideFilters
 * @property {string} [schoolId]
 * @property {number} [year]
 *
 * @typedef {object} TimelineFilters
 * @property {string} [admissionGuideId]
 * @property {string} [schoolId]
 * @property {number} [year]
 * @property {string} [eventKey]
 *
 * @typedef {object} ExperienceFilters
 * @property {string} [schoolId]
 * @property {number} [year]
 * @property {string} [stage]
 * @property {string} [assessmentType]
 * @property {boolean} [verified]
 */

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

function normalizeKeyword(keyword) {
  return typeof keyword === "string" ? keyword.trim().toLowerCase() : "";
}

function getPublishedSchoolById(schoolId) {
  return seedData.schools.find((school) => school.id === schoolId && isPublished(school)) ?? null;
}

function visibleGuides() {
  return seedData.admissionGuides.filter((guide) => isPublished(guide) && getPublishedSchoolById(guide.schoolId));
}

function visibleGuideIds() {
  return new Set(visibleGuides().map((guide) => guide.id));
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
  return visibleGuides()
    .filter((guide) => !filters.schoolId || guide.schoolId === filters.schoolId)
    .filter((guide) => !filters.year || guide.admissionYear === filters.year)
    .sort(compareGuideRecency);
}

/**
 * Reads one published admission guide by id.
 *
 * @param {string} guideId
 * @returns {import("./seed-data.js").AdmissionGuideSeed | null}
 */
export function getGuideById(guideId) {
  return listGuides().find((guide) => guide.id === guideId) ?? null;
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
 * Lists published interview experiences for public student views.
 *
 * @param {ExperienceFilters} [filters]
 * @returns {ReadonlyArray<import("./seed-data.js").ExperienceSeed>}
 */
export function listExperiences(filters = {}) {
  return seedData.experiences
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
