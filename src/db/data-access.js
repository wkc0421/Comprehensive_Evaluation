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

function isRecentExperience(experience, year) {
  return experience.admissionYear <= year && experience.admissionYear >= year - 1;
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
