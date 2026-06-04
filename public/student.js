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

showToastFromQuery();
