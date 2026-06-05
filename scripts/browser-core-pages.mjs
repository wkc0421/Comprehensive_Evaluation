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
scut_school_id = os.environ["SCUT_SCHOOL_ID"]
logged_in_cookie = os.environ["LOGGED_IN_COOKIE"]

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
    "admission probability",
    "ranking prediction",
    "paid consulting",
    "open comments",
    "private messaging",
]

home_grade_states = [
    ("/?grade=high_school_g1", "High school grade one", "Understand the comprehensive evaluation path."),
    ("/?grade=high_school_g2", "High school grade two", "Check academic test and subject requirements."),
    ("/?grade=high_school_g3", "High school grade three", "Watch current guide releases."),
]

async def verify_home_state(page, path, expected_grade, expected_tip, *, logged_in=False):
    await page.goto(f"{base_url}{path}", wait_until="domcontentloaded")
    await page.locator(".home-first-screen").wait_for()
    metrics = await page.evaluate("""({ expectedGrade }) => {
        const first = document.querySelector(".home-first-screen");
        const latestGuides = document.querySelector("#latest-guides-title");
        const taskLinks = Array.from(document.querySelectorAll(".home-task-card"))
            .map((link) => ({ href: link.getAttribute("href"), text: link.innerText.trim() }));
        const timelineRows = Array.from(document.querySelectorAll("[data-home-timeline-row='true']"));
        const guideRows = Array.from(document.querySelectorAll("[data-home-guide-row='true']"));
        const experienceRows = Array.from(document.querySelectorAll("[data-home-experience-row='true']"));
        const latestBox = latestGuides ? latestGuides.getBoundingClientRect() : null;
        const firstText = first ? first.innerText : "";
        return {
            bodyText: document.body.innerText,
            firstText,
            taskLinks,
            timelineCount: timelineRows.length,
            guideCount: guideRows.length,
            experienceCount: experienceRows.length,
            latestGuideTop: latestBox ? latestBox.top : null,
            viewportHeight: window.innerHeight,
            currentGradeHref: document.querySelector(".grade-switch a[aria-current='page']")?.getAttribute("href") ?? "",
            expectedGrade
        };
    }""", {"expectedGrade": expected_grade})

    if expected_grade not in metrics["bodyText"]:
        raise AssertionError(f"Home state missing grade {expected_grade}")
    if expected_tip not in metrics["bodyText"]:
        raise AssertionError(f"Home state missing grade tip {expected_tip}")
    if "Latest guides" in metrics["firstText"] or "Latest experiences" in metrics["firstText"]:
        raise AssertionError("Home first screen contains below-the-fold latest content")
    if metrics["latestGuideTop"] is None or metrics["latestGuideTop"] < metrics["viewportHeight"] - 8:
        raise AssertionError(f"Latest guides are not below the first screen: {metrics}")
    expected_tasks = [
        ("/schools", "Schools\\nBrowse schools"),
        ("/timeline", "Timeline\\nKey dates"),
        ("/calculator", "Score Calculator\\nCalculate score"),
        ("/experiences", "Experiences\\nRead stories"),
    ]
    actual_tasks = [(item["href"], "\\n".join(item["text"].splitlines()[-2:])) for item in metrics["taskLinks"]]
    if actual_tasks != expected_tasks:
        raise AssertionError(f"Unexpected home tasks: {actual_tasks}")
    if metrics["timelineCount"] < 1 or metrics["timelineCount"] > 3:
        raise AssertionError(f"Nearest timeline count should be 1-3, got {metrics['timelineCount']}")
    if metrics["guideCount"] != 3 or metrics["experienceCount"] != 3:
        raise AssertionError(f"Latest row counts are wrong: {metrics}")
    if logged_in:
        if "Favorited schools" not in metrics["bodyText"]:
            raise AssertionError("Logged-in home did not use favorited school timeline source")
        if "Log in to favorite schools" in metrics["bodyText"]:
            raise AssertionError("Logged-in home still shows the guest timeline login prompt")
    else:
        if "Log in to favorite schools and view your personal timeline." not in metrics["bodyText"]:
            raise AssertionError("Guest home missing personal timeline login prompt")

