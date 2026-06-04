import {
  getSchoolById,
  listExperiences,
  listGuides,
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
