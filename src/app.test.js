import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import { createAuthService } from "./auth.js";
import { handleRequest } from "./app.js";
import { seedIds } from "./db/seed-data.js";

function jsonRequest(body = {}) {
  return {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function sessionCookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");

  assert.ok(setCookie, "Expected session cookie to be set");
  return setCookie.split(";")[0];
}

function assertNoPhoneFields(payload) {
  const serialized = JSON.stringify(payload);

  assert.doesNotMatch(serialized, /13812345678/);
  assert.doesNotMatch(serialized, /phone(Hash|Ciphertext|Number)?/i);
}

describe("web routes", () => {
  let authService;
  let baseUrl;
  let server;

  before(async () => {
    authService = createAuthService({
      env: {
        NODE_ENV: "test",
        AUTH_SECRET: "app-test-secret",
        AUTH_SESSION_COOKIE_NAME: "test_session",
        LOCAL_OTP_ENABLED: "true",
        LOCAL_OTP_CODE: "246810"
      }
    });
    server = createServer((request, response) => {
      handleRequest(request, response, { authService }).catch((error) => {
        response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: error.message }));
      });
    });

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("renders the student home route", async () => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Mobile-first student web app/);
    assert.match(body, /Grade-aware entry points/);
  });

  it("renders the admin placeholder route", async () => {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Admin console placeholder/);
    assert.match(body, /Official guide review/);
  });

  it("returns the health API contract", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.database, "postgresql");
  });

  it("logs in with a phone OTP session without returning phone data", async () => {
    const otpResponse = await fetch(`${baseUrl}/api/auth/otp`, {
      method: "POST",
      ...jsonRequest({ phoneNumber: "+8613812345678" })
    });
    const otpBody = await otpResponse.json();

    assert.equal(otpResponse.status, 200);
    assert.equal(otpBody.delivery, "local_stub");
    assertNoPhoneFields(otpBody);

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      ...jsonRequest({
        phoneNumber: "+8613812345678",
        otpCode: "246810",
        nickname: "Grade two applicant",
        grade: "high_school_g2",
        defaultAnonymous: false
      })
    });
    const loginBody = await loginResponse.json();
    const cookie = sessionCookieFrom(loginResponse);

    assert.equal(loginResponse.status, 200);
    assert.equal(loginBody.user.nickname, "Grade two applicant");
    assert.equal(loginBody.user.role, "user");
    assert.equal(loginBody.user.accountStatus, "active");
    assert.equal(loginBody.user.defaultAnonymous, false);
    assert.ok(loginBody.session.expiresAt);
    assertNoPhoneFields(loginBody);

    const meResponse = await fetch(`${baseUrl}/api/me`, {
      headers: { cookie }
    });
    const meBody = await meResponse.json();

    assert.equal(meResponse.status, 200);
    assert.equal(meBody.user.id, loginBody.user.id);
    assertNoPhoneFields(meBody);
  });

  it("blocks unauthenticated users from restricted student and admin APIs", async () => {
    const cases = [
      { method: "POST", path: "/api/experiences", body: { schoolId: seedIds.schools.sysu } },
      { method: "POST", path: "/api/favorites", body: { targetType: "school", targetId: seedIds.schools.sysu } },
      { method: "POST", path: `/api/experiences/${seedIds.experiences.sysu2026}/useful`, body: {} },
      { method: "POST", path: "/api/reports", body: { targetType: "experience", targetId: seedIds.experiences.sysu2026 } },
      { method: "GET", path: "/api/timeline?mine=true" },
      { method: "GET", path: "/api/admin/health" }
    ];

    for (const currentCase of cases) {
      const response = await fetch(`${baseUrl}${currentCase.path}`, {
        method: currentCase.method,
        ...(currentCase.body ? jsonRequest(currentCase.body) : {})
      });
      const body = await response.json();

      assert.equal(response.status, 401, currentCase.path);
      assert.equal(body.error, "login_required", currentCase.path);
      assert.match(body.message, /Login is required/);
    }
  });

  it("blocks limited and banned accounts from restricted actions", async () => {
    const limitedUser = authService.createUserForTesting({
      phoneNumber: "+8613000000001",
      accountStatus: "limited"
    });
    const bannedUser = authService.createUserForTesting({
      phoneNumber: "+8613000000002",
      role: "admin",
      accountStatus: "banned"
    });
    const limitedSession = authService.createSessionForUser(limitedUser.id);
    const bannedSession = authService.createSessionForUser(bannedUser.id);

    const limitedResponse = await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: {
        cookie: authService.serializeSessionCookie(limitedSession).split(";")[0],
        "content-type": "application/json"
      },
      body: JSON.stringify({ targetType: "school", targetId: seedIds.schools.sysu })
    });
    const limitedBody = await limitedResponse.json();

    assert.equal(limitedResponse.status, 403);
    assert.equal(limitedBody.error, "account_restricted");
    assert.equal(limitedBody.accountStatus, "limited");

    const bannedResponse = await fetch(`${baseUrl}/api/admin/health`, {
      headers: { cookie: authService.serializeSessionCookie(bannedSession).split(";")[0] }
    });
    const bannedBody = await bannedResponse.json();

    assert.equal(bannedResponse.status, 403);
    assert.equal(bannedBody.error, "account_restricted");
    assert.equal(bannedBody.accountStatus, "banned");
  });

  it("enforces reviewer or admin roles on admin APIs", async () => {
    const user = authService.createUserForTesting({
      phoneNumber: "+8613000000003",
      role: "user"
    });
    const admin = authService.createUserForTesting({
      phoneNumber: "+8613000000004",
      role: "admin"
    });
    const userSession = authService.createSessionForUser(user.id);
    const adminSession = authService.createSessionForUser(admin.id);

    const userResponse = await fetch(`${baseUrl}/api/admin/health`, {
      headers: { cookie: authService.serializeSessionCookie(userSession).split(";")[0] }
    });
    const userBody = await userResponse.json();

    assert.equal(userResponse.status, 403);
    assert.equal(userBody.error, "forbidden");

    const adminResponse = await fetch(`${baseUrl}/api/admin/health`, {
      headers: { cookie: authService.serializeSessionCookie(adminSession).split(";")[0] }
    });
    const adminBody = await adminResponse.json();

    assert.equal(adminResponse.status, 200);
    assert.equal(adminBody.ok, true);
    assert.equal(adminBody.user.role, "admin");
    assertNoPhoneFields(adminBody);
  });
});
