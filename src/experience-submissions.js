import { randomUUID } from "node:crypto";

import {
  getSchoolById,
  moderatePublishedExperience,
  registerPublishedExperience
} from "./db/data-access.js";

export class ExperienceSubmissionError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "ExperienceSubmissionError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const experienceReviewActions = new Set(["approve", "return", "hide", "ban"]);
const verificationReviewActions = new Set(["approve", "reject", "return"]);
const moderationRules = Object.freeze([
  {
    code: "ongoing_exam_content",
    label: "进行中考试内容",
    pattern: /\b(ongoing exam|exam in progress|assessment still running|still in the exam|current live exam)\b/i,
    message: "进行中考试内容不得发布。"
  },
  {
    code: "undisclosed_original_question",
    label: "未公开原题",
    pattern: /\b(exact original question|undisclosed original question|leaked prompt|verbatim question|original exam question)\b/i,
    message: "未公开具体原题必须改写后才可审核通过。"
  },
  {
    code: "true_question_sales",
    label: "真题售卖",
    pattern: /\b(true[- ]?question sales?|sell(?:ing)? real questions?|paid real question|buy real questions?)\b/i,
    message: "真题售卖或付费真题导流必须拦截。"
  },
  {
    code: "material_ghostwriting",
    label: "材料代写",
    pattern: /\b(ghostwrite|ghostwriting|write your materials?|personal statement writing service|application material writing)\b/i,
    message: "材料代写内容必须改写或移除。"
  },
  {
    code: "guaranteed_admission_claim",
    label: "保录承诺",
    pattern: /\b(guaranteed admission|100% admission|sure admit|admission guaranteed|guarantee offer)\b/i,
    message: "禁止保录承诺。"
  },
  {
    code: "external_traffic_scam",
    label: "外部导流风险",
    pattern: /\b(add my wechat|wechat group|qq group|telegram group|scan qr|paid consulting|private traffic|dm me)\b/i,
    message: "外部导流或付费咨询风险信号必须拦截。"
  },
  {
    code: "personal_sensitive_information",
    label: "个人敏感信息",
    pattern: /(?:\b(?:\+?86)?1[3-9]\d{9}\b|\b\d{17}[\dXx]\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|id card|身份证|real name)/i,
    message: "个人敏感信息必须移除后才能审核通过。"
  }
]);

function currentDate(now) {
  if (typeof now !== "function") {
    return new Date();
  }

  const value = now();
  return value instanceof Date ? value : new Date(value);
}

function scalarValue(value) {
  if (Array.isArray(value)) {
    return value.find((item) => String(item ?? "").trim().length > 0) ?? value[0];
  }

  return value;
}

function firstDefined(body, keys) {
  for (const key of keys) {
    if (Object.hasOwn(body, key)) {
      return body[key];
    }
  }

  return undefined;
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(scalarValue(value)).trim().replace(/\s+/g, " ");
}

function requiredText(body, keys, label, maxLength = 2000) {
  const text = normalizeText(firstDefined(body, keys));

  if (text.length === 0) {
    throw new ExperienceSubmissionError("missing_required_field", `${label}为必填项。`);
  }

  if (text.length > maxLength) {
    throw new ExperienceSubmissionError("field_too_long", `${label}最多 ${maxLength} 个字符。`);
  }

  return text;
}

function optionalText(body, keys, label, maxLength = 1000) {
  const text = normalizeText(firstDefined(body, keys));

  if (text.length > maxLength) {
    throw new ExperienceSubmissionError("field_too_long", `${label}最多 ${maxLength} 个字符。`);
  }

  return text || null;
}

function normalizeYear(value) {
  const year = Number(scalarValue(value));

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new ExperienceSubmissionError("invalid_year", "年份必须是四位招生年份。");
  }

  return year;
}

function normalizeRequiredYear(body) {
  const value = firstDefined(body, ["year", "admissionYear"]);

  if (value === undefined || value === null || normalizeText(value).length === 0) {
    throw new ExperienceSubmissionError("missing_required_field", "年份为必填项。");
  }

  return normalizeYear(value);
}

