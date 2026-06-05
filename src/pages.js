import {
  getSchoolDetail,
  getSchoolById,
  listExperiences,
  listGuides,
  listSchoolGuideCards,
  listTimelineNodes,
  timelineEventDefinitions
} from "./db/data-access.js";
import {
  adminNavigation,
  productDescription,
  productName,
  studentNavigation
} from "./lib/product.js";

const entryPoints = [
  {
    badge: "G1",
    title: "High school grade one",
    body: "Build a baseline view of participating schools, assessment formats, and subject requirement signals."
  },
  {
    badge: "G2",
    title: "High school grade two",
    body: "Compare recent guide changes, timeline rhythm, and verified experience patterns before application year."
  },
  {
    badge: "G3",
    title: "High school grade three",
    body: "Track current guide releases, important dates, score formula availability, and assessment preparation details."
  }
];

const workflowPlaceholders = [
  { title: "Data Ingestion", status: "Draft-only workflow active" },
  { title: "Guide Review", status: "Official source review active" },
  { title: "Timeline Management", status: "Override workflow active" },
  { title: "Formula Management", status: "Draft and publish workflow active" },
  { title: "Experience Review", status: "Content review active" },
  { title: "Verification Review", status: "Material metadata review active" },
  { title: "Report Handling", status: "Resolution workflow active" }
];

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

const importantEventKeys = new Set([
  "application_deadline",
  "confirmation_or_payment",
  "school_assessment",
  "shortlist_publication",
  "volunteer_application",
  "admission_publication"
]);

const missingOfficialText = "Official not specified";
const pendingSupplementText = "Pending supplement";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeScriptJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function formatDate(value) {
  if (!value) {
    return "To be announced";
  }

  return dateFormatter.format(new Date(value));
}

function timestampFor(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isNaN(timestamp) ? null : timestamp;
}

function eventTimestamp(event) {
  return timestampFor(event.endsAt) ?? timestampFor(event.startsAt);
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function humanizeToken(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value, fallback = missingOfficialText) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : fallback;
  }

  if (value === 0) {
    return "0";
  }

  if (!value) {
    return fallback;
  }

  return String(value);
}

function schoolNameFor(record) {
  return getSchoolById(record.schoolId)?.name ?? "Published school";
}

function currentAdmissionYear(guides) {
  return guides.reduce((latestYear, guide) => Math.max(latestYear, guide.admissionYear), 0);
}

function nearestImportantEvents(events, referenceDate = new Date()) {
  const now = referenceDate.getTime();
  const importantEvents = events
    .filter((event) => importantEventKeys.has(event.eventKey))
    .map((event) => ({ event, timestamp: eventTimestamp(event) }))
    .filter((item) => item.timestamp !== null);

  const upcomingEvents = importantEvents
    .filter((item) => item.timestamp >= now)
    .sort((left, right) => left.timestamp - right.timestamp);
  const recentEvents = importantEvents
    .filter((item) => item.timestamp < now)
    .sort((left, right) => right.timestamp - left.timestamp);

  return [...upcomingEvents, ...recentEvents].slice(0, 3).map((item) => item.event);
}

function highQualityExperiences(experiences) {
  return [...experiences]
    .sort((left, right) => {
      const verifiedDifference =
        Number(right.verificationStatus === "verified") - Number(left.verificationStatus === "verified");

      if (verifiedDifference !== 0) {
        return verifiedDifference;
      }

      if (right.createdAt !== left.createdAt) {
        return right.createdAt.localeCompare(left.createdAt);
      }

      return right.usefulCount - left.usefulCount;
    })
    .slice(0, 3);
}

function htmlPage({ title, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeHtml(productDescription)}">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
${body}
  </body>
</html>`;
}

function renderIcon(name) {
  const icons = {
    back: `<path d="M15 18l-6-6 6-6"></path>`,
    calculator: `<rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M8 7h8"></path><path d="M8 11h.01"></path><path d="M12 11h.01"></path><path d="M16 11h.01"></path><path d="M8 15h.01"></path><path d="M12 15h.01"></path><path d="M16 15h.01"></path>`,
    calendar: `<rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M4 10h16"></path>`,
    filter: `<path d="M4 6h16"></path><path d="M7 12h10"></path><path d="M10 18h4"></path>`,
    heart: `<path d="M12 21s-7-4.4-9-8.4C1.3 9.1 3.4 5 7.2 5c2 0 3.5 1.1 4.8 2.7C13.3 6.1 14.8 5 16.8 5c3.8 0 5.9 4.1 4.2 7.6C19 16.6 12 21 12 21z"></path>`,
    home: `<path d="M4 10.5 12 4l8 6.5"></path><path d="M6.5 10v9h11v-9"></path><path d="M10 19v-5h4v5"></path>`,
    login: `<path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path><path d="M14 4h4a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-4"></path>`,
    school: `<path d="M4 6h16v13H4z"></path><path d="M8 10h8"></path><path d="M8 14h5"></path>`,
    experience: `<path d="M5 5h14v12H8l-3 3z"></path><path d="M8.5 9h7"></path><path d="M8.5 13h5"></path>`,
    user: `<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"></path><path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path>`
  };

  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">${icons[name] ?? icons.home}</svg>`;
}

function renderStudentNav(currentKey = "") {
  return studentNavigation
    .map((item) => {
      const isCurrent = item.key === currentKey;
      const current = isCurrent ? ` aria-current="page"` : "";

      return `<a class="student-nav-item${isCurrent ? " active" : ""}" href="${escapeHtml(item.href)}"${current}>
        ${renderIcon(item.icon)}
        <span>${escapeHtml(item.label)}</span>
      </a>`;
    })
    .join("");
}

function renderStudentBottomNav(currentKey = "") {
  return `<nav class="student-bottom-nav" aria-label="Student bottom navigation" data-student-bottom-nav="true">${renderStudentNav(currentKey)}</nav>`;
}

function renderGradeSwitch(currentGrade = "high_school_g3") {
  const grades = [
    ["high_school_g1", "G1"],
    ["high_school_g2", "G2"],
    ["high_school_g3", "G3"]
  ];

  return `<div class="grade-switch" aria-label="Grade switch" role="group">
    ${grades
      .map(([grade, label]) => {
        const current = grade === currentGrade ? ` aria-current="page"` : "";
        return `<a href="/?grade=${escapeHtml(grade)}"${current}>${escapeHtml(label)}</a>`;
      })
      .join("")}
  </div>`;
}

function renderIconLink({ href, label, icon }) {
  return `<a class="icon-button" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">${renderIcon(icon)}</a>`;
}

function renderFavoriteSchoolAction(schoolId, returnTo = "/schools") {
  return renderFavoriteSchoolForm(schoolId, returnTo);
}

function renderStudentTopBar({
  type = "list",
  title,
  backHref = "",
  backLabel = "Go back",
  actionHtml = "",
  filterHref = "",
  filterLabel = "Open filters",
  submitState = ""
}) {
  const backEntry = backHref ? renderIconLink({ href: backHref, label: backLabel, icon: "back" }) : "";
  const actions = actionHtml ||
    (filterHref ? renderIconLink({ href: filterHref, label: filterLabel, icon: "filter" }) : "") ||
    (submitState ? `<span class="top-state">${escapeHtml(submitState)}</span>` : "");

  return `<header class="student-top-bar student-top-bar-${escapeHtml(type)}" data-student-top-bar="${escapeHtml(type)}">
    <div class="student-top-leading">
      ${backEntry}
      <div class="student-title-copy">
        ${type === "home" ? `<span class="top-kicker">Guangdong CE</span>` : ""}
        <span class="student-top-title">${escapeHtml(title)}</span>
      </div>
    </div>
    <div class="student-top-actions">${actions}</div>
  </header>`;
}

function renderStudentPage({
  title,
  currentKey = "",
  topBar,
  content,
  hideBottomNav = false,
  mainClass = ""
}) {
  return htmlPage({
    title,
    body: `    <div class="student-frame${hideBottomNav ? " student-task-frame" : ""}">
      ${topBar}
      <main class="app-shell student-main${mainClass ? ` ${escapeHtml(mainClass)}` : ""}">
${content}
      </main>
      <div class="student-toast" role="status" aria-live="polite" hidden data-student-toast="true"></div>
      ${hideBottomNav ? "" : renderStudentBottomNav(currentKey)}
      <script src="/student.js" defer></script>
    </div>`
  });
}

function renderAdminNav(currentKey = "") {
  return adminNavigation
    .map((item) => `<a class="admin-nav-link" href="${escapeHtml(item.href)}"${item.key === currentKey ? ` aria-current="page"` : ""}>
      <span>${escapeHtml(item.label)}</span>
    </a>`)
    .join("");
}

function renderAdminShell({
  title,
  currentKey,
  eyebrow,
  heading,
  description,
  user,
  content,
  detailPanel = "",
  statusText = "Global status: manual review required before student-visible changes"
}) {
  return htmlPage({
    title,
    body: `    <div class="admin-workspace" data-admin-shell="desktop">
      <aside class="admin-sidebar" aria-label="Admin left navigation">
        <a class="brand admin-brand" href="/admin">
          <span class="brand-mark">Admin</span>
          <span class="brand-name">${productName}</span>
        </a>
        <nav class="admin-side-nav" aria-label="Admin left navigation">${renderAdminNav(currentKey)}</nav>
      </aside>
      <div class="admin-surface">
        <header class="admin-topbar" aria-label="Admin global status bar">
          <div>
            <p class="eyebrow">${escapeHtml(eyebrow)}</p>
            <h1>${escapeHtml(heading)}</h1>
            <p>${escapeHtml(description)}</p>
          </div>
          <div class="admin-topbar-meta">
            <span>${escapeHtml(statusText)}</span>
            ${user ? `<strong>Signed in as ${escapeHtml(user.nickname)} (${escapeHtml(user.role)})</strong>` : ""}
          </div>
        </header>
        <main class="admin-content" aria-label="Admin main content">
          <div class="admin-main-region">${content}</div>
          ${detailPanel}
        </main>
      </div>
    </div>`
  });
}

function renderAdminTable({ caption, headers, rows, emptyText }) {
  if (rows.length === 0) {
    return `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
  }

  return `<div class="admin-table-wrap">
    <table class="admin-table">
      <caption>${escapeHtml(caption)}</caption>
      <thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  </div>`;
}

function renderAdminPanel({ id, title, kicker, sections, actions = "", footer = "" }) {
  return `<aside class="admin-detail-panel" id="${escapeHtml(id)}" aria-label="${escapeHtml(title)}">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Detail drawer</p>
        <h2>${escapeHtml(title)}</h2>
        ${kicker ? `<p class="section-kicker">${escapeHtml(kicker)}</p>` : ""}
      </div>
    </div>
    ${sections.join("")}
    ${actions ? `<section class="admin-review-section" aria-label="${escapeHtml(title)} actions">
      <h3>Action bar</h3>
      ${actions}
    </section>` : ""}
    ${footer}
  </aside>`;
}

function renderAdminPanelSection(title, body, ariaLabel = title) {
  return `<section class="admin-review-section" aria-label="${escapeHtml(ariaLabel)}">
    <h3>${escapeHtml(title)}</h3>
    ${body}
  </section>`;
}

function renderStatusCards({ currentYear, annualGuideCount, annualTimelineCount, annualExperienceCount }) {
  return [
    {
      label: "Current cycle",
      value: `${currentYear} Guangdong`,
      detail: "Published official data"
    },
    {
      label: "Published guides",
      value: `${annualGuideCount} ${pluralize(annualGuideCount, "school")}`,
      detail: "Visible to students"
    },
    {
      label: "Timeline progress",
      value: `${annualTimelineCount} ${pluralize(annualTimelineCount, "node")}`,
      detail: "Guide releases and deadlines"
    },
    {
      label: "Published experiences",
      value: `${annualExperienceCount} ${pluralize(annualExperienceCount, "story", "stories")}`,
      detail: "Structured student references"
    }
  ]
    .map(
      (item) => `<div class="status-item">
        <span class="status-label">${escapeHtml(item.label)}</span>
        <strong class="status-value">${escapeHtml(item.value)}</strong>
        <span class="status-note">${escapeHtml(item.detail)}</span>
      </div>`
    )
    .join("");
}

function renderGradeCards() {
  return entryPoints
    .map(
      (item) => `<article class="info-card">
        <div class="badge-row"><span class="badge">${escapeHtml(item.badge)}</span></div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.body)}</p>
      </article>`
    )
    .join("");
}

function renderTimelineCards(events) {
  if (events.length === 0) {
    return `<p class="empty-state">No published timeline dates are available yet.</p>`;
  }

  return events
    .map((event) => `<article class="compact-card">
      <div class="item-meta">
        <span>${escapeHtml(schoolNameFor(event))}</span>
        <span>${escapeHtml(formatDate(event.endsAt ?? event.startsAt))}</span>
      </div>
      <h3>${escapeHtml(event.title)}</h3>
    </article>`)
    .join("");
}

function renderGuideCards(guides) {
  if (guides.length === 0) {
    return `<p class="empty-state">No published guides are available yet.</p>`;
  }

  return guides
    .map((guide) => `<article class="info-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(guide.admissionYear)}</span>
        <span class="soft-badge">Published guide</span>
      </div>
      <h3>${escapeHtml(schoolNameFor(guide))}</h3>
      <p>${escapeHtml(guide.summary)}</p>
      <dl class="detail-list">
        <div>
          <dt>Application window</dt>
          <dd>${escapeHtml(formatDate(guide.applicationStartAt))} to ${escapeHtml(formatDate(guide.applicationDeadlineAt))}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>${escapeHtml(formatDate(guide.updatedAt))}</dd>
        </div>
      </dl>
      <a class="text-link" href="${escapeHtml(guide.officialSourceUrl)}" rel="noopener">Official source</a>
    </article>`)
    .join("");
}

function renderExperienceCards(experiences) {
  if (experiences.length === 0) {
    return `<p class="empty-state">No published experiences are available yet.</p>`;
  }

  return experiences
    .map((experience) => `<article class="info-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(experience.admissionYear)}</span>
        <span class="soft-badge">${escapeHtml(experience.verificationStatus)}</span>
      </div>
      <h3>${escapeHtml(schoolNameFor(experience))}</h3>
      <p>${escapeHtml(experience.summary)}</p>
      <dl class="detail-list">
        <div>
          <dt>Assessment</dt>
          <dd>${escapeHtml(experience.assessmentTypes.join(", "))}</dd>
        </div>
        <div>
          <dt>Useful count</dt>
          <dd>${escapeHtml(experience.usefulCount)}</dd>
        </div>
      </dl>
    </article>`)
    .join("");
}

function selectedAttribute(currentValue, optionValue) {
  return String(currentValue ?? "") === String(optionValue) ? " selected" : "";
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))]
    .sort((left, right) => String(left).localeCompare(String(right), "en"));
}

function renderOption(value, label, currentValue) {
  return `<option value="${escapeHtml(value)}"${selectedAttribute(currentValue, value)}>${escapeHtml(label)}</option>`;
}

function schoolAbbreviation(school) {
  if (school?.abbreviation) {
    return school.abbreviation;
  }

  return String(school?.name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function queryStringFromFilters(filters, allowedKeys) {
  const params = new URLSearchParams();

  for (const key of allowedKeys) {
    const value = filters[key];

    if (value !== undefined && value !== null && String(value).length > 0) {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function schoolListHref(filters = {}) {
  return `/schools${queryStringFromFilters(filters, [
    "year",
    "keyword",
    "status",
    "applicationStatus",
    "schoolType",
    "sort"
  ])}`;
}

function renderFavoriteSchoolForm(schoolId, returnTo, className = "top-action-form") {
  return `<form class="${escapeHtml(className)}" method="post" action="/favorites" aria-label="Favorite school action">
    <input type="hidden" name="targetType" value="school">
    <input type="hidden" name="targetId" value="${escapeHtml(schoolId)}">
    <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
    <button class="icon-button" type="submit" aria-label="Favorite school">${renderIcon("heart")}</button>
  </form>`;
}

function renderSchoolFilters(filters, allCards) {
  const years = uniqueSorted(allCards.map((card) => card.guide.admissionYear)).sort((left, right) => right - left);
  const applicationStatuses = uniqueSorted(allCards.map((card) => card.guide.applicationStatus));
  const schoolTypes = uniqueSorted(allCards.map((card) => card.school.schoolType));

  const yearOptions = [
    renderOption("", "All years", filters.year ?? ""),
    ...years.map((year) => renderOption(year, year, filters.year))
  ].join("");
  const statusOptions = [
    renderOption("", "All guide statuses", filters.status ?? ""),
    renderOption("published", "Published", filters.status),
    renderOption("pending_review", "Waiting publication", filters.status),
    renderOption("archived", "Historical reference", filters.status)
  ].join("");
  const applicationStatusOptions = [
    renderOption("", "All application statuses", filters.applicationStatus ?? ""),
    ...applicationStatuses.map((status) => renderOption(status, humanizeToken(status), filters.applicationStatus))
  ].join("");
  const schoolTypeOptions = [
    renderOption("", "All school types", filters.schoolType ?? ""),
    ...schoolTypes.map((schoolType) => renderOption(schoolType, humanizeToken(schoolType), filters.schoolType))
  ].join("");
  const sortOptions = [
    renderOption("deadline", "Application deadline", filters.sort ?? "deadline"),
    renderOption("updated", "Update time", filters.sort),
    renderOption("name", "School name", filters.sort)
  ].join("");

  return `<form class="school-filter-panel" method="get" action="/schools" aria-label="School filters" data-school-filter-form="true">
    <label class="filter-field school-search-field">
      <span>School keyword</span>
      <input type="search" name="keyword" value="${escapeHtml(filters.keyword ?? "")}" placeholder="Search school" autocomplete="off">
    </label>
    <div class="school-filter-row" aria-label="Visible school filters">
      <label class="filter-field">
        <span>Year</span>
        <select name="year">${yearOptions}</select>
      </label>
      <label class="filter-field">
        <span>Guide status</span>
        <select name="status">${statusOptions}</select>
      </label>
      <label class="filter-field">
        <span>Application status</span>
        <select name="applicationStatus">${applicationStatusOptions}</select>
      </label>
      <label class="filter-field">
        <span>School type</span>
        <select name="schoolType">${schoolTypeOptions}</select>
      </label>
      <label class="filter-field">
        <span>Sort</span>
        <select name="sort">${sortOptions}</select>
      </label>
    </div>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/schools" data-school-clear-filters="true">Clear</a>
    </div>
  </form>`;
}

function selectedSchoolFilterEntries(filters) {
  const entries = [
    ["Year", filters.year],
    ["Keyword", filters.keyword],
    ["Guide status", filters.status && humanizeToken(filters.status)],
    ["Application status", filters.applicationStatus && humanizeToken(filters.applicationStatus)],
    ["School type", filters.schoolType && humanizeToken(filters.schoolType)]
  ];

  return entries.filter(([, value]) => value !== undefined && value !== null && String(value).length > 0);
}

function renderSelectedSchoolFilters(filters) {
  const selected = selectedSchoolFilterEntries(filters);

  if (selected.length === 0) {
    return `<p class="filter-summary">Showing all published school guide cards.</p>`;
  }

  return `<div class="selected-filters" aria-label="Selected school filters">
    ${selected
      .map(([label, value]) => `<span class="filter-chip">${escapeHtml(label)}: ${escapeHtml(value)}</span>`)
      .join("")}
    <a class="text-link" href="/schools" data-school-clear-filters="true">Clear filters</a>
  </div>`;
}

function renderSchoolTimelineNodes(nodes) {
  if (nodes.length === 0) {
    return `<p class="inline-empty">Timeline ${escapeHtml(pendingSupplementText.toLowerCase())}</p>`;
  }

  return `<ul class="school-timeline">${nodes
    .map((node) => `<li>
      <span>${escapeHtml(node.title)}</span>
      <strong>${escapeHtml(formatDate(node.endsAt ?? node.startsAt))}</strong>
    </li>`)
    .join("")}</ul>`;
}

function renderFormulaTag(formula) {
  if (!formula?.available) {
    return "No formula";
  }

  const formulaName = String(formula.formulaName ?? "").toLowerCase();

  if (formulaName.includes("60/30/10")) {
    return "631";
  }

  if (formulaName.includes("85/15")) {
    return "85/15";
  }

  if (formula.formulaType === "custom") {
    return "Custom";
  }

  return "Custom";
}

function renderExperienceAvailability(experiences) {
  return `${experiences.count} ${pluralize(experiences.count, "experience")}`;
}

function renderSchoolEmptyState(filters) {
  const hasFilters = selectedSchoolFilterEntries(filters).length > 0;
  const clearAction = hasFilters
    ? `<a class="secondary-action" href="/schools" data-school-clear-filters="true">Clear filters</a>`
    : "";

  return `<div class="empty-state school-empty-state">
    <strong>No matching schools</strong>
    <p>No schools match these filters. Try switching year or status.</p>
    ${clearAction}
  </div>`;
}

function renderSchoolCards(cards, filters) {
  if (cards.length === 0) {
    return renderSchoolEmptyState(filters);
  }

  const returnTo = schoolListHref(filters);

  return cards
    .map((card) => {
      const detailHref = `/schools/${escapeHtml(encodeURIComponent(card.school.id))}?year=${escapeHtml(card.guide.admissionYear)}`;

      return `<article class="school-card">
        <div class="school-card-top">
          <div class="school-title-group">
            <div class="badge-row">
              <span class="badge">${escapeHtml(card.guide.admissionYear)}</span>
              <span class="soft-badge">${escapeHtml(humanizeToken(card.guide.status))}</span>
              <span class="muted-badge">${escapeHtml(schoolAbbreviation(card.school))}</span>
            </div>
            <h3><a href="${detailHref}">${escapeHtml(card.school.name)}</a></h3>
            <p class="school-abbrev">${escapeHtml(schoolAbbreviation(card.school))} · ${escapeHtml(humanizeToken(card.school.schoolType))}</p>
          </div>
          ${renderFavoriteSchoolForm(card.school.id, returnTo, "school-card-favorite")}
        </div>
        <dl class="school-card-facts">
          <div>
            <dt>Deadline</dt>
            <dd>${escapeHtml(formatDate(card.guide.applicationDeadlineAt))}</dd>
          </div>
          <div>
            <dt>Formula</dt>
            <dd>${escapeHtml(renderFormulaTag(card.formula))}</dd>
          </div>
          <div>
            <dt>Experiences</dt>
            <dd>${escapeHtml(renderExperienceAvailability(card.experiences))}</dd>
          </div>
          <div>
            <dt>Application</dt>
            <dd>${escapeHtml(humanizeToken(card.guide.applicationStatus))}</dd>
          </div>
        </dl>
        <p>${escapeHtml(card.guide.summary)}</p>
        <div class="timeline-block">
          <h4>Key timeline</h4>
          ${renderSchoolTimelineNodes(card.keyTimelineNodes)}
        </div>
        <a class="text-link school-card-link" href="${detailHref}">View school detail</a>
      </article>`;
    })
    .join("");
}

function renderTimelineFilters(filters) {
  const selectedSchoolId = filters.schoolIds?.[0] ?? "";
  const years = uniqueSorted(listGuides().map((guide) => guide.admissionYear)).sort((left, right) => right - left);
  const schoolsById = new Map(
    listSchoolGuideCards({ sort: "name" }).map((card) => [card.school.id, card.school])
  );
  const nodeTypeOptions = [
    renderOption("", "All node types", filters.nodeType ?? ""),
    ...timelineEventDefinitions.map((definition) => (
      renderOption(definition.eventKey, definition.title, filters.nodeType)
    ))
  ].join("");
  const yearOptions = [
    renderOption("", "All years", filters.year ?? ""),
    ...years.map((year) => renderOption(year, year, filters.year))
  ].join("");
  const schoolOptions = [
    renderOption("", "All schools", selectedSchoolId),
    ...[...schoolsById.values()].map((school) => renderOption(school.id, school.name, selectedSchoolId))
  ].join("");
  const mineInput = filters.mine ? `<input type="hidden" name="mine" value="true">` : "";

  return `<form class="filter-panel timeline-filter-panel" method="get" action="/timeline" aria-label="Timeline filters">
    ${mineInput}
    <label class="filter-field">
      <span>Year</span>
      <select name="year">${yearOptions}</select>
    </label>
    <label class="filter-field">
      <span>Node type</span>
      <select name="nodeType">${nodeTypeOptions}</select>
    </label>
    <label class="filter-field wide-field">
      <span>School</span>
      <select name="schoolIds">${schoolOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="secondary-action" type="submit">Apply</button>
      <a class="secondary-action" href="${filters.mine ? "/timeline?mine=true" : "/timeline"}">Reset</a>
    </div>
  </form>`;
}

function timelineHref(filters, overrides = {}) {
  const next = {
    year: filters.year,
    schoolIds: filters.schoolIds ?? [],
    mine: filters.mine,
    nodeType: filters.nodeType,
    ...overrides
  };
  const params = new URLSearchParams();

  if (next.mine) {
    params.set("mine", "true");
  }

  if (next.year) {
    params.set("year", String(next.year));
  }

  if (next.nodeType) {
    params.set("nodeType", next.nodeType);
  }

  if (next.schoolIds?.length) {
    params.set("schoolIds", next.schoolIds.join(","));
  }

  const query = params.toString();
  return query ? `/timeline?${query}` : "/timeline";
}

function renderTimelineTabs(filters) {
  const allHref = timelineHref(filters, { mine: false });
  const mineHref = timelineHref(filters, { mine: true });
  const allCurrent = filters.mine ? "" : ` aria-current="page"`;
  const mineCurrent = filters.mine ? ` aria-current="page"` : "";

  return `<nav class="timeline-tabs" aria-label="Timeline scope">
    <a href="${escapeHtml(allHref)}"${allCurrent}>All Nodes</a>
    <a href="${escapeHtml(mineHref)}"${mineCurrent}>My Favorites</a>
  </nav>`;
}

function formatTimelineWindow(node) {
  if (!node.startsAt && !node.endsAt) {
    return "To be announced";
  }

  if (node.startsAt && node.endsAt && node.startsAt !== node.endsAt) {
    return `${formatDate(node.startsAt)} to ${formatDate(node.endsAt)}`;
  }

  return formatDate(node.endsAt ?? node.startsAt);
}

function timelineDisplayStatus(node) {
  if (!node.isDateKnown) {
    return {
      className: "status-to_be_announced",
      label: "To be announced"
    };
  }

  return {
    className: `status-${node.status}`,
    label: humanizeToken(node.status)
  };
}

function timelineMonthLabel(node) {
  const dateValue = node.startsAt ?? node.endsAt;

  if (!dateValue) {
    return "To be announced";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "To be announced";
  }

  return date.toLocaleString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function groupTimelineNodesByMonth(nodes) {
  const groups = [];
  const groupsByLabel = new Map();

  for (const node of nodes) {
    const label = timelineMonthLabel(node);
    const group = groupsByLabel.get(label) ?? { label, nodes: [] };
    group.nodes.push(node);

    if (!groupsByLabel.has(label)) {
      groupsByLabel.set(label, group);
      groups.push(group);
    }
  }

  return groups;
}

function renderTimelineEmptyState(timeline) {
  if (timeline.mine && timeline.favorites.length === 0) {
    return `<div class="timeline-empty-state">
      <strong>Collect schools to build My Favorites.</strong>
      <p>Favorite schools from the school list or detail pages, then return here for a school-focused timeline.</p>
      <a class="secondary-action" href="/schools">Browse schools</a>
    </div>`;
  }

  if (timeline.mine) {
    return `<p class="empty-state">No favorite-school timeline nodes match these filters.</p>`;
  }

  return `<p class="empty-state">No published timeline nodes match these filters.</p>`;
}

function renderTimelineNodeCards(timeline) {
  if (timeline.events.length === 0) {
    return renderTimelineEmptyState(timeline);
  }

  const reminderEventIds = new Set(timeline.reminders.map((reminder) => reminder.eventId));

  return groupTimelineNodesByMonth(timeline.events)
    .map((group) => `<section class="timeline-month-group" aria-label="${escapeHtml(group.label)}">
      <h3>${escapeHtml(group.label)}</h3>
      <div class="timeline-month-list">${group.nodes
    .map((node) => {
      const reminderBadge = reminderEventIds.has(node.id)
        ? `<span class="site-badge">Site reminder</span>`
        : "";
      const displayStatus = timelineDisplayStatus(node);
      const detailHref = `/schools/${escapeHtml(encodeURIComponent(node.school.id))}?year=${escapeHtml(node.guide.admissionYear)}`;

      return `<article class="timeline-card">
        <div class="badge-row">
          <span class="badge">${escapeHtml(node.guide.admissionYear)}</span>
          <span class="status-badge ${escapeHtml(displayStatus.className)}">${escapeHtml(displayStatus.label)}</span>
          ${reminderBadge}
        </div>
        <h4><a href="${detailHref}">${escapeHtml(node.title)}</a></h4>
        <dl class="detail-list split-details">
          <div>
            <dt>School</dt>
            <dd>${escapeHtml(node.school.name)}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>${escapeHtml(formatTimelineWindow(node))}</dd>
          </div>
          <div>
            <dt>Node type</dt>
            <dd>${escapeHtml(humanizeToken(node.eventKey))}</dd>
          </div>
          <div>
            <dt>Source guide year</dt>
            <dd>${escapeHtml(node.guide.admissionYear)}</dd>
          </div>
        </dl>
        <a class="text-link" href="${detailHref}">Open related school detail</a>
      </article>`;
    })
    .join("")}</div>
    </section>`)
    .join("");
}

function renderDetailLink(url, label) {
  if (!url) {
    return `<span class="inline-empty">${escapeHtml(missingOfficialText)}</span>`;
  }

  return `<a class="text-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
}

