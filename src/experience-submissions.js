import { randomUUID } from "node:crypto";

import { getSchoolById } from "./db/data-access.js";

export class ExperienceSubmissionError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "ExperienceSubmissionError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

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

export function createExperienceSubmissionStore(options = {}) {
  const submissionsById = new Map();

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
