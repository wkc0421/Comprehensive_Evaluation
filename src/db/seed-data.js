/**
 * @typedef {"draft" | "pending_review" | "published" | "archived"} OfficialDataStatus
 * @typedef {"draft" | "pending_review" | "published" | "rejected" | "hidden"} ExperienceStatus
 *
 * @typedef {object} SchoolSeed
 * @property {string} id
 * @property {string} name
 * @property {string} normalizedName
 * @property {"guangdong"} provinceScope
 * @property {string} city
 * @property {string} schoolType
 * @property {string} officialWebsiteUrl
 * @property {OfficialDataStatus} status
 * @property {string} updatedAt
 *
 * @typedef {object} AdmissionGuideSeed
 * @property {string} id
 * @property {string} schoolId
 * @property {number} admissionYear
 * @property {"guangdong"} provinceScope
 * @property {OfficialDataStatus} status
 * @property {number} version
 * @property {boolean} isCurrent
 * @property {string} officialSourceUrl
 * @property {string} applicationUrl
 * @property {string} guideTitle
 * @property {string} summary
 * @property {string} applicationStatus
 * @property {string | null} applicationStartAt
 * @property {string | null} applicationDeadlineAt
 * @property {Array<{name: string, track: string}>} majors
 * @property {string[]} subjectRequirements
 * @property {string} academicTestRequirements
 * @property {string} assessmentMethod
 * @property {string} admissionRule
 * @property {{applicationFeeCny?: number, assessmentFeeCny?: number}} fees
 * @property {{phone?: string, email?: string}} contact
 * @property {string} publishedAt
 * @property {string} updatedAt
 *
 * @typedef {object} TimelineEventSeed
 * @property {string} id
 * @property {string} admissionGuideId
 * @property {string} schoolId
 * @property {string} eventKey
 * @property {string} title
 * @property {string | null} startsAt
 * @property {string | null} endsAt
 * @property {OfficialDataStatus} status
 *
 * @typedef {object} ScoreFormulaSeed
 * @property {string} id
 * @property {string} admissionGuideId
 * @property {string} schoolId
 * @property {number} admissionYear
 * @property {"guangdong"} provinceScope
 * @property {OfficialDataStatus} status
 * @property {number} version
 * @property {string} formulaName
 * @property {"weighted_sum" | "custom" | "not_specified"} formulaType
 * @property {{inputs: Array<{key: string, label: string, maxScore: number, weight: number}>, outputMaxScore: number}} formulaConfig
 * @property {string} explanation
 * @property {string} officialSourceUrl
 *
 * @typedef {object} ExperienceSeed
 * @property {string} id
 * @property {string} schoolId
 * @property {number} admissionYear
 * @property {"guangdong"} provinceScope
 * @property {ExperienceStatus} status
 * @property {string} majorGroup
 * @property {string} candidateTrack
 * @property {string} stage
 * @property {string[]} assessmentTypes
 * @property {string} location
 * @property {string} summary
 * @property {string} processSummary
 * @property {string[]} questionTypes
 * @property {string} preparationSummary
 * @property {number} difficultyScore
 * @property {number} pressureScore
 * @property {number} differentiationScore
 * @property {string} advice
 * @property {boolean} isAnonymous
 * @property {"pending_review" | "verified" | "rejected" | "hidden"} verificationStatus
 * @property {number} usefulCount
 * @property {string} createdAt
 */

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return value;
}