async def verify_login_favorite_continuation(page):
    await page.goto(f"{base_url}/schools/{sysu_school_id}?year=2026", wait_until="domcontentloaded")
    await page.locator(".student-top-bar button[aria-label='Favorite school']").click()
    await page.locator("#login-title").wait_for()

    submit = page.locator("[data-login-submit='true']")
    if not await submit.is_disabled():
        raise AssertionError("Login submit should be disabled until agreement is checked")

    await page.locator("input[name='phoneNumber']").fill("12112345678")
    await page.locator("[data-send-otp='true']").click()
    error_text = await page.locator("[data-login-error='true']").inner_text()
    if "mainland China phone number" not in error_text:
        raise AssertionError(f"Invalid phone did not show retryable validation: {error_text}")

    await page.locator("input[name='phoneNumber']").fill("13900001234")
    await page.locator("input[name='otpCode']").fill("246810")
    await page.locator("[data-login-agreement='true']").check()
    if await submit.is_disabled():
        raise AssertionError("Login submit stayed disabled after agreement was checked")

    await page.locator("[data-send-otp='true']").click()
    await page.wait_for_function("""() => document.querySelector("[data-send-otp='true']")?.textContent === "60s" """)
    await submit.click()
    await page.wait_for_url(f"**/schools/{sysu_school_id}?year=2026&toast=favorite_saved")
    await page.locator("[data-student-toast='true']").wait_for(state="visible")
    toast_text = await page.locator("[data-student-toast='true']").inner_text()
    if toast_text != "Favorite saved":
        raise AssertionError(f"Favorite continuation toast was wrong: {toast_text}")

async def ajax_count(page):
    return await page.evaluate("() => window.__schoolFilterAjaxCount || 0")

async def wait_for_ajax_count(page, previous_count):
    await page.wait_for_function("previous => (window.__schoolFilterAjaxCount || 0) > previous", arg=previous_count)

async def verify_school_filter_interactions(page):
    await page.goto(f"{base_url}/schools?year=2025&sort=name", wait_until="domcontentloaded")
    await page.locator("[data-school-filter-form='true']").wait_for()

    if await page.locator("input[placeholder='Search school']").count() != 1:
        raise AssertionError("School list search placeholder is missing")

    await page.evaluate("() => { window.__schoolFilterMarker = 'kept'; }")
    previous_count = await ajax_count(page)
    await page.locator("select[name='year']").select_option("2026")
    await wait_for_ajax_count(page, previous_count)
    marker = await page.evaluate("() => window.__schoolFilterMarker")
    if marker != "kept":
        raise AssertionError("School filter change caused a full page navigation")
    body_text = await page.locator("body").inner_text()
    if "Year: 2026" not in body_text or "Sun Yat-sen University" not in body_text:
        raise AssertionError(f"School AJAX year filter did not preserve visible state: {body_text}")

    previous_count = await ajax_count(page)
    await page.locator("[data-school-clear-filters='true']").first.click()
    await wait_for_ajax_count(page, previous_count)
    body_text = await page.locator("body").inner_text()
    if "Showing all published school guide cards." not in body_text:
        raise AssertionError("School clear filters did not restore the all-published summary")

    await page.locator("input[name='keyword']").fill("NoSuchSchool")
    previous_count = await ajax_count(page)
    await page.locator("[data-school-filter-form='true'] .primary-action").click()
    await wait_for_ajax_count(page, previous_count)
    body_text = await page.locator("body").inner_text()
    if "No schools match these filters." not in body_text or "Clear filters" not in body_text:
        raise AssertionError("School empty state did not include clear-filter guidance")

    async def fail_school_request(route):
        await route.fulfill(status=503, content_type="text/html", body="failed")

    await page.route("**/schools?*keyword=BrowserFail*", fail_school_request)
    await page.locator("input[name='keyword']").fill("BrowserFail")
    await page.locator("[data-school-filter-form='true'] .primary-action").click()
    await page.locator("[data-school-filter-retry='true']").wait_for()
    error_text = await page.locator("[data-school-list-status='true']").inner_text()
    if "Could not load schools." not in error_text or "Retry" not in error_text:
        raise AssertionError(f"School failed-loading state was wrong: {error_text}")

    await page.unroute("**/schools?*keyword=BrowserFail*", fail_school_request)
    previous_count = await ajax_count(page)
    await page.locator("[data-school-filter-retry='true']").click()
    await wait_for_ajax_count(page, previous_count)
    body_text = await page.locator("body").inner_text()
    if "No schools match these filters." not in body_text:
        raise AssertionError("School retry did not reload the requested filters")

