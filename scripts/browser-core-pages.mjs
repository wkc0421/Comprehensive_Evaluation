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
    ("/", "home", True, "/"),
    ("/schools?year=2025&sort=name", "schools", True, "/schools"),
    (f"/schools/{sysu_school_id}?year=2026", "school-detail", True, "/schools"),
    ("/timeline?year=2026", "timeline", True, None),
    (f"/calculator?schoolId={sysu_school_id}&year=2026", "calculator", False, None),
    ("/experiences?year=2024&assessmentType=machine_test&sort=newest", "experiences", True, "/experiences"),
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

            for path, label, requires_nav, current_href in core_pages:
                await page.goto(f"{base_url}{path}", wait_until="domcontentloaded")
                await page.locator("body").wait_for()
                metrics = await page.evaluate("""({ requiresNav, currentHref }) => {
                    const nav = document.querySelector("[data-student-bottom-nav='true']");
                    const navLinks = nav ? Array.from(nav.querySelectorAll("a")) : [];
                    const activeLink = nav ? nav.querySelector("a[aria-current='page']") : null;
                    const navRect = nav ? nav.getBoundingClientRect() : null;
                    const visiblePrimaryActions = Array.from(document.querySelectorAll(".primary-action"))
                        .filter((element) => {
                            const rect = element.getBoundingClientRect();
                            const style = window.getComputedStyle(element);
                            return rect.width > 0 &&
                                rect.height > 0 &&
                                rect.bottom > 0 &&
                                rect.top < window.innerHeight &&
                                style.visibility !== "hidden" &&
                                style.display !== "none";
                        });
                    const obstructedPrimaryActions = navRect
                        ? visiblePrimaryActions.filter((element) => {
                            const rect = element.getBoundingClientRect();
                            return rect.bottom > navRect.top && rect.top < navRect.bottom;
                        }).map((element) => element.textContent.trim())
                        : [];
                    const smallTargets = navLinks
                        .map((link) => ({ label: link.textContent.trim(), rect: link.getBoundingClientRect() }))
                        .filter((item) => item.rect.width < 44 || item.rect.height < 44)
                        .map((item) => item.label + ":" + Math.round(item.rect.width) + "x" + Math.round(item.rect.height));
                    const longNames = [
                        "South China University of Technology",
                        "Southern University of Science and Technology",
                    ];
                    const clippedLongNames = Array.from(document.querySelectorAll("body *"))
                        .filter((element) => longNames.some((name) => element.textContent.includes(name)))
                        .filter((element) => element.children.length === 0)
                        .filter((element) => {
                            const rect = element.getBoundingClientRect();
                            const style = window.getComputedStyle(element);
                            if (rect.width <= 0 || rect.height <= 0) {
                                return false;
                            }
                            const renderedWidth = Math.max(element.clientWidth, Math.ceil(rect.width));
                            const overflowing = element.scrollWidth > renderedWidth + 1;
                            const cleanTruncate = style.whiteSpace === "nowrap" && style.textOverflow === "ellipsis";
                            return overflowing && !cleanTruncate;
                        })
                        .map((element) => element.textContent.trim().slice(0, 80));

                    return {
                        scrollWidth: document.documentElement.scrollWidth,
                        clientWidth: document.documentElement.clientWidth,
                        bodyText: document.body.innerText,
                        navExists: Boolean(nav),
                        navLabels: navLinks.map((link) => link.textContent.trim()),
                        activeHref: activeLink ? activeLink.getAttribute("href") : null,
                        smallTargets,
                        obstructedPrimaryActions,
                        clippedLongNames,
                        requiresNav,
                        currentHref
                    };
                }""", {"requiresNav": requires_nav, "currentHref": current_href})

                if metrics["scrollWidth"] > metrics["clientWidth"]:
                    raise AssertionError(
                        f"{label} at {width}px overflows horizontally: "
                        f"{metrics['scrollWidth']} > {metrics['clientWidth']}"
                    )

                for text in hidden_text:
                    if text in metrics["bodyText"]:
                        raise AssertionError(f"{label} exposed hidden review text: {text}")

                if metrics["requiresNav"]:
                    if not metrics["navExists"]:
                        raise AssertionError(f"{label} at {width}px is missing student bottom navigation")
                    if metrics["navLabels"] != ["Home", "Schools", "Experiences", "My"]:
                        raise AssertionError(f"{label} at {width}px has unexpected nav labels: {metrics['navLabels']}")
                    if metrics["currentHref"] and metrics["activeHref"] != metrics["currentHref"]:
                        raise AssertionError(
                            f"{label} at {width}px active nav href {metrics['activeHref']} "
                            f"did not match {metrics['currentHref']}"
                        )
                    if metrics["smallTargets"]:
                        raise AssertionError(f"{label} at {width}px has small nav targets: {metrics['smallTargets']}")
                    if metrics["obstructedPrimaryActions"]:
                        raise AssertionError(
                            f"{label} at {width}px has primary actions under bottom nav: "
                            f"{metrics['obstructedPrimaryActions']}"
                        )
                elif metrics["navExists"]:
                    raise AssertionError(f"{label} at {width}px should hide student bottom navigation")

                if metrics["clippedLongNames"]:
                    raise AssertionError(
                        f"{label} at {width}px clips long school names without ellipsis: "
                        f"{metrics['clippedLongNames']}"
                    )

                if width == 390:
                    await page.screenshot(path=screenshot_dir / f"{label}-{width}.png", full_page=True)

            await page.close()

        desktop_page = await browser.new_page(viewport={"width": 1280, "height": 940})
        await desktop_page.goto(f"{base_url}/", wait_until="domcontentloaded")
        desktop_metrics = await desktop_page.evaluate("""() => {
            const frame = document.querySelector(".student-frame");
            const rect = frame.getBoundingClientRect();
            return { width: rect.width, left: rect.left, right: rect.right, viewport: window.innerWidth };
        }""")
        if desktop_metrics["width"] < 430 or desktop_metrics["width"] > 520:
            raise AssertionError(f"Desktop student frame width is outside 430-520px: {desktop_metrics}")
        centered_delta = abs(desktop_metrics["left"] - (desktop_metrics["viewport"] - desktop_metrics["right"]))
        if centered_delta > 2:
            raise AssertionError(f"Desktop student frame is not centered: {desktop_metrics}")
        await desktop_page.close()

        await browser.close()

asyncio.run(main())
print("Core browser verification passed at 375px, 390px, 430px, and desktop student frame width")
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
