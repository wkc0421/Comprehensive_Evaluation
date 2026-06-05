const mainlandPhonePattern = /^(?:\+?86)?1[3-9]\d{9}$/;
const countdownSeconds = 60;

function loginErrorText(error) {
  if (error === "invalid_phone") {
    return "请输入中国大陆手机号。";
  }

  if (error === "phone_verification_unavailable") {
    return "发送失败，请稍后重试。";
  }

  return "发送失败，请重试。";
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
      button.textContent = "发送验证码";
    }
  }, 1000);
}

async function sendOtp(form, button) {
  const phoneInput = form.elements.phoneNumber;
  const phoneNumber = String(phoneInput?.value ?? "").trim();

  if (!mainlandPhonePattern.test(phoneNumber)) {
    setInlineError(form, "请输入中国大陆手机号。");
    phoneInput?.focus();
    return;
  }

  setInlineError(form, "");
  button.disabled = true;
  button.textContent = "发送中";

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
      button.textContent = "重新发送";
      return;
    }

    startCountdown(button);
  } catch {
    setInlineError(form, "发送失败，请重试。");
    button.disabled = false;
    button.textContent = "重新发送";
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
      submit.textContent = "登录中";
    }
  });
}

bindLoginForm();
