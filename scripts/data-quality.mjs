import { pathToFileURL } from "node:url";

import {
  getSchoolById,
  listExperiences,
  listGuides,
  listSchoolGuideCards,
  listSchools,
  listScoreFormulas,
  listTimelineNodes
} from "../src/db/data-access.js";
import { seedData } from "../src/db/seed-data.js";

export const guideCoverageYears = Object.freeze([2024, 2025, 2026]);
export const guideCoverageTarget = 0.95;

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function requiredGuideFieldFailures(guides) {
  const failures = [];

  for (const guide of guides) {
    const sourceTimestamp = guide.sourcePublishedAt ?? guide.sourceUpdatedAt;
    const school = getSchoolById(guide.schoolId);

    if (!school) {
      failures.push(`${guide.id} references a missing published school`);
    }

    if (!guide.officialSourceUrl) {
      failures.push(`${guide.id} is missing an official source link`);
    }

    if (!Number.isInteger(guide.admissionYear)) {
      failures.push(`${guide.id} is missing a valid year`);
    }

    if (!guide.guideTitle) {
      failures.push(`${guide.id} is missing a guide title`);
    }

    if (!sourceTimestamp) {
      failures.push(`${guide.id} is missing source published or updated time`);
    }
  }

  return failures;
}

function formulaQualityFailures(formulas) {
  const failures = [];

  for (const formula of formulas) {
    if (!formula.officialSourceUrl) {
      failures.push(`${formula.id} is missing a formula source link`);
    }

    if (!formula.explanation) {
      failures.push(`${formula.id} is missing a formula explanation`);
    }
  }

  return failures;
}

function hiddenOfficialDataFailures() {
  const failures = [];
  const hiddenGuideIds = new Set(
    seedData.admissionGuides
      .filter((guide) => guide.status !== "published" || !guide.isCurrent)
      .map((guide) => guide.id)
  );
  const visibleGuideIds = new Set([
    ...listGuides().map((guide) => guide.id),
    ...listSchoolGuideCards().map((card) => card.guide.id),
    ...guideCoverageYears.flatMap((year) => listTimelineNodes({ year }).map((node) => node.admissionGuideId))
  ]);
  const hiddenFormulaIds = new Set(
    seedData.scoreFormulas
      .filter((formula) => formula.status !== "published")
      .map((formula) => formula.id)
  );
  const visibleFormulaIds = new Set(listScoreFormulas().map((formula) => formula.id));

  for (const guideId of hiddenGuideIds) {
    if (visibleGuideIds.has(guideId)) {
      failures.push(`${guideId} is hidden official guide data but appears in student-facing helpers`);
    }
  }

  for (const formulaId of hiddenFormulaIds) {
    if (visibleFormulaIds.has(formulaId)) {
      failures.push(`${formulaId} is hidden official formula data but appears in student-facing helpers`);
    }
  }

  if (listGuides({ status: "draft" }).length > 0 || listGuides({ status: "pending_review" }).length > 0) {
    failures.push("Draft or pending_review guide filters returned student-visible records");
  }

  return failures;
}

function studentExperienceVisibilityFailures() {
  const failures = [];
  const hiddenExperienceIds = new Set(
    seedData.experiences
      .filter((experience) => experience.status !== "published")
      .map((experience) => experience.id)
  );
  const visibleExperienceIds = new Set(listExperiences().map((experience) => experience.id));

  for (const experienceId of hiddenExperienceIds) {
    if (visibleExperienceIds.has(experienceId)) {
      failures.push(`${experienceId} is hidden experience data but appears in student-facing helpers`);
    }
  }

  return failures;
}

function buildCoverageReport(years, target) {
  const schools = listSchools();
  const annualRows = years.map((year) => {
    const guides = listGuides({ year });

    return {
      year,
      publishedGuideCount: guides.length,
      covered: guides.length > 0
    };
  });
  const coveredYears = annualRows.filter((row) => row.covered).length;
  const schoolYearRows = schools.flatMap((school) => {
    return years.map((year) => {
      const guides = listGuides({ schoolId: school.id, year });

      return {
        schoolId: school.id,
        schoolName: school.name,
        year,
        publishedGuideCount: guides.length,
        covered: guides.length > 0
      };
    });
  });
  const coveredSchoolYears = schoolYearRows.filter((row) => row.covered).length;
  const annualCoverageRatio = ratio(coveredYears, years.length);
  const schoolYearCoverageRatio = ratio(coveredSchoolYears, schoolYearRows.length);

  return {
    years,
    target,
    annualCoverage: {
      coveredYears,
      totalYears: years.length,
      ratio: annualCoverageRatio,
      targetMet: annualCoverageRatio >= target,
      rows: annualRows
    },
    schoolYearCoverage: {
      coveredSlots: coveredSchoolYears,
      totalSlots: schoolYearRows.length,
      ratio: schoolYearCoverageRatio,
      targetMet: schoolYearCoverageRatio >= target,
      rows: schoolYearRows
    }
  };
}

export function buildDataQualityReport(options = {}) {
  const years = options.years ?? guideCoverageYears;
  const target = options.target ?? guideCoverageTarget;
  const publishedGuides = years.flatMap((year) => listGuides({ year }));
  const publishedFormulas = listScoreFormulas().filter((formula) => years.includes(formula.admissionYear));
  const coverage = buildCoverageReport(years, target);
  const failures = [
    ...requiredGuideFieldFailures(publishedGuides),
    ...formulaQualityFailures(publishedFormulas),
    ...hiddenOfficialDataFailures(),
    ...studentExperienceVisibilityFailures()
  ];

  if (!coverage.annualCoverage.targetMet) {
    failures.push(
      `Published guide annual coverage is ${percent(coverage.annualCoverage.ratio)}, below the ${percent(target)} target`
    );
  }

  return {
    checkedAt: new Date().toISOString(),
    coverage,
    publishedGuideCount: publishedGuides.length,
    publishedFormulaCount: publishedFormulas.length,
    failures,
    passed: failures.length === 0
  };
}

export function formatDataQualityReport(report) {
  const lines = [
    "Data quality report",
    `- Years checked: ${report.coverage.years.join(", ")}`,
    `- Annual guide coverage: ${report.coverage.annualCoverage.coveredYears}/${report.coverage.annualCoverage.totalYears} (${percent(report.coverage.annualCoverage.ratio)}) against ${percent(report.coverage.target)} target`,
    `- School-year guide coverage: ${report.coverage.schoolYearCoverage.coveredSlots}/${report.coverage.schoolYearCoverage.totalSlots} (${percent(report.coverage.schoolYearCoverage.ratio)})`,
    `- Published guides checked: ${report.publishedGuideCount}`,
    `- Published calculable formulas checked: ${report.publishedFormulaCount}`,
    `- Result: ${report.passed ? "passed" : "failed"}`
  ];

  if (report.failures.length > 0) {
    lines.push("- Failures:");
    lines.push(...report.failures.map((failure) => `  - ${failure}`));
  }

  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const report = buildDataQualityReport();

  console.log(formatDataQualityReport(report));

  if (!report.passed) {
    process.exit(1);
  }
}
