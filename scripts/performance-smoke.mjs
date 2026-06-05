import { performance } from "node:perf_hooks";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { createAuthService } from "../src/auth.js";
import { handleRequest } from "../src/app.js";
import { seedIds } from "../src/db/seed-data.js";
import { createExperienceSubmissionStore } from "../src/experience-submissions.js";
import { createInteractionStore } from "../src/interactions.js";

const thresholdMs = Number(process.env.PERF_SMOKE_THRESHOLD_MS ?? 250);
const now = () => new Date("2026-04-18T00:00:00.000Z");

function jsonRequest(body) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function createCookie(authService, profile) {
  const user = authService.createUserForTesting(profile);
  const session = authService.createSessionForUser(user.id);

  return {
    user,
    cookie: authService.serializeSessionCookie(session).split(";")[0]
  };
}

function startServer() {
  const authService = createAuthService({
    env: {
      NODE_ENV: "test",
      AUTH_SECRET: "performance-smoke-secret",
      AUTH_SESSION_COOKIE_NAME: "performance_smoke_session",
      LOCAL_OTP_ENABLED: "true",
      LOCAL_OTP_CODE: "246810"
    },
    now
  });
  const experienceSubmissionStore = createExperienceSubmissionStore({ now });
  const interactionStore = createInteractionStore({ now });
  const dataReviewer = createCookie(authService, {
    phoneNumber: "+8613900005101",
    nickname: "Performance data reviewer",
    role: "data_reviewer"
  });
  const contentReviewer = createCookie(authService, {
    phoneNumber: "+8613900005102",
    nickname: "Performance content reviewer",
    role: "content_reviewer"
  });
  const server = createServer((request, response) => {
    handleRequest(request, response, {
      authService,
      experienceSubmissionStore,
      interactionStore,
      now
    }).catch((error) => {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        dataReviewerCookie: dataReviewer.cookie,
        contentReviewerCookie: contentReviewer.cookie
      });
    });
  });
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function measure(baseUrl, target) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${target.path}`, target.options);
  const elapsedMs = performance.now() - startedAt;

  if (!response.ok) {
    throw new Error(`${target.label} returned HTTP ${response.status}`);
  }

  await response.arrayBuffer();
  return {
    label: target.label,
    elapsedMs
  };
}

export async function runPerformanceSmoke() {
  const runtime = await startServer();

  try {
    const targets = [
      { label: "home first-screen HTML", path: "/", options: { headers: { accept: "text/html" } } },
      { label: "school list API", path: "/api/schools?year=2026&sort=name" },
      { label: "experience list API", path: "/api/experiences?sort=verified" },
      { label: "timeline API", path: "/api/timeline?year=2026" },
      {
        label: "score calculation API",
        path: "/api/score/calculate",
        options: jsonRequest({
          schoolId: seedIds.schools.sysu,
          year: 2026,
          scores: {
            gaokao: 650,
            schoolAssessment: 90,
            academicLevel: 95
          }
        })
      },
      {
        label: "admin guide list API",
        path: "/api/admin/guides",
        options: { headers: { cookie: runtime.dataReviewerCookie } }
      },
      {
        label: "admin ingestion list API",
        path: "/api/admin/ingestion-runs",
        options: { headers: { cookie: runtime.dataReviewerCookie } }
      },
      {
        label: "admin experience list API",
        path: "/api/admin/experiences",
        options: { headers: { cookie: runtime.contentReviewerCookie } }
      },
      {
        label: "admin report list API",
        path: "/api/admin/reports",
        options: { headers: { cookie: runtime.contentReviewerCookie } }
      }
    ];
    const results = [];

    for (const target of targets) {
      await measure(runtime.baseUrl, target);
      results.push(await measure(runtime.baseUrl, target));
    }

    const failures = results.filter((result) => result.elapsedMs > thresholdMs);

    console.log("Performance smoke report");
    console.log("- Seed baseline: 3 schools, 2024-2026 guides, published experiences, admin queues");
    console.log(`- Threshold: ${thresholdMs}ms per warmed request`);

    for (const result of results) {
      console.log(`- ${result.label}: ${result.elapsedMs.toFixed(1)}ms`);
    }

    if (failures.length > 0) {
      throw new Error(`Performance smoke exceeded threshold for ${failures.map((failure) => failure.label).join(", ")}`);
    }
  } finally {
    await closeServer(runtime.server);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPerformanceSmoke().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