function renderYearSwitcher(detail) {
  return `<div class="year-switcher" aria-label="Admission year selector">${detail.availableYears
    .map((year) => {
      const className = year === detail.selectedYear ? "year-link active-year" : "year-link";
      const current = year === detail.selectedYear ? ` aria-current="page"` : "";
      return `<a class="${className}" href="/schools/${escapeHtml(encodeURIComponent(detail.school.id))}?year=${escapeHtml(year)}"${current}>${escapeHtml(year)}</a>`;
    })
    .join("")}</div>`;
}

function renderDetailRows(rows) {
  return `<dl class="detail-list split-details">${rows
    .map((row) => `<div>
      <dt>${escapeHtml(row.label)}</dt>
      <dd>${row.html ?? escapeHtml(row.value)}</dd>
    </div>`)
    .join("")}</dl>`;
}

function renderTextList(items) {
  if (!items || items.length === 0) {
    return `<p class="inline-empty">${escapeHtml(missingOfficialText)}</p>`;
  }

  return `<ul class="requirement-list">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function renderMajorList(majors) {
  if (!majors || majors.length === 0) {
    return `<p class="inline-empty">${escapeHtml(pendingSupplementText)}</p>`;
  }

  return `<ul class="requirement-list">${majors
    .map((major) => `<li>
      <strong>${escapeHtml(displayValue(major.name, pendingSupplementText))}</strong>
      <span>${escapeHtml(displayValue(major.track, missingOfficialText))}</span>
    </li>`)
    .join("")}</ul>`;
}

function renderFeeSummary(fees) {
  if (!fees || Object.keys(fees).length === 0) {
    return missingOfficialText;
  }

  const applicationFee = fees.applicationFeeCny ?? missingOfficialText;
  const assessmentFee = fees.assessmentFeeCny ?? missingOfficialText;

  return `Application: ${Number.isFinite(applicationFee) ? `CNY ${applicationFee}` : applicationFee}; Assessment: ${Number.isFinite(assessmentFee) ? `CNY ${assessmentFee}` : assessmentFee}`;
}

function renderContactSummary(contact) {
  if (!contact || Object.keys(contact).length === 0) {
    return missingOfficialText;
  }

  return [
    `Phone: ${displayValue(contact.phone)}`,
    `Email: ${displayValue(contact.email)}`
  ].join("; ");
}

const detailTimelineOrder = [
  ["application_start", "Application start"],
  ["application_deadline", "Application deadline"],
  ["preliminary_review_result", "Preliminary review result"],
  ["school_assessment", "School assessment"],
  ["shortlist_publication", "Shortlist publication"]
];

function dateForDetailTimeline(eventKey, guide, nodes) {
  if (eventKey === "application_start") {
    return guide.applicationStartAt;
  }

  if (eventKey === "application_deadline") {
    return guide.applicationDeadlineAt;
  }

  const node = nodes.find((timelineNode) => timelineNode.eventKey === eventKey);
  return node?.endsAt ?? node?.startsAt ?? null;
}

function renderDetailTimelineCard(detail) {
  return `<article class="detail-panel" data-detail-card="key-timeline">
    <div class="section-heading"><h2>Key timeline</h2></div>
    <ul class="detail-timeline">${detailTimelineOrder
      .map(([eventKey, label]) => `<li>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(formatDate(dateForDetailTimeline(eventKey, detail.guide, detail.timeline)))}</strong>
      </li>`)
      .join("")}</ul>
  </article>`;
}

function sourceDateForGuide(guide) {
  return guide.sourcePublishedAt ?? guide.sourceUpdatedAt ?? guide.publishedAt ?? guide.updatedAt;
}

function guideStatusTag(detail) {
  return detail.historicalReference ? "Historical reference" : humanizeToken(detail.guide.status);
}

function renderHistoricalReferenceNotice(detail) {
  if (!detail.historicalReference) {
    return "";
  }

  const requestedYear = detail.requestedYear ?? "current year";
  return `<p class="reference-notice">No published ${escapeHtml(requestedYear)} guide is visible yet. Showing ${escapeHtml(detail.selectedYear)} as historical reference.</p>`;
}

function renderCollapsibleText(value, label, fallback = missingOfficialText) {
  const text = displayValue(value, fallback);

  if (text === fallback) {
    return `<p class="inline-empty">${escapeHtml(text)}</p>`;
  }

  if (text.length <= 72) {
    return `<p>${escapeHtml(text)}</p>`;
  }

  const preview = `${text.slice(0, 72).trim()}...`;

  return `<div class="collapsible-text">
    <p>${escapeHtml(preview)}</p>
    <details>
      <summary>Expand ${escapeHtml(label)}</summary>
      <p>${escapeHtml(text)}</p>
    </details>
  </div>`;
}

function renderOfficialGuideSummaryCard(detail) {
  const guide = detail.guide;

  return `<article class="detail-panel" data-detail-card="official-guide-summary">
    <div class="section-heading"><h2>Official guide summary</h2></div>
    ${renderHistoricalReferenceNotice(detail)}
    <h3>${escapeHtml(displayValue(guide.guideTitle, pendingSupplementText))}</h3>
    ${renderCollapsibleText(guide.summary, "official summary", pendingSupplementText)}
    ${renderDetailRows([
      { label: "Source type", value: humanizeToken(displayValue(guide.sourceType)) },
      { label: "Source date", value: formatDate(sourceDateForGuide(guide)) },
      { label: "Official guide", html: renderDetailLink(guide.officialSourceUrl, "Open official guide") },
      { label: "Version", value: `Version ${guide.version}` }
    ])}
  </article>`;
}

function formulaWeightSummary(formula) {
  return formula.formulaConfig.inputs
    .map((input) => `${input.label} ${Math.round(input.weight * 100)}%`)
    .join(" + ");
}

function renderFormulaDetail(detail) {
  const formula = detail.formula;

  if (!formula) {
    return `<article class="detail-panel" id="formula" data-detail-card="score-formula">
      <div class="section-heading"><h2>Score formula</h2></div>
      <p class="empty-state">No published formula. Score calculation waits for official clarification.</p>
    </article>`;
  }

  const inputs = formula.formulaConfig.inputs
    .map((input) => `<li>
      <span>${escapeHtml(input.label)}</span>
      <strong>${escapeHtml(Math.round(input.weight * 100))}%</strong>
      <em>Max ${escapeHtml(input.maxScore)}</em>
    </li>`)
    .join("");
  const calculatorHref = detailCalculatorHref(detail);

  return `<article class="detail-panel" id="formula" data-detail-card="score-formula">
    <div class="section-heading">
      <h2>Score formula</h2>
      ${renderDetailLink(formula.officialSourceUrl, "Formula source")}
    </div>
    <h3>${escapeHtml(formula.formulaName)}</h3>
    <p>${escapeHtml(formulaWeightSummary(formula))}</p>
    ${renderCollapsibleText(formula.explanation, "formula explanation")}
    <ul class="formula-inputs">${inputs}</ul>
    <a class="text-link" href="${escapeHtml(calculatorHref)}">Open score calculator</a>
  </article>`;
}

function renderAdmissionRequirementsCard(guide) {
  return `<article class="detail-panel" data-detail-card="admission-requirements">
    <div class="section-heading"><h2>Admission requirements</h2></div>
    ${renderDetailRows([
      { label: "Registration conditions", value: missingOfficialText },
      { label: "Academic test requirements", html: renderCollapsibleText(guide.academicTestRequirements, "academic test requirements") },
      { label: "Subject requirements", html: renderTextList(guide.subjectRequirements) },
      { label: "Majors", html: renderMajorList(guide.majors) }
    ])}
  </article>`;
}

function renderAssessmentAdmissionCard(guide) {
  return `<article class="detail-panel" data-detail-card="assessment-admission">
    <div class="section-heading"><h2>Assessment and admission</h2></div>
    ${renderDetailRows([
      { label: "Assessment method", html: renderCollapsibleText(guide.assessmentMethod, "assessment method") },
      { label: "Shortlist rule", value: missingOfficialText },
      { label: "Admission rule", html: renderCollapsibleText(guide.admissionRule, "admission rule") },
      { label: "Volunteer batch", value: missingOfficialText }
    ])}
  </article>`;
}

function renderFeesConsultationCard(guide) {
  return `<article class="detail-panel" data-detail-card="fees-consultation">
    <div class="section-heading"><h2>Fees and consultation</h2></div>
    ${renderDetailRows([
      { label: "Fees", value: renderFeeSummary(guide.fees) },
      { label: "Contact", value: renderContactSummary(guide.contact) }
    ])}
  </article>`;
}

function renderExperienceDetailCards(experiences) {
  if (experiences.length === 0) {
    return `<p class="empty-state">Experience ${escapeHtml(pendingSupplementText.toLowerCase())}</p>`;
  }

  return experiences
    .map((experience) => `<article class="info-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(experience.admissionYear)}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(experience.verificationStatus))}</span>
        <span class="muted-badge">${escapeHtml(schoolNameFor(experience))}</span>
      </div>
      <h3>${escapeHtml(humanizeToken(experience.stage))}</h3>
      <p>${escapeHtml(experience.summary)}</p>
      ${renderDetailRows([
        { label: "Assessment", value: displayValue(experience.assessmentTypes) },
        { label: "Useful count", value: experience.usefulCount }
      ])}
    </article>`)
    .join("");
}

function isApplicationOpen(guide) {
  return guide.applicationStatus === "open";
}

function renderActionAnchor({ href, label, primary = false, external = false }) {
  const className = primary ? "primary-action" : "secondary-action";
  const target = external ? ` target="_blank" rel="noopener"` : "";

  return `<a class="${className}" href="${escapeHtml(href)}"${target}>${escapeHtml(label)}</a>`;
}

function detailCalculatorHref(detail) {
  return `/calculator?schoolId=${encodeURIComponent(detail.school.id)}&year=${detail.selectedYear}`;
}

function detailExperiencesHref(detail) {
  return `/experiences?schoolId=${encodeURIComponent(detail.school.id)}&year=${detail.selectedYear}`;
}

function detailSubmissionHref(detail) {
  return `/experiences/new?schoolId=${encodeURIComponent(detail.school.id)}&year=${detail.selectedYear}`;
}

function experienceListHref(filters = {}) {
  return `/experiences${queryStringFromFilters(filters, [
    "keyword",
    "schoolId",
    "year",
    "stage",
    "assessmentType",
    "verified",
    "sort"
  ])}`;
}

function experienceDetailHref(experience) {
  return `/experiences/${encodeURIComponent(experience.id)}`;
}

function renderFavoriteExperienceForm(experienceId, returnTo, className = "top-action-form") {
  return `<form class="${escapeHtml(className)}" method="post" action="/favorites" aria-label="Favorite experience action">
    <input type="hidden" name="targetType" value="experience">
    <input type="hidden" name="targetId" value="${escapeHtml(experienceId)}">
    <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
    <button class="icon-button" type="submit" aria-label="Favorite experience">${renderIcon("heart")}</button>
  </form>`;
}

function renderSchoolQuickActions(detail) {
  const guide = detail.guide;
  const primaryAction = guide.applicationUrl && isApplicationOpen(guide)
    ? "application"
    : detail.formula
      ? "calculator"
      : "";
  const actions = [
    guide.officialSourceUrl
      ? renderActionAnchor({
          href: guide.officialSourceUrl,
          label: "Official guide",
          external: true
        })
      : `<span class="action-note">${escapeHtml(missingOfficialText)}</span>`
  ];

  if (guide.applicationUrl) {
    actions.push(renderActionAnchor({
      href: guide.applicationUrl,
      label: "Application link",
      primary: primaryAction === "application",
      external: true
    }));
  }

  if (detail.formula) {
    actions.push(renderActionAnchor({
      href: detailCalculatorHref(detail),
      label: "Score calculator",
      primary: primaryAction === "calculator"
    }));
  } else {
    actions.push(`<span class="action-note">Score calculation waits for official clarification.</span>`);
  }

  actions.push(renderActionAnchor({
    href: detailExperiencesHref(detail),
    label: "Experiences"
  }));

  return `<div class="actions detail-actions school-quick-actions" aria-label="School quick actions">${actions.join("")}</div>`;
}

function renderSchoolBottomActionBar(detail) {
  const actions = [];

  if (detail.guide.applicationUrl) {
    actions.push(renderActionAnchor({
      href: detail.guide.applicationUrl,
      label: "Apply",
      external: true
    }));
  }

  if (detail.formula) {
    actions.push(renderActionAnchor({
      href: detailCalculatorHref(detail),
      label: "Calculate"
    }));
  }

  actions.push(renderActionAnchor({
    href: detailSubmissionHref(detail),
    label: "Submit experience"
  }));

  return `<section class="school-bottom-action-bar" aria-label="School bottom actions">${actions.join("")}</section>`;
}

function renderSchoolHeaderCard(detail) {
  const schoolLocation = displayValue(detail.school.city);
  const returnTo = `/schools/${encodeURIComponent(detail.school.id)}?year=${detail.selectedYear}`;

  return `<section class="school-detail-header-card" aria-labelledby="school-detail-title">
    <div class="school-detail-header-copy">
      <div class="badge-row">
        <span class="badge">${escapeHtml(detail.selectedYear)}</span>
        <span class="soft-badge">${escapeHtml(guideStatusTag(detail))}</span>
        <span class="muted-badge">${escapeHtml(schoolAbbreviation(detail.school))}</span>
      </div>
      <h1 id="school-detail-title">${escapeHtml(detail.school.name)}</h1>
      <p>${escapeHtml(schoolLocation)} · ${escapeHtml(humanizeToken(detail.school.schoolType))}</p>
    </div>
    ${renderFavoriteSchoolForm(detail.school.id, returnTo, "school-detail-favorite")}
    ${renderYearSwitcher(detail)}
    ${renderSchoolQuickActions(detail)}
  </section>`;
}

export function renderSchoolDetailPage(detail) {
  return renderStudentPage({
    title: `${detail.school.name} ${detail.selectedYear} | ${productName}`,
    currentKey: "schools",
    topBar: renderStudentTopBar({
      type: "detail",
      title: schoolAbbreviation(detail.school),
      backHref: "/schools",
      backLabel: "Back to schools",
      actionHtml: renderFavoriteSchoolAction(
        detail.school.id,
        `/schools/${encodeURIComponent(detail.school.id)}?year=${detail.selectedYear}`
      )
    }),
    content: `
      ${renderSchoolHeaderCard(detail)}
      ${renderSchoolBottomActionBar(detail)}

      <section class="section detail-card-stack" aria-label="School official detail">
        ${renderDetailTimelineCard(detail)}
        ${renderOfficialGuideSummaryCard(detail)}
        ${renderFormulaDetail(detail)}
        ${renderAdmissionRequirementsCard(detail.guide)}
        ${renderAssessmentAdmissionCard(detail.guide)}
        ${renderFeesConsultationCard(detail.guide)}
      </section>

      <section class="section" aria-labelledby="featured-experiences-title">
        <div class="section-heading">
          <h2 id="featured-experiences-title">Featured experiences</h2>
          <p class="section-kicker">Published structured assessment references</p>
          <a class="text-link" href="${escapeHtml(detailExperiencesHref(detail))}">View all</a>
        </div>
        <div class="card-grid">${renderExperienceDetailCards(detail.featuredExperiences)}</div>
      </section>`
  });
}

export function renderSchoolListPage(filters = {}) {
  const allCards = listSchoolGuideCards({ sort: "name" });
  const cards = listSchoolGuideCards(filters);

  return renderStudentPage({
    title: `Schools | ${productName}`,
    currentKey: "schools",
    topBar: renderStudentTopBar({
      type: "list",
      title: "Schools",
      filterHref: "#school-filters",
      filterLabel: "Open school filters"
    }),
    content: `
      <section class="page-heading" aria-labelledby="school-list-title">
        <p class="eyebrow">Published school guides</p>
        <h1 id="school-list-title">Schools</h1>
        <p class="lead">Search schools by name or abbreviation, then scan guide status, deadlines, formulas, and published experiences.</p>
      </section>

      <section class="section" id="school-filters" aria-label="School list filters" data-school-filters-container="true">
        ${renderSchoolFilters(filters, allCards)}
        ${renderSelectedSchoolFilters(filters)}
        <div class="school-list-status" role="status" aria-live="polite" hidden data-school-list-status="true"></div>
      </section>

      <section class="section" aria-labelledby="school-results-title" data-school-results-section="true">
        <div class="section-heading">
          <h2 id="school-results-title">${escapeHtml(cards.length)} ${escapeHtml(pluralize(cards.length, "school"))}</h2>
          <p class="section-kicker">Draft and review-only guide data is hidden from visitors</p>
        </div>
        <div class="list-loading-skeleton" hidden aria-hidden="true" data-list-skeleton="school">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="school-list" data-school-results="true">${renderSchoolCards(cards, filters)}</div>
      </section>`
  });
}

export function renderTimelinePage(timeline) {
  return renderStudentPage({
    title: `Timeline | ${productName}`,
    currentKey: "",
    topBar: renderStudentTopBar({
      type: "list",
      title: "Timeline",
      filterHref: "#timeline-filters",
      filterLabel: "Open timeline filters"
    }),
    content: `
      <section class="page-heading" aria-labelledby="timeline-title">
        <p class="eyebrow">Published admissions dates</p>
        <h1 id="timeline-title">${timeline.mine ? "My timeline" : "Guangdong timeline"}</h1>
        <p class="lead">Track official comprehensive evaluation guide publication, application windows, review nodes, assessments, volunteer application, and admission result publication.</p>
        ${renderTimelineTabs(timeline.filters)}
      </section>

      <section class="section" id="timeline-filters" aria-label="Timeline filters">
        ${renderTimelineFilters(timeline.filters)}
      </section>

      <section class="section" aria-labelledby="timeline-results-title">
        <div class="section-heading">
          <h2 id="timeline-results-title">${escapeHtml(timeline.count)} ${escapeHtml(pluralize(timeline.count, "timeline node"))}</h2>
          <p class="section-kicker">${escapeHtml(timeline.reminders.length)} site-only ${escapeHtml(pluralize(timeline.reminders.length, "reminder"))}</p>
        </div>
        <div class="timeline-list">${renderTimelineNodeCards(timeline)}</div>
      </section>`
  });
}

function renderExperienceFilters(filters, allExperiences) {
  const years = uniqueSorted(allExperiences.map((experience) => experience.admissionYear))
    .sort((left, right) => right - left);
  const stages = uniqueSorted(allExperiences.map((experience) => experience.stage));
  const assessmentTypes = uniqueSorted(allExperiences.flatMap((experience) => experience.assessmentTypes));
  const schoolsById = new Map(
    listSchoolGuideCards({ sort: "name" }).map((card) => [card.school.id, card.school])
  );
  const yearOptions = [
    renderOption("", "All years", filters.year ?? ""),
    ...years.map((year) => renderOption(year, year, filters.year))
  ].join("");
  const schoolOptions = [
    renderOption("", "All schools", filters.schoolId ?? ""),
    ...[...schoolsById.values()].map((school) => renderOption(school.id, school.name, filters.schoolId))
  ].join("");
  const stageOptions = [
    renderOption("", "All stages", filters.stage ?? ""),
    ...stages.map((stage) => renderOption(stage, humanizeToken(stage), filters.stage))
  ].join("");
  const assessmentOptions = [
    renderOption("", "All assessment formats", filters.assessmentType ?? ""),
    ...assessmentTypes.map((type) => renderOption(type, humanizeToken(type), filters.assessmentType))
  ].join("");
  const verifiedOptions = [
    renderOption("", "Any verification", filters.verified ?? ""),
    renderOption("true", "Verified", filters.verified === true ? "true" : ""),
    renderOption("false", "Verification pending", filters.verified === false ? "false" : "")
  ].join("");
  const sortOptions = [
    renderOption("default", "Recent two years first", filters.sort ?? "default"),
    renderOption("newest", "Newest", filters.sort),
    renderOption("useful", "Useful count", filters.sort),
    renderOption("verified", "Verified first", filters.sort)
  ].join("");

  return `<form class="filter-panel experience-filter-panel" method="get" action="/experiences" aria-label="Experience filters">
    <label class="filter-field wide-field experience-search-field">
      <span>Experience keyword</span>
      <input type="search" name="keyword" value="${escapeHtml(filters.keyword ?? "")}" placeholder="Search school, stage, or keyword" autocomplete="off">
    </label>
    <label class="filter-field wide-field">
      <span>School</span>
      <select name="schoolId">${schoolOptions}</select>
    </label>
    <label class="filter-field">
      <span>Year</span>
      <select name="year">${yearOptions}</select>
    </label>
    <label class="filter-field">
      <span>Stage</span>
      <select name="stage">${stageOptions}</select>
    </label>
    <label class="filter-field">
      <span>Assessment format</span>
      <select name="assessmentType">${assessmentOptions}</select>
    </label>
    <label class="filter-field">
      <span>Verified status</span>
      <select name="verified">${verifiedOptions}</select>
    </label>
    <label class="filter-field">
      <span>Sort</span>
      <select name="sort">${sortOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="secondary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/experiences">Clear</a>
    </div>
  </form>`;
}

function selectedExperienceFilterEntries(filters) {
  const entries = [
    ["Keyword", filters.keyword],
    ["School", filters.schoolId && (getSchoolById(filters.schoolId)?.name ?? filters.schoolId)],
    ["Year", filters.year],
    ["Stage", filters.stage && humanizeToken(filters.stage)],
    ["Assessment format", filters.assessmentType && humanizeToken(filters.assessmentType)],
    ["Verified status", typeof filters.verified === "boolean"
      ? filters.verified ? "Verified" : "Verification pending"
      : null],
    ["Sort", filters.sort && filters.sort !== "default" ? humanizeToken(filters.sort) : null]
  ];

  return entries.filter(([, value]) => value !== undefined && value !== null && String(value).length > 0);
}

function renderSelectedExperienceFilters(filters) {
  const selected = selectedExperienceFilterEntries(filters);

  if (selected.length === 0) {
    return `<p class="filter-summary">Showing recent published experiences first, then verified status and update time.</p>`;
  }

  return `<div class="selected-filters" aria-label="Selected experience filters">
    ${selected
      .map(([label, value]) => `<span class="filter-chip">${escapeHtml(label)}: ${escapeHtml(value)}</span>`)
      .join("")}
    <a class="text-link" href="/experiences">Clear filters</a>
  </div>`;
}

function latestExperienceReferenceYear() {
  return currentAdmissionYear(listGuides());
}

function experienceVerifiedLabel(experience) {
  return experience.verificationStatus === "verified" ? "Verified experience" : "Verification pending";
}

function experienceHistoricalReferenceNotice(experience) {
  if (latestExperienceReferenceYear() - experience.admissionYear < 2) {
    return "";
  }

  return `Historical reference: this ${experience.admissionYear} experience may not reflect current assessment rules.`;
}

function renderExperienceReferenceNotice(experience) {
  const notice = experienceHistoricalReferenceNotice(experience);

  return notice ? `<p class="reference-notice">${escapeHtml(notice)}</p>` : "";
}

function renderExperienceEmptyState(filters) {
  const hasFilters = selectedExperienceFilterEntries(filters).length > 0;
  const clearAction = hasFilters
    ? `<a class="secondary-action" href="/experiences">Clear filters</a>`
    : "";

  return `<div class="empty-state experience-empty-state">
    <strong>No matching published experiences</strong>
    <p>Try changing filters or publish the first relevant experience for this school, year, or assessment format.</p>
    <div class="actions">
      ${clearAction}
      <a class="primary-action" href="/experiences/new">Submit experience</a>
    </div>
  </div>`;
}

function renderExperienceListCards(experiences, filters = {}) {
  if (experiences.length === 0) {
    return renderExperienceEmptyState(filters);
  }

  const returnTo = experienceListHref(filters);

  return experiences
    .map((experience) => {
      const school = getSchoolById(experience.schoolId);
      const detailHref = experienceDetailHref(experience);

      return `<article class="experience-card">
        <div class="experience-card-top">
          <div class="experience-title-group">
            <div class="badge-row">
              <span class="badge">${escapeHtml(experience.admissionYear)}</span>
              <span class="soft-badge">${escapeHtml(experienceVerifiedLabel(experience))}</span>
              <span class="muted-badge">${escapeHtml(humanizeToken(experience.stage))}</span>
            </div>
            <h3><a href="${escapeHtml(detailHref)}">${escapeHtml(school?.name ?? "Published school")}</a></h3>
            <p class="experience-major">${escapeHtml(displayValue(experience.majorGroup, "Admission group not specified"))}</p>
          </div>
          ${renderFavoriteExperienceForm(experience.id, returnTo, "experience-card-favorite")}
        </div>
        <p>${escapeHtml(experience.summary)}</p>
        <dl class="detail-list split-details">
          <div>
            <dt>School</dt>
            <dd>${escapeHtml(school?.name ?? "Published school")}</dd>
          </div>
          <div>
            <dt>Year</dt>
            <dd>${escapeHtml(experience.admissionYear)}</dd>
          </div>
          <div>
            <dt>Major or group</dt>
            <dd>${escapeHtml(displayValue(experience.majorGroup, missingOfficialText))}</dd>
          </div>
          <div>
            <dt>Stage</dt>
            <dd>${escapeHtml(humanizeToken(experience.stage))}</dd>
          </div>
          <div>
            <dt>Assessment format</dt>
            <dd>${escapeHtml(experience.assessmentTypes.map(humanizeToken).join(", "))}</dd>
          </div>
          <div>
            <dt>Useful count</dt>
            <dd>${escapeHtml(experience.usefulCount)}</dd>
          </div>
        </dl>
        ${renderExperienceReferenceNotice(experience)}
        <a class="text-link" href="${escapeHtml(detailHref)}">Read structured detail</a>
      </article>`;
    })
    .join("");
}

function booleanResultLabel(value, positive, negative) {
  if (value === true) {
    return positive;
  }

  if (value === false) {
    return negative;
  }

  return "Not disclosed";
}

function renderRatingPills(experience) {
  const ratings = [
    ["Difficulty", experience.difficultyScore],
    ["Pressure", experience.pressureScore],
    ["Differentiation", experience.differentiationScore]
  ];

  return `<div class="rating-grid" aria-label="Experience ratings">${ratings
    .map(([label, value]) => `<div class="rating-pill">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}/5</strong>
    </div>`)
    .join("")}</div>`;
}

function renderExperienceActionBar(experience) {
  const returnTo = experienceDetailHref(experience);

  return `<section class="experience-action-bar" aria-label="Experience actions">
    ${renderFavoriteExperienceForm(experience.id, returnTo, "experience-detail-favorite")}
    <form class="experience-action-form" method="post" action="/experiences/${escapeHtml(encodeURIComponent(experience.id))}/useful" aria-label="Mark experience useful">
      <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
      <button class="secondary-action" type="submit">Useful (${escapeHtml(experience.usefulCount)})</button>
    </form>
    <details class="report-details">
      <summary>Report</summary>
      <form class="report-form" method="post" action="/reports" aria-label="Report experience">
        <input type="hidden" name="targetType" value="experience">
        <input type="hidden" name="targetId" value="${escapeHtml(experience.id)}">
        <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
        <label class="form-field">
          <span>Report reason</span>
          <select name="reason" required>
            <option value="">Select reason</option>
            <option value="privacy concern">Privacy concern</option>
            <option value="unverified original question">Unverified original question</option>
            <option value="external traffic or paid service">External traffic or paid service</option>
            <option value="other content issue">Other content issue</option>
          </select>
        </label>
        <label class="form-field">
          <span>Description</span>
          <textarea name="description" rows="3" maxlength="2000"></textarea>
        </label>
        <button class="secondary-action" type="submit">Submit report</button>
      </form>
    </details>
  </section>`;
}

function renderExperienceHeader(experience) {
  const school = getSchoolById(experience.schoolId);

  return `<section class="experience-detail-header-card" aria-labelledby="experience-detail-title">
    <div class="badge-row">
      <span class="badge">${escapeHtml(experience.admissionYear)}</span>
      <span class="soft-badge">${escapeHtml(experienceVerifiedLabel(experience))}</span>
      <span class="muted-badge">${escapeHtml(humanizeToken(experience.stage))}</span>
    </div>
    <h1 id="experience-detail-title">${escapeHtml(school?.name ?? "Published school")}</h1>
    <p>${escapeHtml(displayValue(experience.majorGroup, "Admission group not specified"))} · ${escapeHtml(experience.assessmentTypes.map(humanizeToken).join(", "))}</p>
    ${renderExperienceReferenceNotice(experience)}
    ${renderDetailRows([
      { label: "School", value: school?.name ?? "Published school" },
      { label: "Year", value: experience.admissionYear },
      { label: "Stage", value: humanizeToken(experience.stage) },
      { label: "Useful count", value: experience.usefulCount }
    ])}
  </section>`;
}

function renderQuestionTypeCategories(experience) {
  if (!experience.questionTypes?.length) {
    return `<p class="inline-empty">${escapeHtml(missingOfficialText)}</p>`;
  }

  return `<div class="question-type-grid">${experience.questionTypes
    .map((questionType) => `<span class="question-type-pill">${escapeHtml(humanizeToken(questionType))}</span>`)
    .join("")}</div>`;
}

export function renderExperienceDetailPage(experience) {
  const school = getSchoolById(experience.schoolId);
  const detailHref = experienceDetailHref(experience);

  return renderStudentPage({
    title: `${school?.name ?? "Experience"} ${experience.admissionYear} | ${productName}`,
    currentKey: "experiences",
    topBar: renderStudentTopBar({
      type: "detail",
      title: "Experience",
      backHref: "/experiences",
      backLabel: "Back to experiences",
      actionHtml: renderFavoriteExperienceForm(experience.id, detailHref)
    }),
    content: `
      ${renderExperienceHeader(experience)}
      ${renderExperienceActionBar(experience)}

      <section class="section detail-card-stack" aria-label="Experience detail">
        <article class="detail-panel" data-experience-detail-section="basic-information">
          <div class="section-heading"><h2>Basic information</h2></div>
          ${renderDetailRows([
            { label: "Major or admission group", value: displayValue(experience.majorGroup) },
            { label: "Candidate track", value: humanizeToken(displayValue(experience.candidateTrack)) },
            { label: "Shortlisted result", value: booleanResultLabel(experience.shortlistedStatus, "Shortlisted", "Not shortlisted") },
            { label: "Admitted result", value: booleanResultLabel(experience.admittedStatus, "Admitted", "Not admitted") },
            { label: "Assessment format", value: experience.assessmentTypes.map(humanizeToken).join(", ") },
            { label: "Location", value: displayValue(experience.location) }
          ])}
        </article>

        <article class="detail-panel" data-experience-detail-section="process">
          <div class="section-heading"><h2>Process</h2></div>
          ${renderCollapsibleText(experience.processSummary, "process", pendingSupplementText)}
        </article>

        <article class="detail-panel" data-experience-detail-section="question-types">
          <div class="section-heading"><h2>Question-type categories</h2></div>
          ${renderQuestionTypeCategories(experience)}
        </article>

        <article class="detail-panel" data-experience-detail-section="preparation-advice">
          <div class="section-heading"><h2>Preparation and advice</h2></div>
          ${renderDetailRows([
            { label: "Preparation", html: renderCollapsibleText(experience.preparationSummary, "preparation", pendingSupplementText) },
            { label: "Advice", html: renderCollapsibleText(experience.advice, "advice", pendingSupplementText) }
          ])}
        </article>

        <article class="detail-panel" data-experience-detail-section="ratings">
          <div class="section-heading"><h2>Experience ratings</h2></div>
          ${renderRatingPills(experience)}
        </article>
      </section>`
  });
}

const assessmentTypeSubmissionOptions = [
  ["structured_interview", "Structured interview"],
  ["group_discussion", "Group discussion"],
  ["machine_test", "Machine test"],
  ["materials_review", "Materials review"],
  ["practical_task", "Practical task"]
];

const questionTypeSubmissionOptions = [
  ["motivation", "Motivation"],
  ["current_affairs", "Current affairs"],
  ["major_interest", "Major interest"],
  ["experiment_design", "Experiment design"],
  ["project_reflection", "Project reflection"],
  ["math_reasoning", "Math reasoning"],
  ["teamwork", "Teamwork"],
  ["learning_plan", "Learning plan"]
];

function scalarFormValue(formData, name, fallback = "") {
  if (!formData || typeof formData !== "object") {
    return fallback;
  }

  const value = formData[name];

  if (Array.isArray(value)) {
    const found = value.find((item) => String(item ?? "").length > 0);
    return found === undefined ? fallback : String(found);
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function arrayFormValue(formData, name, fallback = []) {
  if (!formData || typeof formData !== "object") {
    return fallback;
  }

  const value = formData[name];

  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (value === undefined || value === null || String(value).length === 0) {
    return fallback;
  }

  return [String(value)];
}

function checkedAttribute(values, optionValue) {
  return values.includes(optionValue) ? " checked" : "";
}

function renderCheckboxOptions(name, options, defaults = []) {
  return options
    .map(([value, label]) => `<label class="checkbox-field">
      <input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(value)}"${checkedAttribute(defaults, value)}>
      <span>${escapeHtml(label)}</span>
    </label>`)
    .join("");
}

function submissionSchoolOptions(currentValue = "") {
  const schoolsById = new Map(
    listSchoolGuideCards({ sort: "name" }).map((card) => [card.school.id, card.school])
  );

  return [
    renderOption("", "Select school", currentValue),
    ...[...schoolsById.values()].map((school) => renderOption(school.id, school.name, currentValue))
  ].join("");
}

function submissionYearOptions(currentValue = "") {
  const years = uniqueSorted(listGuides().map((guide) => guide.admissionYear))
    .sort((left, right) => right - left);

  return [
    renderOption("", "Select year", currentValue),
    ...years.map((year) => renderOption(year, year, currentValue))
  ].join("");
}

function ratingOptions(currentValue = "") {
  return [
    renderOption("", "Select score", currentValue),
    ...[1, 2, 3, 4, 5].map((score) => renderOption(score, String(score), currentValue))
  ].join("");
}

function requiredMarker() {
  return `<span class="required-marker" aria-label="required">*</span>`;
}

function characterHint(name, maxLength) {
  return `<span class="char-hint" data-char-count-for="${escapeHtml(name)}">0/${escapeHtml(maxLength)}</span>`;
}

function renderSubmissionStatus(submission) {
  if (!submission) {
    return "";
  }

  const school = getSchoolById(submission.schoolId);

  return `<section class="submission-status" aria-labelledby="submission-status-title">
    <div class="section-heading">
      <h2 id="submission-status-title">Pending review</h2>
      <p class="section-kicker">${escapeHtml(submission.verification.materialCount)} verification ${escapeHtml(pluralize(submission.verification.materialCount, "metadata record"))}</p>
    </div>
    <dl class="detail-list split-details">
      <div>
        <dt>School</dt>
        <dd>${escapeHtml(school?.name ?? "Published school")}</dd>
      </div>
      <div>
        <dt>Year</dt>
        <dd>${escapeHtml(submission.year)}</dd>
      </div>
      <div>
        <dt>Stage</dt>
        <dd>${escapeHtml(humanizeToken(submission.stage))}</dd>
      </div>
      <div>
        <dt>Display</dt>
        <dd>${escapeHtml(submission.author.displayName ?? submission.author.nickname)}</dd>
      </div>
    </dl>
  </section>`;
}

function renderSubmissionError(error) {
  return error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : "";
}

export function renderExperienceSubmissionPage({ user, submission = null, error = "", formData = {} }) {
  const anonymousDefault = scalarFormValue(formData, "isAnonymous", user.defaultAnonymous ? "true" : "false");
  const anonymousOptions = [
    renderOption("true", "Anonymous display", anonymousDefault),
    renderOption("false", "Show nickname", anonymousDefault)
  ].join("");
  const selectedAssessmentTypes = arrayFormValue(formData, "assessmentTypes", ["structured_interview"]);
  const selectedQuestionTypes = arrayFormValue(formData, "questionTypes", ["motivation"]);
  const submissionComplete = submission ? "true" : "false";

  return renderStudentPage({
    title: `Submit experience | ${productName}`,
    currentKey: "experiences",
    hideBottomNav: true,
    topBar: renderStudentTopBar({
      type: "form",
      title: "Submit",
      backHref: "/experiences",
      backLabel: "Back to experiences",
      submitState: "Review after submit"
    }),
    content: `
      <section class="page-heading" aria-labelledby="experience-submit-title">
        <p class="eyebrow">Structured submission</p>
        <h1 id="experience-submit-title">Submit experience</h1>
        <p class="lead">Record school assessment details, preparation signals, and optional verification metadata for reviewer approval.</p>
      </section>

      ${renderSubmissionStatus(submission)}

      <div class="draft-restore-prompt" hidden data-experience-draft-prompt="true">
        <p>Saved draft found from this device.</p>
        <div class="actions">
          <button class="secondary-action" type="button" data-experience-draft-restore="true">Restore draft</button>
          <button class="secondary-action" type="button" data-experience-draft-clear="true">Clear draft</button>
        </div>
      </div>

      <form class="submission-form" method="post" action="/experiences" aria-label="Experience submission form" data-experience-submission-form="true" data-submission-complete="${submissionComplete}">
        ${renderSubmissionError(error)}
        <fieldset class="form-section">
          <legend>School and result</legend>
          <label class="form-field wide-field">
            <span>School ${requiredMarker()}</span>
            <select name="schoolId" required>${submissionSchoolOptions(scalarFormValue(formData, "schoolId"))}</select>
          </label>
          <label class="form-field">
            <span>Year ${requiredMarker()}</span>
            <select name="year" required>${submissionYearOptions(scalarFormValue(formData, "year"))}</select>
          </label>
          <label class="form-field">
            <span>Major group ${requiredMarker()}</span>
            <input name="majorGroup" value="${escapeHtml(scalarFormValue(formData, "majorGroup"))}" autocomplete="off" maxlength="160" required>
          </label>
          <label class="form-field">
            <span>Candidate track ${requiredMarker()}</span>
            <select name="candidateTrack" required>
              ${renderOption("", "Select track", scalarFormValue(formData, "candidateTrack"))}
              ${renderOption("physics", "Physics", scalarFormValue(formData, "candidateTrack"))}
              ${renderOption("history", "History", scalarFormValue(formData, "candidateTrack"))}
              ${renderOption("general", "General", scalarFormValue(formData, "candidateTrack"))}
            </select>
          </label>
          <label class="form-field">
            <span>Stage ${requiredMarker()}</span>
            <select name="stage" required>
              ${renderOption("", "Select stage", scalarFormValue(formData, "stage"))}
              ${renderOption("preliminary_review", "Preliminary review", scalarFormValue(formData, "stage"))}
              ${renderOption("school_assessment", "School assessment", scalarFormValue(formData, "stage"))}
              ${renderOption("admission_result", "Admission result", scalarFormValue(formData, "stage"))}
            </select>
          </label>
          <label class="form-field">
            <span>Shortlisted status ${requiredMarker()}</span>
            <select name="shortlistedStatus" required>
              ${renderOption("", "Select status", scalarFormValue(formData, "shortlistedStatus"))}
              ${renderOption("true", "Shortlisted", scalarFormValue(formData, "shortlistedStatus"))}
              ${renderOption("false", "Not shortlisted", scalarFormValue(formData, "shortlistedStatus"))}
            </select>
          </label>
          <label class="form-field">
            <span>Admitted status</span>
            <select name="admittedStatus">
              ${renderOption("", "Not disclosed", scalarFormValue(formData, "admittedStatus"))}
              ${renderOption("true", "Admitted", scalarFormValue(formData, "admittedStatus"))}
              ${renderOption("false", "Not admitted", scalarFormValue(formData, "admittedStatus"))}
            </select>
          </label>
          <label class="form-field wide-field">
            <span>Location</span>
            <input name="location" value="${escapeHtml(scalarFormValue(formData, "location"))}" autocomplete="off" maxlength="240">
          </label>
        </fieldset>

        <fieldset class="form-section">
          <legend>Assessment details</legend>
          <div class="form-field wide-field">
            <span>Assessment types ${requiredMarker()}</span>
            <div class="choice-grid">${renderCheckboxOptions("assessmentTypes", assessmentTypeSubmissionOptions, selectedAssessmentTypes)}</div>
          </div>
          <label class="form-field full-field">
            <span>Process ${requiredMarker()}</span>
            <textarea name="processSummary" rows="5" maxlength="5000" data-character-count="true" required>${escapeHtml(scalarFormValue(formData, "processSummary"))}</textarea>
            ${characterHint("processSummary", 5000)}
          </label>
          <div class="form-field full-field">
            <span>Question types ${requiredMarker()}</span>
            <div class="choice-grid">${renderCheckboxOptions("questionTypes", questionTypeSubmissionOptions, selectedQuestionTypes)}</div>
          </div>
          <label class="form-field full-field">
            <span>Preparation ${requiredMarker()}</span>
            <textarea name="preparationSummary" rows="4" maxlength="3000" data-character-count="true" required>${escapeHtml(scalarFormValue(formData, "preparationSummary"))}</textarea>
            ${characterHint("preparationSummary", 3000)}
          </label>
        </fieldset>

        <fieldset class="form-section">
          <legend>Scores and advice</legend>
          <label class="form-field">
            <span>Difficulty score ${requiredMarker()}</span>
            <select name="difficultyScore" required>${ratingOptions(scalarFormValue(formData, "difficultyScore"))}</select>
          </label>
          <label class="form-field">
            <span>Pressure score ${requiredMarker()}</span>
            <select name="pressureScore" required>${ratingOptions(scalarFormValue(formData, "pressureScore"))}</select>
          </label>
          <label class="form-field">
            <span>Differentiation score ${requiredMarker()}</span>
            <select name="differentiationScore" required>${ratingOptions(scalarFormValue(formData, "differentiationScore"))}</select>
          </label>
          <label class="form-field">
            <span>Anonymous preference ${requiredMarker()}</span>
            <select name="isAnonymous" required>${anonymousOptions}</select>
          </label>
          <label class="form-field full-field">
            <span>Advice ${requiredMarker()}</span>
            <textarea name="advice" rows="4" maxlength="3000" data-character-count="true" required>${escapeHtml(scalarFormValue(formData, "advice"))}</textarea>
            ${characterHint("advice", 3000)}
          </label>
        </fieldset>

        <fieldset class="form-section">
          <legend>Verification metadata</legend>
          <p class="form-help">Verification metadata helps reviewers check authenticity. It stays reviewer-only and is not shown on student pages.</p>
          <label class="form-field">
            <span>Material type</span>
            <input name="verificationMaterialType" value="${escapeHtml(scalarFormValue(formData, "verificationMaterialType"))}" autocomplete="off" maxlength="80">
          </label>
          <label class="form-field">
            <span>Storage key</span>
            <input name="verificationObjectStorageKey" value="${escapeHtml(scalarFormValue(formData, "verificationObjectStorageKey"))}" autocomplete="off" maxlength="240">
          </label>
          <label class="form-field">
            <span>Material title</span>
            <input name="verificationTitle" value="${escapeHtml(scalarFormValue(formData, "verificationTitle"))}" autocomplete="off" maxlength="160">
          </label>
          <label class="form-field">
            <span>Source account</span>
            <input name="verificationSourceAccount" value="${escapeHtml(scalarFormValue(formData, "verificationSourceAccount"))}" autocomplete="off" maxlength="160">
          </label>
          <label class="form-field full-field">
            <span>Verification notes</span>
            <textarea name="verificationNotes" rows="3" maxlength="1000" data-character-count="true">${escapeHtml(scalarFormValue(formData, "verificationNotes"))}</textarea>
            ${characterHint("verificationNotes", 1000)}
          </label>
        </fieldset>

        <div class="form-actions">
          <button class="primary-action" type="submit">Submit</button>
          <button class="secondary-action" type="button" data-experience-draft-clear="true">Clear draft</button>
          <a class="secondary-action" href="/experiences">Cancel</a>
        </div>
      </form>
`
  });
}

export function renderExperienceListPage(filters = {}) {
  const allExperiences = listExperiences();
  const experiences = listExperiences(filters);

  return renderStudentPage({
    title: `Experiences | ${productName}`,
    currentKey: "experiences",
    topBar: renderStudentTopBar({
      type: "list",
      title: "Experiences",
      filterHref: "#experience-filters",
      filterLabel: "Open experience filters"
    }),
    content: `
      <section class="page-heading" aria-labelledby="experience-list-title">
        <p class="eyebrow">Published assessment experiences</p>
        <h1 id="experience-list-title">Experience list</h1>
        <p class="lead">Search school, stage, and assessment keywords, then scan structured references with privacy-safe metadata.</p>
        <div class="actions">
          <a class="primary-action" href="/experiences/new">Submit experience</a>
        </div>
      </section>

      <section class="section" id="experience-filters" aria-label="Experience filters">
        ${renderExperienceFilters(filters, allExperiences)}
        ${renderSelectedExperienceFilters(filters)}
      </section>

      <section class="section" aria-labelledby="experience-results-title">
        <div class="section-heading">
          <h2 id="experience-results-title">${escapeHtml(experiences.length)} published ${escapeHtml(pluralize(experiences.length, "experience"))}</h2>
          <p class="section-kicker">Review-only submissions are hidden from visitors</p>
        </div>
        <div class="experience-list">${renderExperienceListCards(experiences, filters)}</div>
      </section>`
  });
}

function calculatorSchoolEntries(cards) {
  const entriesById = new Map();

  for (const card of cards) {
    const existingEntry = entriesById.get(card.school.id);
    const entry = existingEntry ?? {
      school: card.school,
      years: []
    };

    if (!entry.years.includes(card.guide.admissionYear)) {
      entry.years.push(card.guide.admissionYear);
    }

    entriesById.set(card.school.id, entry);
  }

  return [...entriesById.values()]
    .map((entry) => ({
      ...entry,
      years: entry.years.sort((left, right) => right - left)
    }))
    .sort((left, right) => compareSchoolNames(left.school, right.school));
}

function latestFormulaCard(cards) {
  return [...cards]
    .sort((left, right) => {
      if (right.guide.admissionYear !== left.guide.admissionYear) {
        return right.guide.admissionYear - left.guide.admissionYear;
      }

      return String(right.guide.updatedAt ?? "").localeCompare(String(left.guide.updatedAt ?? ""));
    })
    .find((card) => card.formula.available) ?? cards[0] ?? null;
}

function resolveCalculatorSelection(filters, entries, cards) {
  const fallbackCard = latestFormulaCard(cards);
  const requestedEntry = entries.find((entry) => entry.school.id === filters.schoolId);
  const fallbackEntry = entries.find((entry) => entry.school.id === fallbackCard?.school.id) ?? entries[0] ?? null;
  const selectedEntry = requestedEntry ?? fallbackEntry;
  const selectedYear = selectedEntry?.years.includes(filters.year)
    ? filters.year
    : selectedEntry?.years[0];

  return {
    schoolId: selectedEntry?.school.id,
    year: selectedYear
  };
}

function compareSchoolNames(left, right) {
  return left.name.localeCompare(right.name, "en");
}

function calculatorOptionsJson(entries) {
  return safeScriptJson({
    schools: entries.map((entry) => ({
      id: entry.school.id,
      name: entry.school.name,
      years: entry.years
    }))
  });
}

function percentageLabel(value) {
  const percentage = value * 100;
  const rounded = Math.round(percentage * 10) / 10;

  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function renderCalculatorSelectionForm(entries, selectedSchoolId, selectedYear) {
  if (entries.length === 0) {
    return `<p class="empty-state">No published school guide data is available for score calculation.</p>`;
  }

  const selectedEntry = entries.find((entry) => entry.school.id === selectedSchoolId) ?? entries[0];
  const schoolOptions = entries
    .map((entry) => renderOption(entry.school.id, entry.school.name, selectedSchoolId))
    .join("");
  const yearOptions = selectedEntry.years
    .map((year) => renderOption(year, year, selectedYear))
    .join("");

  return `<form class="filter-panel calculator-selector" method="get" action="/calculator" aria-label="Score calculator selection">
    <label class="filter-field wide-field">
      <span>School</span>
      <select name="schoolId" id="calculator-school">${schoolOptions}</select>
    </label>
    <label class="filter-field">
      <span>Year</span>
      <select name="year" id="calculator-year">${yearOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Load formula</button>
      <a class="secondary-action" href="/calculator">Reset</a>
    </div>
  </form>`;
}

function renderCalculatorInput(input) {
  const inputId = `score-${input.key}`;

  return `<label class="score-field" for="${escapeHtml(inputId)}">
    <span>${escapeHtml(input.label)}</span>
    <input
      id="${escapeHtml(inputId)}"
      name="scores[${escapeHtml(input.key)}]"
      type="number"
      inputmode="decimal"
      min="0"
      max="${escapeHtml(input.maxScore)}"
      step="0.01"
      required
      data-score-key="${escapeHtml(input.key)}"
      data-score-label="${escapeHtml(input.label)}"
      data-max-score="${escapeHtml(input.maxScore)}"
      data-weight="${escapeHtml(input.weight)}"
      aria-describedby="${escapeHtml(inputId)}-hint ${escapeHtml(inputId)}-error">
    <small id="${escapeHtml(inputId)}-hint">0 to ${escapeHtml(input.maxScore)} - ${escapeHtml(percentageLabel(input.weight))}</small>
    <small class="score-error" id="${escapeHtml(inputId)}-error" data-score-error-for="${escapeHtml(input.key)}" aria-live="polite"></small>
  </label>`;
}

function renderFormulaWeightNotes(formula) {
  const inputs = formula.formulaConfig.inputs
    .map((input) => `${input.label}: ${percentageLabel(input.weight)} weight, max ${input.maxScore}`)
    .join("; ");

  return `Weights and max scores: ${inputs}. Output scale: ${formula.formulaConfig.outputMaxScore}.`;
}

function renderCalculatorFormulaForm(detail) {
  if (!detail) {
    return `<div class="calculator-unavailable">
      <h3>No published guide selected</h3>
      <p>Calculation form is hidden until a published school guide and year are available.</p>
    </div>`;
  }

  if (!detail.formula || !detail.formula.officialSourceUrl) {
    const title = detail.formula ? "No source-backed formula" : "No clear published formula";
    const copy = detail.formula
      ? "Calculation form is hidden because the published score formula does not yet have an official source basis."
      : `Calculation form is hidden because no clear published score formula is available for ${detail.school.name} ${detail.selectedYear}.`;

    return `<div class="calculator-unavailable" id="score-input-unavailable">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
      ${renderDetailLink(detail.guide.officialSourceUrl, "Published guide")}
    </div>`;
  }

  const inputs = detail.formula.formulaConfig.inputs.map(renderCalculatorInput).join("");

  return `<form class="score-entry-form" id="score-input-form" novalidate data-school-id="${escapeHtml(detail.school.id)}" data-year="${escapeHtml(detail.selectedYear)}">
    <div class="formula-summary">
      <div>
        <span class="soft-badge">Source-backed formula</span>
        <h3>${escapeHtml(detail.formula.formulaName)}</h3>
        <p>${escapeHtml(detail.formula.explanation)}</p>
        <p>${escapeHtml(renderFormulaWeightNotes(detail.formula))}</p>
      </div>
      <a class="text-link" href="${escapeHtml(detail.formula.officialSourceUrl)}" target="_blank" rel="noopener">Official source basis</a>
    </div>
    <div class="score-fields">${inputs}</div>
    <div class="calculator-feedback" id="calculator-feedback" role="alert" aria-live="polite"></div>
    <button class="primary-action" type="submit" data-calculate-score="true" disabled>Calculate score</button>
  </form>`;
}

export function renderScoreCalculatorPage(filters = {}) {
  const cards = listSchoolGuideCards({ sort: "name" });
  const entries = calculatorSchoolEntries(cards);
  const selection = resolveCalculatorSelection(filters, entries, cards);
  const detail = selection.schoolId && selection.year
    ? getSchoolDetail({ schoolId: selection.schoolId, year: selection.year })
    : null;

  return renderStudentPage({
    title: `Score Calculator | ${productName}`,
    hideBottomNav: true,
    topBar: renderStudentTopBar({
      type: "form",
      title: "Calculator",
      backHref: "/schools",
      backLabel: "Back to schools",
      submitState: "Source backed"
    }),
    content: `
      <section class="page-heading" aria-labelledby="calculator-title">
        <p class="eyebrow">Published formula calculator</p>
        <h1 id="calculator-title">Score calculator</h1>
        <p class="lead">Calculate a comprehensive score from the selected school's published Guangdong formula and official score fields.</p>
      </section>

      <section class="section calculator-steps" aria-label="Score calculation steps">
        <article class="calculator-step">
          <div class="step-marker">Step 1</div>
          <div class="section-heading"><h2>Choose school and year</h2></div>
          ${renderCalculatorSelectionForm(entries, selection.schoolId, selection.year)}
        </article>

        <article class="calculator-step">
          <div class="step-marker">Step 2</div>
          <div class="section-heading"><h2>Enter scores</h2></div>
          ${renderCalculatorFormulaForm(detail)}
        </article>

        <article class="calculator-step">
          <div class="step-marker">Step 3</div>
          <div class="section-heading"><h2>View results</h2></div>
          <div class="calculator-result" id="calculator-result" aria-live="polite">
            <p class="inline-empty">Result will appear after calculation.</p>
          </div>
        </article>
      </section>

      <script type="application/json" id="calculator-options">${calculatorOptionsJson(entries)}</script>
      <script src="/calculator.js" defer></script>
`
  });
}

const gradeLabels = Object.freeze({
  high_school_g1: "High school grade one",
  high_school_g2: "High school grade two",
  high_school_g3: "High school grade three",
  graduated: "Graduated"
});

function gradeLabel(grade) {
  return gradeLabels[grade] ?? humanizeToken(grade);
}

function renderPersonalFeedback({ notice = "", error = "" } = {}) {
  if (error) {
    return `<p class="form-error" role="alert">${escapeHtml(error)}</p>`;
  }

  if (notice) {
    return `<p class="form-success" role="status">${escapeHtml(notice)}</p>`;
  }

  return "";
}

function renderAdminGuideFilters(filters = {}) {
  const statusOptions = [
    renderOption("", "Drafts and pending review", filters.status ?? ""),
    renderOption("draft", "Draft", filters.status),
    renderOption("pending_review", "Pending review", filters.status),
    renderOption("published", "Published", filters.status),
    renderOption("archived", "Archived", filters.status)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/guides" aria-label="Admin guide filters">
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/guides">Reset</a>
    </div>
  </form>`;
}

function renderAdminSourceRows(guide) {
  return renderDetailRows([
    { label: "Source title", value: displayValue(guide.sourceTitle) },
    { label: "Source type", value: humanizeToken(displayValue(guide.sourceType)) },
    { label: "Official source", html: renderDetailLink(guide.officialSourceUrl, "Open source") },
    { label: "Source published", value: formatDate(guide.sourcePublishedAt) },
    { label: "Source updated", value: formatDate(guide.sourceUpdatedAt) }
  ]);
}

function renderAdminStructuredRows(guide) {
  const applicationWindow = `${formatDate(guide.applicationStartAt)} to ${formatDate(guide.applicationDeadlineAt)}`;

  return renderDetailRows([
    { label: "Application window", value: applicationWindow },
    { label: "Application status", value: humanizeToken(displayValue(guide.applicationStatus)) },
    { label: "Application URL", html: renderDetailLink(guide.applicationUrl, "Open application") },
    { label: "Majors", value: guide.majors.map((major) => `${major.name} (${major.track})`).join("; ") || pendingSupplementText },
    { label: "Subject requirements", value: displayValue(guide.subjectRequirements, pendingSupplementText) },
    { label: "Academic test", value: displayValue(guide.academicTestRequirements, pendingSupplementText) },
    { label: "Assessment method", value: displayValue(guide.assessmentMethod, pendingSupplementText) },
    { label: "Admission rule", value: displayValue(guide.admissionRule, pendingSupplementText) }
  ]);
}

function renderAdminAuditTrail(guide) {
  const audit = guide.reviewAudit ?? [];

  if (audit.length === 0) {
    return `<p class="inline-empty">No review operations recorded.</p>`;
  }

  return `<ol class="admin-audit-list">${audit
    .map((entry) => `<li>
      <strong>${escapeHtml(humanizeToken(entry.operation))}</strong>
      <span>${escapeHtml(entry.operatorNickname)} (${escapeHtml(entry.operatorRole)})</span>
      <em>${escapeHtml(formatDate(entry.operatedAt))}</em>
      ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
    </li>`)
    .join("")}</ol>`;
}

function renderAdminGuideActions(guide) {
  const encodedId = escapeHtml(encodeURIComponent(guide.id));

  return `<div class="admin-action-row" aria-label="Guide review actions">
    <form method="post" action="/admin/guides/${encodedId}/submit-review">
      <input type="hidden" name="note" value="Submitted from admin guide detail drawer after source and field review.">
      <button class="secondary-action" type="submit">Submit review</button>
    </form>
    <form method="post" action="/admin/guides/${encodedId}/publish">
      <input type="hidden" name="note" value="Published from admin guide detail drawer with student-visible preview checked.">
      <button class="primary-action" type="submit">Publish</button>
    </form>
    <form method="post" action="/admin/guides/${encodedId}/return">
      <input type="hidden" name="note" value="Returned from admin guide detail drawer; reviewer reason required in workflow notes.">
      <button class="secondary-action" type="submit">Return</button>
    </form>
    <form method="post" action="/admin/guides/${encodedId}/pending-supplement">
      <input type="hidden" name="note" value="Marked pending supplement from admin guide detail drawer.">
      <button class="secondary-action" type="submit">Pending supplement</button>
    </form>
    <form method="post" action="/admin/guides/${encodedId}/archive">
      <input type="hidden" name="note" value="Archived from admin guide detail drawer after reviewer check.">
      <button class="secondary-action" type="submit">Archive</button>
    </form>
  </div>`;
}

function guideMissingFieldCount(guide) {
  const requiredFields = [
    guide.officialSourceUrl,
    guide.sourceTitle,
    guide.sourcePublishedAt ?? guide.sourceUpdatedAt,
    guide.applicationUrl,
    guide.applicationDeadlineAt,
    guide.majors,
    guide.subjectRequirements,
    guide.academicTestRequirements,
    guide.assessmentMethod,
    guide.admissionRule
  ];

  return requiredFields.filter((value) => {
    if (Array.isArray(value)) {
      return value.length === 0;
    }

    return !value;
  }).length;
}

function guideFieldState(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? "Confirmed" : "Pending supplement";
  }

  return value ? "Confirmed" : "Pending supplement";
}