function normalizeArray(value, label) {
  const values = Array.isArray(value) ? value : [value];
  const normalized = values
    .flatMap((item) => String(item ?? "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = [...new Set(normalized)];

  if (unique.length === 0) {
    throw new ExperienceSubmissionError("missing_required_field", `${label}为必填项。`);
  }

  if (unique.some((item) => item.length > 80)) {
    throw new ExperienceSubmissionError("field_too_long", `${label}条目最多 80 个字符。`);
  }

  return unique;
}

function requiredArray(body, keys, label) {
  return normalizeArray(firstDefined(body, keys), label);
}

function normalizeBoolean(value, label, options = {}) {
  const rawValue = scalarValue(value);

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    if (options.optional) {
      return null;
    }

    if (typeof options.defaultValue === "boolean") {
      return options.defaultValue;
    }

    throw new ExperienceSubmissionError("missing_required_field", `${label}为必填项。`);
  }

  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  const normalized = String(rawValue).trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  if (options.optional && ["unknown", "not_disclosed", "not-disclosed"].includes(normalized)) {
    return null;
  }

  throw new ExperienceSubmissionError("invalid_boolean", `${label}必须为 true 或 false。`);
}

function requiredBoolean(body, keys, label) {
  const value = firstDefined(body, keys);
  return normalizeBoolean(value, label);
}

function optionalBoolean(body, keys, label) {
  const value = firstDefined(body, keys);
  return normalizeBoolean(value, label, { optional: true });
}

function defaultedBoolean(body, keys, label, defaultValue) {
  const value = firstDefined(body, keys);
  return normalizeBoolean(value, label, { defaultValue });
}

function normalizeRating(body, keys, label) {
  const value = firstDefined(body, keys);

  if (value === undefined || value === null || normalizeText(value).length === 0) {
    throw new ExperienceSubmissionError("missing_required_field", `${label}为必填项。`);
  }

  const rating = Number(scalarValue(value));

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ExperienceSubmissionError("invalid_rating", `${label}必须是 1 到 5 的整数。`);
  }

  return rating;
}

function summarizeExperience(processSummary, advice) {
  const summary = `${processSummary} ${advice}`.trim().replace(/\s+/g, " ");

  if (summary.length <= 180) {
    return summary;
  }

  return `${summary.slice(0, 177).trimEnd()}...`;
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata)
      .map(([key, value]) => [key, normalizeText(value)])
      .filter(([, value]) => value.length > 0)
  );
}

function currentIsoDate(now) {
  return currentDate(now).toISOString();
}

function operatorAuditFields(operator) {
  return {
    operatorId: operator.id,
    operatorNickname: operator.nickname,
    operatorRole: operator.role
  };
}

function assertOperator(operator) {
  if (!operator?.id || !operator?.nickname || !operator?.role) {
    throw new ExperienceSubmissionError(
      "operator_required",
      "审核操作必须提供操作人身份。",
      403
    );
  }
}

function moderationAuditEntry({ operation, operator, operatedAt, note }) {
  return {
    operation,
    ...operatorAuditFields(operator),
    operatedAt,
    note: note ?? null
  };
}

function normalizeModerationNote(note) {
  const text = normalizeText(note);

  if (text.length > 1000) {
    throw new ExperienceSubmissionError(
      "moderation_note_too_long",
      "审核备注最多 1000 个字符。"
    );
  }

  return text || null;
}

function publicModerationText(experience) {
  return [
    experience.summary,
    experience.processSummary,
    experience.preparationSummary,
    experience.advice,
    experience.location,
    ...(experience.assessmentTypes ?? []),
    ...(experience.questionTypes ?? [])
  ].join(" ");
}

function verificationMetadataText(experience) {
  return (experience.verificationMaterials ?? [])
    .flatMap((material) => [
      material.materialType,
      ...Object.entries(material.metadata ?? {}).map(([key, value]) => `${key}: ${value}`)
    ])
    .join(" ");
}

