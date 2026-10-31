const DEVILS_REPORTS_PATH = "devilsReports";
const DEVILS_REPORTS_PREVIEW_KEY = "cadetlinkPreviewDevilsReports";
const DEVILS_REPORTS_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCsBK8esC6Nwd-xp2cce9UtKi5xDEhWwgY",
  authDomain: "cadetlink-d53c4.firebaseapp.com",
  databaseURL: "https://cadetlink-d53c4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cadetlink-d53c4",
  storageBucket: "cadetlink-d53c4.firebasestorage.app",
  messagingSenderId: "936082286663",
  appId: "1:936082286663:web:9406ef4ee08c9ca7efe962",
  measurementId: "G-L6SQ6ZW1XY"
};

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("devilsReportContainer");
  if (!container) return;

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
  const canViewAdminFeed = ["Admin", "CLC", "CCA", "CAA"].includes(userSession.category);
  if (container.closest(".admin-devils-report-section") && !canViewAdminFeed) return;
  const isAdminFeed = Boolean(container.closest(".admin-devils-report-section"))
    && canViewAdminFeed;
  const isUserDashboard = userSession.category === "Normal Cadet" && !isAdminFeed;
  const adminStatus = isAdminFeed ? document.getElementById("devilsReportAdminStatus") : null;

  const form = document.getElementById("devilsReportForm");
  const status = document.getElementById("devilsReportStatus");
  const sendButton = document.getElementById("devilsReportSend");
  const reportsFeed = container;
  let previousReportIds = null;
  const isLocalPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (isLocalPreview) {
    initializeLocalPreview();
    return;
  }

  if (!window.firebase || typeof firebase.database !== "function") {
    showFeedError("Reports are unavailable because Firebase did not load.");
    console.error("DEVILS REPORT could not start because Firebase did not load.");
    return;
  }

  let reportsRef;
  try {
    if (!firebase.apps.length) firebase.initializeApp(DEVILS_REPORTS_FIREBASE_CONFIG);
    reportsRef = firebase.database().ref(DEVILS_REPORTS_PATH);
    reportsRef.on("value", (snapshot) => renderReports(snapshot.val()), (error) => {
      console.error("DEVILS REPORT updates could not be received:", error);
      showFeedError("Reports are unavailable. Check your connection and database access.");
      if (status) {
        status.textContent = "Could not load reports.";
        status.classList.add("is-error");
      }
    });
  } catch (error) {
    console.error("DEVILS REPORT could not connect to Firebase:", error);
    showFeedError("Reports are unavailable because the database connection could not start.");
    return;
  }

  if (isAdminFeed) {
    reportsFeed.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button || button.disabled) return;

      const reportId = button.dataset.id;
      if (!reportId) return;

      if (button.dataset.action === "acknowledge-report") {
        button.disabled = true;
        button.textContent = "Approving...";
        if (adminStatus) {
          adminStatus.textContent = "";
          adminStatus.classList.remove("is-error");
        }
        try {
          await reportsRef.child(reportId).update({
            acknowledged: true,
            acknowledgedAt: new Date().toISOString()
          });
        } catch (error) {
          console.error("DEVILS REPORT could not be acknowledged:", error);
          if (adminStatus) {
            adminStatus.textContent = "Could not approve the report. Check your connection and database access, then try again.";
            adminStatus.classList.add("is-error");
          }
          button.disabled = false;
          button.textContent = "Acknowledge";
        }
        return;
      }

      if (button.dataset.action !== "remove-report"
        || !window.confirm("Permanently remove this report from all dashboards? This cannot be undone.")) return;

      button.disabled = true;
      button.textContent = "Removing...";
      if (adminStatus) {
        adminStatus.textContent = "";
        adminStatus.classList.remove("is-error");
      }
      try {
        await reportsRef.child(reportId).remove();
        if (adminStatus) adminStatus.textContent = "Report permanently removed from all dashboards.";
      } catch (error) {
        console.error("DEVILS REPORT could not be removed:", error);
        if (adminStatus) {
          adminStatus.textContent = "Could not remove the report. Check your connection and database access, then try again.";
          adminStatus.classList.add("is-error");
        }
        button.disabled = false;
        button.textContent = "Remove report";
      }
    });
  }

  if (!form || !status || !sendButton) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";
    status.classList.remove("is-error");

    const pictureInput = document.getElementById("devilsReportPicture");
    const descriptionInput = document.getElementById("devilsReportDescription");
    const placeInput = document.getElementById("devilsReportPlace");
    const pictureFile = pictureInput.files[0];
    if (!pictureFile || !pictureFile.type.startsWith("image/")) {
      showStatus("Choose an image to attach to your report.", true);
      return;
    }
    if (pictureFile.size > 10 * 1024 * 1024) {
      showStatus("Choose an image smaller than 10 MB.", true);
      return;
    }

    const description = descriptionInput.value.trim();
    const place = placeInput.value.trim();
    if (!description || !place) {
      showStatus("Enter a description and place for your report.", true);
      return;
    }

    sendButton.disabled = true;
    sendButton.textContent = "Sending...";
    try {
      const image = await readCompressedReportImage(pictureFile);
      if (image.length > 1_100_000) {
        throw new Error("The compressed picture is too large to share. Choose a smaller image.");
      }

      await reportsRef.push().set({
        image,
        description,
        place,
        senderUid: userSession.uid,
        senderName: userSession.name || "Cadet",
        senderPicture: window.CadetLinkProfilePictures?.getCurrentPicture() || userSession.profilePicture || "",
        sentAt: new Date().toISOString()
      });
      form.reset();
      showStatus("Report sent and shared with the CLC and Admin dashboards.", false);
    } catch (error) {
      console.error("DEVILS REPORT could not be sent:", error);
      showStatus(error.message || "Could not send the report. Check your connection and try again.", true);
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = "Send report";
    }
  });

  function renderReports(savedReports) {
    reportsFeed.replaceChildren();
    const reports = savedReports && typeof savedReports === "object"
      ? Object.entries(savedReports).map(([id, report]) => ({ ...report, id }))
      : [];
    const currentReportIds = new Set(reports.map((report) => report.id));

    reports.sort((first, second) => {
      const firstTime = Date.parse(first.sentAt) || 0;
      const secondTime = Date.parse(second.sentAt) || 0;
      return secondTime - firstTime || second.id.localeCompare(first.id);
    });

    if (reports.length === 0) {
      const emptyNotice = document.createElement("p");
      emptyNotice.className = "devils-report-empty";
      emptyNotice.textContent = "No reports have been sent yet.";
      reportsFeed.append(emptyNotice);
      previousReportIds = currentReportIds;
      return;
    }

    reports.forEach((report) => {
      const card = document.createElement("article");
      const isNewReport = previousReportIds !== null && !previousReportIds.has(report.id);
      card.className = isNewReport
        ? "devils-report-card is-new"
        : "devils-report-card";
      card.append(window.CadetLinkProfilePictures.createIdentity(
        report.senderPicture,
        report.senderName || "Cadet",
        "devils-report-sender"
      ));

      const hasPicture = typeof report.image === "string"
        && /^data:image\/jpeg;base64,/i.test(report.image);
      const showAcknowledgedOnPicture = isUserDashboard
        && report.acknowledged === true
        && hasPicture;

      if (hasPicture) {
        const pictureWrap = document.createElement("div");
        pictureWrap.className = "devils-report-picture-wrap";
        const picture = document.createElement("img");
        picture.className = "devils-report-picture";
        picture.src = report.image;
        picture.alt = "Picture attached to report";
        picture.loading = "lazy";
        pictureWrap.append(picture);
        if (showAcknowledgedOnPicture) {
          const approval = document.createElement("p");
          approval.className = "devils-report-picture-acknowledged";
          approval.textContent = "Acknowledged";
          pictureWrap.append(approval);
        }
        card.append(pictureWrap);
      } else {
        const noPicture = document.createElement("div");
        noPicture.className = "devils-report-no-picture";
        noPicture.textContent = "No picture attached";
        card.append(noPicture);
      }

      const description = document.createElement("p");
      description.className = "devils-report-description";
      description.textContent = report.description || "";

      const sent = document.createElement("p");
      sent.className = "devils-report-sent";
      const sentAt = new Date(report.sentAt);
      sent.textContent = Number.isNaN(sentAt.getTime())
        ? "Time sent unavailable"
        : `Sent ${sentAt.toLocaleString()}`;

      const place = document.createElement("p");
      place.className = "devils-report-place";
      place.textContent = `Place: ${report.place || "Not provided"}`;

      card.append(description, sent, place);
      if (isAdminFeed || (report.acknowledged === true && !showAcknowledgedOnPicture)) {
        const footer = document.createElement("div");
        footer.className = "devils-report-footer";

        if (report.acknowledged === true) {
          const approval = document.createElement("p");
          approval.className = "devils-report-approved";
          approval.textContent = "Acknowledged";
          footer.append(approval);
        } else if (isAdminFeed) {
          const acknowledgeButton = document.createElement("button");
          acknowledgeButton.className = "devils-report-acknowledge";
          acknowledgeButton.type = "button";
          acknowledgeButton.dataset.action = "acknowledge-report";
          acknowledgeButton.dataset.id = report.id;
          acknowledgeButton.textContent = "Acknowledge";
          footer.append(acknowledgeButton);
        }

        if (isAdminFeed) {
          const removeButton = document.createElement("button");
          removeButton.className = "devils-report-remove";
          removeButton.type = "button";
          removeButton.dataset.action = "remove-report";
          removeButton.dataset.id = report.id;
          removeButton.textContent = "Remove report";
          removeButton.setAttribute("aria-label", `Permanently remove report sent ${sent.textContent.replace(/^Sent /, "")}`);
          footer.append(removeButton);
        }
        card.append(footer);
      }
      reportsFeed.append(card);
    });
    previousReportIds = currentReportIds;
  }

  function initializeLocalPreview() {
    const reportSection = container.closest(".devils-report-section, .admin-devils-report-section");
    const content = reportSection?.querySelector(".devils-report-content");
    if (content) {
      const notice = document.createElement("p");
      notice.className = "devils-report-preview-note";
      notice.textContent = "Local preview only: reports are saved in this browser and do not sync to Firebase.";
      content.prepend(notice);
    }

    function readLocalReports() {
      try {
        const reports = JSON.parse(localStorage.getItem(DEVILS_REPORTS_PREVIEW_KEY) || "{}");
        if (!reports || typeof reports !== "object" || Array.isArray(reports)) {
          throw new Error("Local report data is invalid.");
        }
        return reports;
      } catch (error) {
        console.error("Local DEVILS REPORT preview data could not be read:", error);
        showFeedError(error.message || "Local reports could not be read.");
        return null;
      }
    }

    function saveLocalReports(reports) {
      try {
        localStorage.setItem(DEVILS_REPORTS_PREVIEW_KEY, JSON.stringify(reports));
        renderReports(reports);
        return true;
      } catch (error) {
        console.error("Local DEVILS REPORT preview data could not be saved:", error);
        if (adminStatus) {
          adminStatus.textContent = error.message || "Local report storage is unavailable or full.";
          adminStatus.classList.add("is-error");
        } else if (status) {
          showStatus(error.message || "Local report storage is unavailable or full.", true);
        }
        return false;
      }
    }

    const savedReports = readLocalReports();
    if (!savedReports) return;
    renderReports(savedReports);
    window.addEventListener("storage", (event) => {
      if (event.key !== DEVILS_REPORTS_PREVIEW_KEY) return;
      const latestReports = readLocalReports();
      if (latestReports) renderReports(latestReports);
    });

    if (isAdminFeed) {
      reportsFeed.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button || button.disabled) return;
        const reports = readLocalReports();
        if (!reports || !reports[button.dataset.id]) return;

        if (button.dataset.action === "remove-report"
          && !window.confirm("Remove this preview report from all preview dashboards?")) return;
        if (!["acknowledge-report", "remove-report"].includes(button.dataset.action)) return;

        if (button.dataset.action === "acknowledge-report") {
          reports[button.dataset.id].acknowledged = true;
          reports[button.dataset.id].acknowledgedAt = new Date().toISOString();
        } else {
          delete reports[button.dataset.id];
        }
        saveLocalReports(reports);
      });
    }

    if (!form || !status || !sendButton) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "";
      status.classList.remove("is-error");

      const pictureInput = document.getElementById("devilsReportPicture");
      const descriptionInput = document.getElementById("devilsReportDescription");
      const placeInput = document.getElementById("devilsReportPlace");
      const pictureFile = pictureInput?.files?.[0];
      if (!pictureFile || !pictureFile.type.startsWith("image/")) {
        showStatus("Choose an image to attach to your report.", true);
        return;
      }
      if (pictureFile.size > 10 * 1024 * 1024) {
        showStatus("Choose an image smaller than 10 MB.", true);
        return;
      }
      const description = descriptionInput.value.trim();
      const place = placeInput.value.trim();
      if (!description || !place) {
        showStatus("Enter a description and place for your report.", true);
        return;
      }

      sendButton.disabled = true;
      sendButton.textContent = "Sending...";
      try {
        const image = await readCompressedReportImage(pictureFile);
        if (image.length > 1_100_000) {
          throw new Error("The compressed picture is too large to share. Choose a smaller image.");
        }
        const reports = readLocalReports();
        if (!reports) throw new Error("Local preview reports could not be loaded.");
        const id = crypto.randomUUID();
        reports[id] = {
          image,
          description,
          place,
          senderUid: userSession.uid,
          senderName: userSession.name || "Cadet",
          senderPicture: window.CadetLinkProfilePictures?.getCurrentPicture() || userSession.profilePicture || "",
          sentAt: new Date().toISOString()
        };
        if (!saveLocalReports(reports)) throw new Error("Could not save this preview report.");
        form.reset();
        showStatus("Preview report saved and shared with the other local dashboards.", false);
      } catch (error) {
        console.error("Local DEVILS REPORT preview could not be saved:", error);
        showStatus(error.message || "Could not save the preview report.", true);
      } finally {
        sendButton.disabled = false;
        sendButton.textContent = "Send report";
      }
    });
  }

  function showFeedError(message) {
    reportsFeed.replaceChildren();
    const errorNotice = document.createElement("p");
    errorNotice.className = "devils-report-empty is-error";
    errorNotice.textContent = message;
    reportsFeed.append(errorNotice);
  }

  function showStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }
});

function readCompressedReportImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected picture."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read the selected picture."));
        return;
      }

      const image = new Image();
      image.onerror = () => reject(new Error("The selected file is not a readable image."));
      image.onload = () => {
        const maxDimension = 1000;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Picture processing is not supported in this browser."));
          return;
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        try {
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        } catch {
          reject(new Error("Could not prepare the selected picture."));
        }
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
