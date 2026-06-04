import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export class AuthError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const userRoles = Object.freeze([
  "user",
  "content_reviewer",
  "data_reviewer",
  "admin"
]);

export const accountStatuses = Object.freeze([
  "active",
  "limited",
  "banned",
  "deleted"
]);

export const studentGrades = Object.freeze([
  "high_school_g1",
  "high_school_g2",
  "high_school_g3",
  "graduated"
]);

const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const roleSet = new Set(userRoles);
const accountStatusSet = new Set(accountStatuses);
const studentGradeSet = new Set(studentGrades);

function booleanFromEnv(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return value === "true" || value === "1";
}

function currentDate(now) {
  if (typeof now !== "function") {
    return new Date();
  }

  const value = now();
  return value instanceof Date ? value : new Date(value);
}

function normalizePhoneNumber(phoneNumber) {
  if (typeof phoneNumber !== "string") {
    throw new AuthError("invalid_phone", "A valid phone number is required.");
  }

  const compact = phoneNumber.trim().replace(/[\s-]/g, "");
  const normalized = compact.startsWith("+86")
    ? compact
    : compact.startsWith("86") && compact.length === 13
      ? `+${compact}`
      : compact.length === 11
        ? `+86${compact}`
        : compact;

  if (!/^\+861[3-9]\d{9}$/.test(normalized)) {
    throw new AuthError("invalid_phone", "A mainland China phone number is required.");
  }

  return normalized;
}

