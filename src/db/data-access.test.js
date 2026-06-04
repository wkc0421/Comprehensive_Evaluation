import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createGuideVersion,
  getExperienceById,
  getGuideDetail,
  getGuideById,
  getSchoolDetail,
  getSchoolById,
  getScoreFormula,
  getScoreFormulaById,
  listSchoolGuideCards,
  getTimelineEventById,
  listExperiences,
  listGuides,
  listSchools,
  listScoreFormulas,
  listTimelineEvents
} from "./data-access.js";
import { seedData, seedIds } from "./seed-data.js";

function ids(records) {
  return records.map((record) => record.id);
}

describe("Guangdong seed data", () => {
  it("covers schools, guide years, guide statuses, timelines, formulas, and published experiences", () => {
    assert.ok(seedData.schools.length >= 3);

    const guideYears = new Set(seedData.admissionGuides.map((guide) => guide.admissionYear));
    assert.deepEqual([...guideYears].sort(), [2024, 2025, 2026]);

    const guideStatuses = new Set(seedData.admissionGuides.map((guide) => guide.status));
    for (const status of ["draft", "pending_review", "published", "archived"]) {
      assert.ok(guideStatuses.has(status), `Expected ${status} guide seed data`);
    }

    assert.ok(seedData.timelineEvents.length > 0);
    assert.ok(seedData.scoreFormulas.length > 0);
    assert.ok(seedData.experiences.some((experience) => experience.status === "published"));
    assert.equal(getScoreFormula({ schoolId: seedIds.schools.scut, year: 2025 }), null);
  });
});

