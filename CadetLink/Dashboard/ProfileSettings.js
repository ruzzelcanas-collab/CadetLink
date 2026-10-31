(() => {
  const modal = document.getElementById("profileSettingsModal");
  if (!modal) return;

  const closeButton = document.getElementById("closeProfileSettings");
  const sectionForm = document.getElementById("profileDetailsForm");
  const passwordForm = document.getElementById("profilePasswordForm");
  const sectionInput = document.getElementById("profileSettingsSection");
  const pictureInput = document.getElementById("profilePictureInput");
  const sessionKey = "cadetlinkSession";

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(sessionKey) || "null");
    } catch (error) {
      console.error("Could not read the profile settings session:", error);
      return null;
    }
  }

  function showStatus(id, message, isError = false) {
    const status = document.getElementById(id);
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  async function request(action, fields) {
    const session = getSession();
    if (!session?.accessToken) throw new Error("Your session expired. Sign in again.");
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`
      },
      body: JSON.stringify({ action, ...fields })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Could not update your profile.");
    return result;
  }

  function open() {
    const session = getSession();
    if (!session?.uid) return;
    document.getElementById("profileSettingsName").textContent = session.name || "Cadet";
    const roleLabel = [session.category, session.subcategory].filter(Boolean).join(" · ");
    document.getElementById("profileSettingsRole").textContent = roleLabel || "Cadet account";
    const cadetNumber = document.getElementById("profileSettingsCadetNumber");
    cadetNumber.textContent = session.cadetNumber ? `Cadet number ${session.cadetNumber}` : "";
    cadetNumber.hidden = !session.cadetNumber;
    const avatar = document.getElementById("profileSettingsAvatar");
    avatar.replaceChildren(window.CadetLinkProfilePictures.createAvatar(
      session.profilePicture,
      session.name,
      "profile-settings-avatar-image"
    ));
    sectionInput.value = session.section || "";
    showStatus("profileDetailsStatus", "");
    showStatus("profilePasswordStatus", "");
    showStatus("profilePictureSaveStatus", "");
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    closeButton.focus();
  }

  function close() {
    modal.hidden = true;
    document.body.style.overflow = "";
    document.getElementById("profilePictureButton")?.focus();
  }

  closeButton.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) close();
  });
  document.getElementById("changeProfilePicture").addEventListener("click", () => pictureInput?.click());

  sectionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = sectionForm.querySelector("button[type=submit]");
    submit.disabled = true;
    showStatus("profileDetailsStatus", "Saving section...");
    try {
      await request("update-profile", { section: sectionInput.value });
      const session = getSession();
      session.section = sectionInput.value.trim();
      sessionStorage.setItem(sessionKey, JSON.stringify(session));
      showStatus("profileDetailsStatus", "Section updated.");
    } catch (error) {
      showStatus("profileDetailsStatus", error.message, true);
    } finally {
      submit.disabled = false;
    }
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = document.getElementById("profileCurrentPassword").value;
    const newPassword = document.getElementById("profileNewPassword").value;
    const confirmPassword = document.getElementById("profileConfirmPassword").value;
    if (newPassword !== confirmPassword) {
      showStatus("profilePasswordStatus", "The new passwords do not match.", true);
      return;
    }

    const submit = passwordForm.querySelector("button[type=submit]");
    submit.disabled = true;
    showStatus("profilePasswordStatus", "Updating password...");
    try {
      await request("change-password", { currentPassword, newPassword });
      passwordForm.reset();
      showStatus("profilePasswordStatus", "Password updated.");
    } catch (error) {
      showStatus("profilePasswordStatus", error.message, true);
    } finally {
      submit.disabled = false;
    }
  });

  window.CadetLinkProfileSettings = Object.freeze({ open });
})();
