const DEVILS_REPORTS_PATH = "devilsReports";
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
  if (container.closest(".admin-devils-report-section") && userSession.category !== "Admin") return;

  const form = document.getElementById("devilsReportForm");
  const status = document.getElementById("devilsReportStatus");
  const sendButton = document.getElementById("devilsReportSend");
  const reportsFeed = container;
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
      return;
    }

    reports.forEach((report) => {
      const card = document.createElement("article");
      card.className = "devils-report-card";

      if (typeof report.image === "string" && /^data:image\/jpeg;base64,/i.test(report.image)) {
        const picture = document.createElement("img");
        picture.className = "devils-report-picture";
        picture.src = report.image;
        picture.alt = "Picture attached to report";
        picture.loading = "lazy";
        card.append(picture);
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
      reportsFeed.append(card);
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
