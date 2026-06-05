import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { createAuthService } from "../src/auth.js";
import { handleRequest } from "../src/app.js";
import { createAdminIngestionRun } from "../src/db/data-access.js";
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
sysu_experience_id = os.environ["SYSU_EXPERIENCE_ID"]
logged_in_cookie = os.environ["LOGGED_IN_COOKIE"]
no_favorite_cookie = os.environ["NO_FAVORITE_COOKIE"]
admin_data_cookie = os.environ["ADMIN_DATA_COOKIE"]
admin_content_cookie = os.environ["ADMIN_CONTENT_COOKIE"]

core_pages = [
    ("/", "home", True, "/"),
    ("/schools?year=2025&sort=name", "schools", True, "/schools"),
    (f"/schools/{sysu_school_id}?year=2026", "school-detail", True, "/schools"),
    ("/timeline?year=2026", "timeline", True, None),
    (f"/calculator?schoolId={sysu_school_id}&year=2026", "calculator", False, None),
    ("/experiences?year=2024&assessmentType=machine_test&sort=newest", "experiences", True, "/experiences"),
    (f"/experiences/{sysu_experience_id}", "experience-detail", True, "/experiences"),
    ("/me", "personal-logged-out", True, "/me"),
]
student_viewports = [(375, 667), (390, 844), (430, 932), (768, 1024), (1440, 900)]
admin_viewports = [(1280, 720), (1440, 900), (1920, 1080)]
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
    ("/?grade=high_school_g1", "高一", "了解综评整体路径。"),
    ("/?grade=high_school_g2", "高二", "核对学考和选科要求。"),
    ("/?grade=high_school_g3", "高三", "关注当年简章发布。"),
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
    if "最新简章" in metrics["firstText"] or "最新面经" in metrics["firstText"]:
        raise AssertionError("Home first screen contains below-the-fold latest content")
    if metrics["latestGuideTop"] is None or metrics["latestGuideTop"] < metrics["viewportHeight"] - 8:
        raise AssertionError(f"Latest guides are not below the first screen: {metrics}")
    expected_tasks = [
        ("/schools", "院校\\n查院校"),
        ("/timeline", "时间线\\n看日期"),
        ("/calculator", "综合分\\n算分数"),
        ("/experiences", "面经\\n看经验"),
    ]
    actual_tasks = [(item["href"], "\\n".join(item["text"].splitlines()[-2:])) for item in metrics["taskLinks"]]
    if actual_tasks != expected_tasks:
        raise AssertionError(f"Unexpected home tasks: {actual_tasks}")
    if metrics["timelineCount"] < 1 or metrics["timelineCount"] > 3:
        raise AssertionError(f"Nearest timeline count should be 1-3, got {metrics['timelineCount']}")
    if metrics["guideCount"] != 3 or metrics["experienceCount"] != 3:
        raise AssertionError(f"Latest row counts are wrong: {metrics}")
    if logged_in:
        if "已收藏院校" not in metrics["bodyText"]:
            raise AssertionError("Logged-in home did not use favorited school timeline source")
        if "登录后可收藏院校" in metrics["bodyText"]:
            raise AssertionError("Logged-in home still shows the guest timeline login prompt")
    else:
        if "登录后可收藏院校并查看个人时间线。" not in metrics["bodyText"]:
            raise AssertionError("Guest home missing personal timeline login prompt")

async def verify_login_favorite_continuation(page):
    await page.goto(f"{base_url}/schools/{sysu_school_id}?year=2026", wait_until="domcontentloaded")
    await page.locator(".student-top-bar button[aria-label='收藏院校']").click()
    await page.locator("#login-title").wait_for()

    submit = page.locator("[data-login-submit='true']")
    if not await submit.is_disabled():
        raise AssertionError("Login submit should be disabled until agreement is checked")

    await page.locator("input[name='phoneNumber']").fill("12112345678")
    await page.locator("[data-send-otp='true']").click()
    error_text = await page.locator("[data-login-error='true']").inner_text()
    if "请输入中国大陆手机号" not in error_text:
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
    if toast_text != "已收藏":
        raise AssertionError(f"Favorite continuation toast was wrong: {toast_text}")

async def verify_admin_desktop_page(browser, path, cookie, screenshot_name, required_text, viewport):
    context = await browser.new_context(
        viewport={"width": viewport[0], "height": viewport[1]},
        extra_http_headers={"Cookie": cookie}
    )
    page = await context.new_page()
    await page.goto(f"{base_url}{path}", wait_until="domcontentloaded")
    await page.locator("[data-admin-shell='desktop']").wait_for()
    metrics = await page.evaluate("""() => {
        const navLabels = Array.from(document.querySelectorAll(".admin-side-nav a"))
            .map((item) => item.innerText.trim());
        const tableCount = document.querySelectorAll(".admin-table").length;
        const panelText = document.querySelector(".admin-detail-panel")?.innerText ?? "";
        return {
            bodyText: document.body.innerText,
            navLabels,
            hasTopbar: Boolean(document.querySelector(".admin-topbar")),
            hasMain: Boolean(document.querySelector(".admin-content")),
            hasPanel: Boolean(document.querySelector(".admin-detail-panel")),
            tableCount,
            panelText,
            hasStudentFrame: Boolean(document.querySelector(".student-frame")),
            hasStudentNav: Boolean(document.querySelector(".student-bottom-nav")),
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth
        };
    }""")
    expected_nav = [
        "AI 入库",
        "简章审核",
        "时间线管理",
        "公式管理",
        "面经审核",
        "认证审核",
        "举报处理",
    ]
    for label in expected_nav:
        if label not in metrics["navLabels"]:
            raise AssertionError(f"Admin nav missing {label}: {metrics['navLabels']}")
    if not metrics["hasTopbar"] or not metrics["hasMain"] or not metrics["hasPanel"]:
        raise AssertionError(f"Admin shell missing topbar/main/panel: {metrics}")
    if metrics["tableCount"] < 1 and path != "/admin":
        raise AssertionError(f"Admin page missing queue/list table: {path}")
    for expected in required_text:
        if expected.lower() not in metrics["bodyText"].lower():
            raise AssertionError(f"Admin page {path} missing {expected}")
    if "学生端预览" in metrics["bodyText"] and "学生端预览" not in metrics["panelText"]:
        raise AssertionError(f"Student preview is not in the admin detail panel for {path}")
    if metrics["hasStudentFrame"] or metrics["hasStudentNav"]:
        raise AssertionError(f"Admin page rendered student shell elements: {path}")
    if metrics["scrollWidth"] > metrics["clientWidth"]:
        raise AssertionError(f"Admin page overflows horizontally: {path} {metrics}")
    await page.screenshot(path=screenshot_dir / screenshot_name, full_page=True)
    await context.close()

