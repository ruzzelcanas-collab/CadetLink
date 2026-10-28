// Interactive Dynamic Dashboard Features
function renderAnnouncementFeed(containerId, announcements, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.replaceChildren();

  if (announcements.length === 0) {
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
      const returnPath = userSession.entryPoint === "index"
        ? "../index.html"
        : "../Loading%20screen/Loadingscreen.html";
      sessionStorage.removeItem("cadetlinkSession");
      window.location.replace(returnPath);
    });
  }

  subscribeToAnnouncements("general", "announcementsContainer", "No announcements have been published yet.");
  subscribeToAnnouncements("clc", "clcAnnouncementsContainer", "No announcements have been published yet.");

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

function subscribeToAnnouncements(type, containerId, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    CadetLinkAnnouncements.getReference(type).on("value", (snapshot) => {
      renderAnnouncementFeed(containerId, CadetLinkAnnouncements.fromSnapshot(snapshot), emptyText);
    }, (error) => {
      console.error(`${type} announcements could not be loaded:`, error);
      container.textContent = "Announcements are currently unavailable. Check your connection and database access.";
    });
  } catch (error) {
    console.error(`${type} announcements could not be initialized:`, error);
    container.textContent = "Announcements are currently unavailable. Check your connection and database access.";
  }
}
