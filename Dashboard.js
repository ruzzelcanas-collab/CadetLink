// Interactive Dynamic Dashboard Features
const ANNOUNCEMENTS_KEY = "cadetlinkAnnouncements";
const CLC_ANNOUNCEMENTS_KEY = "cadetlinkCLCAnnouncements";

function renderAnnouncementFeed(containerId, storageKey, emptyText, unavailableText) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const announcements = JSON.parse(localStorage.getItem(storageKey) || "[]");
    container.replaceChildren();

    if (!Array.isArray(announcements) || announcements.length === 0) {
      const emptyNotice = document.createElement("p");
      emptyNotice.className = "dashboard-announcement-date";
      emptyNotice.textContent = emptyText;
      container.append(emptyNotice);
      return;
    }

    [...announcements].reverse().forEach((announcement) => {
      const article = document.createElement("article");
      article.className = "dashboard-announcement";
      const title = document.createElement("h3");
      title.textContent = announcement.title;
      const message = document.createElement("p");
      message.textContent = announcement.message;
      const date = document.createElement("p");
      date.className = "dashboard-announcement-date";
      date.textContent = new Date(announcement.updatedAt || announcement.createdAt).toLocaleString();
      article.append(title, message, date);
      container.append(article);
    });
  } catch {
    container.textContent = unavailableText;
  }
}

function renderDashboardAnnouncements() {
  renderAnnouncementFeed("announcementsContainer", ANNOUNCEMENTS_KEY, "No announcements have been published yet.", "Announcements are currently unavailable.");
  renderAnnouncementFeed("clcAnnouncementsContainer", CLC_ANNOUNCEMENTS_KEY, "No announcements have been published yet.", "Announcements are currently unavailable.");
}

document.addEventListener("DOMContentLoaded", () => {
  let userSession;
  try {
    userSession = JSON.parse(sessionStorage.getItem("cadetlinkSession") || "null");
  } catch {
    userSession = null;
  }
  if (!userSession || !userSession.uid) {
    window.location.replace("../Loading%20screen/Loadingscreen.html");
    return;
  }

  const logoutButton = document.getElementById("logoutBtn");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      sessionStorage.removeItem("cadetlinkSession");
      const signInPage = userSession.entryPoint === "url"
        ? "../index.html"
        : "../Loading%20screen/Loadingscreen.html";
      window.location.replace(signInPage);
    });
  }

  renderDashboardAnnouncements();

  window.addEventListener("cadetlink:announcements-updated", renderDashboardAnnouncements);
  window.addEventListener("storage", (event) => {
    if (!event.key || [ANNOUNCEMENTS_KEY, CLC_ANNOUNCEMENTS_KEY].includes(event.key)) {
      renderDashboardAnnouncements();
    }
  });

  // Update time dynamic display
  const clockElement = document.getElementById("clock-in-time");
  if (clockElement) {
    const now = new Date();
    clockElement.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Scan again button feedback
  const scanBtn = document.getElementById("scan-again-btn");
  if (scanBtn) {
    scanBtn.addEventListener("click", () => {
      // Reloads page or opens the loading screen snippet
      window.location.reload();
    });
  }
});