async def verify_school_detail_fallback(page):
    await page.goto(f"{base_url}/schools/{scut_school_id}?year=2026", wait_until="domcontentloaded")
    await page.locator("#school-detail-title").wait_for()
    body_text = await page.locator("body").inner_text()
    if "Historical reference" not in body_text:
        raise AssertionError("School detail fallback is missing historical reference label")
    if "No published 2026 guide is visible yet. Showing 2025 as historical reference." not in body_text:
        raise AssertionError("School detail fallback does not explain the unpublished requested year")
    if "Draft Review Guide" in body_text:
        raise AssertionError("School detail fallback exposed pending-review guide text")
    if await page.locator("a[href^='/calculator?schoolId=']").count() != 0:
        raise AssertionError("No-formula fallback detail exposed a score calculator link")

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
                        visiblePrimaryActionTexts: visiblePrimaryActions.map((element) => element.textContent.trim()),
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

                if label == "schools":
                    body_lower = metrics["bodyText"].lower()
                    required_school_text = [
                        "School keyword",
                        "Guide status",
                        "Application status",
                        "School type",
                        "SCUT",
                        "No formula",
                        "1 experience",
                        "Key timeline",
                    ]
                    for expected in required_school_text:
                        if expected.lower() not in body_lower:
                            raise AssertionError(f"Schools page at {width}px missing {expected}")

                if label == "school-detail":
                    body_lower = metrics["bodyText"].lower()
                    required_detail_text = [
                        "Official guide summary",
                        "Score formula",
                        "Admission requirements",
                        "Assessment and admission",
                        "Fees and consultation",
                        "Featured experiences",
                        "Submit experience",
                    ]
                    for expected in required_detail_text:
                        if expected.lower() not in body_lower:
                            raise AssertionError(f"School detail at {width}px missing {expected}")
                    if len(metrics["visiblePrimaryActionTexts"]) > 1:
                        raise AssertionError(
                            f"School detail at {width}px has more than one primary action in view: "
                            f"{metrics['visiblePrimaryActionTexts']}"
                        )

                if width == 390:
                    await page.screenshot(path=screenshot_dir / f"{label}-{width}.png", full_page=True)

            await page.close()

            home_page = await browser.new_page(viewport={"width": width, "height": 940})
            for path, expected_grade, expected_tip in home_grade_states:
                await verify_home_state(home_page, path, expected_grade, expected_tip)
                if width == 390:
                    screenshot_name = path.split("=")[-1].replace("high_school_", "home-")
                    await home_page.screenshot(path=screenshot_dir / f"{screenshot_name}-{width}.png", full_page=True)
            await home_page.close()

            logged_context = await browser.new_context(
                viewport={"width": width, "height": 940},
                extra_http_headers={"Cookie": logged_in_cookie}
            )
            logged_home = await logged_context.new_page()
            await verify_home_state(
                logged_home,
                "/",
                "High school grade two",
                "Check academic test and subject requirements.",
                logged_in=True
            )
            if width == 390:
                await logged_home.screenshot(path=screenshot_dir / f"home-logged-in-{width}.png", full_page=True)
            await logged_context.close()

            school_filter_page = await browser.new_page(viewport={"width": width, "height": 940})
            await verify_school_filter_interactions(school_filter_page)
            if width == 390:
                await school_filter_page.screenshot(path=screenshot_dir / f"schools-filter-retry-{width}.png", full_page=True)
            await school_filter_page.close()

            school_fallback_page = await browser.new_page(viewport={"width": width, "height": 940})
            await verify_school_detail_fallback(school_fallback_page)
            if width == 390:
                await school_fallback_page.screenshot(path=screenshot_dir / f"school-detail-historical-{width}.png", full_page=True)
            await school_fallback_page.close()

        login_page = await browser.new_page(viewport={"width": 390, "height": 940})
        await verify_login_favorite_continuation(login_page)
        await login_page.screenshot(path=screenshot_dir / "login-favorite-continuation-390.png", full_page=True)
        await login_page.close()

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

        desktop_school_page = await browser.new_page(viewport={"width": 1280, "height": 940})
        for path, screenshot_name, required_text in [
            ("/schools?year=2025&sort=name", "schools-desktop-1280.png", "School keyword"),
            (f"/schools/{sysu_school_id}?year=2026", "school-detail-desktop-1280.png", "Official guide summary"),
        ]:
            await desktop_school_page.goto(f"{base_url}{path}", wait_until="domcontentloaded")
            desktop_school_metrics = await desktop_school_page.evaluate("""() => {
                const frame = document.querySelector(".student-frame");
                const frameRect = frame.getBoundingClientRect();
                return {
                    frameWidth: frameRect.width,
                    scrollWidth: document.documentElement.scrollWidth,
                    clientWidth: document.documentElement.clientWidth,
                    bodyText: document.body.innerText
                };
            }""")
            if desktop_school_metrics["frameWidth"] < 430 or desktop_school_metrics["frameWidth"] > 520:
                raise AssertionError(f"Desktop school frame width is outside 430-520px: {desktop_school_metrics}")
            if desktop_school_metrics["scrollWidth"] > desktop_school_metrics["clientWidth"]:
                raise AssertionError(f"Desktop school page overflows horizontally: {desktop_school_metrics}")
            if required_text.lower() not in desktop_school_metrics["bodyText"].lower():
                raise AssertionError(f"Desktop school page missing {required_text}")
            await desktop_school_page.screenshot(path=screenshot_dir / screenshot_name, full_page=True)
        await desktop_school_page.close()

        await browser.close()

