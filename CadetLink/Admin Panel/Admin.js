const SESSION_KEY = "cadetlinkSession";
const DASHBOARD_URLS = {
  Admin: "Admin.html",
  CLC: "../CLC%20Panel/CLCDashboard.html",
  "CCA-CCO/TLU": "../CCA-CCO-TLU.html",
  "CCA-Nurse": "../CCA-Nurse.html",
  "CCA-Galley": "../CCA-Galley.html",
  "CAA-Instructor": "../CAA-Instructor.html",
  "CAA-KRC": "../CAA-KRC.html",
  "Normal Cadet": "../Dashboard/Dashboard.html"
};

document.addEventListener("DOMContentLoaded", () => {
  let userSession;
  try {
    userSession = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch (error) {
    console.error("Could not read the dashboard session:", error);
    userSession = null;
  }

  if (!userSession?.uid || !userSession.accessToken) {
    window.location.replace("../Loading%20screen/Loadingscreen.html");
    return;
  }

  const requiredCategory = document.body.dataset.requiredCategory || "Admin";
  const requiredSubcategory = document.body.dataset.requiredSubcategory || "";
  if (userSession.category !== requiredCategory
    || (requiredSubcategory && userSession.subcategory !== requiredSubcategory)) {
    const role = `${userSession.category}-${userSession.subcategory || ""}`;
    window.location.replace(DASHBOARD_URLS[role] || DASHBOARD_URLS[userSession.category] || DASHBOARD_URLS["Normal Cadet"]);
    return;
  }

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    const returnPath = userSession.entryPoint === "admin-access"
      ? "../admin-access.html"
      : userSession.entryPoint === "index"
        ? "../index.html"
        : "../Loading%20screen/Loadingscreen.html";
    sessionStorage.removeItem(SESSION_KEY);
    window.location.replace(returnPath);
  });

  setupReportImageViewer();
});

function setupReportImageViewer() {
  const viewer = document.getElementById("adminImageViewer");
  const viewerPicture = document.getElementById("adminImageViewerPicture");
  const closeButton = document.getElementById("closeAdminImageViewer");
  const reportFeed = document.getElementById("devilsReportContainer");
  if (!viewer || !viewerPicture || !closeButton || !reportFeed) return;

  let returnFocusTo = null;
  let previousBodyOverflow = "";

  function makeImagesKeyboardAccessible(container) {
    container.querySelectorAll("img").forEach((image) => {
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute("aria-label", `View ${image.alt || "attached picture"} full size`);
    });
  }

  function openViewer(image) {
    returnFocusTo = image;
    previousBodyOverflow = document.body.style.overflow;
    viewerPicture.src = image.src;
    viewerPicture.alt = image.alt;
    viewer.hidden = false;
    document.body.style.overflow = "hidden";
    closeButton.focus();
  }

  function closeViewer() {
    viewer.hidden = true;
    viewerPicture.removeAttribute("src");
    document.body.style.overflow = previousBodyOverflow;
    returnFocusTo?.focus();
  }

  makeImagesKeyboardAccessible(reportFeed);
  reportFeed.addEventListener("click", (event) => {
    const image = event.target.closest("img");
    if (image && reportFeed.contains(image)) openViewer(image);
  });
  reportFeed.addEventListener("keydown", (event) => {
    const image = event.target.closest("img");
    if (!image || !reportFeed.contains(image) || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openViewer(image);
  });

  const imageObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches("img")) {
          node.tabIndex = 0;
          node.setAttribute("role", "button");
          node.setAttribute("aria-label", `View ${node.alt || "attached picture"} full size`);
        }
        makeImagesKeyboardAccessible(node);
      });
    });
  });
  imageObserver.observe(reportFeed, { childList: true, subtree: true });

  closeButton.addEventListener("click", closeViewer);
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) closeViewer();
  });
  document.addEventListener("keydown", (event) => {
    if (viewer.hidden) return;
    if (event.key === "Escape") {
      closeViewer();
    } else if (event.key === "Tab") {
      event.preventDefault();
      closeButton.focus();
    }
  });
}
