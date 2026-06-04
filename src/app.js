import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { AuthError, authService as defaultAuthService } from "./auth.js";
import { listSchoolGuideCards, listTimelineEvents } from "./db/data-access.js";
import { renderAdminPage, renderNotFound, renderSchoolListPage, renderStudentHome } from "./pages.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(rootDir, "public");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);
const guideStatuses = new Set(["draft", "pending_review", "published", "archived"]);
const schoolSorts = new Set(["deadline", "updated", "name"]);

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(html);
}

class RequestError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "RequestError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, error, message, extra = {}) {
  sendJson(response, statusCode, { error, message, ...extra });
}

function errorStatus(error) {
  return Number.isInteger(error.statusCode) ? error.statusCode : 500;
}

async function readJsonBody(request) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of request) {
    bytes += chunk.length;

    if (bytes > 64 * 1024) {
      throw new RequestError("request_too_large", "Request body is too large.", 413);
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();

  if (rawBody.length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new RequestError("invalid_json", "Request body must be valid JSON.");
  }
}

function headerValue(headers, name) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function optionalStringParam(url, name) {
  const value = url.searchParams.get(name);

  if (value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalYearParam(url) {
  const value = optionalStringParam(url, "year");

  if (!value) {
    return undefined;
  }

  const year = Number(value);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new RequestError("invalid_year", "Year must be a four-digit admission year.");
  }

  return year;
}

function parseSchoolListFilters(url) {
  const status = optionalStringParam(url, "status");
  const sort = optionalStringParam(url, "sort") ?? "deadline";

  if (status && !guideStatuses.has(status)) {
    throw new RequestError("invalid_status", "Guide status is not supported.");
  }

  if (!schoolSorts.has(sort)) {
    throw new RequestError("invalid_sort", "School list sort is not supported.");
  }

  return {
    year: optionalYearParam(url),
    status,
    keyword: optionalStringParam(url, "keyword"),
    applicationStatus: optionalStringParam(url, "applicationStatus"),
    schoolType: optionalStringParam(url, "schoolType"),
    sort
  };
}

function shouldSendSchoolListJson(request, url) {
  if (url.pathname === "/api/schools" || url.searchParams.get("format") === "json") {
    return true;
  }

  const accept = headerValue(request.headers, "accept") ?? "";

  if (accept.includes("text/html")) {
    return false;
  }

  return accept.length === 0 || accept.includes("*/*") || accept.includes("application/json");
}

function schoolCardJson(card) {
  return {
    school: {
      id: card.school.id,
      name: card.school.name,
      city: card.school.city,
      schoolType: card.school.schoolType,
      officialWebsiteUrl: card.school.officialWebsiteUrl,
      updatedAt: card.school.updatedAt
    },
    guide: {
      id: card.guide.id,
      year: card.guide.admissionYear,
      status: card.guide.status,
      applicationStatus: card.guide.applicationStatus,
      applicationStartAt: card.guide.applicationStartAt,
      applicationDeadlineAt: card.guide.applicationDeadlineAt,
      updatedAt: card.guide.updatedAt,
      summary: card.guide.summary,
      officialSourceUrl: card.guide.officialSourceUrl
    },
    keyTimelineNodes: card.keyTimelineNodes.map((node) => ({
      id: node.id,
      eventKey: node.eventKey,
      title: node.title,
      startsAt: node.startsAt,
      endsAt: node.endsAt
    })),
    formula: card.formula,
    experiences: card.experiences
  };
}

function sendSchoolListJson(response, filters) {
  const schools = listSchoolGuideCards(filters).map(schoolCardJson);

  sendJson(response, 200, {
    filters,
    count: schools.length,
    schools
  });
}

function sessionTokenFromRequest(request, authService) {
  const authorization = headerValue(request.headers, "authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(?<token>.+)$/i)?.groups?.token;

  if (bearerToken) {
    return bearerToken;
  }

  const cookieHeader = headerValue(request.headers, "cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${authService.sessionCookieName}=`));

  return cookie ? decodeURIComponent(cookie.slice(authService.sessionCookieName.length + 1)) : "";
}

function currentUserFromRequest(request, authService) {
  const token = sessionTokenFromRequest(request, authService);
  return authService.getSession(token)?.user ?? null;
}

function requireActiveUser(request, response, authService, options = {}) {
  const user = currentUserFromRequest(request, authService);

  if (!user) {
    sendError(response, 401, "login_required", "Login is required for this action.");
    return null;
  }

  if (user.accountStatus !== "active") {
    sendError(response, 403, "account_restricted", "This account cannot perform restricted actions.", {
      accountStatus: user.accountStatus
    });
    return null;
  }

  if (options.roles && !options.roles.includes(user.role)) {
    sendError(response, 403, "forbidden", "This account does not have access to this API.");
    return null;
  }

  return user;
}

function isMineTimeline(url) {
  return url.searchParams.get("mine") === "true";
}

async function sendPublicAsset(requestPath, response) {
  const normalizedPath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const assetPath = join(publicDir, normalizedPath);
  const assetStats = await stat(assetPath).catch(() => null);

  if (!assetStats?.isFile()) {
    return false;
  }

  response.writeHead(200, {
    "content-type": contentTypes.get(extname(assetPath)) ?? "application/octet-stream",
    "cache-control": "public, max-age=300"
  });
  createReadStream(assetPath).pipe(response);
  return true;
}

export async function handleRequest(request, response, context = {}) {
  const authService = context.authService ?? defaultAuthService;
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/api/auth/otp" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const result = await authService.requestPhoneOtp({ phoneNumber: body.phoneNumber });
      sendJson(response, 200, result);
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "auth_error", error.message);
    }

    return;
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const result = await authService.loginWithPhoneOtp({
        phoneNumber: body.phoneNumber,
        otpCode: body.otpCode,
        profile: {
          nickname: body.nickname,
          grade: body.grade,
          defaultAnonymous: body.defaultAnonymous
        }
      });

      sendJson(response, 200, {
        user: result.user,
        session: { expiresAt: result.session.expiresAt }
      }, {
        "set-cookie": authService.serializeSessionCookie(result.session)
      });
    } catch (error) {
      const statusCode = error instanceof AuthError || error instanceof RequestError ? errorStatus(error) : 500;
      sendError(response, statusCode, error.code ?? "auth_error", error.message);
    }

    return;
  }

  if (url.pathname === "/api/me" && request.method === "GET") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    sendJson(response, 200, { user });
    return;
  }

  if (url.pathname === "/api/experiences" && request.method === "POST") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    sendJson(response, 202, { status: "pending_review", submittedBy: user.id });
    return;
  }

  if (url.pathname === "/api/favorites" && request.method === "POST") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    sendJson(response, 202, { status: "accepted", userId: user.id });
    return;
  }

  const usefulRoute = url.pathname.match(/^\/api\/experiences\/(?<experienceId>[^/]+)\/useful$/);

  if (usefulRoute && request.method === "POST") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    sendJson(response, 202, {
      status: "accepted",
      experienceId: usefulRoute.groups.experienceId,
      userId: user.id
    });
    return;
  }

  if (url.pathname === "/api/reports" && request.method === "POST") {
    const user = requireActiveUser(request, response, authService);

    if (!user) {
      return;
    }

    sendJson(response, 202, { status: "pending", reporterId: user.id });
    return;
  }

  if (url.pathname === "/api/timeline" && request.method === "GET") {
    if (isMineTimeline(url)) {
      const user = requireActiveUser(request, response, authService);

      if (!user) {
        return;
      }

      sendJson(response, 200, { mine: true, events: [], reminders: [] });
      return;
    }

    sendJson(response, 200, { mine: false, events: listTimelineEvents() });
    return;
  }

  if ((url.pathname === "/schools" || url.pathname === "/api/schools") && request.method === "GET") {
    try {
      const filters = parseSchoolListFilters(url);

      if (shouldSendSchoolListJson(request, url)) {
        sendSchoolListJson(response, filters);
        return;
      }

      sendHtml(response, 200, renderSchoolListPage(filters));
    } catch (error) {
      sendError(response, errorStatus(error), error.code ?? "school_list_error", error.message);
    }

    return;
  }

  if (url.pathname.startsWith("/api/admin")) {
    const user = requireActiveUser(request, response, authService, {
      roles: ["content_reviewer", "data_reviewer", "admin"]
    });

    if (!user) {
      return;
    }

    sendJson(response, 200, { ok: true, user });
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "guangdong-comprehensive-evaluation",
      database: "postgresql"
    });
    return;
  }

  if (url.pathname === "/") {
    sendHtml(response, 200, renderStudentHome());
    return;
  }

  if (url.pathname === "/admin") {
    sendHtml(response, 200, renderAdminPage());
    return;
  }

  if (await sendPublicAsset(url.pathname, response)) {
    return;
  }

  sendHtml(response, 404, renderNotFound());
}
