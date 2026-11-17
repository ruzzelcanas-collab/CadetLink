function initializeAccess() {
  const signInForm = document.getElementById("signInForm");
  const signInRole = document.getElementById("signInRole");
  const signInSubcategory = document.getElementById("signInSubcategory");
  const signInSubcategoryGroup = document.getElementById("signInSubcategoryGroup");
  const signInName = document.getElementById("signInName");
  const signInNumber = document.getElementById("signInNumber");
  const signInNumberGroup = document.getElementById("signInNumberGroup");
  const signInPassword = document.getElementById("signInPassword");
  const signInError = document.getElementById("signInError");
  const accessStatus = document.getElementById("accessStatus");

  if (!window.CadetLinkAuth) {
    accessStatus.textContent = "Account access could not be initialized. Refresh this page to try again.";
    return;
  }
  if (!window.crypto?.subtle) {
    accessStatus.textContent = "Secure browser cryptography is unavailable. Open this page over HTTPS or localhost.";
    return;
  }

  signInRole.addEventListener("change", updateSignInFields);
  signInForm.addEventListener("submit", signIn);
  updateSignInFields();

  function updateSignInFields() {
    const category = signInRole.value;
    const usesNameAndPassword = ["CCA", "CAA"].includes(category);
    signInNumberGroup.hidden = usesNameAndPassword;
    signInNumber.required = !usesNameAndPassword;
    const subcategories = category === "CCA"
      ? ["Nurse", "Galley", "CCO/TLU"]
      : category === "CAA"
        ? ["Instructor", "KRC"]
        : [];
    signInSubcategoryGroup.hidden = subcategories.length === 0;
    signInSubcategory.replaceChildren(...subcategories.map((subcategory) => {
      const option = document.createElement("option");
      option.value = subcategory;
      option.textContent = subcategory;
      return option;
    }));
    signInSubcategory.required = subcategories.length > 0;
  }

  async function signIn(event) {
    event.preventDefault();
    const name = signInName.value.trim();
    const selectedCategory = signInRole.value;
    const cadetNumber = signInNumber.value.trim();
    const password = signInPassword.value;
    const submitButton = signInForm.querySelector("button[type=submit]");

    signInError.textContent = "";
    accessStatus.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "Checking...";

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          category: selectedCategory,
          subcategory: signInSubcategory.value,
          name,
          cadetNumber,
          password
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not verify your account. Try again.");
      CadetLinkAuth.enterDashboard(result.uid, result.account, "index", result.token);
    } catch (error) {
      console.error("Sign in failed:", error);
      signInError.textContent = "Could not verify your account. Check your connection and try again.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Sign in and continue";
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAccess, { once: true });
} else {
  initializeAccess();
}