export const seedIds = deepFreeze({
  schools: {
    sysu: "00000000-0000-4000-8000-000000000001",
    scut: "00000000-0000-4000-8000-000000000002",
    sustech: "00000000-0000-4000-8000-000000000003"
  },
  guides: {
    sysu2026: "10000000-0000-4000-8000-000000000001",
    sysu2025: "10000000-0000-4000-8000-000000000002",
    sysu2024Archived: "10000000-0000-4000-8000-000000000003",
    scut2026Pending: "10000000-0000-4000-8000-000000000004",
    scut2025: "10000000-0000-4000-8000-000000000005",
    scut2024: "10000000-0000-4000-8000-000000000006",
    sustech2026Draft: "10000000-0000-4000-8000-000000000007",
    sustech2025: "10000000-0000-4000-8000-000000000008",
    sustech2024: "10000000-0000-4000-8000-000000000009"
  },
  formulas: {
    sysu2026: "20000000-0000-4000-8000-000000000001",
    sysu2025: "20000000-0000-4000-8000-000000000002",
    scut2024: "20000000-0000-4000-8000-000000000003",
    sustech2025Pending: "20000000-0000-4000-8000-000000000004"
  },
  experiences: {
    sysu2026: "30000000-0000-4000-8000-000000000001",
    scut2025: "30000000-0000-4000-8000-000000000002",
    sustech2024: "30000000-0000-4000-8000-000000000003",
    pending: "30000000-0000-4000-8000-000000000004"
  }
});

/** @type {ReadonlyArray<SchoolSeed>} */
const schools = [
  {
    id: seedIds.schools.sysu,
    name: "Sun Yat-sen University",
    normalizedName: "sun-yat-sen-university",
    provinceScope: "guangdong",
    city: "Guangzhou",
    schoolType: "985 comprehensive university",
    officialWebsiteUrl: "https://example.edu/sysu/admissions",
    status: "published",
    updatedAt: "2026-04-10T09:00:00.000Z"
  },
  {
    id: seedIds.schools.scut,
    name: "South China University of Technology",
    normalizedName: "south-china-university-of-technology",
    provinceScope: "guangdong",
    city: "Guangzhou",
    schoolType: "985 science and engineering university",
    officialWebsiteUrl: "https://example.edu/scut/admissions",
    status: "published",
    updatedAt: "2026-03-28T09:00:00.000Z"
  },
  {
    id: seedIds.schools.sustech,
    name: "Southern University of Science and Technology",
    normalizedName: "southern-university-of-science-and-technology",
    provinceScope: "guangdong",
    city: "Shenzhen",
    schoolType: "research university",
    officialWebsiteUrl: "https://example.edu/sustech/admissions",
    status: "published",
    updatedAt: "2026-03-16T09:00:00.000Z"
  }
];

function guideFields(overrides) {
  return {
    provinceScope: "guangdong",
    version: 1,
    isCurrent: true,
    applicationUrl: "https://example.edu/apply",
    applicationStatus: "open",
    majors: [
      { name: "Experimental science program", track: "physics" },
      { name: "Humanities pilot program", track: "history" }
    ],
    subjectRequirements: ["Physics or history track accepted by program"],
    academicTestRequirements: "Academic level examination results must meet the school notice.",
    assessmentMethod: "Materials review plus school assessment.",
    admissionRule: "Comprehensive score is used with the official admissions rules.",
    fees: { applicationFeeCny: 0, assessmentFeeCny: 0 },
    contact: { phone: "020-00000000", email: "admission@example.edu" },
    ...overrides
  };
}

