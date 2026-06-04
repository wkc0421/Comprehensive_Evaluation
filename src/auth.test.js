import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accountStatuses, createAuthService, userRoles } from "./auth.js";

function assertNoPhoneFields(payload) {
  const serialized = JSON.stringify(payload);

  assert.doesNotMatch(serialized, /13812345678/);
  assert.doesNotMatch(serialized, /phone(Hash|Ciphertext|Number)?/i);
}

describe("phone authentication service", () => {
  it("creates a session from the local OTP stub only outside production", async () => {
    const authService = createAuthService({
      env: {
        NODE_ENV: "test",
        AUTH_SECRET: "test-secret",
        AUTH_SESSION_COOKIE_NAME: "test_session",
        LOCAL_OTP_ENABLED: "true",
        LOCAL_OTP_CODE: "246810"
      }
    });

    const otp = await authService.requestPhoneOtp({ phoneNumber: "+8613812345678" });
    const result = await authService.loginWithPhoneOtp({
      phoneNumber: "+8613812345678",
      otpCode: "246810",
      profile: {
        nickname: "Pearl River applicant",
        grade: "high_school_g2",
        defaultAnonymous: false
      }
    });

    assert.equal(otp.status, "otp_requested");
    assert.equal(otp.delivery, "local_stub");
    assert.equal(result.user.nickname, "Pearl River applicant");
    assert.equal(result.user.grade, "high_school_g2");
    assert.equal(result.user.defaultAnonymous, false);
    assert.equal(result.user.role, "user");
    assert.equal(result.user.accountStatus, "active");
    assert.ok(result.session.token);
    assertNoPhoneFields(result);
  });

  it("does not accept the local OTP stub in production", async () => {
    const authService = createAuthService({
      env: {
        NODE_ENV: "production",
        AUTH_SECRET: "production-secret",
        LOCAL_OTP_ENABLED: "true",
        LOCAL_OTP_CODE: "246810"
      }
    });

    await assert.rejects(
      () => authService.loginWithPhoneOtp({
        phoneNumber: "+8613812345678",
        otpCode: "246810"
      }),
      (error) => error.code === "phone_verification_unavailable" && error.statusCode === 503
    );
  });

  it("supports production phone verification through a verifier callback", async () => {
    const authService = createAuthService({
      env: {
        NODE_ENV: "production",
        AUTH_SECRET: "production-secret",
        LOCAL_OTP_ENABLED: "true",
        LOCAL_OTP_CODE: "246810"
      },
      verifyProductionOtp: async ({ otpCode }) => otpCode === "verified"
    });

    const result = await authService.loginWithPhoneOtp({
      phoneNumber: "+8613812345678",
      otpCode: "verified"
    });

    assert.equal(result.user.role, "user");
    assertNoPhoneFields(result);
  });

  it("stores only authenticated roles and supported account statuses", () => {
    assert.deepEqual(userRoles, ["user", "content_reviewer", "data_reviewer", "admin"]);
    assert.deepEqual(accountStatuses, ["active", "limited", "banned", "deleted"]);

    const authService = createAuthService({
      env: {
        NODE_ENV: "test",
        AUTH_SECRET: "role-test-secret"
      }
    });

    assert.throws(
      () => authService.createUserForTesting({
        phoneNumber: "+8613812345678",
        role: "visitor"
      }),
      /User role is not supported/
    );
  });
});