async def ajax_count(page):
    return await page.evaluate("() => window.__schoolFilterAjaxCount || 0")

async def wait_for_ajax_count(page, previous_count):
    await page.wait_for_function("previous => (window.__schoolFilterAjaxCount || 0) > previous", arg=previous_count)

async def verify_school_filter_interactions(page):
    await page.goto(f"{base_url}/schools?year=2025&sort=name", wait_until="domcontentloaded")
    await page.locator("[data-school-filter-form='true']").wait_for()

    if await page.locator("input[placeholder='搜索院校']").count() != 1:
        raise AssertionError("School list search placeholder is missing")

    await page.evaluate("() => { window.__schoolFilterMarker = 'kept'; }")
    previous_count = await ajax_count(page)

    async def slow_school_request(route):
        await asyncio.sleep(0.15)
        await route.continue_()

    await page.route("**/schools?*year=2026*", slow_school_request)
    await page.locator("select[name='year']").select_option("2026")
    await page.locator("[data-list-skeleton='school']").wait_for(state="visible")
    await wait_for_ajax_count(page, previous_count)
    await page.unroute("**/schools?*year=2026*", slow_school_request)
    if await page.locator("[data-list-skeleton='school']").is_visible():
        raise AssertionError("School loading skeleton stayed visible after results loaded")
    marker = await page.evaluate("() => window.__schoolFilterMarker")
    if marker != "kept":
        raise AssertionError("School filter change caused a full page navigation")
    body_text = await page.locator("body").inner_text()
    if "年份: 2026" not in body_text or "中山大学" not in body_text:
        raise AssertionError(f"School AJAX year filter did not preserve visible state: {body_text}")

    previous_count = await ajax_count(page)
    await page.locator("[data-school-clear-filters='true']").first.click()
    await wait_for_ajax_count(page, previous_count)
    body_text = await page.locator("body").inner_text()
    if "正在展示全部已发布院校简章卡片。" not in body_text:
        raise AssertionError("School clear filters did not restore the all-published summary")

    await page.locator("input[name='keyword']").fill("NoSuchSchool")
    previous_count = await ajax_count(page)
    await page.locator("[data-school-filter-form='true'] .primary-action").click()
    await wait_for_ajax_count(page, previous_count)
    body_text = await page.locator("body").inner_text()
    if "当前筛选没有匹配院校" not in body_text or "清空筛选" not in body_text:
        raise AssertionError("School empty state did not include clear-filter guidance")

    async def fail_school_request(route):
        await route.fulfill(status=503, content_type="text/html", body="failed")

    await page.route("**/schools?*keyword=BrowserFail*", fail_school_request)
    await page.locator("input[name='keyword']").fill("BrowserFail")
    await page.locator("[data-school-filter-form='true'] .primary-action").click()
    await page.locator("[data-school-filter-retry='true']").wait_for()
    error_text = await page.locator("[data-school-list-status='true']").inner_text()
    if "院校加载失败。" not in error_text or "重试" not in error_text:
        raise AssertionError(f"School failed-loading state was wrong: {error_text}")

    await page.unroute("**/schools?*keyword=BrowserFail*", fail_school_request)
    previous_count = await ajax_count(page)
    await page.locator("[data-school-filter-retry='true']").click()
    await wait_for_ajax_count(page, previous_count)
    body_text = await page.locator("body").inner_text()
    if "当前筛选没有匹配院校" not in body_text:
        raise AssertionError("School retry did not reload the requested filters")

async def verify_school_detail_fallback(page):
    await page.goto(f"{base_url}/schools/{scut_school_id}?year=2026", wait_until="domcontentloaded")
    await page.locator("#school-detail-title").wait_for()
    body_text = await page.locator("body").inner_text()
    if "历史参考" not in body_text:
        raise AssertionError("School detail fallback is missing historical reference label")
    if "暂无可见的 2026 已发布简章，当前展示 2025 年作为历史参考。" not in body_text:
        raise AssertionError("School detail fallback does not explain the unpublished requested year")
    if "Draft Review Guide" in body_text:
        raise AssertionError("School detail fallback exposed pending-review guide text")
    if await page.locator("a[href^='/calculator?schoolId=']").count() != 0:
        raise AssertionError("No-formula fallback detail exposed a score calculator link")

