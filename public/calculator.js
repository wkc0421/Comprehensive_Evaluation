(() => {
  "use strict";

  const optionsNode = document.getElementById("calculator-options");
  const schoolSelect = document.getElementById("calculator-school");
  const yearSelect = document.getElementById("calculator-year");
  const scoreForm = document.getElementById("score-input-form");
  const feedback = document.getElementById("calculator-feedback");
  const resultPanel = document.getElementById("calculator-result");
  const calculateButton = scoreForm?.querySelector("[data-calculate-score='true']");

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

  function scoreFields() {
    return scoreForm ? [...scoreForm.querySelectorAll("[data-score-key]")] : [];
  }

  function scoreErrorNode(field) {
    return scoreForm?.querySelector(`[data-score-error-for="${field.dataset.scoreKey}"]`) ?? null;
  }

  function setFieldError(field, message) {
    field.setCustomValidity(message);
    const errorNode = scoreErrorNode(field);

    if (errorNode) {
      errorNode.textContent = message;
    }
  }

  function validateScoreField(field, { requireValue = false } = {}) {
    const label = field.dataset.scoreLabel;
    const maxScore = Number(field.dataset.maxScore);
    const rawValue = field.value.trim();

    if (rawValue.length === 0) {
      const message = `${label}必填。`;
      setFieldError(field, requireValue ? message : "");
      return { valid: !requireValue, score: null, message };
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
      const message = `${label}必须是数字。`;
      setFieldError(field, message);
      return { valid: false, score: null, message };
    }

    if (value < 0 || value > maxScore) {
      const message = `${label}必须在 0 到 ${maxScore} 之间。`;
      setFieldError(field, message);
      return { valid: false, score: null, message };
    }

    setFieldError(field, "");
    return { valid: true, score: value, message: "" };
  }

  function validateScores() {
    const scores = {};

    for (const field of scoreFields()) {
      const result = validateScoreField(field, { requireValue: true });

      if (!result.valid) {
        throw new Error(result.message);
      }

      scores[field.dataset.scoreKey] = result.score;
    }

    return scores;
  }

  function refreshSubmitState() {
    if (!calculateButton) {
      return;
    }

    const fields = scoreFields();
    const canSubmit = fields.length > 0 && fields.every((field) => validateScoreField(field).valid && field.value.trim());
    calculateButton.disabled = !canSubmit;
  }

  function resetResultPanel() {
    if (!resultPanel) {
      return;
    }

    clearNode(resultPanel);
    resultPanel.dataset.empty = "true";
    appendText(resultPanel, "p", "计算后将在这里显示结果。", "inline-empty");
  }

  function clearCalculationState() {
    for (const field of scoreFields()) {
      field.value = "";
      setFieldError(field, "");
    }

    setFeedback("");
    resetResultPanel();
    refreshSubmitState();
  }

  function renderBreakdownItem(item) {
    const listItem = document.createElement("li");
    appendText(listItem, "span", item.label);
    appendText(
      listItem,
      "strong",
      `${item.score}/${item.maxScore} 贡献 ${item.contribution} 分`
    );
    appendText(
      listItem,
      "em",
      `权重 ${Math.round(item.weight * 1000) / 10}%，折算分 ${item.normalizedScore}`
    );

    return listItem;
  }

  function renderResult(data) {
    clearNode(resultPanel);
    resultPanel.dataset.empty = "false";

    const scoreBlock = document.createElement("div");
    scoreBlock.className = "result-score";
    appendText(scoreBlock, "span", "综合分");
    appendText(scoreBlock, "strong", `${data.totalScore} / ${data.outputMaxScore}`);
    resultPanel.appendChild(scoreBlock);

    appendText(resultPanel, "p", data.formulaName, "result-formula-name");
    appendText(resultPanel, "h3", "分项贡献");
    const breakdownList = document.createElement("ul");
    breakdownList.className = "result-breakdown";
    data.breakdown.map(renderBreakdownItem).forEach((item) => breakdownList.appendChild(item));
    resultPanel.appendChild(breakdownList);

    appendText(resultPanel, "p", data.explanation, "result-explanation");

    const sourceLink = document.createElement("a");
    sourceLink.className = "text-link";
    sourceLink.href = data.officialSourceUrl;
    sourceLink.rel = "noopener";
    sourceLink.textContent = "官方来源";
    resultPanel.appendChild(sourceLink);

    appendText(resultPanel, "p", data.disclaimer, "result-disclaimer");
    resultPanel.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function calculateScore() {
    const payload = {
      schoolId: scoreForm.dataset.schoolId,
      year: Number(scoreForm.dataset.year),
      scores: validateScores()
    };

    setFeedback("正在计算...", "loading");
    if (calculateButton) {
      calculateButton.disabled = true;
      calculateButton.dataset.loading = "true";
      calculateButton.textContent = "正在计算...";
    }

    const response = await fetch("/api/score/calculate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.message ?? "综合分计算失败。");
    }

    renderResult(body);
    setFeedback("");
  }

  if (schoolSelect && yearSelect) {
    schoolSelect.addEventListener("change", () => {
      refreshYearOptions();
      clearCalculationState();
    });
    yearSelect.addEventListener("change", clearCalculationState);
  }

  if (scoreForm) {
    scoreForm.addEventListener("input", (event) => {
      if (event.target.matches("[data-score-key]")) {
        validateScoreField(event.target);
        setFeedback("");
        resetResultPanel();
        refreshSubmitState();
      }
    });

    scoreForm.addEventListener("submit", (event) => {
      event.preventDefault();

      calculateScore().catch((error) => {
        setFeedback(error.message);
      }).finally(() => {
        if (calculateButton) {
          calculateButton.dataset.loading = "false";
          calculateButton.textContent = "计算综合分";
        }
        refreshSubmitState();
      });
    });

    refreshSubmitState();
  }
})();
