function initializeAdminAccess() {
  const signInForm = document.getElementById("adminSignInForm");
  const accessStatus = document.getElementById("adminAccessStatus");
  if (!window.CadetLinkAuth) {
    accessStatus.textContent = "Admin access could not be initialized. Refresh this page to try again.";
    return;
  }

  signInForm.addEventListener("submit", signIn);

  async function signIn(event) {
    event.preventDefault();
    const submitButton = signInForm.querySelector("button[type=submit]");
    const errorOutput = document.getElementById("adminSignInError");
    errorOutput.textContent = "";
    accessStatus.textContent = "";
    accessStatus.dataset.state = "";
    submitButton.disabled = true;
    submitButton.textContent = "Checking...";
    try {
      const result = await sendAuthRequest({
        action: "admin-login",
        name: document.getElementById("adminSignInName").value.trim(),
        password: document.getElementById("adminSignInPassword").value
      });
      if (result.account?.category !== "Admin") throw new Error("This account does not have Admin access.");
      CadetLinkAuth.enterDashboard(result.uid, result.account, "admin-access", result.token);
    } catch (error) {
      console.error("Admin sign-in failed:", error);
      errorOutput.textContent = error.message || "Could not verify the Admin account. Check your connection and try again.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Sign in as Admin";
    }
  }

  async function sendAuthRequest(body) {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Could not complete the request. Try again.");
    return result;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAdminAccess, { once: true });
} else {
  initializeAdminAccess();
}
