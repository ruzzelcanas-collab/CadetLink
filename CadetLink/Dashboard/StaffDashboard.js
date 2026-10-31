document.addEventListener("DOMContentLoaded", () => {
  const sessionKey = "cadetlinkSession";
  let session;
  try {
    session = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
  } catch (error) {
    console.error("Could not read the staff dashboard session:", error);
    session = null;
  }

  const requiredCategory = document.body.dataset.requiredCategory;
  const requiredSubcategory = document.body.dataset.requiredSubcategory;
  if (!session?.uid || !session.accessToken) {
    window.location.replace("/index.html");
    return;
  }
  if (session.category !== requiredCategory || session.subcategory !== requiredSubcategory) {
    window.location.replace("/index.html");
    return;
  }

  window.CadetLinkPortalSections.initializeStaffDashboard();
});