function renderAdminGuideFieldConfirmationRows(guide) {
  return renderDetailRows([
    { label: "Application URL", value: guideFieldState(guide.applicationUrl) },
    { label: "Application deadline", value: guideFieldState(guide.applicationDeadlineAt) },
    { label: "Majors", value: guideFieldState(guide.majors) },
    { label: "Subject requirements", value: guideFieldState(guide.subjectRequirements) },
    { label: "Assessment method", value: guideFieldState(guide.assessmentMethod) },
    { label: "Admission rule", value: guideFieldState(guide.admissionRule) }
  ]);
}

function renderAdminGuideTable(reviews) {
  return renderAdminTable({
    caption: "Guide review queue table",
    headers: ["School", "Guide", "Year", "Status", "Source type", "Missing fields", "Updated", "Detail"],
    emptyText: "No guide records match this review queue.",
    rows: reviews.map(({ guide, school }) => `<tr>
      <th scope="row">${escapeHtml(school.name)}</th>
      <td>${escapeHtml(guide.guideTitle)}</td>
      <td>${escapeHtml(guide.admissionYear)}</td>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(guide.status))}</span></td>
      <td>${escapeHtml(humanizeToken(guide.sourceType))}</td>
      <td>${escapeHtml(guideMissingFieldCount(guide))}</td>
      <td>${escapeHtml(formatDate(guide.updatedAt))}</td>
      <td><a class="text-link" href="#admin-guide-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminGuidePreview(guide, school) {
  return renderDetailRows([
    { label: "Student title", value: `${school.name} ${guide.admissionYear}` },
    { label: "Guide summary", value: guide.summary },
    { label: "Application deadline", value: formatDate(guide.applicationDeadlineAt) },
    { label: "Missing fields", value: `${guideMissingFieldCount(guide)} pending supplement` }
  ]);
}

function renderAdminGuideDetailPanel(reviews) {
  const selected = reviews[0];

  if (!selected) {
    return renderAdminPanel({
      id: "admin-guide-detail",
      title: "Guide detail review",
      kicker: "Select a queue row after records are available.",
      sections: [
        renderAdminPanelSection("Student-visible preview", `<p class="inline-empty">No guide record selected.</p>`)
      ]
    });
  }

  const { guide, school } = selected;

  return renderAdminPanel({
    id: "admin-guide-detail",
    title: "Guide detail review",
    kicker: `${school.name} - ${guide.admissionYear} - ${guide.guideTitle} - version ${guide.version}`,
    sections: [
      renderAdminPanelSection("Student-visible preview", renderAdminGuidePreview(guide, school)),
      renderAdminPanelSection("Extracted fields", renderAdminStructuredRows(guide), "Structured fields beside official source"),
      renderAdminPanelSection("Official source preview or link", renderAdminSourceRows(guide)),
      renderAdminPanelSection("Field-level confirmation state", renderAdminGuideFieldConfirmationRows(guide)),
      renderAdminPanelSection("Review audit", renderAdminAuditTrail(guide))
    ],
    actions: `<label class="form-field admin-reason-field">
        <span>Reason / audit note for publish, return, supplement, or archive</span>
        <textarea rows="2" required placeholder="Official source checked; missing fields are marked for students."></textarea>
      </label>
      ${renderAdminGuideActions(guide)}`
  });
}

function renderAdminGuideCards(reviews) {
  if (reviews.length === 0) {
    return `<p class="empty-state">No guide records match this review queue.</p>`;
  }

  return reviews
    .map(({ guide, school }) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(guide.admissionYear)}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(guide.status))}</span>
        ${guide.supplementStatus ? `<span class="muted-badge">${escapeHtml(humanizeToken(guide.supplementStatus))}</span>` : ""}
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(guide.guideTitle)}</h3>
          <p class="section-kicker">${escapeHtml(school.name)} - version ${escapeHtml(guide.version)}</p>
        </div>
        ${renderAdminGuideActions(guide)}
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Official source attribution">
          <h4>Official source attribution</h4>
          ${renderAdminSourceRows(guide)}
        </section>
        <section class="admin-review-section" aria-label="Extracted structured fields">
          <h4>Extracted fields</h4>
          ${renderAdminStructuredRows(guide)}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Review audit trail">
        <h4>Review audit</h4>
        ${renderAdminAuditTrail(guide)}
      </section>
    </article>`)
    .join("");
}

export function renderAdminGuideReviewPage({ reviews, filters = {}, user }) {
  return renderAdminShell({
    title: `Guide Review | ${productName}`,
    currentKey: "guides",
    eyebrow: "Official guide review",
    heading: "Guide review queue",
    description: "Review draft and pending official guide records before they become visible to students.",
    user,
    content: `
      <section class="admin-section" aria-label="Admin guide filters">
        ${renderAdminGuideFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-guide-results-title">
        <div class="section-heading">
          <h2 id="admin-guide-results-title">${escapeHtml(reviews.length)} ${escapeHtml(pluralize(reviews.length, "guide"))} in review</h2>
          <p class="section-kicker">Queue table includes school, year, status, source type, missing-field count, and update time</p>
        </div>
        ${renderAdminGuideTable(reviews)}
      </section>`,
    detailPanel: renderAdminGuideDetailPanel(reviews)
  });
}

function renderAdminTimelineFilters(filters = {}) {
  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/timeline" aria-label="Admin timeline filters">
    <label class="filter-field">
      <span>Year</span>
      <input name="year" inputmode="numeric" value="${escapeHtml(filters.year ?? "")}" placeholder="2026">
    </label>
    <label class="filter-field">
      <span>School id</span>
      <input name="schoolId" value="${escapeHtml(filters.schoolId ?? "")}" placeholder="Optional school id">
    </label>
    <label class="filter-field">
      <span>Event key</span>
      <input name="eventKey" value="${escapeHtml(filters.eventKey ?? "")}" placeholder="application_deadline">
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/timeline">Reset</a>
    </div>
  </form>`;
}

function renderAdminTimelineOverrideForm(node) {
  return `<form class="admin-inline-form" method="post" action="/admin/timeline/overrides" aria-label="Override ${escapeHtml(node.title)}">
    <input type="hidden" name="admissionGuideId" value="${escapeHtml(node.admissionGuideId)}">
    <input type="hidden" name="eventKey" value="${escapeHtml(node.eventKey)}">
    <label class="form-field">
      <span>Title</span>
      <input name="title" value="${escapeHtml(node.title)}" required>
    </label>
    <label class="form-field">
      <span>Start date</span>
      <input name="startsAt" value="${escapeHtml(node.startsAt ?? "")}" placeholder="YYYY-MM-DD or ISO time">
    </label>
    <label class="form-field">
      <span>End date</span>
      <input name="endsAt" value="${escapeHtml(node.endsAt ?? "")}" placeholder="YYYY-MM-DD or ISO time">
    </label>
    <label class="form-field admin-wide-field">
      <span>Description</span>
      <textarea name="description" rows="3">${escapeHtml(node.description ?? "")}</textarea>
    </label>
    <label class="form-field admin-wide-field">
      <span>Override reason</span>
      <textarea name="overrideReason" rows="2" required placeholder="Official notice checked and date/title corrected"></textarea>
    </label>
    <div class="form-actions admin-wide-field">
      <button class="primary-action" type="submit">Save override</button>
    </div>
  </form>`;
}

function renderAdminTimelineCards(timelineNodes) {
  if (timelineNodes.length === 0) {
    return `<p class="empty-state">No generated timeline nodes match these filters.</p>`;
  }

  return timelineNodes
    .map((node) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(node.guide.admissionYear)}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(node.eventKey))}</span>
        <span class="muted-badge">${escapeHtml(humanizeToken(node.source))}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(node.title)}</h3>
          <p class="section-kicker">${escapeHtml(node.school.name)} - ${escapeHtml(formatDate(node.startsAt ?? node.endsAt))}</p>
        </div>
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Guide-generated timeline data">
          <h4>Guide-generated event</h4>
          ${renderDetailRows([
            { label: "Generated title", value: node.generated.title },
            { label: "Generated start", value: formatDate(node.generated.startsAt) },
            { label: "Generated end", value: formatDate(node.generated.endsAt) },
            { label: "Guide", value: node.guide.guideTitle }
          ])}
        </section>
        <section class="admin-review-section" aria-label="Manual timeline override">
          <h4>Manual override</h4>
          ${renderDetailRows([
            { label: "Current title", value: node.title },
            { label: "Current start", value: formatDate(node.startsAt) },
            { label: "Current end", value: formatDate(node.endsAt) },
            { label: "Description", value: displayValue(node.description) },
            { label: "Last reason", value: displayValue(node.override?.reason) }
          ])}
          ${renderAdminTimelineOverrideForm(node)}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Timeline audit trail">
        <h4>Timeline audit</h4>
        ${renderAdminAuditTrail({ reviewAudit: node.override?.reviewAudit ?? [] })}
      </section>
    </article>`)
    .join("");
}

function renderAdminTimelineTable(timelineNodes) {
  return renderAdminTable({
    caption: "Timeline management generated nodes table",
    headers: ["School", "Year", "Node type", "Date", "Date precision", "Source", "Manual override", "Student status", "Detail"],
    emptyText: "No generated timeline nodes match these filters.",
    rows: timelineNodes.map((node) => `<tr>
      <th scope="row">${escapeHtml(node.school.name)}</th>
      <td>${escapeHtml(node.guide.admissionYear)}</td>
      <td>${escapeHtml(humanizeToken(node.eventKey))}</td>
      <td>${escapeHtml(formatDate(node.startsAt ?? node.endsAt))}</td>
      <td>${escapeHtml(node.isDateKnown ? "Date known" : "Date unknown")}</td>
      <td>${escapeHtml(humanizeToken(node.source))}</td>
      <td>${escapeHtml(node.override ? "Manual override" : "Generated")}</td>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(node.status))}</span></td>
      <td><a class="text-link" href="#admin-timeline-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminTimelineDetailPanel(timelineNodes) {
  const node = timelineNodes[0];

  if (!node) {
    return renderAdminPanel({
      id: "admin-timeline-detail",
      title: "Timeline node detail",
      kicker: "Select a generated node after records are available.",
      sections: [
        renderAdminPanelSection("Student-side status", `<p class="inline-empty">No timeline node selected.</p>`)
      ]
    });
  }

  return renderAdminPanel({
    id: "admin-timeline-detail",
    title: "Timeline node detail",
    kicker: `${node.school.name} - ${node.guide.admissionYear} - ${humanizeToken(node.eventKey)}`,
    sections: [
      renderAdminPanelSection("Student-side status", renderDetailRows([
        { label: "Student label", value: node.title },
        { label: "Date shown to students", value: formatDate(node.startsAt ?? node.endsAt) },
        { label: "Status", value: humanizeToken(node.status) },
        { label: "Unknown-date handling", value: node.isDateKnown ? "Date shown" : "To be announced" }
      ])),
      renderAdminPanelSection("Original generated data", renderDetailRows([
        { label: "Generated title", value: node.generated.title },
        { label: "Generated start", value: formatDate(node.generated.startsAt) },
        { label: "Generated end", value: formatDate(node.generated.endsAt) },
        { label: "Guide", value: node.guide.guideTitle }
      ])),
      renderAdminPanelSection("Manual override state", renderDetailRows([
        { label: "Override source", value: humanizeToken(node.source) },
        { label: "Last reason", value: displayValue(node.override?.reason) },
        { label: "Override updated", value: node.override?.updatedAt ? formatDate(node.override.updatedAt) : missingOfficialText }
      ])),
      renderAdminPanelSection("Timeline audit", renderAdminAuditTrail({ reviewAudit: node.override?.reviewAudit ?? [] }))
    ],
    actions: renderAdminTimelineOverrideForm(node)
  });
}

export function renderAdminTimelineManagementPage({ timelineNodes, filters = {}, user }) {
  return renderAdminShell({
    title: `Timeline Management | ${productName}`,
    currentKey: "timeline",
    eyebrow: "Timeline management",
    heading: "Timeline overrides",
    description: "Review guide-generated timeline events and apply audited manual overrides for dates, titles, and descriptions.",
    user,
    content: `
      <section class="admin-section" aria-label="Admin timeline filters">
        ${renderAdminTimelineFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-timeline-results-title">
        <div class="section-heading">
          <h2 id="admin-timeline-results-title">${escapeHtml(timelineNodes.length)} ${escapeHtml(pluralize(timelineNodes.length, "timeline node"))}</h2>
          <p class="section-kicker">Generated nodes preserve original data when a manual override is applied</p>
        </div>
        ${renderAdminTimelineTable(timelineNodes)}
      </section>`,
    detailPanel: renderAdminTimelineDetailPanel(timelineNodes)
  });
}

function defaultFormulaConfigJson() {
  return safeScriptJson({
    inputs: [
      { key: "gaokao", label: "Gaokao score", maxScore: 750, weight: 0.85 },
      { key: "schoolAssessment", label: "School assessment", maxScore: 100, weight: 0.15 }
    ],
    outputMaxScore: 100,
    customConfig: {
      note: "Optional reviewer-only custom configuration"
    }
  });
}

function defaultFormulaSamplesJson() {
  return safeScriptJson([
    {
      name: "Full score sample",
      scores: { gaokao: 750, schoolAssessment: 100 },
      expectedTotalScore: 100
    }
  ]);
}

function renderAdminFormulaFilters(filters = {}) {
  const statusOptions = [
    renderOption("", "All formula statuses", filters.status ?? ""),
    renderOption("draft", "Draft", filters.status),
    renderOption("pending_review", "Pending review", filters.status),
    renderOption("published", "Published", filters.status),
    renderOption("archived", "Archived", filters.status)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/formulas" aria-label="Admin formula filters">
    <label class="filter-field">
      <span>Year</span>
      <input name="year" inputmode="numeric" value="${escapeHtml(filters.year ?? "")}" placeholder="2026">
    </label>
    <label class="filter-field">
      <span>School id</span>
      <input name="schoolId" value="${escapeHtml(filters.schoolId ?? "")}" placeholder="Optional school id">
    </label>
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/formulas">Reset</a>
    </div>
  </form>`;
}

function renderFormulaDraftForm() {
  return `<form class="admin-draft-form" method="post" action="/admin/formulas" aria-label="Create or update formula draft">
    <div class="admin-form-grid">
      <label class="form-field">
        <span>Formula id for update</span>
        <input name="id" placeholder="Leave blank for a new draft">
      </label>
      <label class="form-field">
        <span>Admission guide id</span>
        <input name="admissionGuideId" placeholder="Current published guide id">
      </label>
      <label class="form-field">
        <span>School id</span>
        <input name="schoolId" placeholder="Required if guide id is blank">
      </label>
      <label class="form-field">
        <span>Year</span>
        <input name="year" inputmode="numeric" placeholder="2026">
      </label>
      <label class="form-field">
        <span>Status</span>
        <select name="status">
          <option value="draft">Draft</option>
          <option value="pending_review">Pending review</option>
        </select>
      </label>
      <label class="form-field">
        <span>Formula type</span>
        <select name="formulaType">
          <option value="weighted_sum">Weighted sum</option>
          <option value="custom">Custom with weighted inputs</option>
        </select>
      </label>
      <label class="form-field admin-wide-field">
        <span>Formula name</span>
        <input name="formulaName" placeholder="85/15 comprehensive score">
      </label>
      <label class="form-field admin-wide-field">
        <span>Official source URL</span>
        <input name="officialSourceUrl" placeholder="https://example.edu/source">
      </label>
      <label class="form-field admin-wide-field">
        <span>Explanation</span>
        <textarea name="explanation" rows="3" placeholder="Explain the score inputs, max scores, and weights"></textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Inputs schema and weights JSON</span>
        <textarea name="formulaConfig" rows="8">${escapeHtml(defaultFormulaConfigJson())}</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Sample calculation tests JSON</span>
        <textarea name="sampleTests" rows="6">${escapeHtml(defaultFormulaSamplesJson())}</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Review note</span>
        <textarea name="note" rows="2" placeholder="Source checked against official guide"></textarea>
      </label>
      <div class="form-actions admin-wide-field">
        <button class="primary-action" type="submit">Save formula draft</button>
      </div>
    </div>
  </form>`;
}

function renderFormulaInputRows(formula) {
  return renderDetailRows([
    { label: "Formula type", value: humanizeToken(formula.formulaType) },
    { label: "Output max score", value: formula.formulaConfig.outputMaxScore },
    {
      label: "Inputs",
      value: formula.formulaConfig.inputs
        .map((input) => `${input.label}: max ${input.maxScore}, weight ${input.weight}`)
        .join("; ")
    },
    { label: "Custom config", value: formula.formulaConfig.customConfig ? JSON.stringify(formula.formulaConfig.customConfig) : missingOfficialText },
    { label: "Official source", html: renderDetailLink(formula.officialSourceUrl, "Open source") }
  ]);
}

function renderFormulaSampleResults(sampleResults) {
  if (!sampleResults || sampleResults.length === 0) {
    return `<p class="inline-empty">No sample calculation tests configured.</p>`;
  }

  return `<ol class="admin-audit-list">${sampleResults
    .map((sample) => `<li>
      <strong>${escapeHtml(sample.name)}</strong>
      <span>${sample.passed ? "Passed" : "Failed"}</span>
      <em>Expected ${escapeHtml(sample.expectedTotalScore)} / Actual ${escapeHtml(sample.actualTotalScore ?? "Error")}</em>
      ${sample.error ? `<p>${escapeHtml(sample.error)}</p>` : ""}
    </li>`)
    .join("")}</ol>`;
}

function renderAdminFormulaActions(formula) {
  const encodedId = escapeHtml(encodeURIComponent(formula.id));

  return `<div class="admin-action-row" aria-label="Formula actions">
    <form method="post" action="/admin/formulas/${encodedId}/publish">
      <input type="hidden" name="note" value="Published from formula detail drawer after source link and sample tests were checked.">
      <button class="primary-action" type="submit">Publish formula</button>
    </form>
  </div>`;
}

function renderAdminFormulaCards(formulas) {
  if (formulas.length === 0) {
    return `<p class="empty-state">No formulas match these filters.</p>`;
  }

  return formulas
    .map(({ formula, school, guide, sampleResults }) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(formula.admissionYear)}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(formula.status))}</span>
        <span class="muted-badge">Version ${escapeHtml(formula.version)}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(formula.formulaName)}</h3>
          <p class="section-kicker">${escapeHtml(school.name)} - ${escapeHtml(guide.guideTitle)}</p>
        </div>
        ${renderAdminFormulaActions(formula)}
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Formula configuration">
          <h4>Inputs schema and weights</h4>
          ${renderFormulaInputRows(formula)}
        </section>
        <section class="admin-review-section" aria-label="Formula sample tests">
          <h4>Sample calculation tests</h4>
          ${renderFormulaSampleResults(sampleResults)}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Formula explanation">
        <h4>Explanation</h4>
        <p>${escapeHtml(formula.explanation)}</p>
      </section>
      <section class="admin-review-section" aria-label="Formula audit trail">
        <h4>Formula audit</h4>
        ${renderAdminAuditTrail(formula)}
      </section>
    </article>`)
    .join("");
}

function formulaHasPassingSample(sampleResults = []) {
  return sampleResults.some((sample) => sample.passed);
}

function renderAdminFormulaTable(formulas) {
  return renderAdminTable({
    caption: "Formula management list table",
    headers: ["School", "Year", "Formula", "Status", "Source", "Passing sample", "Updated", "Detail"],
    emptyText: "No formulas match these filters.",
    rows: formulas.map(({ formula, school, sampleResults }) => `<tr>
      <th scope="row">${escapeHtml(school.name)}</th>
      <td>${escapeHtml(formula.admissionYear)}</td>
      <td>${escapeHtml(formula.formulaName)}</td>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(formula.status))}</span></td>
      <td>${formula.officialSourceUrl ? "Official source linked" : "Source required"}</td>
      <td>${escapeHtml(formulaHasPassingSample(sampleResults) ? "Passed" : "Required before publication")}</td>
      <td>${escapeHtml(formatDate(formula.updatedAt))}</td>
      <td><a class="text-link" href="#admin-formula-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminFormulaStudentPreview({ formula, school }) {
  return renderDetailRows([
    { label: "Calculator school", value: school.name },
    { label: "Student formula name", value: formula.formulaName },
    { label: "Student formula explanation", value: formula.explanation },
    { label: "Student availability", value: formula.status === "published" ? "Visible in calculator" : "Hidden until published" }
  ]);
}

