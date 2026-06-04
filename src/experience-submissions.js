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
    label: "Ongoing exam content",
    pattern: /\b(ongoing exam|exam in progress|assessment still running|still in the exam|current live exam)\b/i,
    message: "Content from an ongoing exam must not be published."
  },
  {
    code: "undisclosed_original_question",
    label: "Undisclosed original question",
    pattern: /\b(exact original question|undisclosed original question|leaked prompt|verbatim question|original exam question)\b/i,
    message: "Undisclosed specific original questions require rewrite before approval."
  },
  {
    code: "true_question_sales",
    label: "True-question sales",
    pattern: /\b(true[- ]?question sales?|sell(?:ing)? real questions?|paid real question|buy real questions?)\b/i,
    message: "True-question sales or paid real-question traffic must be blocked."
  },
  {
    code: "material_ghostwriting",
    label: "Material ghostwriting",
    pattern: /\b(ghostwrite|ghostwriting|write your materials?|personal statement writing service|application material writing)\b/i,
    message: "Material ghostwriting offers require rewrite or removal."
  },
  {
    code: "guaranteed_admission_claim",
    label: "Guaranteed admission claim",
    pattern: /\b(guaranteed admission|100% admission|sure admit|admission guaranteed|guarantee offer)\b/i,
    message: "Guaranteed admission claims are prohibited."
  },
  {
    code: "external_traffic_scam",
    label: "External traffic scam",
    pattern: /\b(add my wechat|wechat group|qq group|telegram group|scan qr|paid consulting|private traffic|dm me)\b/i,
    message: "External traffic or paid consulting scam signals must be blocked."
  },
  {
    code: "personal_sensitive_information",
    label: "Personal sensitive information",
    pattern: /(?:\b(?:\+?86)?1[3-9]\d{9}\b|\b\d{17}[\dXx]\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|id card|身份证|real name)/i,
    message: "Personal sensitive information must be removed before approval."
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
    throw new ExperienceSubmissionError("missing_required_field", `${label} is required.`);
  }

  if (text.length > maxLength) {
    throw new ExperienceSubmissionError("field_too_long", `${label} must be ${maxLength} characters or fewer.`);
  }

  return text;
}

function optionalText(body, keys, label, maxLength = 1000) {
  const text = normalizeText(firstDefined(body, keys));

  if (text.length > maxLength) {
    throw new ExperienceSubmissionError("field_too_long", `${label} must be ${maxLength} characters or fewer.`);
  }

  return text || null;
}

function normalizeYear(value) {
  const year = Number(scalarValue(value));

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new ExperienceSubmissionError("invalid_year", "Year must be a four-digit admission year.");
  }

  return year;
}

function normalizeRequiredYear(body) {
  const value = firstDefined(body, ["year", "admissionYear"]);

  if (value === undefined || value === null || normalizeText(value).length === 0) {
    throw new ExperienceSubmissionError("missing_required_field", "Year is required.");
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
    throw new ExperienceSubmissionError("missing_required_field", `${label} is required.`);
  }

  if (unique.some((item) => item.length > 80)) {
    throw new ExperienceSubmissionError("field_too_long", `${label} entries must be 80 characters or fewer.`);
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

    throw new ExperienceSubmissionError("missing_required_field", `${label} is required.`);
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

  throw new ExperienceSubmissionError("invalid_boolean", `${label} must be true or false.`);
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
    throw new ExperienceSubmissionError("missing_required_field", `${label} is required.`);
  }

  const rating = Number(scalarValue(value));

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ExperienceSubmissionError("invalid_rating", `${label} must be an integer from 1 to 5.`);
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
      "Operator identity is required for moderation.",
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
      "Moderation note must be 1000 characters or fewer."
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
      label: "Verification privacy warning",
      severity: "warning",
      action: "review_private_material",
      message: "Verification metadata contains private identity or source-account signals and must remain reviewer-only."
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
    throw new ExperienceSubmissionError("invalid_verification_material", "Verification material metadata is invalid.");
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
      "Verification material type is required when verification metadata is provided."
    );
  }

  if (materialType.length > 80 || objectStorageKey.length > 240) {
    throw new ExperienceSubmissionError("field_too_long", "Verification material metadata is too long.");
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
        "Verification materials must be valid JSON when sent as text."
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
    throw new ExperienceSubmissionError("school_not_found", "A published school is required.", 404);
  }

  return school;
}

export function buildExperienceSubmission({ body, user, now, id = randomUUID() }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ExperienceSubmissionError("invalid_submission", "Experience submission must be an object.");
  }

  if (!user?.id) {
    throw new ExperienceSubmissionError("login_required", "Login is required for this action.", 401);
  }

  const schoolId = requiredText(body, ["schoolId"], "School", 120);
  assertSchoolExists(schoolId);

  const processSummary = requiredText(body, ["processSummary", "process"], "Process", 5000);
  const advice = requiredText(body, ["advice"], "Advice", 3000);
  const createdAt = currentDate(now).toISOString();

  return {
    id,
    userId: user.id,
    authorNickname: user.nickname ?? "Guangdong student",
    schoolId,
    admissionYear: normalizeRequiredYear(body),
    provinceScope: "guangdong",
    status: "pending_review",
    majorGroup: requiredText(body, ["majorGroup"], "Major group", 160),
    candidateTrack: requiredText(body, ["candidateTrack"], "Candidate track", 120),
    stage: requiredText(body, ["stage"], "Stage", 120),
    shortlistedStatus: requiredBoolean(body, ["shortlistedStatus", "shortlisted"], "Shortlisted status"),
    admittedStatus: optionalBoolean(body, ["admittedStatus", "admitted"], "Admitted status"),
    assessmentTypes: requiredArray(body, ["assessmentTypes", "assessmentType"], "Assessment type"),
    location: optionalText(body, ["location"], "Location", 240),
    summary: summarizeExperience(processSummary, advice),
    processSummary,
    questionTypes: requiredArray(body, ["questionTypes", "questionType"], "Question type"),
    preparationSummary: requiredText(body, ["preparationSummary", "preparation"], "Preparation", 3000),
    difficultyScore: normalizeRating(body, ["difficultyScore"], "Difficulty score"),
    pressureScore: normalizeRating(body, ["pressureScore"], "Pressure score"),
    differentiationScore: normalizeRating(body, ["differentiationScore"], "Differentiation score"),
    advice,
    isAnonymous: defaultedBoolean(body, ["isAnonymous", "anonymous", "anonymousPreference"], "Anonymous preference", user.defaultAnonymous ?? true),
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
      ? { anonymous: true, displayName: "Anonymous student" }
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

function adminVerificationMaterial(material, experience) {
  return {
    id: material.id,
    experienceId: experience.id,
    materialType: material.materialType,
    metadata: { ...material.metadata },
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
      throw new ExperienceSubmissionError("experience_not_found", "No submitted experience was found.", 404);
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
      "No verification material was found.",
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
          "Experience review action is not supported."
        );
      }

      const experience = submissionById(experienceId);
      const operatedAt = currentIsoDate(options.now);
      const reviewNote = normalizeModerationNote(note);
      const moderation = moderationSummary(experience);

      if (action === "approve" && moderation.approvalBlocked) {
        const error = new ExperienceSubmissionError(
          "moderation_blocked",
          "This experience must be rewritten before approval.",
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
          "Verification review action is not supported."
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