function hashValue(secret, value) {
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function assertRole(role) {
  if (!roleSet.has(role)) {
    throw new AuthError("invalid_role", "User role is not supported.");
  }
}

function assertAccountStatus(accountStatus) {
  if (!accountStatusSet.has(accountStatus)) {
    throw new AuthError("invalid_account_status", "Account status is not supported.");
  }
}

function normalizeNickname(nickname) {
  if (nickname === undefined || nickname === null || nickname === "") {
    return "Guangdong student";
  }

  if (typeof nickname !== "string") {
    throw new AuthError("invalid_profile", "Nickname must be text.");
  }

  const normalized = nickname.trim();

  if (normalized.length === 0 || normalized.length > 80) {
    throw new AuthError("invalid_profile", "Nickname must be 1 to 80 characters.");
  }

  return normalized;
}

function normalizeGrade(grade) {
  if (grade === undefined || grade === null || grade === "") {
    return "high_school_g3";
  }

  if (!studentGradeSet.has(grade)) {
    throw new AuthError("invalid_profile", "Grade is not supported.");
  }

  return grade;
}

function normalizeDefaultAnonymous(defaultAnonymous) {
  if (defaultAnonymous === undefined || defaultAnonymous === null) {
    return true;
  }

  if (typeof defaultAnonymous !== "boolean") {
    throw new AuthError("invalid_profile", "Default anonymous preference must be boolean.");
  }

  return defaultAnonymous;
}

function localOtpAllowed(env) {
  const nodeEnv = env.NODE_ENV || "development";
  return (nodeEnv === "development" || nodeEnv === "test") && booleanFromEnv(env.LOCAL_OTP_ENABLED, true);
}

function productionProviderHeaders(env) {
  const headers = { "content-type": "application/json" };

  if (env.PHONE_VERIFICATION_API_TOKEN) {
    headers.authorization = `Bearer ${env.PHONE_VERIFICATION_API_TOKEN}`;
  }

  return headers;
}

function createProductionOtpRequester(env) {
  if (!env.PHONE_VERIFICATION_REQUEST_URL) {
    return null;
  }

  return async ({ phoneNumber, phoneHash }) => {
    const response = await fetch(env.PHONE_VERIFICATION_REQUEST_URL, {
      method: "POST",
      headers: productionProviderHeaders(env),
      body: JSON.stringify({ phoneNumber, phoneHash })
    });

    if (!response.ok) {
      throw new AuthError(
        "phone_verification_unavailable",
        "Phone verification provider is unavailable.",
        503
      );
    }
  };
}

function createProductionOtpVerifier(env) {
  if (!env.PHONE_VERIFICATION_VERIFY_URL) {
    return null;
  }

  return async ({ phoneNumber, phoneHash, otpCode }) => {
    const response = await fetch(env.PHONE_VERIFICATION_VERIFY_URL, {
      method: "POST",
      headers: productionProviderHeaders(env),
      body: JSON.stringify({ phoneNumber, phoneHash, otpCode })
    });

    if (!response.ok) {
      return false;
    }

    const body = await response.json().catch(() => ({}));
    return body.verified === true;
  };
}

export function toPublicUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    grade: user.grade,
    defaultAnonymous: user.defaultAnonymous,
    role: user.role,
    accountStatus: user.accountStatus,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function createAuthService(options = {}) {
  const env = options.env ?? process.env;
  const authSecret = env.AUTH_SECRET || "development-auth-secret";
  const sessionCookieName = env.AUTH_SESSION_COOKIE_NAME || "gce_session";
  const localOtpCode = env.LOCAL_OTP_CODE || "123456";
  const sendProductionOtp = options.sendProductionOtp ?? createProductionOtpRequester(env);
  const verifyProductionOtp = options.verifyProductionOtp ?? createProductionOtpVerifier(env);
  const usersById = new Map();
  const userIdsByPhoneHash = new Map();
  const sessionsByToken = new Map();

  function phoneHashFor(phoneNumber) {
    return hashValue(authSecret, normalizePhoneNumber(phoneNumber));
  }

  function createUserRecord({
    phoneNumber,
    nickname,
    grade,
    defaultAnonymous,
    role = "user",
    accountStatus = "active"
  }) {
    assertRole(role);
    assertAccountStatus(accountStatus);

    const createdAt = currentDate(options.now).toISOString();
    const phoneHash = phoneHashFor(phoneNumber);
    const user = {
      id: randomBytes(16).toString("hex"),
      phoneHash,
      nickname: normalizeNickname(nickname),
      grade: normalizeGrade(grade),
      defaultAnonymous: normalizeDefaultAnonymous(defaultAnonymous),
      role,
      accountStatus,
      createdAt,
      updatedAt: createdAt
    };

    usersById.set(user.id, user);
    userIdsByPhoneHash.set(phoneHash, user.id);
    return user;
  }

  async function verifyOtp({ normalizedPhoneNumber, phoneHash, otpCode }) {
    if (typeof otpCode !== "string" || otpCode.length === 0) {
      throw new AuthError("invalid_otp", "Verification code is required.", 401);
    }

    if (localOtpAllowed(env)) {
      if (!safeEqual(otpCode, localOtpCode)) {
        throw new AuthError("invalid_otp", "Verification code is invalid.", 401);
      }

      return;
    }

    if (typeof verifyProductionOtp !== "function") {
      throw new AuthError(
        "phone_verification_unavailable",
        "Phone verification provider is not configured.",
        503
      );
    }

    const verified = await verifyProductionOtp({
      phoneNumber: normalizedPhoneNumber,
      phoneHash,
      otpCode
    });

    if (verified !== true) {
      throw new AuthError("invalid_otp", "Verification code is invalid.", 401);
    }
  }

  function createSessionForUser(userId) {
    const user = usersById.get(userId);

    if (!user) {
      throw new AuthError("unknown_user", "User does not exist.", 404);
    }

    const createdAt = currentDate(options.now);
    const expiresAt = new Date(createdAt.getTime() + sessionTtlMs);
    const session = {
      token: randomBytes(32).toString("base64url"),
      userId: user.id,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    sessionsByToken.set(session.token, session);
    return session;
  }

  return {
    sessionCookieName,

    async requestPhoneOtp({ phoneNumber }) {
      const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
      const phoneHash = hashValue(authSecret, normalizedPhoneNumber);

      if (!localOtpAllowed(env)) {
        if (typeof sendProductionOtp !== "function") {
          throw new AuthError(
            "phone_verification_unavailable",
            "Phone verification provider is not configured.",
            503
          );
        }

        await sendProductionOtp({ phoneNumber: normalizedPhoneNumber, phoneHash });
      }

      return {
        status: "otp_requested",
        delivery: localOtpAllowed(env) ? "local_stub" : "phone_verification_provider"
      };
    },

    async loginWithPhoneOtp({ phoneNumber, otpCode, profile = {} }) {
      const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
      const phoneHash = hashValue(authSecret, normalizedPhoneNumber);

      await verifyOtp({ normalizedPhoneNumber, phoneHash, otpCode });

      const existingUserId = userIdsByPhoneHash.get(phoneHash);
      const user = existingUserId
        ? usersById.get(existingUserId)
        : createUserRecord({ phoneNumber: normalizedPhoneNumber, ...profile });
      const session = createSessionForUser(user.id);

      return {
        user: toPublicUser(user),
        session
      };
    },

    createUserForTesting(user) {
      return toPublicUser(createUserRecord(user));
    },

    createSessionForUser,

    updateUserProfile(userId, profile = {}) {
      const user = usersById.get(userId);

      if (!user) {
        throw new AuthError("unknown_user", "User does not exist.", 404);
      }

      if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        throw new AuthError("invalid_profile", "Profile updates must be provided as an object.");
      }

      if (Object.hasOwn(profile, "nickname")) {
        user.nickname = normalizeNickname(profile.nickname);
      }

      if (Object.hasOwn(profile, "grade")) {
        user.grade = normalizeGrade(profile.grade);
      }

      if (Object.hasOwn(profile, "defaultAnonymous")) {
        user.defaultAnonymous = normalizeDefaultAnonymous(profile.defaultAnonymous);
      }

      user.updatedAt = currentDate(options.now).toISOString();
      return toPublicUser(user);
    },

    updateUserAccountStatus(userId, accountStatus) {
      const user = usersById.get(userId);

      if (!user) {
        throw new AuthError("unknown_user", "User does not exist.", 404);
      }

      assertAccountStatus(accountStatus);
      user.accountStatus = accountStatus;
      user.updatedAt = currentDate(options.now).toISOString();
      return toPublicUser(user);
    },

    getUserById(userId) {
      const user = usersById.get(userId);
      return user ? toPublicUser(user) : null;
    },

    getSession(token) {
      if (!token) {
        return null;
      }

      const session = sessionsByToken.get(token);

      if (!session) {
        return null;
      }

      if (new Date(session.expiresAt).getTime() <= currentDate(options.now).getTime()) {
        sessionsByToken.delete(token);
        return null;
      }

      const user = usersById.get(session.userId);
      return user ? { session, user: toPublicUser(user) } : null;
    },

    serializeSessionCookie(session) {
      const attributes = [
        `${sessionCookieName}=${session.token}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${Math.floor(sessionTtlMs / 1000)}`
      ];

      if (env.NODE_ENV === "production") {
        attributes.push("Secure");
      }

      return attributes.join("; ");
    }
  };
}

export const authService = createAuthService();
