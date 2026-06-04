import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getExperienceById,
  getGuideById,
  getSchoolById,
  getScoreFormula,
  getScoreFormulaById,
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
