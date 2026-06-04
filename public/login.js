const mainlandPhonePattern = /^(?:\+?86)?1[3-9]\d{9}$/;
const countdownSeconds = 60;

function loginErrorText(error) {
  if (error === "invalid_phone") {
    return "Enter a mainland China phone number.";
  }

  if (error === "phone_verification_unavailable") {
    return "Sending failed. Please try again later.";
  }

  return "Sending failed. Please try again.";
}

function updateSubmitState(form) {
  const agreement = form.querySelector("[data-login-agreement='true']");
  const submit = form.querySelector("[data-login-submit='true']");

  if (!agreement || !submit) {
    return;
  }

  submit.disabled = !agreement.checked;
}

function setInlineError(form, message) {
  const error = form.querySelector("[data-login-error='true']");

  if (error) {
    error.textContent = message;
  }
}

function startCountdown(button) {
  let remaining = countdownSeconds;
  button.disabled = true;
  button.textContent = `${remaining}s`;

  const timer = window.setInterval(() => {
    remaining -= 1;
    button.textContent = `${remaining}s`;

    if (remaining <= 0) {
      window.clearInterval(timer);
      button.disabled = false;
      button.textContent = "Send code";
    }
  }, 1000);
}

async function sendOtp(form, button) {
  const phoneInput = form.elements.phoneNumber;
  const phoneNumber = String(phoneInput?.value ?? "").trim();

  if (!mainlandPhonePattern.test(phoneNumber)) {
    setInlineError(form, "Enter a mainland China phone number.");
    phoneInput?.focus();
    return;
  }

  setInlineError(form, "");
  button.disabled = true;
  button.textContent = "Sending";

  try {
    const response = await fetch("/api/auth/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber })
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setInlineError(form, loginErrorText(body.error));
      button.disabled = false;
      button.textContent = "Retry code";
      return;
    }

    startCountdown(button);
  } catch {
    setInlineError(form, "Sending failed. Please try again.");
    button.disabled = false;
    button.textContent = "Retry code";
  }
}

function bindLoginForm() {
  const form = document.querySelector("[data-login-form='true']");

  if (!form) {
    return;
  }

  const agreement = form.querySelector("[data-login-agreement='true']");
  const sendButton = form.querySelector("[data-send-otp='true']");
  const submit = form.querySelector("[data-login-submit='true']");

  updateSubmitState(form);

  agreement?.addEventListener("change", () => {
    updateSubmitState(form);
  });

  sendButton?.addEventListener("click", () => {
    sendOtp(form, sendButton);
  });

  form.addEventListener("submit", () => {
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Logging in";
    }
  });
}

bindLoginForm();