function renderAdminFormulaDetailPanel(formulas) {
  const detail = formulas[0];

  if (!detail) {
    return renderAdminPanel({
      id: "admin-formula-detail",
      title: "Formula detail review",
      kicker: "Select a formula after records are available.",
      sections: [
        renderAdminPanelSection("Student-side preview", `<p class="inline-empty">No formula selected.</p>`)
      ]
    });
  }

  const { formula, school, guide, sampleResults } = detail;

  return renderAdminPanel({
    id: "admin-formula-detail",
    title: "Formula detail review",
    kicker: `${school.name} - ${formula.admissionYear} - version ${formula.version}`,
    sections: [
      renderAdminPanelSection("Student-side preview", renderAdminFormulaStudentPreview({ formula, school })),
      renderAdminPanelSection("Formula configuration", renderFormulaInputRows(formula)),
      renderAdminPanelSection("Test sample area", renderFormulaSampleResults(sampleResults)),
      renderAdminPanelSection("Official source and publication gate", renderDetailRows([
        { label: "Guide", value: guide.guideTitle },
        { label: "Official source", html: renderDetailLink(formula.officialSourceUrl, "Open source") },
        { label: "Publication requirement", value: formulaHasPassingSample(sampleResults) ? "At least one sample calculation passed" : "A passing sample calculation is required" }
      ])),
      renderAdminPanelSection("Formula audit", renderAdminAuditTrail(formula))
    ],
    actions: renderAdminFormulaActions(formula)
  });
}