function scanModerationWarnings(experience) {
  const publicText = publicModerationText(experience);
  const privateText = verificationMetadataText(experience);
  const warnings = moderationRules
    .filter((rule) => rule.pattern.test(publicText))
    .map((rule) => ({
      code: rule.code,
      label: rule.label,
      severity: "block",
      action: "rewrite_required",
      message: rule.message
    }));

  if (/(sourceAccount|source account|realName|real name|id card|身份证|\b(?:\+?86)?1[3-9]\d{9}\b)/i.test(privateText)) {
    warnings.push({
      code: "verification_privacy_warning",
      label: "认证隐私风险",
      severity: "warning",
      action: "review_private_material",
      message: "认证元数据包含身份或来源账号信号，必须仅审核端可见。"
    });
  }

  return warnings;
}

function moderationSummary(experience) {
  const warnings = scanModerationWarnings(experience);

  return {
    approvalBlocked: warnings.some((warning) => warning.severity === "block"),
    warnings
  };
}

function normalizeVerificationMaterial(material) {
  if (!material || typeof material !== "object" || Array.isArray(material)) {
    throw new ExperienceSubmissionError("invalid_verification_material", "认证材料元数据无效。");
  }

  const metadata = normalizeMetadata(material.metadata);
  const title = normalizeText(material.title ?? material.materialTitle);
  const sourceAccount = normalizeText(material.sourceAccount);
  const notes = normalizeText(material.notes ?? material.verificationNotes);

  if (title) {
    metadata.title = title;
  }

  if (sourceAccount) {
    metadata.sourceAccount = sourceAccount;
  }

  if (notes) {
    metadata.notes = notes;
  }

  const materialType = normalizeText(material.materialType ?? material.type);
  const objectStorageKey = normalizeText(material.objectStorageKey ?? material.storageKey);
  const hasMetadata = Object.keys(metadata).length > 0 || objectStorageKey.length > 0;

  if (!materialType && !hasMetadata) {
    return null;
  }

  if (!materialType) {
    throw new ExperienceSubmissionError(
      "missing_required_field",
      "提供认证元数据时必须填写材料类型。"
    );
  }

  if (materialType.length > 80 || objectStorageKey.length > 240) {
    throw new ExperienceSubmissionError("field_too_long", "认证材料元数据过长。");
  }

  return {
    id: randomUUID(),
    materialType,
    objectStorageKey: objectStorageKey || null,
    metadata,
    status: "pending_review"
  };
}

function parseVerificationMaterials(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (typeof value === "string") {
    const text = value.trim();

    if (!text) {
      return [];
    }

    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      throw new ExperienceSubmissionError(
        "invalid_verification_material",
        "认证材料以文本发送时必须是有效 JSON。"
      );
    }
  }

  return Array.isArray(value) ? value : [value];
}

function formVerificationMaterial(body) {
  const material = {
    materialType: firstDefined(body, ["verificationMaterialType", "materialType"]),
    objectStorageKey: firstDefined(body, ["verificationObjectStorageKey", "objectStorageKey"]),
    title: firstDefined(body, ["verificationTitle", "materialTitle"]),
    sourceAccount: firstDefined(body, ["verificationSourceAccount", "sourceAccount"]),
    notes: firstDefined(body, ["verificationNotes", "materialNotes"])
  };

  return Object.values(material).some((value) => normalizeText(value).length > 0) ? material : null;
}

function normalizeVerificationMaterials(body) {
  const directMaterials = parseVerificationMaterials(firstDefined(body, ["verificationMaterials"]));
  const formMaterial = formVerificationMaterial(body);
  const materials = formMaterial ? [...directMaterials, formMaterial] : directMaterials;

  return materials
    .map(normalizeVerificationMaterial)
    .filter(Boolean);
}

function assertSchoolExists(schoolId) {
  const school = getSchoolById(schoolId);

  if (!school) {
    throw new ExperienceSubmissionError("school_not_found", "必须选择已发布院校。", 404);
  }

  return school;
}

