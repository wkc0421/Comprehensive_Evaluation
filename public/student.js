const toastMessages = new Map([
  ["logged_in", "Logged in"],
  ["favorite_saved", "Favorite saved"],
  ["already_favorited", "Already in favorites"],
  ["useful_saved", "Marked useful"],
  ["report_submitted", "Report submitted for review"],
  ["publish_ready", "Continue publishing your experience"],
  ["logged_out", "Logged out"]
]);
const experienceDraftKey = "gce:experience-submission-draft";
const experienceDraftTtlMs = 7 * 24 * 60 * 60 * 1000;

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

function experienceDraftForm() {
  return document.querySelector("[data-experience-submission-form='true']");
}

function readExperienceDraft() {
  try {
    const draft = JSON.parse(window.localStorage.getItem(experienceDraftKey) || "null");

    if (!draft || typeof draft !== "object" || typeof draft.savedAt !== "number") {
      return null;
    }

    if (Date.now() - draft.savedAt > experienceDraftTtlMs) {
      window.localStorage.removeItem(experienceDraftKey);
      window.__experienceDraftState = "expired";
      return null;
    }

    return draft;
  } catch {
    window.localStorage.removeItem(experienceDraftKey);
    window.__experienceDraftState = "invalid";
    return null;
  }
}

function clearExperienceDraft() {
  window.localStorage.removeItem(experienceDraftKey);
  const prompt = document.querySelector("[data-experience-draft-prompt='true']");

  if (prompt) {
    prompt.hidden = true;
  }

  window.__experienceDraftState = "cleared";
}

function draftableField(field) {
  return field.name &&
    field.type !== "file" &&
    field.type !== "submit" &&
    field.type !== "button" &&
    !field.disabled;
}

function formDraftValues(form) {
  const values = {};

  for (const field of Array.from(form.elements)) {
    if (!draftableField(field)) {
      continue;
    }

    if ((field.type === "checkbox" || field.type === "radio") && !field.checked) {
      continue;
    }

    const value = String(field.value ?? "");

    if (field.type !== "checkbox" && value.trim().length === 0) {
      continue;
    }

    if (Object.hasOwn(values, field.name)) {
      values[field.name] = Array.isArray(values[field.name])
        ? [...values[field.name], value]
        : [values[field.name], value];
      continue;
    }

    values[field.name] = value;
  }

  return values;
}

function saveExperienceDraft(form) {
  const values = formDraftValues(form);
  const hasValues = Object.values(values).some((value) => {
    if (Array.isArray(value)) {
      return value.some((item) => String(item).trim().length > 0);
    }

    return String(value).trim().length > 0;
  });

  if (!hasValues) {
    clearExperienceDraft();
    return;
  }

  window.localStorage.setItem(experienceDraftKey, JSON.stringify({
    savedAt: Date.now(),
    values
  }));
  window.__experienceDraftState = "saved";
}

function setFieldValue(field, values) {
  const value = values[field.name];
  const valueList = Array.isArray(value) ? value.map(String) : [String(value ?? "")];

  if (field.type === "checkbox" || field.type === "radio") {
    field.checked = valueList.includes(field.value);
    return;
  }

  field.value = valueList[0] ?? "";
}

function restoreExperienceDraft(form, draft) {
  for (const field of Array.from(form.elements)) {
    if (draftableField(field) && Object.hasOwn(draft.values ?? {}, field.name)) {
      setFieldValue(field, draft.values);
    }
  }

  updateCharacterCounts(form);
  window.__experienceDraftState = "restored";
}

function updateCharacterCounts(scope = document) {
  for (const textarea of Array.from(scope.querySelectorAll("[data-character-count='true']"))) {
    const counter = scope.querySelector(`[data-char-count-for="${textarea.name}"]`);

    if (!counter) {
      continue;
    }

    const maxLength = textarea.getAttribute("maxlength") || "0";
    counter.textContent = `${textarea.value.length}/${maxLength}`;
  }
}

function bindExperienceDrafts() {
  const form = experienceDraftForm();
  const prompt = document.querySelector("[data-experience-draft-prompt='true']");

  updateCharacterCounts();

  if (!form) {
    document.addEventListener("submit", (event) => {
      const logoutForm = event.target.closest?.("form[action='/logout']");

      if (logoutForm) {
        clearExperienceDraft();
      }
    });
    return;
  }

  if (form.dataset.submissionComplete === "true") {
    clearExperienceDraft();
  }

  let draft = readExperienceDraft();
  let dirty = false;
  let submitted = false;

  if (draft && prompt && form.dataset.submissionComplete !== "true") {
    prompt.hidden = false;
    window.__experienceDraftState = "prompt";
  } else if (prompt) {
    prompt.hidden = true;
  }

  form.addEventListener("input", () => {
    dirty = true;
    updateCharacterCounts(form);
    saveExperienceDraft(form);
  });

  form.addEventListener("change", () => {
    dirty = true;
    updateCharacterCounts(form);
    saveExperienceDraft(form);
  });

  form.addEventListener("submit", () => {
    submitted = true;
  });

  window.addEventListener("beforeunload", (event) => {
    if (!dirty || submitted) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  });

  document.addEventListener("click", (event) => {
    const restoreButton = event.target.closest?.("[data-experience-draft-restore='true']");
    const clearButton = event.target.closest?.("[data-experience-draft-clear='true']");
    const logoutButton = event.target.closest?.("[data-clear-experience-drafts='true']");

    if (restoreButton) {
      event.preventDefault();
      draft = readExperienceDraft();

      if (draft) {
        restoreExperienceDraft(form, draft);
      }

      if (prompt) {
        prompt.hidden = true;
      }
      return;
    }

    if (clearButton || logoutButton) {
      clearExperienceDraft();
    }
  });

  document.addEventListener("submit", (event) => {
    const logoutForm = event.target.closest?.("form[action='/logout']");

    if (logoutForm) {
      clearExperienceDraft();
    }
  });
}

showToastFromQuery();
enhanceSchoolFilters();
bindExperienceDrafts();
