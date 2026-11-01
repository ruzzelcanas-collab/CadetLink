document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".duties-btn").forEach((toggleBtn) => {
    const wrapper = document.getElementById(toggleBtn.getAttribute("aria-controls"));
    if (!wrapper) return;

    toggleBtn.addEventListener("click", () => {
      const isOpen = toggleBtn.classList.contains("active");

      if (isOpen) {
        wrapper.style.maxHeight = null;
        toggleBtn.classList.remove("active");
        toggleBtn.setAttribute("aria-expanded", "false");
      } else {
        toggleBtn.classList.add("active");
        toggleBtn.setAttribute("aria-expanded", "true");
        wrapper.style.maxHeight = wrapper.scrollHeight + "px";
      }
    });
  });

  const cadetName = getRegisteredCadetName();
  if (cadetName) {
    fetchDutiesFromGoogleSheets(cadetName);
    fetchSecondTabFromGoogleSheets(cadetName);
    fetchStudyCallFromGoogleSheets(cadetName);
  }
});








const SPREADSHEET_API_URL = "https://script.google.com/macros/s/AKfycbzXJb_COXV6HEraXVWH5podyrGSKAnjHKvTZmsEkn7GGHZRn5DYCVEi0jZj4RQMiAHd/exec";

function getRegisteredCadetName() {
  try {
    const session = JSON.parse(sessionStorage.getItem("cadetlinkSession") || "null");
    return typeof session?.name === "string" ? session.name.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Searches Google Spreadsheet for matching Cadet Name via Apps Script API
 */
function fetchDutiesFromGoogleSheets(cadetName) {
  const container = document.getElementById("dutiesDataContainer");
  const wrapper = document.getElementById("dutiesWrapper");
  if (!container || !wrapper) return;

  if (!cadetName) {
    showDutiesMessage(container, "Your registered name could not be found. Sign in again to view duties.");
    updateDutiesHeight(wrapper);
    return;
  }

  showDutiesMessage(container, `Searching duties for ${cadetName}...`);
  updateDutiesHeight(wrapper);

  fetch(`${SPREADSHEET_API_URL}?name=${encodeURIComponent(cadetName)}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Spreadsheet request failed: ${response.status}`);
      return response.json();
    })
    .then((duties) => {
      container.replaceChildren();

      if (Array.isArray(duties) && duties.length > 0) {
        duties.forEach((duty) => renderDutyCard(duty, container));
      } else {
        showDutiesMessage(container, `No duty records found for ${cadetName}.`);
      }

      updateDutiesHeight(wrapper);
    })
    .catch((err) => {
      console.error("Error loading spreadsheet data:", err);
      showDutiesMessage(container, "Duties could not be loaded. Check your connection and try again.", "error");
      updateDutiesHeight(wrapper);
    });
}

function renderDutyCard(duty, container, roleVariant = "") {
  const record = duty || {};
  const card = document.createElement("article");
  card.className = "duty-card";
  card.setAttribute("aria-label", "Daily duty");

  [
    ["Date", record.date],
    ["Day", record.day],
    ["Time", record.time],
    ["Role", record.role],
    ["Name", record.name]
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "duty-row";

    const labelElement = document.createElement("span");
    labelElement.className = "duty-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("span");
    valueElement.className = label === "Role"
      ? `duty-value duty-role-badge${roleVariant ? ` ${roleVariant}` : ""}`
      : "duty-value";
    valueElement.textContent = value == null || value === "" ? "—" : String(value);

    row.append(labelElement, valueElement);
    card.append(row);
  });

  container.append(card);
}

function showDutiesMessage(container, message, state = "") {
  const paragraph = document.createElement("p");
  paragraph.className = `placeholder-text${state ? ` is-${state}` : ""}`;
  paragraph.textContent = message;
  container.replaceChildren(paragraph);
}

function updateDutiesHeight(wrapper) {
  if (wrapper && wrapper.previousElementSibling?.classList.contains("active")) {
    wrapper.style.maxHeight = `${wrapper.scrollHeight}px`;
  }
}