export function buildExperienceSubmission({ body, user, now, id = randomUUID() }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ExperienceSubmissionError("invalid_submission", "面经投稿必须是对象。");
  }

  if (!user?.id) {
    throw new ExperienceSubmissionError("login_required", "需要登录后才能执行此操作。", 401);
  }

  const schoolId = requiredText(body, ["schoolId"], "院校", 120);
  assertSchoolExists(schoolId);

  const processSummary = requiredText(body, ["processSummary", "process"], "流程", 5000);
  const advice = requiredText(body, ["advice"], "建议", 3000);
  const createdAt = currentDate(now).toISOString();

  return {
    id,
    userId: user.id,
    authorNickname: user.nickname ?? "广东考生",
    schoolId,
    admissionYear: normalizeRequiredYear(body),
    provinceScope: "guangdong",
    status: "pending_review",
    majorGroup: requiredText(body, ["majorGroup"], "专业组", 160),
    candidateTrack: requiredText(body, ["candidateTrack"], "考生科类", 120),
    stage: requiredText(body, ["stage"], "阶段", 120),
    shortlistedStatus: requiredBoolean(body, ["shortlistedStatus", "shortlisted"], "入围状态"),
    admittedStatus: optionalBoolean(body, ["admittedStatus", "admitted"], "录取状态"),
    assessmentTypes: requiredArray(body, ["assessmentTypes", "assessmentType"], "考核类型"),
    location: optionalText(body, ["location"], "地点", 240),
    summary: summarizeExperience(processSummary, advice),
    processSummary,
    questionTypes: requiredArray(body, ["questionTypes", "questionType"], "问题类型"),
    preparationSummary: requiredText(body, ["preparationSummary", "preparation"], "准备", 3000),
    difficultyScore: normalizeRating(body, ["difficultyScore"], "难度评分"),
    pressureScore: normalizeRating(body, ["pressureScore"], "压力评分"),
    differentiationScore: normalizeRating(body, ["differentiationScore"], "区分度评分"),
    advice,
    isAnonymous: defaultedBoolean(body, ["isAnonymous", "anonymous", "anonymousPreference"], "匿名偏好", user.defaultAnonymous ?? true),
    verificationStatus: "pending_review",
    verificationMaterials: normalizeVerificationMaterials(body),
    usefulCount: 0,
    createdAt,
    updatedAt: createdAt
  };
}

export function publicExperienceSubmission(experience) {
  return {
    id: experience.id,
    schoolId: experience.schoolId,
    year: experience.admissionYear,
    provinceScope: experience.provinceScope,
    status: experience.status,
    majorGroup: experience.majorGroup,
    candidateTrack: experience.candidateTrack,
    stage: experience.stage,
    shortlistedStatus: experience.shortlistedStatus,
    admittedStatus: experience.admittedStatus,
    assessmentTypes: experience.assessmentTypes,
    location: experience.location,
    summary: experience.summary,
    processSummary: experience.processSummary,
    questionTypes: experience.questionTypes,
    preparationSummary: experience.preparationSummary,
    difficultyScore: experience.difficultyScore,
    pressureScore: experience.pressureScore,
    differentiationScore: experience.differentiationScore,
    advice: experience.advice,
    isAnonymous: experience.isAnonymous,
    author: experience.isAnonymous
      ? { anonymous: true, displayName: "匿名考生" }
      : { anonymous: false, id: experience.userId, nickname: experience.authorNickname },
    verification: {
      status: experience.verificationStatus,
      materialCount: experience.verificationMaterials.length
    },
    usefulCount: experience.usefulCount,
    createdAt: experience.createdAt,
    updatedAt: experience.updatedAt
  };
}

function reviewerSafeVerificationMetadata(metadata) {
  const entries = Object.entries(metadata ?? {});
  const serialized = JSON.stringify(metadata ?? {});
  const identitySignalPresent = /sourceAccount|realName|idCard|candidateNumber|examCandidateNumber|身份证|\b\d{17}[\dXx]\b/i
    .test(serialized);

  return {
    provided: entries.length > 0,
    fieldCount: entries.length,
    identitySignalPresent
  };
}

function adminVerificationMaterial(material, experience) {
  return {
    id: material.id,
    experienceId: experience.id,
    materialType: material.materialType,
    metadata: reviewerSafeVerificationMetadata(material.metadata),
    status: material.status,
    storageKeyPresent: Boolean(material.objectStorageKey),
    reviewAudit: (material.reviewAudit ?? []).map((entry) => ({ ...entry }))
  };
}