export function renderAdminFormulaManagementPage({ formulas, filters = {}, user }) {
  return renderAdminShell({
    title: `Formula Management | ${productName}`,
    currentKey: "formulas",
    eyebrow: "Formula management",
    heading: "Score formula drafts",
    description: "Create, update, sample-test, and publish score formula records before they appear in the student calculator.",
    user,
    content: `
      <section class="admin-section" aria-label="Formula editor">
        <div class="section-heading">
          <h2>Formula editor</h2>
          <p class="section-kicker">Inputs schema, max scores, weights, source URL, status, and sample tests</p>
        </div>
        ${renderFormulaDraftForm()}
      </section>
      <section class="admin-section" aria-label="Admin formula filters">
        ${renderAdminFormulaFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-formula-results-title">
        <div class="section-heading">
          <h2 id="admin-formula-results-title">${escapeHtml(formulas.length)} ${escapeHtml(pluralize(formulas.length, "formula"))}</h2>
          <p class="section-kicker">Drafts stay hidden until publication has a passing sample test</p>
        </div>
        ${renderAdminFormulaTable(formulas)}
      </section>`,
    detailPanel: renderAdminFormulaDetailPanel(formulas)
  });
}

function defaultIngestionSourcesJson() {
  return JSON.stringify([
    {
      id: "source-official-1",
      sourceUrl: "https://eea.gd.gov.cn/admission/example",
      title: "Guangdong Education Examination Authority comprehensive evaluation notice",
      sourceType: "guangdong_education_exam_authority",
      status: "accepted"
    }
  ], null, 2);
}

