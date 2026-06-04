(() => {
  "use strict";

  const optionsNode = document.getElementById("calculator-options");
  const schoolSelect = document.getElementById("calculator-school");
  const yearSelect = document.getElementById("calculator-year");
  const scoreForm = document.getElementById("score-input-form");
  const feedback = document.getElementById("calculator-feedback");
  const resultPanel = document.getElementById("calculator-result");

  function parseOptions() {
    if (!optionsNode) {
      return { schools: [] };
    }

    try {
      return JSON.parse(optionsNode.textContent);
    } catch {
      return { schools: [] };
    }
  }

  const calculatorOptions = parseOptions();

  function selectedSchoolYears() {
    const school = calculatorOptions.schools.find((item) => item.id === schoolSelect.value);
    return school?.years ?? [];
  }

  function refreshYearOptions() {
    if (!schoolSelect || !yearSelect) {
      return;
    }

    const currentYear = yearSelect.value;
    const years = selectedSchoolYears();
    yearSelect.replaceChildren(
      ...years.map((year) => {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = String(year);
        option.selected = String(year) === currentYear;
        return option;
      })
    );

    if (!years.some((year) => String(year) === currentYear) && yearSelect.options.length > 0) {
      yearSelect.options[0].selected = true;
    }
  }

  function clearNode(node) {
    if (!node) {
      return;
    }

    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function appendText(parent, tagName, text, className) {
    const node = document.createElement(tagName);
    node.textContent = text;

    if (className) {
      node.className = className;
    }

    parent.appendChild(node);
    return node;
  }

  function setFeedback(message, state = "error") {
    if (!feedback) {
      return;
    }

    feedback.textContent = message;
    feedback.dataset.state = state;
  }

  function validateScores() {
    const scores = {};
    const fields = [...scoreForm.querySelectorAll("[data-score-key]")];

    for (const field of fields) {
      const label = field.dataset.scoreLabel;
      const maxScore = Number(field.dataset.maxScore);
      const rawValue = field.value.trim();
      field.setCustomValidity("");

      if (rawValue.length === 0) {
        const message = `${label} is required.`;
        field.setCustomValidity(message);
        field.reportValidity();
        throw new Error(message);
      }

      const value = Number(rawValue);

      if (!Number.isFinite(value)) {
        const message = `${label} must be a number.`;
        field.setCustomValidity(message);
        field.reportValidity();
        throw new Error(message);
      }

      if (value < 0 || value > maxScore) {
        const message = `${label} must be between 0 and ${maxScore}.`;
        field.setCustomValidity(message);
        field.reportValidity();
        throw new Error(message);
      }

      scores[field.dataset.scoreKey] = value;
    }

    return scores;
  }

  function renderBreakdownItem(item) {
    const listItem = document.createElement("li");
    appendText(listItem, "span", item.label);
    appendText(
      listItem,
      "strong",
      `${item.contribution} points from ${item.score}/${item.maxScore}`
    );
    appendText(
      listItem,
      "em",
      `${Math.round(item.weight * 1000) / 10}% weight, normalized ${item.normalizedScore}`
    );

    return listItem;
  }

  function renderResult(data) {
    clearNode(resultPanel);
    resultPanel.dataset.empty = "false";

    const scoreBlock = document.createElement("div");
    scoreBlock.className = "result-score";
    appendText(scoreBlock, "span", "Comprehensive score");
    appendText(scoreBlock, "strong", `${data.totalScore} / ${data.outputMaxScore}`);
    resultPanel.appendChild(scoreBlock);

    appendText(resultPanel, "h3", "Contribution breakdown");
    const breakdownList = document.createElement("ul");
    breakdownList.className = "result-breakdown";
    data.breakdown.map(renderBreakdownItem).forEach((item) => breakdownList.appendChild(item));
    resultPanel.appendChild(breakdownList);

    appendText(resultPanel, "p", data.explanation, "result-explanation");

    const sourceLink = document.createElement("a");
    sourceLink.className = "text-link";
    sourceLink.href = data.officialSourceUrl;
    sourceLink.rel = "noopener";
    sourceLink.textContent = "Official source";
    resultPanel.appendChild(sourceLink);

    appendText(resultPanel, "p", data.disclaimer, "result-disclaimer");
  }

  async function calculateScore() {
    const payload = {
      schoolId: scoreForm.dataset.schoolId,
      year: Number(scoreForm.dataset.year),
      scores: validateScores()
    };

    setFeedback("Calculating...", "loading");

    const response = await fetch("/api/score/calculate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.message ?? "Score calculation failed.");
    }

    renderResult(body);
    setFeedback("");
  }

  if (schoolSelect && yearSelect) {
    schoolSelect.addEventListener("change", refreshYearOptions);
  }

  if (scoreForm) {
    scoreForm.addEventListener("input", (event) => {
      if (event.target.matches("[data-score-key]")) {
        event.target.setCustomValidity("");
        setFeedback("");
      }
    });

    scoreForm.addEventListener("submit", (event) => {
      event.preventDefault();

      calculateScore().catch((error) => {
        setFeedback(error.message);
      });
    });
  }
})();
