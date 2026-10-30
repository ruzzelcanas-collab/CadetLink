(() => {
  let userSession = null;
  try {
    userSession = JSON.parse(sessionStorage.getItem("cadetlinkSession") || "null");
  } catch (error) {
    console.warn("The signed-in account could not be identified for its display preference:", error);
  }
  const storageKey = typeof userSession?.uid === "string" && userSession.uid
    ? `cadetlinkDisplayTheme:${encodeURIComponent(userSession.uid)}`
    : null;
  const choices = document.querySelectorAll("[data-theme-choice]");

  function applyTheme(theme) {
    const selectedTheme = theme === "night" ? "night" : "day";
    document.body.dataset.theme = selectedTheme;
    choices.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === selectedTheme));
    });
  }

  let savedTheme = "day";
  if (storageKey) {
    try {
      savedTheme = localStorage.getItem(storageKey) === "night" ? "night" : "day";
    } catch (error) {
      console.warn("The display theme preference could not be loaded:", error);
    }
  }
  applyTheme(savedTheme);

  choices.forEach((button) => {
    button.addEventListener("click", () => {
      const theme = button.dataset.themeChoice;
      applyTheme(theme);
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, theme);
      } catch (error) {
        console.warn("The display theme preference could not be saved:", error);
      }
    });
  });
})();