function defaultExtractedGuideFieldsJson() {
  return JSON.stringify({
    guideTitle: {
      value: "Example 2026 Guangdong Comprehensive Evaluation Guide",
      sourceDocumentId: "source-official-1",
      confidence: 0.91
    },
    summary: {
      value: "Draft extraction summary for manual data review.",
      sourceDocumentId: "source-official-1",
      confidence: 0.87
    },
    applicationStatus: {
      value: "open",
      manualNote: "Reviewer can adjust after checking official attachments."
    },
    majors: {
      value: [],
      manualNote: "No major list extracted yet."
    }
  }, null, 2);
}

function renderAdminIngestionFilters(filters = {}) {
  const statusOptions = [
    renderOption("", "All run statuses", filters.status ?? ""),
    renderOption("pending", "Pending", filters.status),
    renderOption("running", "Running", filters.status),
    renderOption("succeeded", "Succeeded", filters.status),
    renderOption("failed", "Failed", filters.status)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/ingestion-runs" aria-label="Admin ingestion filters">
    <label class="filter-field">
      <span>Year</span>
      <input name="year" inputmode="numeric" value="${escapeHtml(filters.year ?? "")}" placeholder="2026">
    </label>
    <label class="filter-field">
      <span>School id</span>
      <input name="schoolId" value="${escapeHtml(filters.schoolId ?? "")}" placeholder="Optional school id">
    </label>
    <label class="filter-field">
      <span>Keyword</span>
      <input name="keyword" value="${escapeHtml(filters.keyword ?? "")}" placeholder="Source or field keyword">
    </label>
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/ingestion-runs">Reset</a>
    </div>
  </form>`;
}

function renderIngestionCreateForm() {
  return `<form class="admin-draft-form" id="admin-ingestion-create-form" method="post" action="/admin/ingestion-runs" aria-label="Create ingestion run">
    <div class="admin-form-grid">
      <label class="form-field">
        <span>Year</span>
        <input name="year" inputmode="numeric" placeholder="2026">
      </label>
      <label class="form-field">
        <span>School id</span>
        <input name="schoolId" placeholder="Required for draft creation">
      </label>
      <label class="form-field">
        <span>Keyword</span>
        <input name="keyword" placeholder="School or guide keyword">
      </label>
      <label class="form-field">
        <span>Confidence score</span>
        <input name="confidenceScore" inputmode="decimal" placeholder="0.86">
      </label>
      <label class="form-field admin-wide-field">
        <span>Source document candidates JSON</span>
        <textarea name="sourceDocuments" rows="8">${escapeHtml(defaultIngestionSourcesJson())}</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Extracted guide fields JSON</span>
        <textarea name="extractedGuideFields" rows="10">${escapeHtml(defaultExtractedGuideFieldsJson())}</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Timeline candidates JSON</span>
        <textarea name="timelineCandidates" rows="4">[]</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Formula candidates JSON</span>
        <textarea name="formulaCandidates" rows="4">[]</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Review note</span>
        <textarea name="reviewNote" rows="2" placeholder="Manual checks needed before publishing"></textarea>
      </label>
      <label class="form-field checkbox-field admin-wide-field">
        <input type="checkbox" name="createDraft" value="true" checked>
        <span>Generate guide draft from accepted official source and extracted fields</span>
      </label>
      <div class="form-actions admin-wide-field">
        <button class="primary-action" type="submit">Create run and draft guide</button>
      </div>
    </div>
  </form>`;
}

function renderIngestionSourceDocuments(sourceDocuments) {
  if (sourceDocuments.length === 0) {
    return `<p class="inline-empty">No source document candidates stored.</p>`;
  }

  return `<ol class="admin-audit-list ingestion-source-list">${sourceDocuments
    .map((document) => `<li>
      <strong>${escapeHtml(document.sourcePriority)}. ${escapeHtml(document.title)}</strong>
      <span>${escapeHtml(document.sourcePriorityLabel)} - ${escapeHtml(humanizeToken(document.candidateStatus))}</span>
      <em>${escapeHtml(document.contentHash.slice(0, 12))}</em>
      ${renderDetailRows([
        { label: "Source type", value: humanizeToken(document.sourceType) },
        { label: "Authority role", value: humanizeToken(document.authorityRole) },
        { label: "Fetched", value: formatDate(document.fetchedAt) },
        { label: "Raw text asset", value: document.rawTextAssetUrl },
        { label: "Source URL", html: renderDetailLink(document.sourceUrl, "Open source") }
      ])}
    </li>`)
    .join("")}</ol>`;
}

function traceLabel(trace) {
  if (trace.sourceDocumentId) {
    const note = trace.manualNote ? `; manual note: ${trace.manualNote}` : "";
    return `${trace.sourceTitle ?? trace.sourceDocumentId}${note}`;
  }

  return trace.manualNote ?? missingOfficialText;
}

function renderTraceableFieldRows(fields) {
  const entries = Object.entries(fields);

  if (entries.length === 0) {
    return `<p class="inline-empty">No extracted guide fields stored.</p>`;
  }

  return renderDetailRows(entries.map(([name, field]) => ({
    label: name,
    value: `${JSON.stringify(field.value)} | trace: ${traceLabel(field.trace)}`
  })));
}

function renderTraceableCandidateList(candidates, emptyText) {
  if (candidates.length === 0) {
    return `<p class="inline-empty">${escapeHtml(emptyText)}</p>`;
  }

  return `<ol class="admin-audit-list">${candidates
    .map((candidate) => `<li>
      <strong>${escapeHtml(candidate.eventKey ?? candidate.formulaName ?? candidate.title ?? "Candidate")}</strong>
      <span>${escapeHtml(traceLabel(candidate.trace))}</span>
      <em>${escapeHtml(candidate.confidence ?? "No confidence")}</em>
      <p>${escapeHtml(JSON.stringify(candidate))}</p>
    </li>`)
    .join("")}</ol>`;
}

function renderIngestionRunCards(ingestionRuns) {
  if (ingestionRuns.length === 0) {
    return `<p class="empty-state">No ingestion runs match these filters.</p>`;
  }

  return ingestionRuns
    .map((run) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(run.year ?? "Any year")}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(run.status))}</span>
        <span class="muted-badge">Confidence ${escapeHtml(run.confidenceScore ?? "not set")}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(run.keyword || run.school?.name || "Ingestion run")}</h3>
          <p class="section-kicker">${escapeHtml(run.id)}${run.draftGuide ? ` - draft ${escapeHtml(run.draftGuide.id)}` : ""}</p>
        </div>
        <a class="secondary-action" href="/admin/ingestion-runs/${escapeHtml(encodeURIComponent(run.id))}?format=json">JSON detail</a>
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Source document candidates">
          <h4>Source document candidates</h4>
          ${renderIngestionSourceDocuments(run.sourceDocuments)}
        </section>
        <section class="admin-review-section" aria-label="Traceable extracted guide fields">
          <h4>Extracted guide fields</h4>
          ${renderTraceableFieldRows(run.extractedGuideFields)}
        </section>
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Timeline candidates">
          <h4>Timeline candidates</h4>
          ${renderTraceableCandidateList(run.timelineCandidates, "No timeline candidates stored.")}
        </section>
        <section class="admin-review-section" aria-label="Formula candidates">
          <h4>Formula candidates</h4>
          ${renderTraceableCandidateList(run.formulaCandidates, "No formula candidates stored.")}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Draft-only output">
        <h4>Draft-only output</h4>
        ${run.draftGuide
          ? renderDetailRows([
              { label: "Draft guide", value: run.draftGuide.guideTitle },
              { label: "Draft status", value: humanizeToken(run.draftGuide.status) },
              { label: "Student visibility", value: "Hidden until manual publish" }
            ])
          : `<p class="inline-empty">No guide draft was created for this run.</p>`}
      </section>
    </article>`)
    .join("");
}

