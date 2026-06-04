import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDataQualityReport,
  guideCoverageTarget,
  guideCoverageYears
} from "../scripts/data-quality.mjs";

describe("MVP data quality gate", () => {
  it("reports 2024 through 2026 guide coverage and validates student-visible official data", () => {
    const report = buildDataQualityReport({
      years: guideCoverageYears,
      target: guideCoverageTarget
    });

    assert.equal(report.passed, true);
    assert.deepEqual(report.coverage.years, [2024, 2025, 2026]);
    assert.equal(report.coverage.target, 0.95);
    assert.equal(report.coverage.annualCoverage.coveredYears, 3);
    assert.equal(report.coverage.annualCoverage.totalYears, 3);
    assert.equal(report.coverage.annualCoverage.targetMet, true);
    assert.equal(report.coverage.schoolYearCoverage.coveredSlots, 6);
    assert.equal(report.coverage.schoolYearCoverage.totalSlots, 9);
    assert.ok(report.publishedGuideCount > 0);
    assert.ok(report.publishedFormulaCount > 0);
    assert.deepEqual(report.failures, []);
  });
});
