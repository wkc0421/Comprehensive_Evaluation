import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { renderAdminPage, renderNotFound, renderStudentHome } from "./pages.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(rootDir, "public");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(html);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
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

export async function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

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