/** @type {ReadonlyArray<AdmissionGuideSeed>} */
const admissionGuides = [
  guideFields({
    id: seedIds.guides.sysu2026,
    schoolId: seedIds.schools.sysu,
    admissionYear: 2026,
    status: "published",
    officialSourceUrl: "https://example.edu/sysu/2026-comprehensive-evaluation-guide",
    guideTitle: "Sun Yat-sen University 2026 Guangdong Comprehensive Evaluation Guide",
    summary: "Published guide for Guangdong candidates with application dates, assessment requirements, and score conversion rules.",
    applicationStartAt: "2026-03-18T01:00:00.000Z",
    applicationDeadlineAt: "2026-04-20T15:59:59.000Z",
    publishedAt: "2026-03-15T02:00:00.000Z",
    updatedAt: "2026-04-10T09:00:00.000Z"
  }),
  guideFields({
    id: seedIds.guides.sysu2025,
    schoolId: seedIds.schools.sysu,
    admissionYear: 2025,
    status: "published",
    officialSourceUrl: "https://example.edu/sysu/2025-comprehensive-evaluation-guide",
    guideTitle: "Sun Yat-sen University 2025 Guangdong Comprehensive Evaluation Guide",
    summary: "Published guide with an 85/15 comprehensive score rule for 2025 candidates.",
    applicationStartAt: "2025-03-20T01:00:00.000Z",
    applicationDeadlineAt: "2025-04-18T15:59:59.000Z",
    publishedAt: "2025-03-16T02:00:00.000Z",
    updatedAt: "2025-04-12T09:00:00.000Z"
  }),
  guideFields({
    id: seedIds.guides.sysu2024Archived,
    schoolId: seedIds.schools.sysu,
    admissionYear: 2024,
    status: "archived",
    officialSourceUrl: "https://example.edu/sysu/2024-comprehensive-evaluation-guide",
    guideTitle: "Sun Yat-sen University 2024 Guangdong Comprehensive Evaluation Guide",
    summary: "Archived historical guide that should not appear in student-facing helpers.",
    applicationStartAt: "2024-03-18T01:00:00.000Z",
    applicationDeadlineAt: "2024-04-20T15:59:59.000Z",
    publishedAt: "2024-03-15T02:00:00.000Z",
    updatedAt: "2024-08-01T09:00:00.000Z"
  }),
  guideFields({
    id: seedIds.guides.scut2026Pending,
    schoolId: seedIds.schools.scut,
    admissionYear: 2026,
    status: "pending_review",
    officialSourceUrl: "https://example.edu/scut/2026-comprehensive-evaluation-guide",
    guideTitle: "South China University of Technology 2026 Draft Review Guide",
    summary: "Pending review guide that should stay hidden until data review is complete.",
    applicationStartAt: "2026-03-25T01:00:00.000Z",
    applicationDeadlineAt: "2026-04-24T15:59:59.000Z",
    publishedAt: "2026-03-20T02:00:00.000Z",
    updatedAt: "2026-03-28T09:00:00.000Z"
  }),
  guideFields({
    id: seedIds.guides.scut2025,
    schoolId: seedIds.schools.scut,
    admissionYear: 2025,
    status: "published",
    officialSourceUrl: "https://example.edu/scut/2025-comprehensive-evaluation-guide",
    guideTitle: "South China University of Technology 2025 Guangdong Comprehensive Evaluation Guide",
    summary: "Published guide with timeline data but no explicit score formula.",
    applicationStartAt: "2025-03-22T01:00:00.000Z",
    applicationDeadlineAt: "2025-04-22T15:59:59.000Z",
    publishedAt: "2025-03-17T02:00:00.000Z",
    updatedAt: "2025-04-01T09:00:00.000Z"
  }),
  guideFields({
    id: seedIds.guides.scut2024,
    schoolId: seedIds.schools.scut,
    admissionYear: 2024,
    status: "published",
    officialSourceUrl: "https://example.edu/scut/2024-comprehensive-evaluation-guide",
    guideTitle: "South China University of Technology 2024 Guangdong Comprehensive Evaluation Guide",
    summary: "Published guide for 2024 historical browsing and formula tests.",
    applicationStartAt: "2024-03-21T01:00:00.000Z",
    applicationDeadlineAt: "2024-04-21T15:59:59.000Z",
    publishedAt: "2024-03-16T02:00:00.000Z",
    updatedAt: "2024-04-08T09:00:00.000Z"
  }),
  guideFields({
    id: seedIds.guides.sustech2026Draft,
    schoolId: seedIds.schools.sustech,
    admissionYear: 2026,
    status: "draft",
    officialSourceUrl: "https://example.edu/sustech/2026-comprehensive-evaluation-guide",
    guideTitle: "Southern University of Science and Technology 2026 Working Draft",
    summary: "Draft guide that should not be visible to visitors.",
    applicationStartAt: null,
    applicationDeadlineAt: null,
    publishedAt: "2026-03-12T02:00:00.000Z",
    updatedAt: "2026-03-16T09:00:00.000Z"
  }),
  guideFields({
    id: seedIds.guides.sustech2025,
    schoolId: seedIds.schools.sustech,
    admissionYear: 2025,
    status: "published",
    officialSourceUrl: "https://example.edu/sustech/2025-comprehensive-evaluation-guide",
    guideTitle: "Southern University of Science and Technology 2025 Guangdong Comprehensive Evaluation Guide",
    summary: "Published guide for Shenzhen applicants with interview and machine test information.",
    applicationStartAt: "2025-03-12T01:00:00.000Z",
    applicationDeadlineAt: "2025-04-10T15:59:59.000Z",
    publishedAt: "2025-03-08T02:00:00.000Z",
    updatedAt: "2025-03-25T09:00:00.000Z"
  }),
  guideFields({
    id: seedIds.guides.sustech2024,
    schoolId: seedIds.schools.sustech,
    admissionYear: 2024,
    status: "published",
    officialSourceUrl: "https://example.edu/sustech/2024-comprehensive-evaluation-guide",
    guideTitle: "Southern University of Science and Technology 2024 Guangdong Comprehensive Evaluation Guide",
    summary: "Published 2024 guide with no explicit score formula.",
    applicationStartAt: "2024-03-13T01:00:00.000Z",
    applicationDeadlineAt: "2024-04-10T15:59:59.000Z",
    publishedAt: "2024-03-08T02:00:00.000Z",
    updatedAt: "2024-03-24T09:00:00.000Z"
  })
];