function loadDutiesData(dataArray) {
  const container = document.getElementById("dutiesDataContainer");
  if (!container) return;

  container.replaceChildren();
  if (Array.isArray(dataArray)) {
    dataArray.forEach((duty) => renderDutyCard(duty, container));
  }

  const wrapper = document.getElementById("dutiesWrapper");
  updateDutiesHeight(wrapper);
}


















const CMI_BREAD_API_URL = "https://script.google.com/macros/s/AKfycbxSuNnrvib3-0e2rD_fK0XucEaPXNIjps2Zs0TlqEUD7sXOPzgaaYZLBTWZaWrCQmGW/exec";

/**
 * Fetches duty records specifically from the CMI & Daily Bread tab
 */
function fetchSecondTabFromGoogleSheets(cadetName) {
  const container = document.getElementById("cmiDataContainer");
  const wrapper = document.getElementById("cmiWrapper");
  if (!container || !wrapper) return;

  if (!cadetName) {
    showDutiesMessage(container, "Your registered name could not be found. Sign in again to view CMI and Daily Bread.");
    updateDutiesHeight(wrapper);
    return;
  }

  showDutiesMessage(container, `Searching CMI and Daily Bread for ${cadetName}...`);
  updateDutiesHeight(wrapper);

  fetch(`${CMI_BREAD_API_URL}?name=${encodeURIComponent(cadetName)}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Spreadsheet request failed: ${response.status}`);
      return response.json();
    })
    .then((records) => {
      container.replaceChildren();

      if (Array.isArray(records) && records.length > 0) {
        records.forEach((record) => renderSecondTabCard(record, container));
      } else {
        showDutiesMessage(container, `No CMI or Daily Bread records found for ${cadetName}.`);
      }

      updateDutiesHeight(wrapper);
    })
    .catch((err) => {
      console.error("Error loading CMI and Daily Bread data:", err);
      showDutiesMessage(container, "CMI and Daily Bread could not be loaded. Check your connection and try again.", "error");
      updateDutiesHeight(wrapper);
    });
}

function renderSecondTabCard(record, container) {
  const role = String(record?.role || "").toUpperCase();
  const roleVariant = role.includes("CMI") ? "is-cmi" : "is-bread";
  renderDutyCard(record, container, roleVariant);
}















const STUDY_CALL_API_URL = "https://script.google.com/macros/s/AKfycbxY14BwtyGQXE0TAP7clcSS-Ivv2cM1tzlw-5JAUyDnvKhKCY51ZVsHYaytoV9nB_s/exec";

/**
 * Fetches data specifically from Study Call Watchers & Details tab
 */
function fetchStudyCallFromGoogleSheets(cadetName) {
  const container = document.getElementById("studyCallDataContainer");
  const wrapper = document.getElementById("studyCallWrapper");
  if (!container || !wrapper) return;

  if (!cadetName) {
    showDutiesMessage(container, "Your registered name could not be found. Sign in again to view Studycall Watcher records.");
    updateDutiesHeight(wrapper);
    return;
  }

  showDutiesMessage(container, `Searching Studycall Watcher records for ${cadetName}...`);
  updateDutiesHeight(wrapper);

  fetch(`${STUDY_CALL_API_URL}?name=${encodeURIComponent(cadetName)}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Spreadsheet request failed: ${response.status}`);
      return response.json();
    })
    .then((records) => {
      container.replaceChildren();

      if (Array.isArray(records) && records.length > 0) {
        records.forEach((record) => renderStudyCallCard(record, container));
      } else {
        showDutiesMessage(container, `No Studycall Watcher assignments found for ${cadetName}.`);
      }

      updateDutiesHeight(wrapper);
    })
    .catch((err) => {
      console.error("Error fetching Study Call data:", err);
      showDutiesMessage(container, "Studycall Watcher records could not be loaded. Check your connection and try again.", "error");
      updateDutiesHeight(wrapper);
    });
}

function renderStudyCallCard(record, container) {
  const role = String(record?.role || "").toUpperCase();
  const roleVariant = role.includes("WATCHER") ? "is-watcher" : "is-details";
  renderDutyCard(record, container, roleVariant);
}