import {
  getSchoolDetail,
  getSchoolById,
  listExperiences,
  listGuides,
  listSchoolGuideCards,
  listTimelineEvents
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
  { title: "Official guide review", status: "Awaiting data model" },
  { title: "Timeline management", status: "Awaiting guide fields" },
  { title: "Experience moderation", status: "Awaiting submissions" }
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

function renderStudentNav() {
  return studentNavigation
    .map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`)
    .join("");
}

function renderAdminNav() {
  return adminNavigation
    .map((item) => `<a class="badge" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`)
    .join("");
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

function renderSchoolFilters(filters, allCards) {
  const years = uniqueSorted(allCards.map((card) => card.guide.admissionYear)).sort((left, right) => right - left);
  const applicationStatuses = uniqueSorted(allCards.map((card) => card.guide.applicationStatus));
  const schoolTypes = uniqueSorted(allCards.map((card) => card.school.schoolType));

  const yearOptions = [
    renderOption("", "All years", filters.year ?? ""),
    ...years.map((year) => renderOption(year, year, filters.year))
  ].join("");
  const statusOptions = [
    renderOption("", "Any visible status", filters.status ?? ""),
    renderOption("published", "Published", filters.status),
    renderOption("pending_review", "Pending review", filters.status),
    renderOption("draft", "Draft", filters.status),
    renderOption("archived", "Archived", filters.status)
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

  return `<form class="filter-panel" method="get" action="/schools" aria-label="School filters">
    <label class="filter-field">
      <span>Year</span>
      <select name="year">${yearOptions}</select>
    </label>
    <label class="filter-field wide-field">
      <span>School keyword</span>
      <input name="keyword" value="${escapeHtml(filters.keyword ?? "")}" autocomplete="off">
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
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/schools">Reset</a>
    </div>
  </form>`;
}

function renderSchoolTimelineNodes(nodes) {
  if (nodes.length === 0) {
    return `<p class="inline-empty">Timeline pending supplement</p>`;
  }

  return `<ul class="school-timeline">${nodes
    .map((node) => `<li>
      <span>${escapeHtml(node.title)}</span>
      <strong>${escapeHtml(formatDate(node.endsAt ?? node.startsAt))}</strong>
    </li>`)
    .join("")}</ul>`;
}

function renderFormulaLabel(formula) {
  if (!formula.available) {
    return "Formula not available";
  }

  return `${humanizeToken(formula.formulaType)} - ${formula.formulaName}`;
}

function renderExperienceAvailability(experiences) {
  if (!experiences.exists) {
    return "No published experiences yet";
  }

  return `${experiences.count} published ${pluralize(experiences.count, "experience")}`;
}

function renderSchoolCards(cards) {
  if (cards.length === 0) {
    return `<p class="empty-state">No published guide cards match these filters.</p>`;
  }

  return cards
    .map((card) => `<article class="school-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(card.guide.admissionYear)}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(card.guide.applicationStatus))}</span>
        <span class="muted-badge">${escapeHtml(humanizeToken(card.school.schoolType))}</span>
      </div>
      <h3><a href="/schools/${escapeHtml(encodeURIComponent(card.school.id))}?year=${escapeHtml(card.guide.admissionYear)}">${escapeHtml(card.school.name)}</a></h3>
      <p>${escapeHtml(card.guide.summary)}</p>
      <dl class="detail-list split-details">
        <div>
          <dt>Application status</dt>
          <dd>${escapeHtml(humanizeToken(card.guide.applicationStatus))}</dd>
        </div>
        <div>
          <dt>Application deadline</dt>
          <dd>${escapeHtml(formatDate(card.guide.applicationDeadlineAt))}</dd>
        </div>
        <div>
          <dt>Formula</dt>
          <dd>${escapeHtml(renderFormulaLabel(card.formula))}</dd>
        </div>
        <div>
          <dt>Experiences</dt>
          <dd>${escapeHtml(renderExperienceAvailability(card.experiences))}</dd>
        </div>
      </dl>
      <div class="timeline-block">
        <h4>Key timeline nodes</h4>
        ${renderSchoolTimelineNodes(card.keyTimelineNodes)}
      </div>
    </article>`)
    .join("");
}

function renderTimelineFilters(filters) {
  const selectedSchoolId = filters.schoolIds?.[0] ?? "";
  const years = uniqueSorted(listGuides().map((guide) => guide.admissionYear)).sort((left, right) => right - left);
  const schoolsById = new Map(
    listSchoolGuideCards({ sort: "name" }).map((card) => [card.school.id, card.school])
  );
  const yearOptions = [
    renderOption("", "All years", filters.year ?? ""),
    ...years.map((year) => renderOption(year, year, filters.year))
  ].join("");
  const schoolOptions = [
    renderOption("", "All schools", selectedSchoolId),
    ...[...schoolsById.values()].map((school) => renderOption(school.id, school.name, selectedSchoolId))
  ].join("");

  return `<form class="filter-panel timeline-filter-panel" method="get" action="/timeline" aria-label="Timeline filters">
    <label class="filter-field">
      <span>Year</span>
      <select name="year">${yearOptions}</select>
    </label>
    <label class="filter-field wide-field">
      <span>School</span>
      <select name="schoolIds">${schoolOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/timeline">Reset</a>
    </div>
  </form>`;
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

function renderTimelineNodeCards(nodes, reminders) {
  if (nodes.length === 0) {
    return `<p class="empty-state">No published timeline nodes match these filters.</p>`;
  }

  const reminderEventIds = new Set(reminders.map((reminder) => reminder.eventId));

  return nodes
    .map((node) => {
      const reminderBadge = reminderEventIds.has(node.id)
        ? `<span class="site-badge">Site reminder</span>`
        : "";

      return `<article class="timeline-card">
        <div class="badge-row">
          <span class="badge">${escapeHtml(node.guide.admissionYear)}</span>
          <span class="status-badge status-${escapeHtml(node.status)}">${escapeHtml(humanizeToken(node.status))}</span>
          ${reminderBadge}
        </div>
        <h3>${escapeHtml(node.title)}</h3>
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
            <dt>Timeline node</dt>
            <dd>${escapeHtml(humanizeToken(node.eventKey))}</dd>
          </div>
          <div>
            <dt>Guide</dt>
            <dd>${escapeHtml(node.guide.guideTitle)}</dd>
          </div>
        </dl>
      </article>`;
    })
    .join("");
}

function renderDetailLink(url, label) {
  if (!url) {
    return `<span class="inline-empty">${escapeHtml(missingOfficialText)}</span>`;
  }

  return `<a class="text-link" href="${escapeHtml(url)}" rel="noopener">${escapeHtml(label)}</a>`;
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

function renderDetailTimeline(nodes) {
  if (nodes.length === 0) {
    return `<p class="empty-state">Timeline ${escapeHtml(pendingSupplementText.toLowerCase())}</p>`;
  }

  return `<ul class="detail-timeline">${nodes
    .map((node) => `<li>
      <span>${escapeHtml(humanizeToken(node.eventKey))}</span>
      <strong>${escapeHtml(node.title)}</strong>
      <em>${escapeHtml(formatDate(node.endsAt ?? node.startsAt))}</em>
    </li>`)
    .join("")}</ul>`;
}

function renderFormulaDetail(formula) {
  if (!formula) {
    return `<div class="detail-panel" id="formula">
      <div class="section-heading">
        <h2>Score formula entry</h2>
      </div>
      <p class="empty-state">Score formula ${escapeHtml(pendingSupplementText.toLowerCase())}</p>
    </div>`;
  }

  const inputs = formula.formulaConfig.inputs
    .map((input) => `<li>
      <span>${escapeHtml(input.label)}</span>
      <strong>${escapeHtml(Math.round(input.weight * 100))}%</strong>
      <em>Max ${escapeHtml(input.maxScore)}</em>
    </li>`)
    .join("");

  return `<div class="detail-panel" id="formula">
    <div class="section-heading">
      <h2>Score formula entry</h2>
      ${renderDetailLink(formula.officialSourceUrl, "Formula source")}
    </div>
    <h3>${escapeHtml(formula.formulaName)}</h3>
    <p>${escapeHtml(formula.explanation)}</p>
    <ul class="formula-inputs">${inputs}</ul>
  </div>`;
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

export function renderSchoolDetailPage(detail) {
  const guide = detail.guide;
  const applicationWindow =
    `${formatDate(guide.applicationStartAt)} to ${formatDate(guide.applicationDeadlineAt)}`;

  return htmlPage({
    title: `${detail.school.name} ${detail.selectedYear} | ${productName}`,
    body: `    <main class="app-shell">
      <header class="top-bar">
        <a class="brand" href="/">
          <span class="brand-mark">Guangdong MVP</span>
          <span class="brand-name">${productName}</span>
        </a>
        <nav class="nav-pills" aria-label="Student navigation">${renderStudentNav()}</nav>
        <a class="admin-link" href="/admin">Admin</a>
      </header>

      <section class="page-heading detail-heading" aria-labelledby="school-detail-title">
        <p class="eyebrow">${escapeHtml(detail.selectedYear)} published guide</p>
        <h1 id="school-detail-title">${escapeHtml(detail.school.name)}</h1>
        <p class="lead">${escapeHtml(guide.summary)}</p>
        <div class="actions detail-actions" aria-label="Official links">
          ${renderDetailLink(guide.officialSourceUrl, "Official source")}
          ${renderDetailLink(guide.applicationUrl, "Application link")}
          <a class="secondary-action" href="/schools">All schools</a>
        </div>
      </section>

      <section class="section" aria-label="Available admission years">
        ${renderYearSwitcher(detail)}
      </section>

      <section class="section detail-grid" aria-label="School official detail">
        <div class="detail-panel">
          <div class="section-heading"><h2>School base information</h2></div>
          ${renderDetailRows([
            { label: "City", value: displayValue(detail.school.city) },
            { label: "School type", value: humanizeToken(displayValue(detail.school.schoolType)) },
            { label: "Province scope", value: humanizeToken(displayValue(detail.school.provinceScope)) },
            { label: "Official website", html: renderDetailLink(detail.school.officialWebsiteUrl, "Admissions website") },
            { label: "Application status", value: humanizeToken(displayValue(guide.applicationStatus)) },
            { label: "Application window", value: applicationWindow },
            { label: "Guide published", value: formatDate(guide.publishedAt) },
            { label: "Guide updated", value: formatDate(guide.updatedAt) }
          ])}
        </div>

        <div class="detail-panel">
          <div class="section-heading"><h2>Guide summary</h2></div>
          <h3>${escapeHtml(displayValue(guide.guideTitle, pendingSupplementText))}</h3>
          <p>${escapeHtml(displayValue(guide.summary, pendingSupplementText))}</p>
          ${renderDetailRows([
            { label: "Official source", html: renderDetailLink(guide.officialSourceUrl, "Open source") },
            { label: "Application link", html: renderDetailLink(guide.applicationUrl, "Open application") },
            { label: "Version", value: `Version ${guide.version}` }
          ])}
        </div>
      </section>

      <section class="section detail-grid" aria-label="Guide requirements">
        <div class="detail-panel">
          <div class="section-heading"><h2>Majors</h2></div>
          ${renderMajorList(guide.majors)}
        </div>

        <div class="detail-panel">
          <div class="section-heading"><h2>Subject requirements</h2></div>
          ${renderTextList(guide.subjectRequirements)}
        </div>

        <div class="detail-panel">
          <div class="section-heading"><h2>Academic test requirements</h2></div>
          <p>${escapeHtml(displayValue(guide.academicTestRequirements))}</p>
        </div>

        <div class="detail-panel">
          <div class="section-heading"><h2>Assessment method</h2></div>
          <p>${escapeHtml(displayValue(guide.assessmentMethod))}</p>
        </div>

        <div class="detail-panel">
          <div class="section-heading"><h2>Admission rule</h2></div>
          <p>${escapeHtml(displayValue(guide.admissionRule))}</p>
        </div>

        <div class="detail-panel">
          <div class="section-heading"><h2>Fees and contact</h2></div>
          ${renderDetailRows([
            { label: "Fees", value: renderFeeSummary(guide.fees) },
            { label: "Contact", value: renderContactSummary(guide.contact) }
          ])}
        </div>
      </section>

      <section class="section detail-grid" aria-label="Timeline and formula">
        <div class="detail-panel">
          <div class="section-heading"><h2>Timeline</h2></div>
          ${renderDetailTimeline(detail.timeline)}
        </div>
        ${renderFormulaDetail(detail.formula)}
      </section>

      <section class="section" aria-labelledby="featured-experiences-title">
        <div class="section-heading">
          <h2 id="featured-experiences-title">Featured experiences</h2>
          <p class="section-kicker">Published structured assessment references</p>
        </div>
        <div class="card-grid">${renderExperienceDetailCards(detail.featuredExperiences)}</div>
      </section>
    </main>`
  });
}

export function renderSchoolListPage(filters = {}) {
  const allCards = listSchoolGuideCards({ sort: "name" });
  const cards = listSchoolGuideCards(filters);

  return htmlPage({
    title: `Schools | ${productName}`,
    body: `    <main class="app-shell">
      <header class="top-bar">
        <a class="brand" href="/">
          <span class="brand-mark">Guangdong MVP</span>
          <span class="brand-name">${productName}</span>
        </a>
        <nav class="nav-pills" aria-label="Student navigation">${renderStudentNav()}</nav>
        <a class="admin-link" href="/admin">Admin</a>
      </header>

      <section class="page-heading" aria-labelledby="school-list-title">
        <p class="eyebrow">Published school guides</p>
        <h1 id="school-list-title">School list</h1>
        <p class="lead">Browse Guangdong comprehensive evaluation schools with current guide cards, timeline nodes, formula availability, and published experience signals.</p>
      </section>

      <section class="section" aria-label="School list filters">
        ${renderSchoolFilters(filters, allCards)}
      </section>

      <section class="section" aria-labelledby="school-results-title">
        <div class="section-heading">
          <h2 id="school-results-title">${escapeHtml(cards.length)} published ${escapeHtml(pluralize(cards.length, "guide card"))}</h2>
          <p class="section-kicker">Draft and review-only guide data is hidden from visitors</p>
        </div>
        <div class="school-list">${renderSchoolCards(cards)}</div>
      </section>
    </main>`
  });
}

export function renderTimelinePage(timeline) {
  return htmlPage({
    title: `Timeline | ${productName}`,
    body: `    <main class="app-shell">
      <header class="top-bar">
        <a class="brand" href="/">
          <span class="brand-mark">Guangdong MVP</span>
          <span class="brand-name">${productName}</span>
        </a>
        <nav class="nav-pills" aria-label="Student navigation">${renderStudentNav()}</nav>
        <a class="admin-link" href="/admin">Admin</a>
      </header>

      <section class="page-heading" aria-labelledby="timeline-title">
        <p class="eyebrow">Published admissions dates</p>
        <h1 id="timeline-title">${timeline.mine ? "My timeline" : "Guangdong timeline"}</h1>
        <p class="lead">Track official comprehensive evaluation guide publication, application windows, review nodes, assessments, volunteer application, and admission result publication.</p>
      </section>

      <section class="section" aria-label="Timeline filters">
        ${renderTimelineFilters(timeline.filters)}
      </section>

      <section class="section" aria-labelledby="timeline-results-title">
        <div class="section-heading">
          <h2 id="timeline-results-title">${escapeHtml(timeline.count)} ${escapeHtml(pluralize(timeline.count, "timeline node"))}</h2>
          <p class="section-kicker">${escapeHtml(timeline.reminders.length)} site-only ${escapeHtml(pluralize(timeline.reminders.length, "reminder"))}</p>
        </div>
        <div class="timeline-list">${renderTimelineNodeCards(timeline.events, timeline.reminders)}</div>
      </section>
    </main>`
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
    renderOption("newest", "Newest", filters.sort ?? "newest"),
    renderOption("useful", "Useful count", filters.sort),
    renderOption("verified", "Verified first", filters.sort)
  ].join("");

  return `<form class="filter-panel experience-filter-panel" method="get" action="/experiences" aria-label="Experience filters">
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
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/experiences">Reset</a>
    </div>
  </form>`;
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

function renderExperienceListCards(experiences) {
  if (experiences.length === 0) {
    return `<p class="empty-state">No published experiences match these filters.</p>`;
  }

  return experiences
    .map((experience) => {
      const school = getSchoolById(experience.schoolId);

      return `<article class="experience-card">
        <div class="badge-row">
          <span class="badge">${escapeHtml(experience.admissionYear)}</span>
          <span class="soft-badge">${escapeHtml(experienceVerifiedLabel(experience))}</span>
          <span class="muted-badge">${escapeHtml(humanizeToken(experience.stage))}</span>
        </div>
        <h3><a href="/schools/${escapeHtml(encodeURIComponent(experience.schoolId))}?year=${escapeHtml(experience.admissionYear)}">${escapeHtml(school?.name ?? "Published school")}</a></h3>
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
      </article>`;
    })
    .join("");
}

export function renderExperienceListPage(filters = {}) {
  const allExperiences = listExperiences();
  const experiences = listExperiences(filters);

  return htmlPage({
    title: `Experiences | ${productName}`,
    body: `    <main class="app-shell">
      <header class="top-bar">
        <a class="brand" href="/">
          <span class="brand-mark">Guangdong MVP</span>
          <span class="brand-name">${productName}</span>
        </a>
        <nav class="nav-pills" aria-label="Student navigation">${renderStudentNav()}</nav>
        <a class="admin-link" href="/admin">Admin</a>
      </header>

      <section class="page-heading" aria-labelledby="experience-list-title">
        <p class="eyebrow">Published assessment experiences</p>
        <h1 id="experience-list-title">Experience list</h1>
        <p class="lead">Browse structured interview and assessment references by school, year, stage, verification, and useful count.</p>
      </section>

      <section class="section" aria-label="Experience filters">
        ${renderExperienceFilters(filters, allExperiences)}
      </section>

      <section class="section" aria-labelledby="experience-results-title">
        <div class="section-heading">
          <h2 id="experience-results-title">${escapeHtml(experiences.length)} published ${escapeHtml(pluralize(experiences.length, "experience"))}</h2>
          <p class="section-kicker">Review-only submissions are hidden from visitors</p>
        </div>
        <div class="experience-list">${renderExperienceListCards(experiences)}</div>
      </section>
    </main>`
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
      aria-describedby="${escapeHtml(inputId)}-hint">
    <small id="${escapeHtml(inputId)}-hint">0 to ${escapeHtml(input.maxScore)} - ${escapeHtml(percentageLabel(input.weight))}</small>
  </label>`;
}

function renderCalculatorFormulaForm(detail) {
  if (!detail) {
    return `<div class="calculator-unavailable">
      <h3>No published guide selected</h3>
      <p>Calculation form is hidden until a published school guide and year are available.</p>
    </div>`;
  }

  if (!detail.formula) {
    return `<div class="calculator-unavailable" id="score-input-unavailable">
      <h3>No clear published formula</h3>
      <p>Calculation form is hidden because no clear published score formula is available for ${escapeHtml(detail.school.name)} ${escapeHtml(detail.selectedYear)}.</p>
      ${renderDetailLink(detail.guide.officialSourceUrl, "Published guide")}
    </div>`;
  }

  const inputs = detail.formula.formulaConfig.inputs.map(renderCalculatorInput).join("");

  return `<form class="score-entry-form" id="score-input-form" novalidate data-school-id="${escapeHtml(detail.school.id)}" data-year="${escapeHtml(detail.selectedYear)}">
    <div class="formula-summary">
      <div>
        <h3>${escapeHtml(detail.formula.formulaName)}</h3>
        <p>${escapeHtml(detail.formula.explanation)}</p>
      </div>
      <a class="text-link" href="${escapeHtml(detail.formula.officialSourceUrl)}" rel="noopener">Official source</a>
    </div>
    <div class="score-fields">${inputs}</div>
    <div class="calculator-feedback" id="calculator-feedback" role="alert" aria-live="polite"></div>
    <button class="primary-action" type="submit">Calculate score</button>
  </form>`;
}

export function renderScoreCalculatorPage(filters = {}) {
  const cards = listSchoolGuideCards({ sort: "name" });
  const entries = calculatorSchoolEntries(cards);
  const selection = resolveCalculatorSelection(filters, entries, cards);
  const detail = selection.schoolId && selection.year
    ? getSchoolDetail({ schoolId: selection.schoolId, year: selection.year })
    : null;

  return htmlPage({
    title: `Score Calculator | ${productName}`,
    body: `    <main class="app-shell">
      <header class="top-bar">
        <a class="brand" href="/">
          <span class="brand-mark">Guangdong MVP</span>
          <span class="brand-name">${productName}</span>
        </a>
        <nav class="nav-pills" aria-label="Student navigation">${renderStudentNav()}</nav>
        <a class="admin-link" href="/admin">Admin</a>
      </header>

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
    </main>`
  });
}

export function renderStudentHome() {
  const guides = listGuides();
  const timelineEvents = listTimelineEvents();
  const experiences = listExperiences();
  const currentYear = currentAdmissionYear(guides);
  const annualGuides = guides.filter((guide) => guide.admissionYear === currentYear);
  const annualTimelineEvents = listTimelineEvents({ year: currentYear });
  const annualExperiences = experiences.filter((experience) => experience.admissionYear === currentYear);
  const nearestEvents = nearestImportantEvents(timelineEvents);
  const latestGuides = guides.slice(0, 3);
  const featuredExperiences = highQualityExperiences(experiences);
  const statusCards = renderStatusCards({
    currentYear,
    annualGuideCount: annualGuides.length,
    annualTimelineCount: annualTimelineEvents.length,
    annualExperienceCount: annualExperiences.length
  });

  return htmlPage({
    title: productName,
    body: `    <main class="app-shell">
      <header class="top-bar">
        <a class="brand" href="/">
          <span class="brand-mark">Guangdong MVP</span>
          <span class="brand-name">${productName}</span>
        </a>
        <nav class="nav-pills" aria-label="Student navigation">${renderStudentNav()}</nav>
        <a class="admin-link" href="/admin">Admin</a>
      </header>

      <section class="hero" aria-labelledby="home-title">
        <div class="hero-copy">
          <p class="eyebrow">Mobile-first student home</p>
          <h1 id="home-title">Guangdong comprehensive evaluation admissions</h1>
          <p class="lead">
            Follow published admissions guides, official timeline nodes, score formula
            availability, and verified assessment experiences for Guangdong high school applicants.
          </p>
          <div class="actions" aria-label="Primary sections">
            <a class="primary-action" href="/schools">Browse schools</a>
            <a class="secondary-action" href="/timeline">View timeline</a>
          </div>
        </div>

        <aside class="status-panel" aria-label="Annual admissions progress">
          <p class="eyebrow">Annual progress</p>
          <h2>${escapeHtml(currentYear)} Guangdong cycle</h2>
          <div class="status-grid">${statusCards}</div>
        </aside>
      </section>

      <section class="section" aria-labelledby="entry-title">
        <div class="section-heading"><h2 id="entry-title">Grade-aware entry points</h2></div>
        <div class="card-grid">${renderGradeCards()}</div>
      </section>

      <section class="section" aria-labelledby="deadline-title">
        <div class="section-heading">
          <h2 id="deadline-title">Nearest deadlines</h2>
          <p class="section-kicker">Official timeline dates from published guide data</p>
        </div>
        <div class="timeline-grid">${renderTimelineCards(nearestEvents)}</div>
      </section>

      <section class="section content-grid" aria-label="Latest admissions content">
        <div class="content-column" id="guides">
          <div class="section-heading">
            <h2>Latest published guides</h2>
          </div>
          <div class="card-grid">${renderGuideCards(latestGuides)}</div>
        </div>

        <div class="content-column" id="experiences">
          <div class="section-heading">
            <h2>Latest high-quality experiences</h2>
          </div>
          <div class="card-grid">${renderExperienceCards(featuredExperiences)}</div>
        </div>
      </section>
    </main>`
  });
}

export function renderAdminPage() {
  const workflowItems = workflowPlaceholders
    .map(
      (item) => `<li>
        <strong>${item.title}</strong>
        <span>${item.status}</span>
      </li>`
    )
    .join("");

  return htmlPage({
    title: `Admin | ${productName}`,
    body: `    <main class="app-shell admin-main">
      <header class="admin-header">
        <a class="brand" href="/">
          <span class="brand-mark">Admin</span>
          <span class="brand-name">${productName}</span>
        </a>
        <p class="eyebrow">Audited workflow foundation</p>
        <h1>Admin console placeholder</h1>
        <p class="lead">
          The MVP admin area is reserved for reviewed official data, structured extraction
          tasks, experience moderation, and report handling.
        </p>
      </header>

      <section class="admin-panel" aria-labelledby="admin-routes-title">
        <div class="section-heading"><h2 id="admin-routes-title">Initial admin routes</h2></div>
        <nav class="badge-row" aria-label="Admin navigation">${renderAdminNav()}</nav>
        <ul class="admin-list">${workflowItems}</ul>
      </section>
    </main>`
  });
}

export function renderNotFound() {
  return htmlPage({
    title: `Not Found | ${productName}`,
    body: `    <main class="app-shell">
      <section class="hero-copy">
        <p class="eyebrow">404</p>
        <h1>Route not found</h1>
        <p class="lead">This scaffold currently exposes the student home route, admin placeholder, and health API.</p>
        <div class="actions"><a class="primary-action" href="/">Return home</a></div>
      </section>
    </main>`
  });
}
