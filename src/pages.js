import {
  adminNavigation,
  productDescription,
  productName,
  studentNavigation
} from "./lib/product.js";

const progressItems = [
  { label: "2026 guide cycle", value: "Tracking official releases" },
  { label: "Nearest deadline", value: "Application windows appear here" },
  { label: "Search approach", value: "PostgreSQL full-text search" }
];

const entryPoints = [
  {
    title: "Grade one",
    body: "Start with the basics: what comprehensive evaluation admissions are and which school signals matter early."
  },
  {
    title: "Grade two",
    body: "Compare guide changes, subject requirements, and common assessment formats before the application year."
  },
  {
    title: "Grade three",
    body: "Follow current-year guide releases, deadlines, score formulas, and structured interview experiences."
  }
];

const workflowPlaceholders = [
  { title: "Official guide review", status: "Awaiting data model" },
  { title: "Timeline management", status: "Awaiting guide fields" },
  { title: "Experience moderation", status: "Awaiting submissions" }
];

function htmlPage({ title, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${productDescription}">
    <title>${title}</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
${body}
  </body>
</html>`;
}

function renderStudentNav() {
  return studentNavigation
    .map((item) => `<a href="${item.href}">${item.label}</a>`)
    .join("");
}

function renderAdminNav() {
  return adminNavigation
    .map((item) => `<a class="badge" href="${item.href}">${item.label}</a>`)
    .join("");
}

export function renderStudentHome() {
  const statusCards = progressItems
    .map(
      (item) => `<div class="status-item">
        <span class="status-label">${item.label}</span>
        <strong class="status-value">${item.value}</strong>
      </div>`
    )
    .join("");

  const gradeCards = entryPoints
    .map(
      (item) => `<article class="info-card">
        <div class="badge-row"><span class="badge">${item.title}</span></div>
        <h3>${item.title} planning</h3>
        <p>${item.body}</p>
      </article>`
    )
    .join("");

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
          <p class="eyebrow">Mobile-first student web app</p>
          <h1 id="home-title">Guangdong comprehensive evaluation admissions</h1>
          <p class="lead">
            A focused foundation for official guide discovery, application timelines,
            score calculation, and structured admissions experiences without predictions,
            paid consulting, comments, or private messages.
          </p>
          <div class="actions" aria-label="Primary sections">
            <a class="primary-action" href="/schools">Browse schools</a>
            <a class="secondary-action" href="/timeline">View timeline</a>
          </div>
        </div>

        <aside class="status-panel" aria-label="Annual admissions progress">
          <p class="eyebrow">Annual progress</p>
          <div class="status-grid">${statusCards}</div>
        </aside>
      </section>

      <section class="section" aria-labelledby="entry-title">
        <div class="section-heading"><h2 id="entry-title">Grade-aware entry points</h2></div>
        <div class="card-grid">${gradeCards}</div>
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
