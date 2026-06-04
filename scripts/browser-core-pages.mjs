import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { createAuthService } from "../src/auth.js";
import { handleRequest } from "../src/app.js";
import { seedIds } from "../src/db/seed-data.js";
import { createExperienceSubmissionStore } from "../src/experience-submissions.js";
import { createInteractionStore } from "../src/interactions.js";

const defaultPythonCandidates = [
  process.env.PLAYWRIGHT_PYTHON,
  "/home/wkc/codex_project/linux_codex_gui/.venv/bin/python",
  "python3",
  "python"
].filter(Boolean);
const screenshotDir = resolve(process.env.BROWSER_SCREENSHOT_DIR ?? "scripts/ralph/runs/browser-core-pages");

function findPlaywrightPython() {
  for (const candidate of defaultPythonCandidates) {
    const result = spawnSync(candidate, [
      "-c",
      "from playwright.async_api import async_playwright"
    ], {
      encoding: "utf8"
    });

    if (result.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    "Python Playwright is required for browser tests. Set PLAYWRIGHT_PYTHON to a Python executable with playwright installed."
  );
}

function pythonBrowserScript() {
  return String.raw`
import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright

base_url = os.environ["BASE_URL"].rstrip("/")
screenshot_dir = Path(os.environ["BROWSER_SCREENSHOT_DIR"])
sysu_school_id = os.environ["SYSU_SCHOOL_ID"]

core_pages = [
    ("/", "home"),
    ("/schools?year=2025&sort=name", "schools"),
    (f"/schools/{sysu_school_id}?year=2026", "school-detail"),
    ("/timeline?year=2026", "timeline"),
    (f"/calculator?schoolId={sysu_school_id}&year=2026", "calculator"),
    ("/experiences?year=2024&assessmentType=machine_test&sort=newest", "experiences"),
]
widths = [375, 390, 430]
hidden_text = [
    "Draft Review Guide",
    "Working Draft",
    "Pending review experience that must remain hidden",
]

async def main():
    screenshot_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()

        for width in widths:
            page = await browser.new_page(viewport={"width": width, "height": 940})

            for path, label in core_pages:
                await page.goto(f"{base_url}{path}", wait_until="domcontentloaded")
                await page.locator("body").wait_for()
                metrics = await page.evaluate("""() => ({
                    scrollWidth: document.documentElement.scrollWidth,
                    clientWidth: document.documentElement.clientWidth,
                    bodyText: document.body.innerText
                })""")

                if metrics["scrollWidth"] > metrics["clientWidth"]:
                    raise AssertionError(
                        f"{label} at {width}px overflows horizontally: "
                        f"{metrics['scrollWidth']} > {metrics['clientWidth']}"
                    )

                for text in hidden_text:
                    if text in metrics["bodyText"]:
                        raise AssertionError(f"{label} exposed hidden review text: {text}")

                if width == 390:
                    await page.screenshot(path=screenshot_dir / f"{label}-{width}.png", full_page=True)

            await page.close()

        await browser.close()

asyncio.run(main())
print("Core mobile browser verification passed at 375px, 390px, and 430px")
`;
}

function startServer() {
  const now = () => new Date("2026-04-18T00:00:00.000Z");
  const authService = createAuthService({
    env: {
      NODE_ENV: "test",
      AUTH_SECRET: "browser-test-secret",
      AUTH_SESSION_COOKIE_NAME: "browser_test_session",
      LOCAL_OTP_ENABLED: "true",
      LOCAL_OTP_CODE: "246810"
    },
    now
  });
  const experienceSubmissionStore = createExperienceSubmissionStore({ now });
  const interactionStore = createInteractionStore({ now });
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
        baseUrl: `http://127.0.0.1:${address.port}`
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

async function runBrowserVerification({ python, baseUrl }) {
  await new Promise((resolve, reject) => {
    const child = spawn(python, ["-c", pythonBrowserScript()], {
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        BROWSER_SCREENSHOT_DIR: screenshotDir,
        SYSU_SCHOOL_ID: seedIds.schools.sysu
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `Browser verification failed with exit code ${code}`));
    });
  });
}

const python = findPlaywrightPython();
const { server, baseUrl } = await startServer();

try {
  await mkdir(screenshotDir, { recursive: true });
  await runBrowserVerification({ python, baseUrl });
} finally {
  await closeServer(server);
}