function renderIngestionRunTable(ingestionRuns) {
  return renderAdminTable({
    caption: "Data ingestion task list",
    headers: ["Task", "Status", "Sources", "Extraction confidence", "Creator", "Created", "Detail"],
    emptyText: "No ingestion runs match these filters.",
    rows: ingestionRuns.map((run) => `<tr>
      <th scope="row">${escapeHtml(run.keyword || run.school?.name || run.id)}</th>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(run.status))}</span></td>
      <td>${escapeHtml(run.sourceDocuments.length)}</td>
      <td>${escapeHtml(run.confidenceScore ?? "Manual review required")}</td>
      <td>${escapeHtml(run.createdBy?.operatorNickname ?? "Unknown creator")}</td>
      <td>${escapeHtml(formatDate(run.createdAt))}</td>
      <td><a class="text-link" href="#admin-ingestion-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderIngestionManualConfirmationItems(run) {
  const items = Object.entries(run.extractedGuideFields)
    .filter(([, field]) => field.trace?.manualNote || (field.confidence !== null && field.confidence < 0.88))
    .map(([fieldName, field]) => `<li>
      <strong>${escapeHtml(fieldName)}</strong>
      <span>${escapeHtml(field.trace?.manualNote ?? "Low confidence extraction needs reviewer confirmation")}</span>
      <em>Confidence ${escapeHtml(field.confidence ?? "not set")}</em>
    </li>`);

  if (items.length === 0) {
    return `<p class="inline-empty">No manual-confirmation items detected for this run.</p>`;
  }

  return `<ol class="admin-audit-list">${items.join("")}</ol>`;
}

function renderIngestionDraftCreationState(run) {
  return run.draftGuide
    ? renderDetailRows([
        { label: "Draft guide", value: run.draftGuide.guideTitle },
        { label: "Draft status", value: humanizeToken(run.draftGuide.status) },
        { label: "Student visibility", value: "Hidden until manual guide review publishes it" }
      ])
    : `<div class="admin-inline-form">
        <p class="section-kicker">No draft guide is attached. Use the create task form with draft generation enabled after source checks.</p>
        <button class="secondary-action" type="submit" form="admin-ingestion-create-form">Generate guide draft</button>
      </div>`;
}

function renderAdminIngestionDetailPanel(ingestionRuns) {
  const run = ingestionRuns[0];

  if (!run) {
    return renderAdminPanel({
      id: "admin-ingestion-detail",
      title: "Ingestion detail",
      kicker: "Select a run after records are available.",
      sections: [
        renderAdminPanelSection("Source candidates", `<p class="inline-empty">No ingestion run selected.</p>`)
      ]
    });
  }

  return renderAdminPanel({
    id: "admin-ingestion-detail",
    title: "Ingestion detail",
    kicker: `${run.keyword || run.school?.name || run.id} - ${humanizeToken(run.status)}`,
    sections: [
      renderAdminPanelSection("Run status and confidence", renderDetailRows([
        { label: "Status", value: humanizeToken(run.status) },
        { label: "Extraction confidence", value: run.confidenceScore ?? "Manual review required" },
        { label: "Created by", value: run.createdBy?.operatorNickname ?? "Unknown creator" },
        { label: "Created", value: formatDate(run.createdAt) }
      ])),
      renderAdminPanelSection("Source document candidates", renderIngestionSourceDocuments(run.sourceDocuments)),
      renderAdminPanelSection("Traceable extracted guide fields", renderTraceableFieldRows(run.extractedGuideFields)),
      renderAdminPanelSection("Manual-confirmation items", renderIngestionManualConfirmationItems(run)),
      renderAdminPanelSection("Draft-guide creation", renderIngestionDraftCreationState(run))
    ]
  });
}

export function renderAdminIngestionRunPage({ ingestionRuns, filters = {}, user }) {
  return renderAdminShell({
    title: `AI Ingestion | ${productName}`,
    currentKey: "ingestion",
    eyebrow: "AI-assisted official source ingestion",
    heading: "Ingestion draft workflow",
    description: "Store official source candidates, extracted fields, timeline candidates, formula candidates, confidence, and review notes as draft-only review material.",
    user,
    content: `
      <section class="admin-section" aria-label="Create ingestion run">
        <div class="section-heading">
          <h2>Create ingestion run</h2>
          <p class="section-kicker">AI and extraction output can create drafts only; publishing stays in manual guide review</p>
        </div>
        ${renderIngestionCreateForm()}
      </section>
      <section class="admin-section" aria-label="Ingestion filters">
        ${renderAdminIngestionFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-ingestion-results-title">
        <div class="section-heading">
          <h2 id="admin-ingestion-results-title">${escapeHtml(ingestionRuns.length)} ${escapeHtml(pluralize(ingestionRuns.length, "ingestion run"))}</h2>
          <p class="section-kicker">Source priority: GEEA, CHSI/Yangguang Gaokao, university admissions, other official, discovery clues</p>
        </div>
        ${renderIngestionRunTable(ingestionRuns)}
      </section>`,
    detailPanel: renderAdminIngestionDetailPanel(ingestionRuns)
  });
}

function renderAdminModerationWarnings(moderation) {
  const warnings = moderation?.warnings ?? [];

  if (warnings.length === 0) {
    return `<p class="inline-empty">No prohibited-content or privacy warnings detected.</p>`;
  }

  return `<ol class="admin-audit-list">${warnings
    .map((warning) => `<li>
      <strong>${escapeHtml(warning.label)}</strong>
      <span>${escapeHtml(humanizeToken(warning.severity))}</span>
      <em>${escapeHtml(humanizeToken(warning.action))}</em>
      <p>${escapeHtml(warning.message)}</p>
    </li>`)
    .join("")}</ol>`;
}

function renderAdminExperienceFilters(filters = {}) {
  const statusOptions = [
    renderOption("", "Pending review", filters.status ?? ""),
    renderOption("pending_review", "Pending review", filters.status),
    renderOption("published", "Published", filters.status),
    renderOption("returned", "Returned", filters.status),
    renderOption("hidden", "Hidden", filters.status),
    renderOption("banned", "Banned", filters.status)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/experiences" aria-label="Experience moderation filters">
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/experiences">Reset</a>
    </div>
  </form>`;
}

function renderAdminExperienceActions(experience) {
  const encodedId = escapeHtml(encodeURIComponent(experience.id));
  const actions = [
    { action: "approve", label: "Approve", className: "primary-action" },
    { action: "return", label: "Return for rewrite", className: "secondary-action" },
    { action: "hide", label: "Hide", className: "secondary-action" },
    { action: "ban", label: "Limit account", className: "secondary-action" }
  ];

  return `<div class="admin-action-row" aria-label="Experience moderation actions">${actions
    .map((item) => `<form method="post" action="/admin/experiences/${encodedId}/review">
      <input type="hidden" name="action" value="${escapeHtml(item.action)}">
      <input type="hidden" name="note" value="${escapeHtml(item.label)} from review queue">
      <button class="${escapeHtml(item.className)}" type="submit">${escapeHtml(item.label)}</button>
    </form>`)
    .join("")}</div>`;
}

function moderationRiskLabels(moderation) {
  const warnings = moderation?.warnings ?? [];

  if (warnings.length === 0) {
    return "No sensitive risk";
  }

  return warnings.map((warning) => warning.label).join(", ");
}

function renderAdminExperienceTable(experiences) {
  return renderAdminTable({
    caption: "Experience moderation pending queue",
    headers: ["School", "Year", "Stage", "Submitted", "Sensitive risk tags", "Detail"],
    emptyText: "No submitted experiences match this moderation queue.",
    rows: experiences.map((experience) => `<tr>
      <th scope="row">${escapeHtml(experience.school?.name ?? "Submitted experience")}</th>
      <td>${escapeHtml(experience.year)}</td>
      <td>${escapeHtml(humanizeToken(experience.stage))}</td>
      <td>${escapeHtml(formatDate(experience.createdAt))}</td>
      <td>${escapeHtml(moderationRiskLabels(experience.moderation))}</td>
      <td><a class="text-link" href="#admin-experience-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminExperienceStudentPreview(experience) {
  return renderDetailRows([
    { label: "School", value: experience.school?.name ?? missingOfficialText },
    { label: "Year and stage", value: `${experience.year} ${humanizeToken(experience.stage)}` },
    { label: "Assessment format", value: experience.assessmentFormat },
    { label: "Public summary", value: experience.summary },
    { label: "Verification label", value: experience.verificationStatus }
  ]);
}

function renderAdminExperienceDetailPanel(experiences) {
  const experience = experiences[0];

  if (!experience) {
    return renderAdminPanel({
      id: "admin-experience-detail",
      title: "Experience review detail",
      kicker: "Select a pending submission after records are available.",
      sections: [
        renderAdminPanelSection("Student-side preview", `<p class="inline-empty">No submitted experience selected.</p>`)
      ]
    });
  }

  return renderAdminPanel({
    id: "admin-experience-detail",
    title: "Experience review detail",
    kicker: `${experience.school?.name ?? "Submitted experience"} - ${experience.year}`,
    sections: [
      renderAdminPanelSection("Student-side preview", renderAdminExperienceStudentPreview(experience)),
      renderAdminPanelSection("Submitted structured fields", renderDetailRows([
        { label: "Summary", value: experience.summary },
        { label: "Process", value: experience.processSummary },
        { label: "Question types", value: experience.questionTypes.join(", ") },
        { label: "Preparation", value: experience.preparationSummary },
        { label: "Advice", value: experience.advice }
      ])),
      renderAdminPanelSection("Sensitive content and privacy warnings", renderAdminModerationWarnings(experience.moderation)),
      renderAdminPanelSection("Blocked content boundaries", `<p class="section-kicker">Ongoing-exam content, undisclosed original questions, sales, ghostwriting, guaranteed admission claims, external traffic scams, and personal sensitive information must be returned, hidden, or account-limited before publication.</p>`),
      renderAdminPanelSection("Moderation audit", renderAdminAuditTrail({ reviewAudit: experience.reviewAudit }))
    ],
    actions: `<label class="form-field admin-reason-field">
        <span>Reason for return, hide, or account limit</span>
        <textarea rows="2" required placeholder="Explain the rewrite request or risk decision for the audit trail."></textarea>
      </label>
      ${renderAdminExperienceActions(experience)}`
  });
}

function renderAdminExperienceCards(experiences) {
  if (experiences.length === 0) {
    return `<p class="empty-state">No submitted experiences match this moderation queue.</p>`;
  }

  return experiences
    .map((experience) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(experience.year)}</span>
        <span class="soft-badge">${escapeHtml(experience.statusLabel)}</span>
        <span class="muted-badge">${escapeHtml(experience.verificationStatus)}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(experience.school?.name ?? "Submitted experience")}</h3>
          <p class="section-kicker">${escapeHtml(experience.authorNickname)} - ${escapeHtml(experience.assessmentFormat)}</p>
        </div>
        ${renderAdminExperienceActions(experience)}
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Submitted structured experience">
          <h4>Submitted experience</h4>
          ${renderDetailRows([
            { label: "Summary", value: experience.summary },
            { label: "Process", value: experience.processSummary },
            { label: "Question types", value: experience.questionTypes.join(", ") },
            { label: "Preparation", value: experience.preparationSummary },
            { label: "Advice", value: experience.advice }
          ])}
        </section>
        <section class="admin-review-section" aria-label="Moderation warnings">
          <h4>Sensitive content and privacy warnings</h4>
          ${renderAdminModerationWarnings(experience.moderation)}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Experience audit trail">
        <h4>Moderation audit</h4>
        ${renderAdminAuditTrail({ reviewAudit: experience.reviewAudit })}
      </section>
    </article>`)
    .join("");
}

export function renderAdminExperienceModerationPage({ experiences, filters = {}, user }) {
  return renderAdminShell({
    title: `Experience Moderation | ${productName}`,
    currentKey: "experiences",
    eyebrow: "Experience moderation",
    heading: "Experience moderation queue",
    description: "Review pending structured experiences, prohibited-content signals, and privacy warnings before student publication.",
    user,
    content: `
      <section class="admin-section" aria-label="Experience moderation filters">
        ${renderAdminExperienceFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-experience-results-title">
        <div class="section-heading">
          <h2 id="admin-experience-results-title">${escapeHtml(experiences.length)} ${escapeHtml(pluralize(experiences.length, "experience"))} in moderation</h2>
          <p class="section-kicker">Approval is blocked when rewrite-required warnings are present</p>
        </div>
        ${renderAdminExperienceTable(experiences)}
      </section>`,
    detailPanel: renderAdminExperienceDetailPanel(experiences)
  });
}

function renderAdminVerificationFilters(filters = {}) {
  const statusOptions = [
    renderOption("", "Pending review", filters.status ?? ""),
    renderOption("pending_review", "Pending review", filters.status),
    renderOption("verified", "Verified", filters.status),
    renderOption("rejected", "Rejected", filters.status),
    renderOption("returned", "Returned", filters.status)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/verifications" aria-label="Verification review filters">
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/verifications">Reset</a>
    </div>
  </form>`;
}

function renderAdminVerificationActions(material) {
  const encodedId = escapeHtml(encodeURIComponent(material.id));
  const actions = [
    { action: "approve", label: "Approve material", className: "primary-action" },
    { action: "reject", label: "Reject material", className: "secondary-action" },
    { action: "return", label: "Return material", className: "secondary-action" }
  ];

  return `<div class="admin-action-row" aria-label="Verification review actions">${actions
    .map((item) => `<form method="post" action="/admin/verifications/${encodedId}/review">
      <input type="hidden" name="action" value="${escapeHtml(item.action)}">
      <input type="hidden" name="note" value="${escapeHtml(item.label)} from verification queue">
      <button class="${escapeHtml(item.className)}" type="submit">${escapeHtml(item.label)}</button>
    </form>`)
    .join("")}</div>`;
}

function renderAdminVerificationCards(verifications) {
  if (verifications.length === 0) {
    return `<p class="empty-state">No verification materials match this review queue.</p>`;
  }

  return verifications
    .map(({ material, experience, moderation }) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(experience.year)}</span>
        <span class="soft-badge">${escapeHtml(material.status)}</span>
        <span class="muted-badge">${material.storageKeyPresent ? "Private file stored" : "Metadata only"}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(material.materialType)}</h3>
          <p class="section-kicker">${escapeHtml(experience.school?.name ?? "Submitted experience")} - ${escapeHtml(experience.authorNickname)}</p>
        </div>
        ${renderAdminVerificationActions(material)}
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Verification material metadata">
          <h4>Verification material metadata</h4>
          ${renderDetailRows([
            { label: "Material id", value: material.id },
            { label: "Experience id", value: material.experienceId },
            { label: "Storage file", value: material.storageKeyPresent ? "Reviewer-only private storage reference present" : "No private storage reference" },
            { label: "Metadata", value: Object.keys(material.metadata).length > 0 ? JSON.stringify(material.metadata) : missingOfficialText }
          ])}
        </section>
        <section class="admin-review-section" aria-label="Verification privacy warnings">
          <h4>Privacy warning results</h4>
          ${renderAdminModerationWarnings(moderation)}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Verification audit trail">
        <h4>Verification audit</h4>
        ${renderAdminAuditTrail({ reviewAudit: material.reviewAudit })}
      </section>
    </article>`)
    .join("");
}

function renderAdminVerificationTable(verifications) {
  return renderAdminTable({
    caption: "Verification material queue table",
    headers: ["Material", "School", "Experience year", "Status", "Backend material", "Detail"],
    emptyText: "No verification materials match this review queue.",
    rows: verifications.map(({ material, experience }) => `<tr>
      <th scope="row">${escapeHtml(material.materialType)}</th>
      <td>${escapeHtml(experience.school?.name ?? "Submitted experience")}</td>
      <td>${escapeHtml(experience.year)}</td>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(material.status))}</span></td>
      <td>${escapeHtml(material.storageKeyPresent ? "Raw material backend-only" : "Metadata only")}</td>
      <td><a class="text-link" href="#admin-verification-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminVerificationDetailPanel(verifications) {
  const review = verifications[0];

  if (!review) {
    return renderAdminPanel({
      id: "admin-verification-detail",
      title: "Verification review detail",
      kicker: "Select a material after records are available.",
      sections: [
        renderAdminPanelSection("Student-side verification label preview", `<p class="inline-empty">No verification material selected.</p>`)
      ]
    });
  }

  const { material, experience, moderation } = review;

  return renderAdminPanel({
    id: "admin-verification-detail",
    title: "Verification review detail",
    kicker: `${material.materialType} - ${experience.school?.name ?? "Submitted experience"}`,
    sections: [
      renderAdminPanelSection("Student-side verification label preview", renderDetailRows([
        { label: "Public label only", value: material.status === "verified" ? "Verified" : "Verification pending" },
        { label: "Student material visibility", value: "Raw materials are never shown on student pages" }
      ])),
      renderAdminPanelSection("Backend-only material preview", renderDetailRows([
        { label: "Material id", value: material.id },
        { label: "Experience id", value: material.experienceId },
        { label: "Raw material", value: material.storageKeyPresent ? "Reviewer-only private storage reference present" : "No private storage reference" },
        { label: "Metadata", value: Object.keys(material.metadata).length > 0 ? JSON.stringify(material.metadata) : missingOfficialText }
      ])),
      renderAdminPanelSection("Associated experience", renderAdminExperienceStudentPreview(experience)),
      renderAdminPanelSection("Privacy warning results", renderAdminModerationWarnings(moderation)),
      renderAdminPanelSection("Verification audit", renderAdminAuditTrail({ reviewAudit: material.reviewAudit }))
    ],
    actions: `<label class="form-field admin-reason-field">
        <span>Reason required when refusing verification</span>
        <textarea rows="2" required placeholder="Explain why the verification material is rejected or returned."></textarea>
      </label>
      ${renderAdminVerificationActions(material)}`
  });
}

export function renderAdminVerificationReviewPage({ verifications, filters = {}, user }) {
  return renderAdminShell({
    title: `Verification Review | ${productName}`,
    currentKey: "verifications",
    eyebrow: "Verification review",
    heading: "Verification material queue",
    description: "Review verification material metadata and privacy warnings without exposing raw material URLs to student pages.",
    user,
    content: `
      <section class="admin-section" aria-label="Verification filters">
        ${renderAdminVerificationFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-verification-results-title">
        <div class="section-heading">
          <h2 id="admin-verification-results-title">${escapeHtml(verifications.length)} ${escapeHtml(pluralize(verifications.length, "material"))} in verification review</h2>
          <p class="section-kicker">Student routes only receive material count and status</p>
        </div>
        ${renderAdminVerificationTable(verifications)}
      </section>`,
    detailPanel: renderAdminVerificationDetailPanel(verifications)
  });
}

function renderAdminReportFilters(filters = {}) {
  const statusOptions = [
    renderOption("pending", "Pending", filters.status ?? "pending"),
    renderOption("resolved", "Resolved", filters.status)
  ].join("");
  const targetOptions = [
    renderOption("", "Any target", filters.targetType ?? ""),
    renderOption("experience", "Experience", filters.targetType),
    renderOption("user", "User", filters.targetType)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/reports" aria-label="Report review filters">
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <label class="filter-field">
      <span>Target type</span>
      <select name="targetType">${targetOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/reports">Reset</a>
    </div>
  </form>`;
}

function renderAdminReportActions(report) {
  const encodedId = escapeHtml(encodeURIComponent(report.id));
  const actions = [
    { action: "keep", label: "Keep target", className: "secondary-action" },
    { action: "hide", label: "Hide target", className: "secondary-action" },
    { action: "delete", label: "Delete target", className: "secondary-action" },
    { action: "limit_account", label: "Limit account", className: "primary-action" },
    { action: "reject", label: "Reject report", className: "secondary-action" }
  ];

  return `<div class="admin-action-row" aria-label="Report resolution actions">${actions
    .map((item) => `<form method="post" action="/admin/reports/${encodedId}/resolve">
      <input type="hidden" name="action" value="${escapeHtml(item.action)}">
      <input type="hidden" name="resolutionNote" value="${escapeHtml(item.label)} after report review">
      <button class="${escapeHtml(item.className)}" type="submit">${escapeHtml(item.label)}</button>
    </form>`)
    .join("")}</div>`;
}

function renderReportTargetSummary(report) {
  if (report.targetType === "experience") {
    const experience = report.target.experience;
    return experience
      ? `${experience.school?.name ?? "Published experience"} - ${experience.summary}`
      : "Experience is no longer student-visible";
  }

  return report.target.user
    ? `${report.target.user.nickname} (${report.target.user.accountStatus})`
    : "User is no longer available";
}

function renderAdminReportCards(reports) {
  if (reports.length === 0) {
    return `<p class="empty-state">No reports match this queue.</p>`;
  }

  return reports
    .map((report) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(humanizeToken(report.targetType))}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(report.status))}</span>
        <span class="muted-badge">${escapeHtml(formatDate(report.createdAt))}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(report.reason)}</h3>
          <p class="section-kicker">${escapeHtml(renderReportTargetSummary(report))}</p>
        </div>
        ${renderAdminReportActions(report)}
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Report details">
          <h4>Report details</h4>
          ${renderDetailRows([
            { label: "Report id", value: report.id },
            { label: "Target id", value: report.targetId },
            { label: "Description", value: displayValue(report.description) }
          ])}
        </section>
        <section class="admin-review-section" aria-label="Resolution">
          <h4>Resolution</h4>
          ${report.resolution
            ? renderDetailRows([
                { label: "Action", value: humanizeToken(report.resolution.action) },
                { label: "Note", value: report.resolution.note },
                { label: "Operator", value: report.resolution.operatorNickname },
                { label: "Resolved", value: formatDate(report.resolution.resolvedAt) }
              ])
            : `<p class="inline-empty">No resolution recorded.</p>`}
        </section>
      </div>
    </article>`)
    .join("");
}

function renderAdminReportTable(reports) {
  return renderAdminTable({
    caption: "Report handling list table",
    headers: ["Reason", "Target", "Status", "Created", "History", "Detail"],
    emptyText: "No reports match this queue.",
    rows: reports.map((report) => `<tr>
      <th scope="row">${escapeHtml(report.reason)}</th>
      <td>${escapeHtml(humanizeToken(report.targetType))}</td>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(report.status))}</span></td>
      <td>${escapeHtml(formatDate(report.createdAt))}</td>
      <td>${escapeHtml(report.resolution ? `${humanizeToken(report.resolution.action)} by ${report.resolution.operatorNickname}` : "No resolution recorded")}</td>
      <td><a class="text-link" href="#admin-report-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminReportHistory(report) {
  if (!report.resolution) {
    return `<p class="inline-empty">No resolution recorded.</p>`;
  }

  return renderDetailRows([
    { label: "Action", value: humanizeToken(report.resolution.action) },
    { label: "Note", value: report.resolution.note },
    { label: "Operator", value: report.resolution.operatorNickname },
    { label: "Operation time", value: formatDate(report.resolution.resolvedAt) }
  ]);
}

function renderAdminReportDetailPanel(reports) {
  const report = reports[0];

  if (!report) {
    return renderAdminPanel({
      id: "admin-report-detail",
      title: "Report handling detail",
      kicker: "Select a report after records are available.",
      sections: [
        renderAdminPanelSection("Target preview", `<p class="inline-empty">No report selected.</p>`)
      ]
    });
  }

  return renderAdminPanel({
    id: "admin-report-detail",
    title: "Report handling detail",
    kicker: `${humanizeToken(report.targetType)} report - ${humanizeToken(report.status)}`,
    sections: [
      renderAdminPanelSection("Target preview", renderDetailRows([
        { label: "Target summary", value: renderReportTargetSummary(report) },
        { label: "Target id", value: report.targetId },
        { label: "Target visibility", value: report.target?.visible ? "Currently visible" : "Not student-visible" }
      ])),
      renderAdminPanelSection("Report reason", renderDetailRows([
        { label: "Reason", value: report.reason },
        { label: "Description", value: displayValue(report.description) },
        { label: "Created", value: formatDate(report.createdAt) }
      ])),
      renderAdminPanelSection("History and operator record", renderAdminReportHistory(report))
    ],
    actions: `<label class="form-field admin-reason-field">
        <span>Resolution reason</span>
        <textarea rows="2" required placeholder="Record why the report is kept, rejected, hidden, deleted, or account-limited."></textarea>
      </label>
      ${renderAdminReportActions(report)}`
  });
}

export function renderAdminReportReviewPage({ reports, filters = {}, user }) {
  return renderAdminShell({
    title: `Report Review | ${productName}`,
    currentKey: "reports",
    eyebrow: "Report handling",
    heading: "Report resolution queue",
    description: "Resolve reports by keeping, rejecting, hiding, deleting, or limiting the target account with an audited note.",
    user,
    content: `
      <section class="admin-section" aria-label="Report filters">
        ${renderAdminReportFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-report-results-title">
        <div class="section-heading">
          <h2 id="admin-report-results-title">${escapeHtml(reports.length)} ${escapeHtml(pluralize(reports.length, "report"))} awaiting handling</h2>
          <p class="section-kicker">Resolution notes are required for every report action</p>
        </div>
        ${renderAdminReportTable(reports)}
      </section>`,
    detailPanel: renderAdminReportDetailPanel(reports)
  });
}

function renderPersonalSummary(personalCenter) {
  const items = [
    {
      label: "Nickname",
      value: personalCenter.user.nickname,
      detail: gradeLabel(personalCenter.user.grade)
    },
    {
      label: "Default anonymous preference",
      value: personalCenter.preferences.defaultAnonymous ? "Anonymous by default" : "Show nickname by default",
      detail: "Used for new experience submissions"
    },
    {
      label: "School favorites",
      value: personalCenter.favorites.schools.length,
      detail: "Saved schools"
    },
    {
      label: "Experience favorites",
      value: personalCenter.favorites.experiences.length,
      detail: "Saved experiences"
    },
    {
      label: "Submissions",
      value: personalCenter.submittedExperiences.length,
      detail: "Review-status tracking"
    },
    {
      label: "Site reminders",
      value: personalCenter.notifications.length,
      detail: "Personal-center only"
    }
  ];

  return `<div class="personal-summary">${items
    .map((item) => `<div class="status-item">
      <span class="status-label">${escapeHtml(item.label)}</span>
      <strong class="status-value">${escapeHtml(item.value)}</strong>
      <span class="status-note">${escapeHtml(item.detail)}</span>
    </div>`)
    .join("")}</div>`;
}

function renderFavoriteSchoolCards(favorites) {
  if (favorites.length === 0) {
    return `<p class="empty-state">No favorited schools yet.</p>`;
  }

  return favorites
    .map((favorite) => {
      const school = favorite.school;
      const guide = favorite.guide;
      const schoolHref = school
        ? `/schools/${escapeHtml(encodeURIComponent(school.id))}${guide ? `?year=${escapeHtml(guide.year)}` : ""}`
        : "/schools";

      return `<article class="personal-card">
        <div class="badge-row">
          <span class="badge">${escapeHtml(guide?.year ?? "School")}</span>
          <span class="soft-badge">${escapeHtml(humanizeToken(favorite.visibility))}</span>
        </div>
        <h3><a href="${schoolHref}">${escapeHtml(school?.name ?? "Unavailable school")}</a></h3>
        ${renderDetailRows([
          { label: "City", value: displayValue(school?.city) },
          { label: "School type", value: school ? humanizeToken(school.schoolType) : missingOfficialText },
          { label: "Application status", value: guide ? humanizeToken(guide.applicationStatus) : missingOfficialText },
          { label: "Application deadline", value: guide ? formatDate(guide.applicationDeadlineAt) : missingOfficialText }
        ])}
      </article>`;
    })
    .join("");
}

function renderFavoriteExperienceCards(favorites) {
  if (favorites.length === 0) {
    return `<p class="empty-state">No favorited experiences yet.</p>`;
  }

  return favorites
    .map((favorite) => {
      const experience = favorite.experience;
      const school = experience?.school;

      return `<article class="personal-card">
        <div class="badge-row">
          <span class="badge">${escapeHtml(experience?.year ?? "Experience")}</span>
          <span class="soft-badge">${escapeHtml(experience?.verifiedLabel ?? humanizeToken(favorite.visibility))}</span>
        </div>
        <h3>${escapeHtml(school?.name ?? "Unavailable experience")}</h3>
        <p>${escapeHtml(experience?.summary ?? "This experience is no longer visible on the student side.")}</p>
        ${renderDetailRows([
          { label: "Stage", value: experience ? experience.stageLabel : missingOfficialText },
          { label: "Assessment format", value: experience ? experience.assessmentFormat : missingOfficialText },
          { label: "Useful count", value: experience ? experience.usefulCount : missingOfficialText }
        ])}
      </article>`;
    })
    .join("");
}

function renderNotificationCards(notifications) {
  if (notifications.length === 0) {
    return `<p class="empty-state">No site reminders for favorited schools or submitted experiences right now.</p>`;
  }

  return notifications
    .map((notification) => {
      if (notification.type === "submission_review") {
        return `<article class="personal-card">
      <div class="badge-row">
        <span class="site-badge">Site-only</span>
        <span class="status-badge status-${escapeHtml(notification.status)}">${escapeHtml(notification.statusLabel)}</span>
      </div>
      <h3>${escapeHtml(notification.title)}</h3>
      ${renderDetailRows([
        { label: "School", value: notification.school?.name ?? "Published school" },
        { label: "Submission year", value: notification.year },
        { label: "Next action", value: notification.nextAction?.label ?? "Check the submitted experience group." }
      ])}
    </article>`;
      }

      return `<article class="personal-card">
      <div class="badge-row">
        <span class="site-badge">Site-only</span>
        <span class="status-badge status-${escapeHtml(notification.status)}">${escapeHtml(notification.statusLabel)}</span>
      </div>
      <h3>${escapeHtml(notification.title)}</h3>
      ${renderDetailRows([
        { label: "School", value: notification.school?.name ?? "Published school" },
        { label: "Timeline node", value: humanizeToken(notification.eventKey) },
        { label: "Due", value: formatDate(notification.dueAt) }
      ])}
    </article>`;
    })
    .join("");
}

function renderSubmissionAction(action) {
  if (!action?.label) {
    return missingOfficialText;
  }

  if (action.href) {
    return `<a class="text-link" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`;
  }

  return escapeHtml(action.label);
}

function renderSubmittedExperienceCard(experience) {
  return `<article class="personal-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(experience.year)}</span>
        <span class="soft-badge">${escapeHtml(experience.statusLabel)}</span>
        <span class="muted-badge">${escapeHtml(experience.verification.statusLabel)}</span>
      </div>
      <h3>${escapeHtml(experience.school?.name ?? "Published school")}</h3>
      <p>${escapeHtml(experience.summary)}</p>
      ${renderDetailRows([
        { label: "Stage", value: humanizeToken(experience.stage) },
        { label: "Assessment format", value: experience.assessmentTypes.map(humanizeToken).join(", ") },
        { label: "Review status", value: experience.statusLabel },
        { label: "Display", value: experience.author.displayName ?? experience.author.nickname },
        { label: "Next action", html: renderSubmissionAction(experience.nextAction) }
      ])}
    </article>`;
}

function renderSubmittedExperienceGroups(personalCenter) {
  const experiences = personalCenter.submittedExperiences;

  if (experiences.length === 0) {
    return `<p class="empty-state">No submitted experiences yet.</p>`;
  }

  const groups = Array.isArray(personalCenter.submittedExperienceGroups) && personalCenter.submittedExperienceGroups.length > 0
    ? personalCenter.submittedExperienceGroups
    : [
        {
          key: "submitted",
          label: "Submitted",
          nextAction: "Check the latest review status.",
          experiences: personalCenter.submittedExperiences
        }
      ];

  return groups
    .map((group) => `<section class="submission-group" aria-labelledby="submission-group-${escapeHtml(group.key)}">
      <div class="submission-group-heading">
        <div>
          <h3 id="submission-group-${escapeHtml(group.key)}">${escapeHtml(group.label)}</h3>
          <p>${escapeHtml(group.nextAction)}</p>
        </div>
        <span class="muted-badge">${escapeHtml(group.experiences.length)} ${escapeHtml(pluralize(group.experiences.length, "item"))}</span>
      </div>
      <div class="personal-list">${group.experiences.map(renderSubmittedExperienceCard).join("")}</div>
    </section>`)
    .join("");
}

function renderPreferenceForm(personalCenter, feedback) {
  const preferences = personalCenter.preferences;
  const gradeOptions = Object.entries(gradeLabels)
    .map(([value, label]) => renderOption(value, label, preferences.grade))
    .join("");
  const anonymousOptions = [
    renderOption("true", "Anonymous by default", preferences.defaultAnonymous ? "true" : "false"),
    renderOption("false", "Show nickname by default", preferences.defaultAnonymous ? "true" : "false")
  ].join("");

  return `<div class="preference-stack">
  <form class="preference-form" method="post" action="/me/preferences" aria-label="Account preferences">
    ${renderPersonalFeedback(feedback)}
    <label class="form-field">
      <span>Nickname</span>
      <input name="nickname" value="${escapeHtml(preferences.nickname)}" autocomplete="nickname" required>
    </label>
    <label class="form-field">
      <span>Grade</span>
      <select name="grade" required>${gradeOptions}</select>
    </label>
    <label class="form-field">
      <span>Default anonymous preference</span>
      <select name="defaultAnonymous" required>${anonymousOptions}</select>
    </label>
    <div class="form-actions">
      <button class="primary-action" type="submit">Update preferences</button>
    </div>
  </form>
  <form class="preference-form logout-form" method="post" action="/logout" aria-label="Logout">
    <input type="hidden" name="returnTo" value="/me">
    <button class="secondary-action" type="submit" data-clear-experience-drafts="true">Logout</button>
  </form>
  </div>`;
}

export function renderPersonalCenterLoginGuidePage({ returnTo = "/me" } = {}) {
  return renderStudentPage({
    title: `My | ${productName}`,
    currentKey: "me",
    topBar: renderStudentTopBar({
      type: "list",
      title: "My"
    }),
    content: `
      <section class="page-heading" aria-labelledby="personal-login-title">
        <p class="eyebrow">Personal center</p>
        <h1 id="personal-login-title">My</h1>
        <p class="lead">Log in when you are ready to keep student-owned admissions work in one place.</p>
      </section>

      <section class="section" aria-label="Login guide">
        <article class="personal-login-guide">
          <div class="login-heading">
            <p class="eyebrow">Login guide</p>
            <h2>Log in to use My page</h2>
            <p>Login enables school favorites, experience publishing, and review-status tracking.</p>
          </div>
          <div class="form-actions">
            <a class="primary-action" href="/login?returnTo=${escapeHtml(encodeURIComponent(safeReturnHref(returnTo)))}">Login</a>
          </div>
          <ul class="tip-list">
            <li>Save Guangdong comprehensive evaluation schools for a personal timeline.</li>
            <li>Publish structured experiences after reviewer approval.</li>
            <li>Check submitted experience review status from this page.</li>
          </ul>
        </article>
      </section>`
  });
}

export function renderPersonalCenterPage({ personalCenter, notice = "", error = "" }) {
  return renderStudentPage({
    title: `Personal Center | ${productName}`,
    currentKey: "me",
    topBar: renderStudentTopBar({
      type: "list",
      title: "My"
    }),
    content: `
      <section class="page-heading" aria-labelledby="personal-center-title">
        <p class="eyebrow">Logged-in workspace</p>
        <h1 id="personal-center-title">Personal center</h1>
        <p class="lead">Review saved admissions content, submitted experiences, site reminders, and account preferences.</p>
      </section>

      <section class="section" aria-label="Personal summary">
        ${renderPersonalSummary(personalCenter)}
      </section>

      <section class="section personal-grid" aria-label="Personal center content">
        <div class="personal-panel">
          <div class="section-heading">
            <h2>Site reminders</h2>
            <p class="section-kicker">${escapeHtml(personalCenter.notifications.length)} site-only ${escapeHtml(pluralize(personalCenter.notifications.length, "reminder"))}</p>
          </div>
          <div class="personal-list">${renderNotificationCards(personalCenter.notifications)}</div>
        </div>

        <div class="personal-panel">
          <div class="section-heading">
            <h2>Account preferences</h2>
            <p class="section-kicker">${escapeHtml(gradeLabel(personalCenter.preferences.grade))}</p>
          </div>
          ${renderPreferenceForm(personalCenter, { notice, error })}
        </div>
      </section>

      <section class="section personal-grid" aria-label="Favorites and submissions">
        <div class="personal-panel">
          <div class="section-heading">
            <h2>Favorited schools</h2>
            <p class="section-kicker">${escapeHtml(personalCenter.favorites.schools.length)} saved ${escapeHtml(pluralize(personalCenter.favorites.schools.length, "school"))}</p>
          </div>
          <div class="personal-list">${renderFavoriteSchoolCards(personalCenter.favorites.schools)}</div>
        </div>

        <div class="personal-panel">
          <div class="section-heading">
            <h2>Favorited experiences</h2>
            <p class="section-kicker">${escapeHtml(personalCenter.favorites.experiences.length)} saved ${escapeHtml(pluralize(personalCenter.favorites.experiences.length, "experience"))}</p>
          </div>
          <div class="personal-list">${renderFavoriteExperienceCards(personalCenter.favorites.experiences)}</div>
        </div>
      </section>

      <section class="section" aria-labelledby="submitted-experiences-title">
        <div class="section-heading">
          <h2 id="submitted-experiences-title">Submitted experiences</h2>
          <p class="section-kicker">${escapeHtml(personalCenter.submittedExperiences.length)} user-owned ${escapeHtml(pluralize(personalCenter.submittedExperiences.length, "submission"))}</p>
        </div>
        <div class="personal-list submitted-list">${renderSubmittedExperienceGroups(personalCenter)}</div>
      </section>`
  });
}

const homeTaskEntries = Object.freeze([
  {
    title: "Schools",
    label: "Browse schools",
    href: "/schools",
    icon: "school"
  },
  {
    title: "Timeline",
    label: "Key dates",
    href: "/timeline",
    icon: "calendar"
  },
  {
    title: "Score Calculator",
    label: "Calculate score",
    href: "/calculator",
    icon: "calculator"
  },
  {
    title: "Experiences",
    label: "Read stories",
    href: "/experiences",
    icon: "experience"
  }
]);

const gradePreparationTips = Object.freeze({
  high_school_g1: [
    "Understand the comprehensive evaluation path.",
    "Watch subject choices and school scope.",
    "Start saving material examples."
  ],
  high_school_g2: [
    "Check academic test and subject requirements.",
    "Compare target school guide changes.",
    "Track assessment formats before application year."
  ],
  high_school_g3: [
    "Watch current guide releases.",
    "Keep deadline and confirmation dates visible.",
    "Prepare school assessment examples."
  ],
  graduated: [
    "Use current guides as official reference.",
    "Check school-year changes before acting.",
    "Read experiences by year and stage."
  ]
});

function normalizeHomeGrade(grade) {
  return Object.hasOwn(gradeLabels, grade) ? grade : "high_school_g3";
}

function homeReferenceDate(now) {
  if (typeof now !== "function") {
    return new Date();
  }

  const value = now();
  return value instanceof Date ? value : new Date(value);
}

function renderHomeTasks() {
  return homeTaskEntries
    .map((entry) => `<a class="home-task-card" href="${escapeHtml(entry.href)}">
      <span class="home-task-icon">${renderIcon(entry.icon)}</span>
      <strong>${escapeHtml(entry.title)}</strong>
      <span>${escapeHtml(entry.label)}</span>
    </a>`)
    .join("");
}

function nearestHomeTimelineNodes({ user, interactionStore, year, now, nodesOverride = null }) {
  if (Array.isArray(nodesOverride)) {
    return {
      favoriteScoped: false,
      nodes: nearestImportantEvents(nodesOverride, homeReferenceDate(now))
    };
  }

  const favoriteSchoolIds = user && typeof interactionStore?.listFavoriteSchoolIds === "function"
    ? interactionStore.listFavoriteSchoolIds(user.id)
    : [];
  const favoriteScoped = favoriteSchoolIds.length > 0;
  const nodes = listTimelineNodes({
    year,
    schoolIds: favoriteScoped ? favoriteSchoolIds : [],
    referenceDate: homeReferenceDate(now)
  });

  return {
    favoriteScoped,
    nodes: nearestImportantEvents(nodes, homeReferenceDate(now))
  };
}

function renderHomeTimelineRows(nodes) {
  if (nodes.length === 0) {
    return `<p class="empty-state">No clear timeline nodes yet. We will update when published.</p>`;
  }

  return nodes
    .slice(0, 3)
    .map((node) => {
      const school = node.school ?? getSchoolById(node.schoolId);

      return `<article class="home-list-row" data-home-timeline-row="true">
        <div>
          <span class="row-label">${escapeHtml(school?.name ?? "Published school")}</span>
          <strong>${escapeHtml(node.title)}</strong>
        </div>
        <div class="row-side">
          <span>${escapeHtml(formatTimelineWindow(node))}</span>
          <em>${escapeHtml(humanizeToken(node.status ?? "not_started"))}</em>
        </div>
      </article>`;
    })
    .join("");
}

function renderHomeGuideRows(guides) {
  if (guides.length === 0) {
    return `<p class="empty-state">Current-year guides are not published yet. Start with previous official rules.</p>`;
  }

  return guides
    .slice(0, 3)
    .map((guide) => `<a class="home-list-row" href="/schools/${escapeHtml(encodeURIComponent(guide.schoolId))}?year=${escapeHtml(guide.admissionYear)}" data-home-guide-row="true">
      <div>
        <span class="row-label">${escapeHtml(schoolNameFor(guide))}</span>
        <strong>${escapeHtml(guide.admissionYear)} ${escapeHtml(humanizeToken(guide.status))}</strong>
      </div>
      <div class="row-side">
        <span>Deadline ${escapeHtml(formatDate(guide.applicationDeadlineAt))}</span>
        <em>${escapeHtml(humanizeToken(guide.sourceType ?? "official_source"))}</em>
      </div>
    </a>`)
    .join("");
}

function renderHomeExperienceRows(experiences) {
  if (experiences.length === 0) {
    return `<p class="empty-state">No published experiences yet. Check school guides first.</p>`;
  }

  return experiences
    .slice(0, 3)
    .map((experience) => {
      const school = getSchoolById(experience.schoolId);
      const assessmentFormat = experience.assessmentTypes.map(humanizeToken).join(", ");

      return `<a class="home-list-row" href="/schools/${escapeHtml(encodeURIComponent(experience.schoolId))}?year=${escapeHtml(experience.admissionYear)}" data-home-experience-row="true">
        <div>
          <span class="row-label">${escapeHtml(school?.name ?? "Published school")}</span>
          <strong>${escapeHtml(experience.admissionYear)} ${escapeHtml(humanizeToken(experience.stage))}</strong>
        </div>
        <div class="row-side">
          <span>${escapeHtml(assessmentFormat)}</span>
          <em>${escapeHtml(experienceVerifiedLabel(experience))}</em>
        </div>
      </a>`;
    })
    .join("");
}

function renderGradeTips(grade) {
  return gradePreparationTips[grade]
    .map((tip) => `<li>${escapeHtml(tip)}</li>`)
    .join("");
}

export function renderStudentHome({
  user = null,
  interactionStore = null,
  now,
  grade,
  homeData = {}
} = {}) {
  const guides = Array.isArray(homeData.guides) ? homeData.guides : listGuides();
  const currentYear = currentAdmissionYear(guides);
  const selectedGrade = normalizeHomeGrade(grade ?? user?.grade);
  const timeline = nearestHomeTimelineNodes({
    user,
    interactionStore,
    year: currentYear,
    now,
    nodesOverride: homeData.timelineNodes
  });
  const latestGuides = guides.slice(0, 3);
  const latestExperiences = (
    Array.isArray(homeData.experiences) ? homeData.experiences : listExperiences({ sort: "newest" })
  ).slice(0, 3);
  const timelineSource = timeline.favoriteScoped ? "Favorited schools" : "Site-wide published nodes";
  const guestPrompt = !user
    ? `<p class="login-prompt">Log in to favorite schools and view your personal timeline.</p>`
    : "";

  return renderStudentPage({
    title: productName,
    currentKey: "home",
    topBar: renderStudentTopBar({
      type: "home",
      title: productName,
      actionHtml: renderGradeSwitch(selectedGrade)
    }),
    content: `
      <section class="home-first-screen" aria-labelledby="home-title">
        <article class="home-greeting-card">
          <p class="eyebrow">${escapeHtml(gradeLabel(selectedGrade))}</p>
          <h1 id="home-title">Guangdong Comprehensive Evaluation</h1>
          <p>Use your grade to move quickly between schools, dates, score tools, and structured experiences.</p>
        </article>

        <nav class="home-task-grid" aria-label="Core student tasks">
          ${renderHomeTasks()}
        </nav>

        <section class="home-panel" aria-labelledby="nearest-nodes-title">
          <div class="section-heading">
            <h2 id="nearest-nodes-title">Nearest timeline nodes</h2>
            <p class="section-kicker">${escapeHtml(timelineSource)}</p>
          </div>
          <div class="home-list">${renderHomeTimelineRows(timeline.nodes)}</div>
          ${guestPrompt}
        </section>
      </section>

      <section class="section home-panel" aria-labelledby="latest-guides-title">
        <div class="section-heading">
          <h2 id="latest-guides-title">Latest guides</h2>
          <a class="text-link" href="/schools">All schools</a>
        </div>
        <div class="home-list">${renderHomeGuideRows(latestGuides)}</div>
      </section>

      <section class="section home-panel" aria-labelledby="latest-experiences-title">
        <div class="section-heading">
          <h2 id="latest-experiences-title">Latest experiences</h2>
          <a class="text-link" href="/experiences">All experiences</a>
        </div>
        <div class="home-list">${renderHomeExperienceRows(latestExperiences)}</div>
      </section>

      <section class="section home-panel" aria-labelledby="grade-tips-title">
        <div class="section-heading">
          <h2 id="grade-tips-title">Grade preparation tips</h2>
          <p class="section-kicker">${escapeHtml(gradeLabel(selectedGrade))}</p>
        </div>
        <ul class="tip-list">${renderGradeTips(selectedGrade)}</ul>
      </section>
`
  });
}

function safeReturnHref(returnTo) {
  return typeof returnTo === "string" &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//")
    ? returnTo
    : "/";
}

export function renderLoginPage({
  returnTo = "/",
  pendingAction = "",
  phoneNumber = "",
  otpCode = "",
  agreement = false,
  error = "",
  notice = ""
} = {}) {
  const checked = agreement ? " checked" : "";
  const disabled = agreement ? "" : " disabled";

  return renderStudentPage({
    title: `Login | ${productName}`,
    hideBottomNav: true,
    topBar: renderStudentTopBar({
      type: "form",
      title: "Login",
      backHref: safeReturnHref(returnTo),
      backLabel: "Back"
    }),
    content: `
      <section class="login-card" aria-labelledby="login-title">
        <div class="login-heading">
          <p class="eyebrow">Phone OTP</p>
          <h1 id="login-title">Login Guangdong CE</h1>
          <p>Log in to favorite schools, publish experiences, and track review status.</p>
        </div>

        ${notice ? `<p class="form-success" role="status">${escapeHtml(notice)}</p>` : ""}
        ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ""}

        <form class="login-form" method="post" action="/login" data-login-form="true" aria-label="Phone OTP login">
          <input type="hidden" name="returnTo" value="${escapeHtml(safeReturnHref(returnTo))}">
          <input type="hidden" name="pendingAction" value="${escapeHtml(pendingAction)}">

          <label class="form-field">
            <span>Mainland China phone</span>
            <input
              name="phoneNumber"
              type="tel"
              inputmode="numeric"
              autocomplete="tel"
              placeholder="13812345678"
              pattern="^(?:\\+?86)?1[3-9]\\d{9}$"
              value="${escapeHtml(phoneNumber)}"
              required>
          </label>

          <label class="form-field">
            <span>Verification code</span>
            <div class="otp-row">
              <input
                name="otpCode"
                inputmode="numeric"
                autocomplete="one-time-code"
                value="${escapeHtml(otpCode)}"
                required>
              <button class="secondary-action otp-send-button" type="button" data-send-otp="true">Send code</button>
            </div>
          </label>

          <p class="login-inline-error" role="alert" aria-live="polite" data-login-error="true"></p>

          <label class="checkbox-field login-agreement">
            <input type="checkbox" name="agreement" value="accepted"${checked} data-login-agreement="true">
            <span>I agree to the user agreement and privacy policy.</span>
          </label>

          <div class="form-actions">
            <button class="primary-action" type="submit" data-login-submit="true"${disabled}>Login</button>
          </div>
        </form>
      </section>
      <script src="/login.js" defer></script>
`
  });
}

export function renderAdminPage({ user } = {}) {
  const workflowItems = workflowPlaceholders
    .map(
      (item) => `<article class="admin-overview-card">
        <strong>${item.title}</strong>
        <span>${item.status}</span>
      </article>`
    )
    .join("");

  return renderAdminShell({
    title: `Admin | ${productName}`,
    currentKey: "overview",
    eyebrow: "Audited workflow foundation",
    heading: "Admin console",
    description: "The MVP admin area is reserved for reviewed official data, structured extraction tasks, experience moderation, and report handling.",
    user,
    content: `
      <section class="admin-section" aria-labelledby="admin-routes-title">
        <div class="section-heading">
          <h2 id="admin-routes-title">Desktop workflow overview</h2>
          <p class="section-kicker">All admin workflows use left navigation, a global status bar, tables, and right-side review panels.</p>
        </div>
        <div class="admin-overview-grid">${workflowItems}</div>
      </section>`,
    detailPanel: renderAdminPanel({
      id: "admin-overview-detail",
      title: "Review workflow rules",
      kicker: "Student-visible changes stay audited.",
      sections: [
        renderAdminPanelSection("Student-visible preview", `<p class="section-kicker">Official guide, formula, experience, verification, and report actions show what students can see before publication or hiding.</p>`),
        renderAdminPanelSection("Audit requirement", `<p class="section-kicker">Publishing, returning, hiding, deleting, rejecting, and account-limiting actions record operator identity and operation time.</p>`)
      ]
    })
  });
}

export function renderNotFound() {
  return renderStudentPage({
    title: `Not Found | ${productName}`,
    hideBottomNav: true,
    topBar: renderStudentTopBar({
      type: "detail",
      title: "Not found",
      backHref: "/",
      backLabel: "Back to home"
    }),
    content: `
      <section class="hero-copy">
        <p class="eyebrow">404</p>
        <h1>Route not found</h1>
        <p class="lead">This scaffold currently exposes the student home route, admin placeholder, and health API.</p>
        <div class="actions"><a class="primary-action" href="/">Return home</a></div>
      </section>`
  });
}
