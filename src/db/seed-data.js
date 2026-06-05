/**
 * @typedef {"draft" | "pending_review" | "published" | "archived"} OfficialDataStatus
 * @typedef {"draft" | "pending_review" | "published" | "rejected" | "hidden"} ExperienceStatus
 *
 * @typedef {object} SchoolSeed
 * @property {string} id
 * @property {string} name
 * @property {string} abbreviation
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
 * @property {"official_notice" | "admission_guide" | "application_portal" | "education_exam_authority" | "manual_upload"} sourceType
 * @property {string} sourceTitle
 * @property {string | null} sourcePublishedAt
 * @property {string | null} sourceUpdatedAt
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
 * @property {string} versionNotes
 * @property {string} publishedAt
 * @property {string} updatedAt
 *
 * @typedef {object} TimelineEventSeed
 * @property {string} id
 * @property {string} admissionGuideId
 * @property {string} schoolId
 * @property {string} eventKey
 * @property {string} title
 * @property {string} [description]
 * @property {string | null} startsAt
 * @property {string | null} endsAt
 * @property {OfficialDataStatus} status
 * @property {string | null} [overrideReason]
 * @property {string | null} [updatedAt]
 * @property {Array<object>} [reviewAudit]
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
 * @property {Array<{name: string, scores: object, expectedTotalScore: number}>} [sampleTests]
 * @property {string | null} [publishedAt]
 * @property {string | null} [updatedAt]
 * @property {Array<object>} [reviewAudit]
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
    sustech2024: "10000000-0000-4000-8000-000000000009",
    sysu2026Initial: "10000000-0000-4000-8000-000000000010"
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
    pending: "30000000-0000-4000-8000-000000000004",
    sysu2026PendingVerification: "30000000-0000-4000-8000-000000000005"
  }
});

/** @type {ReadonlyArray<SchoolSeed>} */
const schools = [
  {
    id: seedIds.schools.sysu,
    name: "中山大学",
    abbreviation: "SYSU",
    normalizedName: "sun-yat-sen-university",
    provinceScope: "guangdong",
    city: "广州",
    schoolType: "985 综合性大学",
    officialWebsiteUrl: "https://example.edu/sysu/admissions",
    status: "published",
    updatedAt: "2026-04-10T09:00:00.000Z"
  },
  {
    id: seedIds.schools.scut,
    name: "华南理工大学",
    abbreviation: "SCUT",
    normalizedName: "south-china-university-of-technology",
    provinceScope: "guangdong",
    city: "广州",
    schoolType: "985 理工类大学",
    officialWebsiteUrl: "https://example.edu/scut/admissions",
    status: "published",
    updatedAt: "2026-03-28T09:00:00.000Z"
  },
  {
    id: seedIds.schools.sustech,
    name: "南方科技大学",
    abbreviation: "SUSTech",
    normalizedName: "southern-university-of-science-and-technology",
    provinceScope: "guangdong",
    city: "深圳",
    schoolType: "研究型大学",
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
    sourceType: overrides.sourceType ?? "admission_guide",
    sourceTitle: overrides.sourceTitle ?? overrides.guideTitle ?? "官方招生简章",
    sourcePublishedAt: overrides.sourcePublishedAt ?? overrides.publishedAt ?? null,
    sourceUpdatedAt: overrides.sourceUpdatedAt ?? overrides.updatedAt ?? overrides.publishedAt ?? null,
    applicationUrl: "https://example.edu/apply",
    applicationStatus: "open",
    majors: [
      { name: "理科试验班", track: "physics" },
      { name: "人文试点班", track: "history" }
    ],
    subjectRequirements: ["按专业组要求接受物理类或历史类考生"],
    academicTestRequirements: "学业水平考试成绩须符合学校招生简章要求。",
    assessmentMethod: "材料审核加学校考核。",
    admissionRule: "按官方招生规则使用综合成绩录取。",
    fees: { applicationFeeCny: 0, assessmentFeeCny: 0 },
    contact: { phone: "020-00000000", email: "admission@example.edu" },
    versionNotes: overrides.versionNotes ?? "初始结构化简章版本。",
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
    version: 2,
    officialSourceUrl: "https://example.edu/sysu/2026-comprehensive-evaluation-guide",
    guideTitle: "中山大学 2026 年广东综合评价招生简章",
    summary: "面向广东考生的已发布简章，包含报名时间、校测要求和成绩折算规则。",
    applicationStartAt: "2026-03-18T01:00:00.000Z",
    applicationDeadlineAt: "2026-04-20T15:59:59.000Z",
    publishedAt: "2026-03-15T02:00:00.000Z",
    updatedAt: "2026-04-10T09:00:00.000Z",
    sourceUpdatedAt: "2026-04-10T08:30:00.000Z",
    versionNotes: "根据官方通知更新报名截止时间和成绩折算表述。"
  }),
  guideFields({
    id: seedIds.guides.sysu2026Initial,
    schoolId: seedIds.schools.sysu,
    admissionYear: 2026,
    status: "published",
    version: 1,
    isCurrent: false,
    officialSourceUrl: "https://example.edu/sysu/2026-comprehensive-evaluation-guide",
    guideTitle: "中山大学 2026 年广东综合评价招生简章",
    summary: "官方补充截止时间前的初始已发布简章。",
    applicationStartAt: "2026-03-18T01:00:00.000Z",
    applicationDeadlineAt: "2026-04-18T15:59:59.000Z",
    publishedAt: "2026-03-15T02:00:00.000Z",
    updatedAt: "2026-03-15T02:00:00.000Z",
    sourceUpdatedAt: "2026-03-15T02:00:00.000Z",
    versionNotes: "招生网站首次官方发布版本。"
  }),
  guideFields({
    id: seedIds.guides.sysu2025,
    schoolId: seedIds.schools.sysu,
    admissionYear: 2025,
    status: "published",
    officialSourceUrl: "https://example.edu/sysu/2025-comprehensive-evaluation-guide",
    guideTitle: "中山大学 2025 年广东综合评价招生简章",
    summary: "包含 85/15 综合成绩规则的 2025 年已发布简章。",
    applicationStatus: "closed",
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
    guideTitle: "中山大学 2024 年广东综合评价招生简章",
    summary: "已归档历史简章，不应出现在学生端当前数据中。",
    applicationStatus: "closed",
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
    guideTitle: "华南理工大学 2026 年待审核招生简章",
    summary: "待审核简章，数据审核完成前不得对学生端可见。",
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
    guideTitle: "华南理工大学 2025 年广东综合评价招生简章",
    summary: "已发布简章，包含时间线信息，但未明确公开综合分公式。",
    applicationStatus: "closed",
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
    guideTitle: "华南理工大学 2024 年广东综合评价招生简章",
    summary: "用于历史浏览和公式测试的 2024 年已发布简章。",
    applicationStatus: "closed",
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
    guideTitle: "南方科技大学 2026 年工作草稿",
    summary: "草稿简章，游客和学生端不可见。",
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
    guideTitle: "南方科技大学 2025 年广东综合评价招生简章",
    summary: "面向深圳等广东考生的已发布简章，包含面试和机试信息。",
    applicationStatus: "closed",
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
    guideTitle: "南方科技大学 2024 年广东综合评价招生简章",
    summary: "2024 年已发布简章，未明确公开综合分公式。",
    applicationStatus: "closed",
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
    title: "简章发布",
    startsAt: "2026-03-15T02:00:00.000Z",
    endsAt: "2026-03-15T02:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    admissionGuideId: seedIds.guides.sysu2026,
    schoolId: seedIds.schools.sysu,
    eventKey: "application_start",
    title: "报名开始",
    startsAt: "2026-03-18T01:00:00.000Z",
    endsAt: "2026-03-18T01:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000003",
    admissionGuideId: seedIds.guides.sysu2026,
    schoolId: seedIds.schools.sysu,
    eventKey: "application_deadline",
    title: "报名截止",
    startsAt: "2026-04-20T15:59:59.000Z",
    endsAt: "2026-04-20T15:59:59.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000004",
    admissionGuideId: seedIds.guides.sysu2026,
    schoolId: seedIds.schools.sysu,
    eventKey: "school_assessment",
    title: "校测",
    startsAt: "2026-06-14T01:00:00.000Z",
    endsAt: "2026-06-15T10:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000005",
    admissionGuideId: seedIds.guides.scut2025,
    schoolId: seedIds.schools.scut,
    eventKey: "application_start",
    title: "报名开始",
    startsAt: "2025-03-22T01:00:00.000Z",
    endsAt: "2025-03-22T01:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000006",
    admissionGuideId: seedIds.guides.scut2025,
    schoolId: seedIds.schools.scut,
    eventKey: "application_deadline",
    title: "报名截止",
    startsAt: "2025-04-22T15:59:59.000Z",
    endsAt: "2025-04-22T15:59:59.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000007",
    admissionGuideId: seedIds.guides.scut2024,
    schoolId: seedIds.schools.scut,
    eventKey: "admission_publication",
    title: "录取结果公布",
    startsAt: "2024-07-18T02:00:00.000Z",
    endsAt: "2024-07-18T02:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000008",
    admissionGuideId: seedIds.guides.sustech2025,
    schoolId: seedIds.schools.sustech,
    eventKey: "application_deadline",
    title: "报名截止",
    startsAt: "2025-04-10T15:59:59.000Z",
    endsAt: "2025-04-10T15:59:59.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000009",
    admissionGuideId: seedIds.guides.sustech2024,
    schoolId: seedIds.schools.sustech,
    eventKey: "school_assessment",
    title: "校测",
    startsAt: "2024-06-11T01:00:00.000Z",
    endsAt: "2024-06-12T10:00:00.000Z",
    status: "published"
  },
  {
    id: "40000000-0000-4000-8000-000000000010",
    admissionGuideId: seedIds.guides.scut2026Pending,
    schoolId: seedIds.schools.scut,
    eventKey: "application_deadline",
    title: "待审核报名截止时间",
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
    formulaName: "60/30/10 综合成绩",
    formulaType: "weighted_sum",
    formulaConfig: {
      inputs: [
        { key: "gaokao", label: "高考成绩", maxScore: 750, weight: 0.6 },
        { key: "schoolAssessment", label: "学校考核成绩", maxScore: 100, weight: 0.3 },
        { key: "academicLevel", label: "学业水平折算成绩", maxScore: 100, weight: 0.1 }
      ],
      outputMaxScore: 100
    },
    explanation: "高考成绩、学校考核成绩和学业水平折算成绩分别按 60%、30%、10% 加权。",
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
    formulaName: "85/15 综合成绩",
    formulaType: "weighted_sum",
    formulaConfig: {
      inputs: [
        { key: "gaokao", label: "高考成绩", maxScore: 750, weight: 0.85 },
        { key: "schoolAssessment", label: "学校考核成绩", maxScore: 100, weight: 0.15 }
      ],
      outputMaxScore: 100
    },
    explanation: "高考成绩和学校考核成绩折算为百分制后，分别按 85%、15% 加权。",
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
    formulaName: "70/30 综合成绩",
    formulaType: "weighted_sum",
    formulaConfig: {
      inputs: [
        { key: "gaokao", label: "高考成绩", maxScore: 750, weight: 0.7 },
        { key: "schoolAssessment", label: "学校考核成绩", maxScore: 100, weight: 0.3 }
      ],
      outputMaxScore: 100
    },
    explanation: "高考成绩和学校考核成绩折算后，分别按 70%、30% 加权。",
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
    formulaName: "待审核公式",
    formulaType: "weighted_sum",
    formulaConfig: {
      inputs: [
        { key: "gaokao", label: "高考成绩", maxScore: 750, weight: 0.6 },
        { key: "schoolAssessment", label: "学校考核成绩", maxScore: 100, weight: 0.4 }
      ],
      outputMaxScore: 100
    },
    explanation: "仅供审核的公式，不得对访客可见。",
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
    majorGroup: "理科试点组",
    candidateTrack: "physics",
    stage: "school_assessment",
    assessmentTypes: ["structured_interview", "group_discussion"],
    location: "广州校区",
    summary: "面试重点围绕报考动机、实验设计和时事分析。",
    processSummary: "考生签到后参加小组讨论，再完成结构化个人面试。",
    questionTypes: ["motivation", "experiment_design", "current_affairs"],
    preparationSummary: "复盘个人陈述材料，并练习简洁说明实验设计思路。",
    difficultyScore: 4,
    pressureScore: 3,
    differentiationScore: 4,
    advice: "使用课程学习中的具体例子，不要脱离题干猜测政策细节。",
    isAnonymous: true,
    verificationStatus: "verified",
    usefulCount: 18,
    createdAt: "2026-05-02T08:00:00.000Z"
  },
  {
    id: seedIds.experiences.sysu2026PendingVerification,
    schoolId: seedIds.schools.sysu,
    admissionYear: 2026,
    provinceScope: "guangdong",
    status: "published",
    majorGroup: "人文试点组",
    candidateTrack: "history",
    stage: "school_assessment",
    assessmentTypes: ["structured_interview"],
    location: "广州校区",
    summary: "待认证的已发布面经，问题涉及公共议题和专业匹配。",
    processSummary: "面试采用结构化评委提问形式，包含个人作答和简短追问。",
    questionTypes: ["current_affairs", "major_interest", "motivation"],
    preparationSummary: "把时事案例与所选专业、个人学习计划联系起来。",
    difficultyScore: 3,
    pressureScore: 2,
    differentiationScore: 3,
    advice: "案例要具体，并区分个人观点和官方政策事实。",
    isAnonymous: true,
    verificationStatus: "pending_review",
    usefulCount: 22,
    createdAt: "2026-05-18T08:00:00.000Z"
  },
  {
    id: seedIds.experiences.scut2025,
    schoolId: seedIds.schools.scut,
    admissionYear: 2025,
    provinceScope: "guangdong",
    status: "published",
    majorGroup: "工程试点组",
    candidateTrack: "physics",
    stage: "school_assessment",
    assessmentTypes: ["structured_interview"],
    location: "广州校区",
    summary: "问题重点考察工程兴趣、项目复盘和团队协作。",
    processSummary: "考核包含一轮个人面试和若干追问。",
    questionTypes: ["project_reflection", "teamwork", "major_interest"],
    preparationSummary: "准备一个简短项目案例，清楚区分个人角色、困难和结果。",
    difficultyScore: 3,
    pressureScore: 3,
    differentiationScore: 3,
    advice: "说明所选工程专业为什么与你的高中经历匹配。",
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
    majorGroup: "科创组",
    candidateTrack: "physics",
    stage: "school_assessment",
    assessmentTypes: ["machine_test", "structured_interview"],
    location: "深圳校区",
    summary: "机试需要合理分配时间，之后还有简短科学类面试。",
    processSummary: "考生先完成机考，再围绕科学学习计划进行交流。",
    questionTypes: ["math_reasoning", "learning_plan", "science_interest"],
    preparationSummary: "练习限时推理题，并准备直接清晰的科研兴趣表述。",
    difficultyScore: 4,
    pressureScore: 4,
    differentiationScore: 4,
    advice: "机试要预留时间检查答案。",
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
    majorGroup: "审核专用组",
    candidateTrack: "history",
    stage: "school_assessment",
    assessmentTypes: ["structured_interview"],
    location: "广州校区",
    summary: "待审核面经，必须保持隐藏。",
    processSummary: "待审核流程摘要。",
    questionTypes: ["motivation"],
    preparationSummary: "待审核准备内容。",
    difficultyScore: 2,
    pressureScore: 2,
    differentiationScore: 2,
    advice: "待审核建议。",
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