/** @type {ReadonlyArray<TimelineEventSeed>} */
const timelineEvents = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    admissionGuideId: seedIds.guides.sysu2026,
    schoolId: seedIds.schools.sysu,
    eventKey: "guide_publication",
    title: "Guide published",
    startsAt: "2026-03-15T02:00:00.000Z",
    endsAt: "2026-03-15T02:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    admissionGuideId: seedIds.guides.sysu2026,
    schoolId: seedIds.schools.sysu,
    eventKey: "application_start",
    title: "Application opens",
    startsAt: "2026-03-18T01:00:00.000Z",
    endsAt: "2026-03-18T01:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000003",
    admissionGuideId: seedIds.guides.sysu2026,
    schoolId: seedIds.schools.sysu,
    eventKey: "application_deadline",
    title: "Application deadline",
    startsAt: "2026-04-20T15:59:59.000Z",
    endsAt: "2026-04-20T15:59:59.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000004",
    admissionGuideId: seedIds.guides.sysu2026,
    schoolId: seedIds.schools.sysu,
    eventKey: "school_assessment",
    title: "School assessment",
    startsAt: "2026-06-14T01:00:00.000Z",
    endsAt: "2026-06-15T10:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000005",
    admissionGuideId: seedIds.guides.scut2025,
    schoolId: seedIds.schools.scut,
    eventKey: "application_start",
    title: "Application opens",
    startsAt: "2025-03-22T01:00:00.000Z",
    endsAt: "2025-03-22T01:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000006",
    admissionGuideId: seedIds.guides.scut2025,
    schoolId: seedIds.schools.scut,
    eventKey: "application_deadline",
    title: "Application deadline",
    startsAt: "2025-04-22T15:59:59.000Z",
    endsAt: "2025-04-22T15:59:59.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000007",
    admissionGuideId: seedIds.guides.scut2024,
    schoolId: seedIds.schools.scut,
    eventKey: "admission_publication",
    title: "Admission results published",
    startsAt: "2024-07-18T02:00:00.000Z",
    endsAt: "2024-07-18T02:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000008",
    admissionGuideId: seedIds.guides.sustech2025,
    schoolId: seedIds.schools.sustech,
    eventKey: "application_deadline",
    title: "Application deadline",
    startsAt: "2025-04-10T15:59:59.000Z",
    endsAt: "2025-04-10T15:59:59.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000009",
    admissionGuideId: seedIds.guides.sustech2024,
    schoolId: seedIds.schools.sustech,
    eventKey: "school_assessment",
    title: "School assessment",
    startsAt: "2024-06-11T01:00:00.000Z",
    endsAt: "2024-06-12T10:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000010",
    admissionGuideId: seedIds.guides.scut2026Pending,
    schoolId: seedIds.schools.scut,
    eventKey: "application_deadline",
    title: "Application deadline under review",
    startsAt: "2026-04-24T15:59:59.000Z",
    endsAt: "2026-04-24T15:59:59.000Z",
    status: "pending_review"
  }
];