async def verify_timeline_interactions(page):
    await page.goto(f"{base_url}/timeline?mine=true&year=2026", wait_until="domcontentloaded")
    await page.locator("#login-title").wait_for()
    login_text = await page.locator("body").inner_text()
    if "登录" not in login_text:
        raise AssertionError("Unauthenticated My Favorites timeline did not show the login guide")

    try:
        await page.set_extra_http_headers({"Cookie": no_favorite_cookie})
        await page.goto(f"{base_url}/timeline?mine=true&year=2026", wait_until="domcontentloaded")
        no_fav_text = await page.locator("body").inner_text()
        if "收藏院校后生成我的时间线" not in no_fav_text:
            raise AssertionError("Logged-in no-favorites timeline empty state was missing")
    finally:
        await page.set_extra_http_headers({})

    await page.goto(f"{base_url}/timeline?year=2026&nodeType=application_deadline", wait_until="domcontentloaded")
    filtered_text = await page.locator(".timeline-list").inner_text()
    if "报名截止" not in filtered_text:
        raise AssertionError("Timeline node-type filter did not show application deadlines")
    if "初审结果" in filtered_text:
        raise AssertionError("Timeline node-type filter still showed another node type")

async def verify_calculator_flow(page):
    await page.goto(f"{base_url}/calculator?schoolId={sysu_school_id}&year=2026", wait_until="domcontentloaded")
    await page.locator("#score-input-form").wait_for()
    body_text = await page.locator("body").inner_text()
    for expected in ["有官方来源的公式", "权重与满分", "官方来源依据"]:
        if expected not in body_text:
            raise AssertionError(f"Calculator missing source-backed context: {expected}")

    calculate = page.locator("[data-calculate-score='true']")
    if not await calculate.is_disabled():
        raise AssertionError("Calculator submit should start disabled while required scores are missing")

    await page.locator("#score-gaokao").fill("800")
    error_text = await page.locator("[data-score-error-for='gaokao']").inner_text()
    if "必须在 0 到 750 之间" not in error_text:
        raise AssertionError(f"Out-of-range score did not render inline error: {error_text}")
    if not await calculate.is_disabled():
        raise AssertionError("Calculator submit should stay disabled for invalid scores")

    await page.locator("#score-gaokao").fill("650")
    await page.locator("#score-schoolAssessment").fill("90")
    await page.locator("#score-academicLevel").fill("95")
    if await calculate.is_disabled():
        raise AssertionError("Calculator submit stayed disabled after all scores became valid")

    await page.locator("#calculator-school").select_option(scut_school_id)
    cleared_values = await page.evaluate("""() => Array.from(document.querySelectorAll("[data-score-key]"))
        .map((field) => field.value)""")
    if any(cleared_values):
        raise AssertionError(f"Changing school did not clear entered scores: {cleared_values}")
    if not await calculate.is_disabled():
        raise AssertionError("Changing school should disable calculation until scores are re-entered")

    await page.goto(f"{base_url}/calculator?schoolId={sysu_school_id}&year=2026", wait_until="domcontentloaded")
    await page.locator("#score-input-form").wait_for()
    await page.locator("#score-gaokao").fill("650")
    await page.locator("#score-schoolAssessment").fill("90")
    await page.locator("#score-academicLevel").fill("95")
    await page.evaluate("() => window.scrollTo(0, 0)")

    async def slow_score(route):
        await asyncio.sleep(0.15)
        await route.continue_()

    await page.route("**/api/score/calculate", slow_score)
    before_scroll = await page.evaluate("() => window.scrollY")
    await page.locator("[data-calculate-score='true']").click()
    await page.wait_for_function("""() => document.querySelector("[data-calculate-score='true']")?.textContent === "正在计算..." """)
    await page.locator(".result-score").wait_for()
    await page.wait_for_function("before => window.scrollY > before", arg=before_scroll)
    await page.unroute("**/api/score/calculate", slow_score)
    after_scroll = await page.evaluate("() => window.scrollY")
    result_text = await page.locator("#calculator-result").inner_text()
    result_lower = result_text.lower()

    if after_scroll <= before_scroll:
        raise AssertionError(f"Calculator result did not scroll into view: before {before_scroll}, after {after_scroll}")
    for expected in ["综合分", "60/30/10 综合成绩", "分项贡献", "官方来源", "不代表录取概率"]:
        if expected.lower() not in result_lower:
            raise AssertionError(f"Calculator result missing {expected}: {result_text}")
    for blocked in ["ranking prediction", "recommended application", "guaranteed admission"]:
        if blocked in result_lower:
            raise AssertionError(f"Calculator result exposed blocked copy: {blocked}")

async def verify_calculator_unavailable(page):
    await page.goto(f"{base_url}/calculator?schoolId={scut_school_id}&year=2025", wait_until="domcontentloaded")
    body_text = await page.locator("body").inner_text()
    if "暂无明确已发布公式" not in body_text or "计算表单已隐藏" not in body_text:
        raise AssertionError("No-formula calculator unavailable state was missing")
    if await page.locator("#score-input-form").count() != 0:
        raise AssertionError("No-formula calculator exposed the score entry form")

