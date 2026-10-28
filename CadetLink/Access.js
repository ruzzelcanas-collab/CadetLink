function initializeAccess() {
  const signInForm = document.getElementById("signInForm");
  const signInRole = document.getElementById("signInRole");
  const signInName = document.getElementById("signInName");
  const signInNumber = document.getElementById("signInNumber");
  const signInNumberGroup = document.getElementById("signInNumberGroup");
  const signInPassword = document.getElementById("signInPassword");
  const signInError = document.getElementById("signInError");
  const accessStatus = document.getElementById("accessStatus");

  if (!window.firebase || typeof firebase.database !== "function") {
    accessStatus.textContent = "Firebase did not load. Refresh this page to try again.";
    return;
  }
  if (!window.CadetLinkAuth) {
    accessStatus.textContent = "Account access could not be initialized. Refresh this page to try again.";
    return;
  }
  if (!window.crypto?.subtle) {
    accessStatus.textContent = "Secure browser cryptography is unavailable. Open this page over HTTPS or localhost.";
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(CadetLinkAuth.firebaseConfig);
  const cadetsRef = firebase.database().ref("cadets");

  signInRole.addEventListener("change", updateSignInFields);
  signInForm.addEventListener("submit", signIn);
  updateSignInFields();

  function updateSignInFields() {
    const isAdmin = signInRole.value === "Admin";
    signInNumberGroup.hidden = isAdmin;
    signInNumber.required = !isAdmin;
  }

  async function signIn(event) {
    event.preventDefault();
    const name = signInName.value.trim();
    const selectedCategory = signInRole.value;
    const isAdmin = selectedCategory === "Admin";
    const cadetNumber = signInNumber.value.trim();
    const password = signInPassword.value;
    const submitButton = signInForm.querySelector("button[type=submit]");

    signInError.textContent = "";
    accessStatus.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "Checking...";

    try {
      const lookupField = isAdmin ? "name" : "cadetNumber";
      const lookupValue = isAdmin ? name : cadetNumber;
      const matchesSnapshot = await cadetsRef.orderByChild(lookupField).equalTo(lookupValue).once("value");
      const matches = [];
      matchesSnapshot.forEach((childSnapshot) => {
        const account = childSnapshot.val();
        if (!account || typeof account !== "object") return;

        const category = CadetLinkAuth.normalizeUserCategory(account.category);
        const nameMatches = typeof account.name === "string"
          && account.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase();
        const accountMatches = isAdmin
          ? category === selectedCategory && nameMatches
          : category === selectedCategory
            && nameMatches
            && typeof account.cadetNumber === "string"
            && account.cadetNumber.trim() === cadetNumber;
        if (accountMatches && account.password?.hash && account.password?.salt) {
          matches.push({ uid: childSnapshot.key, account });
        }
      });

      for (const match of matches) {
        const credential = match.account.password;
        const actualHash = await CadetLinkAuth.derivePasswordHash(password, credential.salt, credential.iterations);
        if (CadetLinkAuth.constantTimeEqual(actualHash, credential.hash)) {
          CadetLinkAuth.enterDashboard(match.uid, match.account, "index");
          return;
        }
      }

      signInError.textContent = "The account details or password did not match. Check them and try again.";
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