/** @type {ReadonlyArray<ScoreFormulaSeed>} */
const scoreFormulas = [
  {
    id: seedIds.formulas.sysu2026,
    admissionGuideId: seedIds.guides.sysu2026,
    schoolId: seedIds.schools.sysu,
    admissionYear: 2026,
    provinceScope: "guangdong",
    status: "published",
    version: 1,
    formulaName: "60/30/10 comprehensive score",
    formulaType: "weighted_sum",
    formulaConfig: {
      inputs: [
        { key: "gaokao", label: "Gaokao score", maxScore: 750, weight: 0.6 },
        { key: "schoolAssessment", label: "School assessment", maxScore: 100, weight: 0.3 },
        { key: "academicLevel", label: "Academic level conversion", maxScore: 100, weight: 0.1 }
      ],
      outputMaxScore: 100
    },
    explanation: "Gaokao, school assessment, and academic level conversion are weighted 60%, 30%, and 10%.",
    officialSourceUrl: "https://example.edu/sysu/2026-comprehensive-evaluation-guide"
  },
  {
    id: seedIds.formulas.sysu2025,
    admissionGuideId: seedIds.guides.sysu2025,
    schoolId: seedIds.schools.sysu,
    admissionYear: 2025,
    provinceScope: "guangdong",
    status: "published",
    version: 1,
    formulaName: "85/15 comprehensive score",
    formulaType: "weighted_sum",
    formulaConfig: {
      inputs: [
        { key: "gaokao", label: "Gaokao score", maxScore: 750, weight: 0.85 },
        { key: "schoolAssessment", label: "School assessment", maxScore: 100, weight: 0.15 }
      ],
      outputMaxScore: 100
    },
    explanation: "Gaokao and school assessment are converted to a 100-point scale and weighted 85% and 15%.",
    officialSourceUrl: "https://example.edu/sysu/2025-comprehensive-evaluation-guide"
  },
  {
    id: seedIds.formulas.scut2024,
    admissionGuideId: seedIds.guides.scut2024,
    schoolId: seedIds.schools.scut,
    admissionYear: 2024,
    provinceScope: "guangdong",
    status: "published",
    version: 1,
    formulaName: "70/30 comprehensive score",
    formulaType: "weighted_sum",
    formulaConfig: {
      inputs: [
        { key: "gaokao", label: "Gaokao score", maxScore: 750, weight: 0.7 },
        { key: "schoolAssessment", label: "School assessment", maxScore: 100, weight: 0.3 }
      ],
      outputMaxScore: 100
    },
    explanation: "Gaokao and school assessment are converted and weighted 70% and 30%.",
    officialSourceUrl: "https://example.edu/scut/2024-comprehensive-evaluation-guide"
  },
  {
    id: seedIds.formulas.sustech2025Pending,
    admissionGuideId: seedIds.guides.sustech2025,
    schoolId: seedIds.schools.sustech,
    admissionYear: 2025,
    provinceScope: "guangdong",
    status: "pending_review",
    version: 1,
    formulaName: "Pending formula review",
    formulaType: "weighted_sum",
    formulaConfig: {
      inputs: [
        { key: "gaokao", label: "Gaokao score", maxScore: 750, weight: 0.6 },
        { key: "schoolAssessment", label: "School assessment", maxScore: 100, weight: 0.4 }
      ],
      outputMaxScore: 100
    },
    explanation: "Review-only formula that must not be visible to visitors.",
    officialSourceUrl: "https://example.edu/sustech/2025-comprehensive-evaluation-guide"
  }
];