asyncio.run(main())
print("Core browser verification passed at 375px, 390px, 430px, school list/detail interactions, home/login states, and desktop student school frames")
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
  const loggedInUser = authService.createUserForTesting({
    phoneNumber: "+8613900001200",
    nickname: "Browser home student",
    grade: "high_school_g2"
  });
  const loggedInCookie = authService.serializeSessionCookie(
    authService.createSessionForUser(loggedInUser.id)
  ).split(";")[0];

  interactionStore.addFavorite({
    userId: loggedInUser.id,
    targetType: "school",
    targetId: seedIds.schools.sysu
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
        loggedInCookie
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

async function runBrowserVerification({ python, baseUrl, loggedInCookie }) {
  await new Promise((resolve, reject) => {
    const child = spawn(python, ["-c", pythonBrowserScript()], {
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        BROWSER_SCREENSHOT_DIR: screenshotDir,
        SYSU_SCHOOL_ID: seedIds.schools.sysu,
        SCUT_SCHOOL_ID: seedIds.schools.scut,
        LOGGED_IN_COOKIE: loggedInCookie
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
const { server, baseUrl, loggedInCookie } = await startServer();

try {
  await mkdir(screenshotDir, { recursive: true });
  await runBrowserVerification({ python, baseUrl, loggedInCookie });
} finally {
  await closeServer(server);
}