function adminExperienceSubmission(experience) {
  return {
    id: experience.id,
    userId: experience.userId,
    authorNickname: experience.authorNickname,
    schoolId: experience.schoolId,
    year: experience.admissionYear,
    provinceScope: experience.provinceScope,
    status: experience.status,
    majorGroup: experience.majorGroup,
    candidateTrack: experience.candidateTrack,
    stage: experience.stage,
    shortlistedStatus: experience.shortlistedStatus,
    admittedStatus: experience.admittedStatus,
    assessmentTypes: [...experience.assessmentTypes],
    location: experience.location,
    summary: experience.summary,
    processSummary: experience.processSummary,
    questionTypes: [...experience.questionTypes],
    preparationSummary: experience.preparationSummary,
    difficultyScore: experience.difficultyScore,
    pressureScore: experience.pressureScore,
    differentiationScore: experience.differentiationScore,
    advice: experience.advice,
    isAnonymous: experience.isAnonymous,
    verificationStatus: experience.verificationStatus,
    verificationMaterials: experience.verificationMaterials.map((material) => adminVerificationMaterial(material, experience)),
    usefulCount: experience.usefulCount,
    moderation: moderationSummary(experience),
    reviewAudit: (experience.reviewAudit ?? []).map((entry) => ({ ...entry })),
    createdAt: experience.createdAt,
    updatedAt: experience.updatedAt
  };
}

function publicPublishedExperience(experience) {
  return {
    id: experience.id,
    schoolId: experience.schoolId,
    admissionYear: experience.admissionYear,
    provinceScope: experience.provinceScope,
    status: "published",
    majorGroup: experience.majorGroup,
    candidateTrack: experience.candidateTrack,
    stage: experience.stage,
    assessmentTypes: [...experience.assessmentTypes],
    location: experience.location,
    summary: experience.summary,
    processSummary: experience.processSummary,
    questionTypes: [...experience.questionTypes],
    preparationSummary: experience.preparationSummary,
    difficultyScore: experience.difficultyScore,
    pressureScore: experience.pressureScore,
    differentiationScore: experience.differentiationScore,
    advice: experience.advice,
    isAnonymous: experience.isAnonymous,
    verificationStatus: experience.verificationStatus,
    usefulCount: experience.usefulCount,
    createdAt: experience.createdAt,
    updatedAt: experience.updatedAt
  };
}

