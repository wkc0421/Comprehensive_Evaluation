const toastMessages = new Map([
  ["logged_in", "Logged in"],
  ["favorite_saved", "Favorite saved"],
  ["already_favorited", "Already in favorites"],
  ["useful_saved", "Marked useful"],
  ["report_submitted", "Report submitted for review"],
  ["publish_ready", "Continue publishing your experience"]
]);

function showToastFromQuery() {
  const toast = document.querySelector("[data-student-toast='true']");

  if (!toast) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const message = toastMessages.get(params.get("toast"));

  if (!message) {
    return;
  }

  toast.textContent = message;
  toast.hidden = false;

  window.setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

let lastSchoolFilterUrl = "";

function schoolListStatus() {
  return document.querySelector("[data-school-list-status='true']");
}

function setSchoolListStatus(message, options = {}) {
  const status = schoolListStatus();

  if (!status) {
    return;
  }

  if (!message) {
    status.textContent = "";
    status.hidden = true;
    return;
  }

  status.hidden = false;
  status.dataset.state = options.state ?? "info";

  if (options.retry) {
    status.innerHTML = `${message} <button type="button" data-school-filter-retry="true">Retry</button>`;
    return;
  }

  status.textContent = message;
}

function schoolFilterUrlFromForm(form) {
  const url = new URL(form.action || "/schools", window.location.origin);
  const formData = new FormData(form);

  for (const [key, value] of formData.entries()) {
    const text = String(value).trim();

    if (text.length > 0) {
      url.searchParams.set(key, text);
    }
  }

  return url;
}

function replaceSchoolListSections(html) {
  const parser = new DOMParser();
  const nextDocument = parser.parseFromString(html, "text/html");
  const currentFilters = document.querySelector("[data-school-filters-container='true']");
  const currentResults = document.querySelector("[data-school-results-section='true']");
  const nextFilters = nextDocument.querySelector("[data-school-filters-container='true']");
  const nextResults = nextDocument.querySelector("[data-school-results-section='true']");

  if (!currentFilters || !currentResults || !nextFilters || !nextResults) {
    throw new Error("School list response was incomplete.");
  }

  currentFilters.innerHTML = nextFilters.innerHTML;
  currentResults.innerHTML = nextResults.innerHTML;
}

async function loadSchoolFilters(url, options = {}) {
  lastSchoolFilterUrl = url.toString();
  setSchoolListStatus("Loading schools...", { state: "loading" });

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html"
      }
    });

    if (!response.ok) {
      throw new Error("School list loading failed.");
    }

    replaceSchoolListSections(await response.text());

    if (options.updateHistory !== false) {
      window.history.pushState({ schoolFilters: true }, "", url);
    }

    window.__schoolFilterAjaxCount = (window.__schoolFilterAjaxCount || 0) + 1;
    setSchoolListStatus("");
  } catch {
    setSchoolListStatus("Could not load schools.", { state: "error", retry: true });

    if (options.throwOnError) {
      throw new Error("Could not load schools.");
    }
  }
}

function enhanceSchoolFilters() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest?.("[data-school-filter-form='true']");

    if (!form) {
      return;
    }

    event.preventDefault();
    loadSchoolFilters(schoolFilterUrlFromForm(form));
  });

  document.addEventListener("change", (event) => {
    const form = event.target.closest?.("[data-school-filter-form='true']");

    if (!form || event.target.tagName !== "SELECT") {
      return;
    }

    loadSchoolFilters(schoolFilterUrlFromForm(form));
  });

  document.addEventListener("click", (event) => {
    const clearLink = event.target.closest?.("[data-school-clear-filters='true']");

    if (clearLink) {
      event.preventDefault();
      loadSchoolFilters(new URL(clearLink.href, window.location.origin));
      return;
    }

    const retryButton = event.target.closest?.("[data-school-filter-retry='true']");

    if (retryButton && lastSchoolFilterUrl) {
      event.preventDefault();
      loadSchoolFilters(new URL(lastSchoolFilterUrl));
    }
  });

  window.addEventListener("popstate", () => {
    const form = document.querySelector("[data-school-filter-form='true']");

    if (!form) {
      return;
    }

    loadSchoolFilters(new URL(window.location.href), { updateHistory: false });
  });
}

showToastFromQuery();
enhanceSchoolFilters();