describe("student-facing data access helpers", () => {
  it("return only published official data and published experiences", () => {
    assert.ok(listSchools().every((school) => school.status === "published"));
    assert.ok(listGuides().every((guide) => guide.status === "published"));
    assert.ok(listTimelineEvents().every((event) => event.status === "published"));
    assert.ok(listScoreFormulas().every((formula) => formula.status === "published"));
    assert.ok(listExperiences().every((experience) => experience.status === "published"));

    assert.equal(getGuideById(seedIds.guides.scut2026Pending), null);
    assert.equal(getGuideById(seedIds.guides.sustech2026Draft), null);
    assert.equal(getGuideById(seedIds.guides.sysu2024Archived), null);
    assert.equal(getScoreFormulaById(seedIds.formulas.sustech2025Pending), null);
    assert.equal(getExperienceById(seedIds.experiences.pending), null);
  });

  it("filters schools by year and keyword using published guide data", () => {
    assert.deepEqual(ids(listSchools({ year: 2026 })), [seedIds.schools.sysu]);
    assert.deepEqual(ids(listSchools({ keyword: "shenzhen" })), [seedIds.schools.sustech]);
  });

  it("builds published school guide cards with filters and availability signals", () => {
    const cards = listSchoolGuideCards({
      year: 2025,
      keyword: "Technology",
      applicationStatus: "closed",
      schoolType: "985 science and engineering university"
    });

    assert.equal(cards.length, 1);
    assert.equal(cards[0].school.id, seedIds.schools.scut);
    assert.equal(cards[0].guide.id, seedIds.guides.scut2025);
    assert.equal(cards[0].formula.available, false);
    assert.equal(cards[0].experiences.exists, true);
    assert.ok(cards[0].keyTimelineNodes.some((node) => node.eventKey === "application_deadline"));
  });

  it("builds school detail aggregates with current or latest published guides", () => {
    const sysuDetail = getSchoolDetail({
      schoolId: seedIds.schools.sysu,
      currentYear: 2026
    });
    const scutDetail = getSchoolDetail({
      schoolId: seedIds.schools.scut,
      currentYear: 2026
    });

    assert.equal(sysuDetail?.selectedYear, 2026);
    assert.equal(sysuDetail?.guide.id, seedIds.guides.sysu2026);
    assert.equal(sysuDetail?.formula?.id, seedIds.formulas.sysu2026);
    assert.ok(sysuDetail?.timeline.some((event) => event.eventKey === "school_assessment"));
    assert.deepEqual(sysuDetail?.availableYears, [2026, 2025]);
    assert.equal(sysuDetail?.featuredExperiences[0].schoolId, seedIds.schools.sysu);

    assert.equal(scutDetail?.selectedYear, 2025);
    assert.equal(scutDetail?.guide.id, seedIds.guides.scut2025);
    assert.equal(scutDetail?.formula, null);
    assert.equal(getSchoolDetail({ schoolId: seedIds.schools.scut, year: 2026 }), null);
    assert.equal(getSchoolDetail({ schoolId: "missing-school", year: 2026 }), null);
  });

  it("sorts school guide cards by deadline, update time, and school name", () => {
    assert.deepEqual(
      listSchoolGuideCards({ year: 2025, sort: "deadline" }).map((card) => card.school.id),
      [seedIds.schools.sustech, seedIds.schools.sysu, seedIds.schools.scut]
    );
    assert.deepEqual(
      listSchoolGuideCards({ year: 2025, sort: "updated" }).map((card) => card.school.id),
      [seedIds.schools.sysu, seedIds.schools.scut, seedIds.schools.sustech]
    );
    assert.deepEqual(
      listSchoolGuideCards({ year: 2025, sort: "name" }).map((card) => card.school.id),
      [seedIds.schools.scut, seedIds.schools.sustech, seedIds.schools.sysu]
    );
  });

  it("filters guides by school and year", () => {
    const guideIds2025 = new Set(ids(listGuides({ year: 2025 })));

    assert.deepEqual(guideIds2025, new Set([
      seedIds.guides.sysu2025,
      seedIds.guides.scut2025,
      seedIds.guides.sustech2025
    ]));
    assert.deepEqual(ids(listGuides({ schoolId: seedIds.schools.sysu })), [
      seedIds.guides.sysu2026,
      seedIds.guides.sysu2025
    ]);
    assert.deepEqual(ids(listGuides({ year: 2026, keyword: "score conversion" })), [
      seedIds.guides.sysu2026
    ]);
  });

  it("builds guide detail aggregates with source attribution and version history", () => {
    const detail = getGuideDetail({ guideId: seedIds.guides.sysu2026 });

    assert.equal(detail?.school.id, seedIds.schools.sysu);
    assert.equal(detail?.guide.version, 2);
    assert.equal(detail?.guide.sourceType, "admission_guide");
    assert.equal(detail?.guide.sourcePublishedAt, "2026-03-15T02:00:00.000Z");
    assert.equal(detail?.guide.sourceUpdatedAt, "2026-04-10T08:30:00.000Z");
    assert.deepEqual(detail?.versionHistory.map((guide) => guide.version), [2, 1]);
    assert.equal(detail?.versionHistory[1].id, seedIds.guides.sysu2026Initial);
    assert.equal(getGuideDetail({ guideId: seedIds.guides.scut2026Pending }), null);
    assert.equal(getGuideDetail({ guideId: seedIds.guides.sustech2026Draft }), null);
    assert.equal(getGuideDetail({ guideId: seedIds.guides.sysu2024Archived }), null);
  });

  it("creates new guide versions without overwriting published records", () => {
    const original = getGuideById(seedIds.guides.scut2025);
    const result = createGuideVersion({
      guideId: seedIds.guides.scut2025,
      id: "10000000-0000-4000-8000-000000009999",
      updatedAt: "2025-04-05T09:00:00.000Z",
      versionNotes: "Corrected subject requirement after reviewer check.",
      fields: {
        summary: "Corrected published guide summary.",
        subjectRequirements: ["Physics track required for listed engineering programs"],
        version: 99,
        isCurrent: false
      }
    });

    const previous = result?.guides.find((guide) => guide.id === seedIds.guides.scut2025);

    assert.equal(original?.summary, "Published guide with timeline data but no explicit score formula.");
    assert.equal(result?.guide.version, 2);
    assert.equal(result?.guide.isCurrent, true);
    assert.equal(result?.guide.summary, "Corrected published guide summary.");
    assert.deepEqual(result?.guide.subjectRequirements, ["Physics track required for listed engineering programs"]);
    assert.equal(result?.guide.versionNotes, "Corrected subject requirement after reviewer check.");
    assert.equal(previous?.version, 1);
    assert.equal(previous?.isCurrent, false);
    assert.equal(previous?.summary, original?.summary);
  });

  it("reads only visible records by id", () => {
    assert.equal(getSchoolById(seedIds.schools.sysu)?.name, "Sun Yat-sen University");
    assert.equal(getGuideById(seedIds.guides.sysu2026)?.admissionYear, 2026);
    assert.equal(getTimelineEventById("40000000-0000-4000-8000-000000000001")?.eventKey, "guide_publication");
    assert.equal(getScoreFormulaById(seedIds.formulas.sysu2026)?.formulaName, "60/30/10 comprehensive score");
    assert.equal(getExperienceById(seedIds.experiences.sysu2026)?.verificationStatus, "verified");
  });

  it("filters timelines, formulas, and experiences by school or year", () => {
    const sysu2026Events = listTimelineEvents({ schoolId: seedIds.schools.sysu, year: 2026 });
    assert.ok(sysu2026Events.length > 0);
    assert.ok(sysu2026Events.every((event) => event.schoolId === seedIds.schools.sysu));

    assert.equal(
      getScoreFormula({ schoolId: seedIds.schools.sysu, year: 2026 })?.formulaName,
      "60/30/10 comprehensive score"
    );
    assert.equal(getScoreFormula({ schoolId: seedIds.schools.scut, year: 2025 }), null);

    assert.deepEqual(ids(listExperiences({
      schoolId: seedIds.schools.scut,
      year: 2025,
      assessmentType: "structured_interview",
      verified: true
    })), [seedIds.experiences.scut2025]);
  });
});