async def fill_experience_submission_form(page, major_group):
    await page.locator("select[name='schoolId']").select_option(sysu_school_id)
    await page.locator("select[name='year']").select_option("2026")
    await page.locator("input[name='majorGroup']").fill(major_group)
    await page.locator("select[name='candidateTrack']").select_option("physics")
    await page.locator("select[name='stage']").select_option("school_assessment")
    await page.locator("select[name='shortlistedStatus']").select_option("true")
    await page.locator("select[name='admittedStatus']").select_option("")
    await page.locator("input[name='location']").fill("Browser verification campus")
    await page.locator("textarea[name='processSummary']").fill(
        f"{major_group} process used a structured panel and group discussion without private identity details."
    )
    await page.locator("textarea[name='preparationSummary']").fill(
        "Browser verification preparation kept examples concise and source-safe."
    )
    await page.locator("select[name='difficultyScore']").select_option("4")
    await page.locator("select[name='pressureScore']").select_option("3")
    await page.locator("select[name='differentiationScore']").select_option("4")
    await page.locator("textarea[name='advice']").fill(
        "Browser verification advice focuses on preparation and avoids admission guarantees."
    )

async def verify_experience_submission_drafts(page):
    await page.goto(f"{base_url}/experiences/new", wait_until="domcontentloaded")
    await page.locator("[data-experience-submission-form='true']").wait_for()
    body_text = await page.locator("body").inner_text()
    body_lower = body_text.lower()
    for expected in ["仅审核端可见", "流程", "建议"]:
        if expected.lower() not in body_lower:
            raise AssertionError(f"Experience submission page missing {expected}")
    if await page.locator("[data-experience-draft-prompt='true']").count() != 1:
        raise AssertionError("Experience submission draft prompt hook is missing")
    if await page.locator("input[type='file']").count() != 0:
        raise AssertionError("Experience submission should not persist or expose local file inputs")

    await page.locator("input[name='majorGroup']").fill("Draft restore group")
    await page.locator("textarea[name='processSummary']").fill("Draft process text")
    await page.wait_for_function("""() => {
        const draft = JSON.parse(localStorage.getItem("gce:experience-submission-draft") || "null");
        return draft && draft.values && draft.values.majorGroup === "Draft restore group";
    }""")
    await page.reload(wait_until="domcontentloaded")
    await page.locator("[data-experience-draft-prompt='true']").wait_for(state="visible")
    await page.locator("[data-experience-draft-restore='true']").click()
    restored_major_group = await page.locator("input[name='majorGroup']").input_value()
    restored_process = await page.locator("textarea[name='processSummary']").input_value()
    process_counter = await page.locator("[data-char-count-for='processSummary']").inner_text()
    if restored_major_group != "Draft restore group" or restored_process != "Draft process text":
        raise AssertionError("Experience draft restore did not restore saved values")
    if not process_counter.startswith(str(len("Draft process text"))):
        raise AssertionError(f"Process character counter did not update after restore: {process_counter}")

    await page.locator(".submission-form [data-experience-draft-clear='true']").click()
    draft_after_clear = await page.evaluate("() => localStorage.getItem('gce:experience-submission-draft')")
    if draft_after_clear is not None:
        raise AssertionError("Experience draft clear did not remove local storage")

    await page.goto(f"{base_url}/", wait_until="domcontentloaded")
    await page.evaluate("""() => localStorage.setItem("gce:experience-submission-draft", JSON.stringify({
        savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        values: { majorGroup: "Expired draft group" }
    }))""")
    await page.goto(f"{base_url}/experiences/new?draftExpiryCheck=1", wait_until="domcontentloaded")
    await page.wait_for_function("""() => window.__experienceDraftState === "expired" ||
        localStorage.getItem("gce:experience-submission-draft") === null""")
    expired_prompt_visible = await page.locator("[data-experience-draft-prompt='true']").is_visible()
    expired_draft = await page.evaluate("() => localStorage.getItem('gce:experience-submission-draft')")
    expired_state = await page.evaluate("() => window.__experienceDraftState || ''")
    if expired_prompt_visible or expired_draft is not None:
        raise AssertionError(
            f"Expired experience draft was not removed: state={expired_state}, draft={str(expired_draft)[:120]}"
        )

    await fill_experience_submission_form(page, "Browser pending draft group")
    await page.locator(".submission-form button[type='submit']").click()
    await page.locator("#submission-status-title").wait_for()
    status_text = await page.locator(".submission-status").inner_text()
    if "待审核" not in status_text or "Browser pending draft group" in status_text:
        raise AssertionError(f"Submission status did not show a safe under-review state: {status_text}")
    draft_after_submit = await page.evaluate("() => localStorage.getItem('gce:experience-submission-draft')")
    if draft_after_submit is not None:
        raise AssertionError("Successful experience submission did not clear the local draft")

    await page.goto(f"{base_url}/experiences?keyword=Browser%20pending%20draft", wait_until="domcontentloaded")
    public_text = await page.locator("body").inner_text()
    if "Browser pending draft group" in public_text:
        raise AssertionError("Pending-review experience appeared in public experience browsing")
    if "没有匹配的已发布面经" not in public_text or "发布面经" not in public_text:
        raise AssertionError("Experience empty state did not guide filter changes or first publication")

    await page.goto(f"{base_url}/me", wait_until="domcontentloaded")
    my_text = await page.locator("body").inner_text()
    if "Browser pending draft group" not in my_text or "待审核" not in my_text:
        raise AssertionError("Pending experience was not visible in My Submissions")

    await page.locator("form[action='/logout'] button").click()
    await page.wait_for_url("**/me?toast=logged_out")
    logout_draft = await page.evaluate("() => localStorage.getItem('gce:experience-submission-draft')")
    if logout_draft is not None:
        raise AssertionError("Logout did not clear experience submission drafts")