/** @type {ReadonlyArray<ExperienceSeed>} */
const experiences = [
  {
    id: seedIds.experiences.sysu2026,
    schoolId: seedIds.schools.sysu,
    admissionYear: 2026,
    provinceScope: "guangdong",
    status: "published",
    majorGroup: "Science pilot group",
    candidateTrack: "physics",
    stage: "school_assessment",
    assessmentTypes: ["structured_interview", "group_discussion"],
    location: "Guangzhou campus",
    summary: "Interview focused on motivation, experiment design, and current affairs reasoning.",
    processSummary: "Candidates checked in, joined a group discussion, then completed a structured individual interview.",
    questionTypes: ["motivation", "experiment_design", "current_affairs"],
    preparationSummary: "Review personal statement materials and practice concise experiment design explanations.",
    difficultyScore: 4,
    pressureScore: 3,
    differentiationScore: 4,
    advice: "Use examples from coursework and avoid guessing policy details beyond the prompt.",
    isAnonymous: true,
    verificationStatus: "verified",
    usefulCount: 18,
    createdAt: "2026-05-02T08:00:00.000Z"
  },
  {
    id: seedIds.experiences.scut2025,
    schoolId: seedIds.schools.scut,
    admissionYear: 2025,
    provinceScope: "guangdong",
    status: "published",
    majorGroup: "Engineering pilot group",
    candidateTrack: "physics",
    stage: "school_assessment",
    assessmentTypes: ["structured_interview"],
    location: "Guangzhou campus",
    summary: "Questions emphasized engineering interest, project reflection, and teamwork.",
    processSummary: "The assessment used one individual interview panel and several follow-up questions.",
    questionTypes: ["project_reflection", "teamwork", "major_interest"],
    preparationSummary: "Prepare a short project story with role, difficulty, and result clearly separated.",
    difficultyScore: 3,
    pressureScore: 3,
    differentiationScore: 3,
    advice: "Explain why the selected engineering major fits your high school experience.",
    isAnonymous: true,
    verificationStatus: "verified",
    usefulCount: 11,
    createdAt: "2025-06-25T08:00:00.000Z"
  },
  {
    id: seedIds.experiences.sustech2024,
    schoolId: seedIds.schools.sustech,
    admissionYear: 2024,
    provinceScope: "guangdong",
    status: "published",
    majorGroup: "Science innovation group",
    candidateTrack: "physics",
    stage: "school_assessment",
    assessmentTypes: ["machine_test", "structured_interview"],
    location: "Shenzhen campus",
    summary: "Machine test required time management before a short science interview.",
    processSummary: "Candidates completed a computer-based assessment and then discussed science learning plans.",
    questionTypes: ["math_reasoning", "learning_plan", "science_interest"],
    preparationSummary: "Practice timed reasoning questions and prepare a direct research-interest statement.",
    difficultyScore: 4,
    pressureScore: 4,
    differentiationScore: 4,
    advice: "Leave enough time to verify answers in the machine test.",
    isAnonymous: true,
    verificationStatus: "verified",
    usefulCount: 15,
    createdAt: "2024-06-30T08:00:00.000Z"
  },
  {
    id: seedIds.experiences.pending,
    schoolId: seedIds.schools.sysu,
    admissionYear: 2026,
    provinceScope: "guangdong",
    status: "pending_review",
    majorGroup: "Review-only group",
    candidateTrack: "history",
    stage: "school_assessment",
    assessmentTypes: ["structured_interview"],
    location: "Guangzhou campus",
    summary: "Pending review experience that must remain hidden.",
    processSummary: "Pending review process summary.",
    questionTypes: ["motivation"],
    preparationSummary: "Pending review preparation.",
    difficultyScore: 2,
    pressureScore: 2,
    differentiationScore: 2,
    advice: "Pending review advice.",
    isAnonymous: true,
    verificationStatus: "pending_review",
    usefulCount: 0,
    createdAt: "2026-05-10T08:00:00.000Z"
  }
];

export const seedData = deepFreeze({
  schools,
  admissionGuides,
  timelineEvents,
  scoreFormulas,
  experiences
});
