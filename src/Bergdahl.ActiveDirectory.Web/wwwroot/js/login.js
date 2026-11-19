// Sign-in form. The server checks the credentials against Active Directory.

(function () {
  const form = document.querySelector("[data-login-form]");
  const error = document.querySelector("[data-login-error]");
  const button = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;

    if (!username) {
      error.textContent = "Enter a user name.";
      form.elements.username.focus();
      return;
    }
    error.textContent = "";
    button.disabled = true;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        sessionStorage.setItem("csrf", data.csrf);
        location.href = "/";
        return;
      }
      error.textContent = data.message || "Sign-in failed.";
      form.elements.password.select();
    } catch {
      error.textContent = "Could not reach the server.";
    } finally {
      button.disabled = false;
    }
  });
})();