async def verify_logged_in_personal_center(page, *, exercise_account_actions=False):
    await page.goto(f"{base_url}/me", wait_until="domcontentloaded")
    await page.locator("#personal-center-title").wait_for()
    body_text = await page.locator("body").inner_text()
    body_lower = body_text.lower()
    required_text = [
        "高二",
        "默认匿名偏好",
        "默认展示昵称",
        "已收藏院校",
        "已收藏面经",
        "已提交面经",
        "站内提醒",
        "账号偏好",
        "待审核",
        "已发布",
        "已退回",
        "已隐藏",
        "已拒绝",
        "下一步",
        "审核状态",
        "报名截止",
        "仅站内",
        "中山大学",
    ]
    for expected in required_text:
        if expected.lower() not in body_lower:
            raise AssertionError(f"Logged-in My page missing {expected}")
    blocked_text = [
        "phone",
        "source-account",
        "real name",
        "verificationmaterials",
        "private/browser",
        "sms",
        "wechat",
        "email",
        "external",
        "banned",
    ]
    for blocked in blocked_text:
        if blocked in body_lower:
            raise AssertionError(f"Logged-in My page exposed blocked text: {blocked}")
    active_href = await page.locator(".student-bottom-nav a[aria-current='page']").get_attribute("href")
    if active_href != "/me":
        raise AssertionError(f"My bottom navigation was not active: {active_href}")

    if not exercise_account_actions:
        return

    await page.locator("input[name='nickname']").fill("Browser My updated")
    await page.locator("select[name='grade']").select_option("high_school_g1")
    await page.locator("select[name='defaultAnonymous']").select_option("true")
    await page.locator("form[action='/me/preferences'] button[type='submit']").click()
    await page.locator(".form-success").wait_for()
    updated_text = await page.locator("body").inner_text()
    if "偏好已更新" not in updated_text or "高一" not in updated_text:
        raise AssertionError("Preference update did not render the updated My page")
    if "默认匿名" not in updated_text:
        raise AssertionError("Default anonymous preference update was not visible")

    await page.evaluate("""() => localStorage.setItem("gce:experience-submission-draft", JSON.stringify({
        savedAt: Date.now(),
        values: { majorGroup: "Personal center logout draft" }
    }))""")
    await page.locator("form[action='/logout'] button").click()
    await page.wait_for_url("**/me?toast=logged_out")
    logout_draft = await page.evaluate("() => localStorage.getItem('gce:experience-submission-draft')")
    if logout_draft is not None:
        raise AssertionError("My page logout did not clear experience submission drafts")
    logged_out_text = await page.locator("body").inner_text()
    if "登录后使用我的页面" not in logged_out_text:
        raise AssertionError("Logout did not return to the logged-out My guide")
    if "Browser My updated" in logged_out_text:
        raise AssertionError("Logged-out My page still showed the previous user's nickname")