export function createExperienceSubmissionStore(options = {}) {
  const submissionsById = new Map();

  function submissionById(experienceId) {
    const experience = submissionsById.get(experienceId);

    if (!experience) {
      throw new ExperienceSubmissionError("experience_not_found", "未找到已提交面经。", 404);
    }

    return experience;
  }

  function findMaterial(verificationId) {
    for (const experience of submissionsById.values()) {
      const material = experience.verificationMaterials.find((candidate) => candidate.id === verificationId);

      if (material) {
        return { experience, material };
      }
    }

    throw new ExperienceSubmissionError(
      "verification_not_found",
      "未找到认证材料。",
      404
    );
  }

  function appendExperienceAudit(experience, operation, operator, operatedAt, note) {
    experience.reviewAudit = [
      ...(experience.reviewAudit ?? []),
      moderationAuditEntry({ operation, operator, operatedAt, note })
    ];
    experience.updatedAt = operatedAt;
  }

  function appendMaterialAudit(material, operation, operator, operatedAt, note) {
    material.reviewAudit = [
      ...(material.reviewAudit ?? []),
      moderationAuditEntry({ operation, operator, operatedAt, note })
    ];
  }

  function updateParentVerificationStatus(experience) {
    if (experience.verificationMaterials.some((material) => material.status === "verified")) {
      experience.verificationStatus = "verified";
      return;
    }

    if (
      experience.verificationMaterials.length > 0 &&
      experience.verificationMaterials.every((material) => material.status === "rejected")
    ) {
      experience.verificationStatus = "rejected";
      return;
    }

    experience.verificationStatus = "pending_review";
  }

  return {
    submitExperience({ user, body }) {
      const experience = buildExperienceSubmission({
        user,
        body,
        now: options.now
      });

      submissionsById.set(experience.id, experience);
      return publicExperienceSubmission(experience);
    },

    listModerationExperiences({ status } = {}) {
      const selectedStatus = status ?? "pending_review";

      return [...submissionsById.values()]
        .filter((experience) => !selectedStatus || experience.status === selectedStatus)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(adminExperienceSubmission);
    },

    getModerationExperience({ experienceId }) {
      return adminExperienceSubmission(submissionById(experienceId));
    },

    reviewExperience({ experienceId, action, operator, note }) {
      assertOperator(operator);

      if (!experienceReviewActions.has(action)) {
        throw new ExperienceSubmissionError(
          "invalid_review_action",
          "不支持该面经审核动作。"
        );
      }

      const experience = submissionById(experienceId);
      const operatedAt = currentIsoDate(options.now);
      const reviewNote = normalizeModerationNote(note);
      const moderation = moderationSummary(experience);

      if (action === "approve" && moderation.approvalBlocked) {
        const error = new ExperienceSubmissionError(
          "moderation_blocked",
          "该面经必须改写后才能通过审核。",
          422
        );
        error.moderation = moderation;
        throw error;
      }

      if (action === "approve") {
        experience.status = "published";
        appendExperienceAudit(experience, "approve_experience", operator, operatedAt, reviewNote);
        registerPublishedExperience(publicPublishedExperience(experience));
        return adminExperienceSubmission(experience);
      }

      if (action === "return") {
        experience.status = "returned";
        appendExperienceAudit(experience, "return_experience", operator, operatedAt, reviewNote);
        return adminExperienceSubmission(experience);
      }

      if (action === "hide") {
        experience.status = "hidden";
        appendExperienceAudit(experience, "hide_experience", operator, operatedAt, reviewNote);
        moderatePublishedExperience({ experienceId: experience.id, action: "hidden" });
        return adminExperienceSubmission(experience);
      }

      experience.status = "banned";
      appendExperienceAudit(experience, "ban_experience", operator, operatedAt, reviewNote);
      moderatePublishedExperience({ experienceId: experience.id, action: "hidden" });
      return adminExperienceSubmission(experience);
    },

    listVerificationReviews({ status } = {}) {
      const selectedStatus = status ?? "pending_review";

      return [...submissionsById.values()]
        .flatMap((experience) => experience.verificationMaterials.map((material) => ({
          experience: adminExperienceSubmission(experience),
          material: adminVerificationMaterial(material, experience),
          moderation: moderationSummary(experience)
        })))
        .filter((item) => !selectedStatus || item.material.status === selectedStatus)
        .sort((left, right) => right.experience.createdAt.localeCompare(left.experience.createdAt));
    },

    reviewVerification({ verificationId, action, operator, note }) {
      assertOperator(operator);

      if (!verificationReviewActions.has(action)) {
        throw new ExperienceSubmissionError(
          "invalid_verification_action",
          "不支持该认证审核动作。"
        );
      }

      const { experience, material } = findMaterial(verificationId);
      const operatedAt = currentIsoDate(options.now);
      const reviewNote = normalizeModerationNote(note);

      if (action === "approve") {
        material.status = "verified";
        appendMaterialAudit(material, "approve_verification", operator, operatedAt, reviewNote);
      } else if (action === "reject") {
        material.status = "rejected";
        appendMaterialAudit(material, "reject_verification", operator, operatedAt, reviewNote);
      } else {
        material.status = "returned";
        appendMaterialAudit(material, "return_verification", operator, operatedAt, reviewNote);
      }

      updateParentVerificationStatus(experience);
      appendExperienceAudit(experience, `${action}_verification`, operator, operatedAt, reviewNote);

      if (experience.status === "published") {
        registerPublishedExperience(publicPublishedExperience(experience));
      }

      return {
        experience: adminExperienceSubmission(experience),
        material: adminVerificationMaterial(material, experience),
        moderation: moderationSummary(experience)
      };
    },

    listSubmissions({ userId } = {}) {
      return [...submissionsById.values()]
        .filter((experience) => !userId || experience.userId === userId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(publicExperienceSubmission);
    },

    listVerificationMaterials({ experienceId, userId } = {}) {
      const experience = submissionsById.get(experienceId);

      if (!experience || (userId && experience.userId !== userId)) {
        return [];
      }

      return experience.verificationMaterials.map((material) => ({
        ...material,
        metadata: { ...material.metadata }
      }));
    }
  };
}

export const experienceSubmissionStore = createExperienceSubmissionStore();