async def main():
    screenshot_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()

        for width, height in student_viewports:
            viewport_label = f"{width}x{height}"
            page = await browser.new_page(viewport={"width": width, "height": height})

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
                    const textRects = Array.from(document.querySelectorAll("body *"))
                        .filter((element) => element.children.length === 0 && element.innerText && element.innerText.trim())
                        .filter((element) => !element.closest("[data-student-bottom-nav='true']"))
                        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
                        .filter((item) => item.rect.width > 2 && item.rect.height > 8)
                        .slice(0, 180);
                    const overlappingText = [];
                    for (let index = 0; index < textRects.length; index += 1) {
                        for (let otherIndex = index + 1; otherIndex < textRects.length; otherIndex += 1) {
                            const left = textRects[index];
                            const right = textRects[otherIndex];
                            const horizontalOverlap = Math.min(left.rect.right, right.rect.right) -
                                Math.max(left.rect.left, right.rect.left);
                            const verticalOverlap = Math.min(left.rect.bottom, right.rect.bottom) -
                                Math.max(left.rect.top, right.rect.top);

                            if (horizontalOverlap > 4 && verticalOverlap > 6) {
                                overlappingText.push(
                                    left.element.innerText.trim().slice(0, 36) + " / " +
                                    right.element.innerText.trim().slice(0, 36)
                                );
                            }
                        }
                    }

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
                        overlappingText,
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
                    if metrics["navLabels"] != ["首页", "院校", "面经", "我的"]:
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

                if metrics["overlappingText"]:
                    raise AssertionError(
                        f"{label} at {width}px has overlapping text: "
                        f"{metrics['overlappingText'][:5]}"
                    )

                if label == "schools":
                    body_lower = metrics["bodyText"].lower()
                    required_school_text = [
                        "院校关键词",
                        "简章状态",
                        "报名状态",
                        "院校类型",
                        "SCUT",
                        "无明确公式",
                        "1 条面经",
                        "关键时间线",
                    ]
                    for expected in required_school_text:
                        if expected.lower() not in body_lower:
                            raise AssertionError(f"Schools page at {width}px missing {expected}")

                if label == "school-detail":
                    body_lower = metrics["bodyText"].lower()
                    required_detail_text = [
                        "官方简章摘要",
                        "综合分公式",
                        "报考要求",
                        "考核与录取",
                        "费用与咨询",
                        "精选面经",
                        "发布面经",
                    ]
                    for expected in required_detail_text:
                        if expected.lower() not in body_lower:
                            raise AssertionError(f"School detail at {width}px missing {expected}")
                    if len(metrics["visiblePrimaryActionTexts"]) > 1:
                        raise AssertionError(
                            f"School detail at {width}px has more than one primary action in view: "
                            f"{metrics['visiblePrimaryActionTexts']}"
                        )

                if label == "timeline":
                    body_lower = metrics["bodyText"].lower()
                    required_timeline_text = [
                        "全部节点",
                        "我的收藏",
                        "节点类型",
                        "来源简章年份",
                        "待公布",
                        "即将截止",
                        "已结束",
                    ]
                    for expected in required_timeline_text:
                        if expected.lower() not in body_lower:
                            raise AssertionError(f"Timeline at {width}px missing {expected}")

                if label == "calculator":
                    body_lower = metrics["bodyText"].lower()
                    required_calculator_text = [
                        "有官方来源的公式",
                        "权重与满分",
                        "官方来源依据",
                    ]
                    for expected in required_calculator_text:
                        if expected.lower() not in body_lower:
                            raise AssertionError(f"Calculator at {width}px missing {expected}")

                if label == "experiences":
                    body_lower = metrics["bodyText"].lower()
                    required_experience_text = [
                        "面经关键词",
                        "认证状态",
                        "专业或组别",
                        "历史参考",
                        "阅读结构化详情",
                    ]
                    for expected in required_experience_text:
                        if expected.lower() not in body_lower:
                            raise AssertionError(f"Experiences at {width}px missing {expected}")
                    if await page.locator("button[aria-label='收藏面经']").count() == 0:
                        raise AssertionError(f"Experiences at {width}px missing favorite control")

                if label == "experience-detail":
                    body_lower = metrics["bodyText"].lower()
                    required_experience_detail_text = [
                        "基本信息",
                        "流程",
                        "题型类别",
                        "准备与建议",
                        "面经评分",
                        "有用（18）",
                        "举报",
                    ]
                    for expected in required_experience_detail_text:
                        if expected.lower() not in body_lower:
                            raise AssertionError(f"Experience detail at {width}px missing {expected}")

                if label == "personal-logged-out":
                    body_lower = metrics["bodyText"].lower()
                    required_personal_text = [
                        "登录后使用我的页面",
                        "登录后可使用院校收藏、面经发布和审核状态跟踪。",
                        "收藏广东综评院校",
                        "查看已投稿面经的审核状态",
                    ]
                    for expected in required_personal_text:
                        if expected.lower() not in body_lower:
                            raise AssertionError(f"Logged-out My page at {width}px missing {expected}")
                    if "phone otp" in body_lower or "phoneNumber" in metrics["bodyText"]:
                        raise AssertionError("Logged-out My guide rendered the phone login form instead of a guide card")

                await page.screenshot(path=screenshot_dir / f"{label}-{viewport_label}.png", full_page=True)

            await page.close()

            home_page = await browser.new_page(viewport={"width": width, "height": height})
            for path, expected_grade, expected_tip in home_grade_states:
                await verify_home_state(home_page, path, expected_grade, expected_tip)
                if width == 390:
                    screenshot_name = path.split("=")[-1].replace("high_school_", "home-")
                    await home_page.screenshot(path=screenshot_dir / f"{screenshot_name}-{viewport_label}.png", full_page=True)
            await home_page.close()

            logged_context = await browser.new_context(
                viewport={"width": width, "height": height},
                extra_http_headers={"Cookie": logged_in_cookie}
            )
            logged_home = await logged_context.new_page()
            await verify_home_state(
                logged_home,
                "/",
                "高二",
                "核对学考和选科要求。",
                logged_in=True
            )
            if width == 390:
                await logged_home.screenshot(path=screenshot_dir / f"home-logged-in-{viewport_label}.png", full_page=True)
            await logged_context.close()

            personal_context = await browser.new_context(
                viewport={"width": width, "height": height},
                extra_http_headers={"Cookie": logged_in_cookie}
            )
            personal_page = await personal_context.new_page()
            await verify_logged_in_personal_center(personal_page)
            if width == 390:
                await personal_page.screenshot(path=screenshot_dir / f"personal-center-logged-in-{viewport_label}.png", full_page=True)
            await personal_context.close()

            school_filter_page = await browser.new_page(viewport={"width": width, "height": height})
            await verify_school_filter_interactions(school_filter_page)
            if width == 390:
                await school_filter_page.screenshot(path=screenshot_dir / f"schools-filter-retry-{viewport_label}.png", full_page=True)
            await school_filter_page.close()

            school_fallback_page = await browser.new_page(viewport={"width": width, "height": height})
            await verify_school_detail_fallback(school_fallback_page)
            if width == 390:
                await school_fallback_page.screenshot(path=screenshot_dir / f"school-detail-historical-{viewport_label}.png", full_page=True)
            await school_fallback_page.close()

            timeline_page = await browser.new_page(viewport={"width": width, "height": height})
            await verify_timeline_interactions(timeline_page)
            if width == 390:
                await timeline_page.screenshot(path=screenshot_dir / f"timeline-filtered-{viewport_label}.png", full_page=True)
            await timeline_page.close()

        login_page = await browser.new_page(viewport={"width": 390, "height": 940})
        await verify_login_favorite_continuation(login_page)
        await login_page.screenshot(path=screenshot_dir / "login-favorite-continuation-390.png", full_page=True)
        await login_page.close()

        calculator_flow_page = await browser.new_page(viewport={"width": 390, "height": 640})
        await verify_calculator_flow(calculator_flow_page)
        await calculator_flow_page.screenshot(path=screenshot_dir / "calculator-flow-390.png", full_page=True)
        await calculator_flow_page.close()

        calculator_unavailable_page = await browser.new_page(viewport={"width": 390, "height": 940})
        await verify_calculator_unavailable(calculator_unavailable_page)
        await calculator_unavailable_page.screenshot(path=screenshot_dir / "calculator-unavailable-390.png", full_page=True)
        await calculator_unavailable_page.close()

        experience_context = await browser.new_context(
            viewport={"width": 390, "height": 940},
            extra_http_headers={"Cookie": no_favorite_cookie}
        )
        experience_flow_page = await experience_context.new_page()
        await verify_experience_submission_drafts(experience_flow_page)
        await experience_flow_page.screenshot(path=screenshot_dir / "experience-submission-under-review-390.png", full_page=True)
        await experience_context.close()

        personal_action_context = await browser.new_context(
            viewport={"width": 390, "height": 940},
            extra_http_headers={"Cookie": logged_in_cookie}
        )
        personal_action_page = await personal_action_context.new_page()
        await verify_logged_in_personal_center(personal_action_page, exercise_account_actions=True)
        await personal_action_page.screenshot(path=screenshot_dir / "personal-center-logout-guide-390.png", full_page=True)
        await personal_action_context.close()

        desktop_page = await browser.new_page(viewport={"width": 1440, "height": 900})
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

        desktop_school_page = await browser.new_page(viewport={"width": 1440, "height": 900})
        for path, screenshot_name, required_text in [
            ("/schools?year=2025&sort=name", "schools-desktop-1440x900.png", "院校关键词"),
            (f"/schools/{sysu_school_id}?year=2026", "school-detail-desktop-1440x900.png", "官方简章摘要"),
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

        admin_pages = [
            ("/admin", admin_data_cookie, "admin-overview-desktop", [
                "桌面工作流总览",
                "审核工作流规则",
                "AI 入库",
                "举报处理",
            ]),
            ("/admin/ingestion-runs", admin_data_cookie, "admin-ingestion-desktop", [
                "数据入库任务列表",
                "来源文档候选",
                "可追溯抽取简章字段",
                "人工确认项",
                "简章草稿创建",
            ]),
            ("/admin/guides", admin_data_cookie, "admin-guide-review-desktop", [
                "简章审核队列表",
                "学生端预览",
                "官方来源预览或链接",
                "字段级确认状态",
            ]),
            ("/admin/timeline?year=2026", admin_data_cookie, "admin-timeline-desktop", [
                "时间线管理生成节点表",
                "日期精度",
                "学生端状态",
                "人工覆写状态",
            ]),
            ("/admin/formulas", admin_data_cookie, "admin-formulas-desktop", [
                "公式编辑器",
                "公式管理列表表格",
                "样例测试区",
                "学生端预览",
                "官方来源与发布门槛",
            ]),
            ("/admin/experiences", admin_content_cookie, "admin-experiences-desktop", [
                "面经待审核队列",
                "敏感内容与隐私警告",
                "学生端预览",
                "禁止内容边界",
                "限制账号",
            ]),
            ("/admin/verifications", admin_content_cookie, "admin-verifications-desktop", [
                "认证材料队列表",
                "仅后端可见材料预览",
                "学生端认证标签预览",
                "拒绝认证时必须填写原因",
            ]),
            ("/admin/reports", admin_content_cookie, "admin-reports-desktop", [
                "举报处理列表表格",
                "对象预览",
                "举报原因",
                "历史与操作记录",
                "驳回举报",
            ]),
        ]
        for admin_width, admin_height in admin_viewports:
            for path, cookie, screenshot_label, required_text in admin_pages:
                await verify_admin_desktop_page(
                    browser,
                    path,
                    cookie,
                    f"{screenshot_label}-{admin_width}x{admin_height}.png",
                    required_text,
                    (admin_width, admin_height)
                )

        await browser.close()

asyncio.run(main())
print("Core browser verification passed at student 375x667, 390x844, 430x932, 768x1024, 1440x900 and admin 1280x720, 1440x900, 1920x1080 with timeline/calculator/experience/My flows, school list/detail interactions, home/login states, personal-center actions, desktop student frames, and admin workflows")
`;
}

function browserExperiencePayload(majorGroup) {
  return {
    schoolId: seedIds.schools.sysu,
    year: 2026,
    majorGroup,
    candidateTrack: "physics",
    stage: "school_assessment",
    shortlistedStatus: true,
    admittedStatus: null,
    assessmentTypes: ["structured_interview", "group_discussion"],
    location: "Browser verification campus",
    processSummary: `${majorGroup} process used a structured panel and group discussion without private identity details.`,
    questionTypes: ["motivation", "experiment_design"],
    preparationSummary: "Browser verification preparation kept examples concise and source-safe.",
    difficultyScore: 4,
    pressureScore: 3,
    differentiationScore: 4,
    advice: "Browser verification advice focuses on preparation and avoids admission guarantees.",
    isAnonymous: true,
    verificationMaterials: [
      {
        materialType: "shortlist_notice",
        objectStorageKey: "private/browser/personal-center-proof.png",
        metadata: {
          sourceAccount: "source-account-browser",
          realName: "Browser Private Name"
        }
      }
    ]
  };
}

function seedBrowserPersonalCenterData({ authService, experienceSubmissionStore, interactionStore, user }) {
  const reviewer = authService.createUserForTesting({
    phoneNumber: "+8613900001210",
    nickname: "Browser content reviewer",
    role: "content_reviewer"
  });
  const createSubmission = (majorGroup) => experienceSubmissionStore.submitExperience({
    user,
    body: browserExperiencePayload(majorGroup)
  });
  const published = createSubmission("Browser Published My group");
  const returned = createSubmission("Browser Returned My group");
  const hidden = createSubmission("Browser Hidden My group");
  const rejected = createSubmission("Browser Rejected My group");

  createSubmission("Browser Pending My group");
  experienceSubmissionStore.reviewExperience({
    experienceId: published.id,
    action: "approve",
    operator: reviewer,
    note: "Approved for browser My verification."
  });
  experienceSubmissionStore.reviewExperience({
    experienceId: returned.id,
    action: "return",
    operator: reviewer,
    note: "Returned for browser My rewrite."
  });
  experienceSubmissionStore.reviewExperience({
    experienceId: hidden.id,
    action: "hide",
    operator: reviewer,
    note: "Hidden for browser My verification."
  });
  experienceSubmissionStore.reviewExperience({
    experienceId: rejected.id,
    action: "ban",
    operator: reviewer,
    note: "Rejected for browser My verification."
  });
  interactionStore.addFavorite({
    userId: user.id,
    targetType: "school",
    targetId: seedIds.schools.sysu
  });
  interactionStore.addFavorite({
    userId: user.id,
    targetType: "experience",
    targetId: seedIds.experiences.sysu2026
  });
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
    nickname: "Browser My student",
    grade: "high_school_g2",
    defaultAnonymous: false
  });
  const loggedInCookie = authService.serializeSessionCookie(
    authService.createSessionForUser(loggedInUser.id)
  ).split(";")[0];
  const noFavoriteUser = authService.createUserForTesting({
    phoneNumber: "+8613900002401",
    nickname: "No favorite browser student",
    grade: "high_school_g3"
  });
  const noFavoriteCookie = authService.serializeSessionCookie(
    authService.createSessionForUser(noFavoriteUser.id)
  ).split(";")[0];
  const dataReviewer = authService.createUserForTesting({
    phoneNumber: "+8613900003401",
    nickname: "Browser data reviewer",
    role: "data_reviewer"
  });
  const contentReviewer = authService.createUserForTesting({
    phoneNumber: "+8613900003402",
    nickname: "Browser content admin",
    role: "content_reviewer"
  });
  const adminDataCookie = authService.serializeSessionCookie(
    authService.createSessionForUser(dataReviewer.id)
  ).split(";")[0];
  const adminContentCookie = authService.serializeSessionCookie(
    authService.createSessionForUser(contentReviewer.id)
  ).split(";")[0];

  seedBrowserPersonalCenterData({
    authService,
    experienceSubmissionStore,
    interactionStore,
    user: loggedInUser
  });
  createAdminIngestionRun({
    operator: dataReviewer,
    now,
    body: {
      id: "browser-admin-ingestion-run",
      schoolId: seedIds.schools.sysu,
      year: 2030,
      keyword: "Browser SYSU official guide",
      confidenceScore: 0.86,
      sourceDocuments: [
        {
          id: "browser-admin-source-geea",
          sourceUrl: "https://eea.gd.gov.cn/browser/2030-guide",
          title: "Browser Guangdong Education Examination Authority source",
          sourceType: "guangdong_education_exam_authority",
          status: "accepted"
        }
      ],
      extractedGuideFields: {
        guideTitle: {
          value: "Browser 2030 Guangdong Comprehensive Evaluation Guide",
          sourceDocumentId: "browser-admin-source-geea",
          confidence: 0.92
        },
        summary: {
          value: "Browser admin ingestion draft for manual review.",
          sourceDocumentId: "browser-admin-source-geea",
          confidence: 0.87
        },
        applicationStatus: {
          value: "open",
          manualNote: "Browser reviewer confirms status after source check."
        }
      },
      reviewNote: "Browser admin workflow verification seed."
    }
  });
  interactionStore.createReport({
    reporterId: noFavoriteUser.id,
    targetType: "experience",
    targetId: seedIds.experiences.sysu2026,
    reason: "Browser report handling",
    description: "Browser report seed for admin desktop workflow verification."
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
        loggedInCookie,
        noFavoriteCookie,
        adminDataCookie,
        adminContentCookie
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

async function runBrowserVerification({
  python,
  baseUrl,
  loggedInCookie,
  noFavoriteCookie,
  adminDataCookie,
  adminContentCookie
}) {
  await new Promise((resolve, reject) => {
    const child = spawn(python, ["-c", pythonBrowserScript()], {
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        BROWSER_SCREENSHOT_DIR: screenshotDir,
        SYSU_SCHOOL_ID: seedIds.schools.sysu,
        SCUT_SCHOOL_ID: seedIds.schools.scut,
        SYSU_EXPERIENCE_ID: seedIds.experiences.sysu2026,
        LOGGED_IN_COOKIE: loggedInCookie,
        NO_FAVORITE_COOKIE: noFavoriteCookie,
        ADMIN_DATA_COOKIE: adminDataCookie,
        ADMIN_CONTENT_COOKIE: adminContentCookie
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
const {
  server,
  baseUrl,
  loggedInCookie,
  noFavoriteCookie,
  adminDataCookie,
  adminContentCookie
} = await startServer();

try {
  await mkdir(screenshotDir, { recursive: true });
  await runBrowserVerification({
    python,
    baseUrl,
    loggedInCookie,
    noFavoriteCookie,
    adminDataCookie,
    adminContentCookie
  });
} finally {
  await closeServer(server);
}
