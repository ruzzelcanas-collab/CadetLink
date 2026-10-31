(() => {
  const sessionKey = "cadetlinkSession";
  const previewFoodConcernsKey = "cadetlinkPreviewFoodConcerns";

  function isLocalPreview() {
    return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  }

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(sessionKey) || "null");
    } catch (error) {
      console.error("Could not read the current portal session:", error);
      return null;
    }
  }

  async function request(kind, body = null) {
    const session = getSession();
    if (!session?.accessToken) throw new Error("Secure access is unavailable. Sign in again.");
    const response = await fetch(body ? "/api/portal" : `/api/portal?kind=${encodeURIComponent(kind)}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify({ ...body, kind }) } : {})
    });
    if (kind === "food-concerns" && isLocalPreview()
      && (response.status === 404 || (body && response.status === 405))) {
      return requestLocalFoodConcerns(body, session);
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Could not load this section.");
    return result;
  }

  function requestLocalFoodConcerns(body, session) {
    let records;
    try {
      records = JSON.parse(localStorage.getItem(previewFoodConcernsKey) || "[]");
    } catch (error) {
      throw new Error(`Local food concerns could not be read: ${error.message}`);
    }
    if (!Array.isArray(records)) throw new Error("Local food concern data is invalid.");

    if (body?.operation === "food-submit") {
      if (session.category !== "Normal Cadet" && session.category !== "CLC") {
        throw new Error("Your account cannot submit food concerns.");
      }
      const concern = typeof body.concern === "string" ? body.concern.trim() : "";
      if (!concern || concern.length > 500) throw new Error("Enter a food concern of 500 characters or fewer.");
      const record = {
        id: crypto.randomUUID(),
        cadetUid: session.uid,
        cadetName: session.name || "",
        concern,
        submittedAt: new Date().toISOString()
      };
      records.push(record);
      try {
        localStorage.setItem(previewFoodConcernsKey, JSON.stringify(records));
      } catch (error) {
        throw new Error(`Local food concern could not be saved: ${error.message}`);
      }
      return { id: record.id, record, storage: "local" };
    }

    const canManage = session.category === "CCA" && session.subcategory === "Galley";
    return {
      records: canManage ? records : records.filter((record) => record.cadetUid === session.uid),
      storage: "local"
    };
  }

  function makePanel(title, id) {
    const section = document.createElement("section");
    section.className = "announcements-section portal-section";
    section.setAttribute("aria-labelledby", `${id}Title`);
    const header = document.createElement("header");
    header.className = "announcements-header";
    const heading = document.createElement("h2");
    heading.className = "announcements-title";
    heading.id = `${id}Title`;
    heading.textContent = title;
    header.append(heading);
    const content = document.createElement("div");
    content.className = "announcements-content portal-section-content";
    content.id = id;
    section.append(header, content);
    return { section, content };
  }

  function setStatus(container, message, isError = false) {
    let status = container.querySelector(".portal-status");
    if (!status) {
      status = document.createElement("p");
      status.className = "portal-status";
      status.setAttribute("role", "status");
      container.prepend(status);
    }
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function createInput(form, labelText, name, type = "text", required = true) {
    const label = document.createElement("label");
    const input = document.createElement(type === "textarea" ? "textarea" : "input");
    const id = `portal-${name}`;
    label.htmlFor = id;
    label.textContent = labelText;
    input.id = id;
    input.name = name;
    input.required = required;
    input.maxLength = name === "reason" || name === "concern" ? 500 : 160;
    if (type !== "textarea") input.type = type;
    form.append(label, input);
    return input;
  }

  function createButton(text, type = "submit") {
    const button = document.createElement("button");
    button.className = "portal-button";
    button.type = type;
    button.textContent = text;
    return button;
  }

  function formatAmount(amount) {
    return Number(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function renderList(container, records, format, onDelete, refreshRecords, onEdit) {
    const list = document.createElement("ul");
    list.className = "portal-record-list";
    records.forEach((record) => {
      const item = document.createElement("li");
      const details = document.createElement("span");
      details.textContent = format(record);
      item.append(details);
      if (onEdit) {
        const edit = createButton("Edit", "button");
        edit.addEventListener("click", () => onEdit(record));
        item.append(edit);
      }
      if (onDelete) {
        const remove = createButton("Remove", "button");
        remove.addEventListener("click", async () => {
          remove.disabled = true;
          try {
            await onDelete(record.id);
            await refreshRecords();
          } catch (error) {
            setStatus(container, error.message, true);
            remove.disabled = false;
          }
        });
        item.append(remove);
      }
      list.append(item);
    });
    if (!records.length) {
      const empty = document.createElement("p");
      empty.className = "portal-empty";
      empty.textContent = "No records yet.";
      container.append(empty);
    } else {
      container.append(list);
    }
  }

  async function loadAnnouncements(container) {
    try {
      setStatus(container, "Loading announcements...");
      const reference = await CadetLinkAnnouncements.prepareLegacy("general", "cadetlinkAnnouncements");
      reference.on("value", (snapshot) => {
        const announcements = CadetLinkAnnouncements.fromSnapshot(snapshot);
        container.replaceChildren();
        if (!announcements.length) {
          container.textContent = "No announcements have been published yet.";
          return;
        }
        [...announcements].reverse().forEach((announcement) => {
          const article = document.createElement("article");
          const title = document.createElement("h3");
          title.textContent = announcement.title;
          const message = document.createElement("p");
          message.textContent = announcement.message;
          article.append(title, message);
          container.append(article);
        });
      }, (error) => {
        console.error("Announcements could not be loaded:", error);
        setStatus(container, "Announcements are unavailable.", true);
      });
    } catch (error) {
      console.error("Announcements could not be initialized:", error);
      setStatus(container, error.message, true);
    }
  }

  function addAnnouncements(grid) {
    const panel = makePanel("General Announcements", "portalAnnouncements");
    grid.append(panel.section);
    loadAnnouncements(panel.content);
  }

  function addNightOrders(grid) {
    const panel = makePanel("Night Orders", "nightOrdersContent");
    panel.content.classList.add("night-orders-content");
    panel.section.classList.add("night-orders-section");
    grid.append(panel.section);
    CadetLinkNightOrders.subscribe("nightOrdersContent");
  }

  function addInfirmary(grid, canManage) {
    const panel = makePanel("Infirmary Patient Count", "infirmaryPortal");
    grid.append(panel.section);
    const container = panel.content;
    let cadetName;
    let reason;
    let editingId = "";
    let submit;
    const form = canManage ? document.createElement("form") : null;
    if (form) {
      form.className = "portal-form";
      cadetName = createInput(form, "Cadet name", "cadetName");
      reason = createInput(form, "Reason", "reason", "textarea");
      submit = createButton("Add patient");
      form.append(submit);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await request("infirmary", {
            operation: "infirmary-upsert",
            id: editingId || undefined,
            cadetName: cadetName.value,
            reason: reason.value
          });
          form.reset();
          editingId = "";
          submit.textContent = "Add patient";
          await refresh();
        } catch (error) {
          setStatus(container, error.message, true);
        }
      });
      container.append(form);
    }

    async function refresh() {
      container.querySelector(".portal-status")?.remove();
      container.querySelector(".portal-record-list")?.remove();
      container.querySelectorAll(".portal-count, .portal-details, .portal-empty").forEach((node) => node.remove());
      try {
        setStatus(container, "Loading patient records...");
        const result = await request("infirmary");
        container.querySelector(".portal-status")?.remove();
        const count = document.createElement("p");
        count.className = "portal-count";
        count.textContent = `Patients currently in the infirmary: ${result.count}`;
        container.append(count);
        if (result.records) {
          renderList(container, result.records, (record) => `${record.cadetName} — ${record.reason}`, async (id) => {
            await request("infirmary", { operation: "infirmary-delete", id });
          }, refresh, (record) => {
            editingId = record.id;
            cadetName.value = record.cadetName;
            reason.value = record.reason;
            submit.textContent = "Update patient";
            cadetName.focus();
          });
        }
      } catch (error) {
        setStatus(container, error.message, true);
      }
    }
    refresh();
  }

  function addBooks(grid, canManage) {
    const panel = makePanel(canManage ? "Issue Books" : "Issued Books", "booksPortal");
    grid.append(panel.section);
    const container = panel.content;
    let instructor;
    let title;
    let editingId = "";
    let submit;
    const form = canManage ? document.createElement("form") : null;
    if (form) {
      form.className = "portal-form";
      instructor = createInput(form, "Instructor", "instructor");
      title = createInput(form, "Title of book", "title");
      submit = createButton("Add book");
      form.append(submit);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await request("books", {
            operation: "book-upsert",
            id: editingId || undefined,
            instructor: instructor.value,
            title: title.value
          });
          form.reset();
          editingId = "";
          submit.textContent = "Add book";
          await refresh();
        } catch (error) {
          setStatus(container, error.message, true);
        }
      });
      container.append(form);
    }

    async function refresh() {
      container.querySelector(".portal-status")?.remove();
      container.querySelector(".portal-record-list")?.remove();
      container.querySelector(".portal-empty")?.remove();
      try {
        setStatus(container, "Loading books...");
        const result = await request("books");
        container.querySelector(".portal-status")?.remove();
        renderList(container, result.records, (record) => `${record.instructor}: ${record.title}`, canManage
          ? async (id) => request("books", { operation: "book-delete", id })
          : null, refresh, canManage ? (record) => {
            editingId = record.id;
            instructor.value = record.instructor;
            title.value = record.title;
            submit.textContent = "Update book";
            instructor.focus();
          } : null);
      } catch (error) {
        setStatus(container, error.message, true);
      }
    }
    refresh();
  }

  async function addPayables(grid, canManage) {
    const panel = makePanel("KRC Payables", "payablesPortal");
    grid.append(panel.section);
    const container = panel.content;
    let cadet;
    let amount;
    let editingId = "";
    let submit;
    const form = canManage ? document.createElement("form") : null;
    if (form) {
      form.className = "portal-form";
      let profiles;
      try {
        setStatus(container, "Loading cadet list...");
        profiles = await request("cadet-profiles");
        container.querySelector(".portal-status")?.remove();
      } catch (error) {
        setStatus(container, error.message, true);
        return;
      }
      const label = document.createElement("label");
      label.textContent = "Cadet";
      cadet = document.createElement("select");
      cadet.required = true;
      profiles.cadets.forEach((profile) => {
        const option = document.createElement("option");
        option.value = profile.uid;
        option.textContent = `${profile.name} (${profile.cadetNumber})`;
        cadet.append(option);
      });
      label.append(cadet);
      amount = createInput(form, "Total amount", "totalAmount", "number");
      amount.min = "0";
      amount.step = "0.01";
      submit = createButton("Save payable");
      form.prepend(label);
      form.append(submit);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await request("payables", {
            operation: "payable-upsert",
            id: editingId || undefined,
            cadetUid: cadet.value,
            totalAmount: amount.value
          });
          form.reset();
          editingId = "";
          submit.textContent = "Save payable";
          await refresh();
        } catch (error) {
          setStatus(container, error.message, true);
        }
      });
      container.append(form);
    }

    async function refresh() {
      container.querySelector(".portal-status")?.remove();
      container.querySelector(".portal-record-list")?.remove();
      container.querySelector(".portal-count")?.remove();
      container.querySelector(".portal-empty")?.remove();
      try {
        setStatus(container, "Loading payables...");
        const result = await request("payables");
        container.querySelector(".portal-status")?.remove();
        if (!canManage) {
          const total = document.createElement("p");
          total.className = "portal-count";
          total.textContent = `Total amount due: ${formatAmount(result.totalAmount)}`;
          container.append(total);
        }
        renderList(container, result.records, (record) => `${record.cadetName}: ${formatAmount(record.totalAmount)}`, canManage
          ? async (id) => request("payables", { operation: "payable-delete", id })
          : null, refresh, canManage ? (record) => {
            editingId = record.id;
            cadet.value = record.cadetUid;
            amount.value = String(record.totalAmount);
            submit.textContent = "Update payable";
            amount.focus();
          } : null);
      } catch (error) {
        setStatus(container, error.message, true);
      }
    }
    await refresh();
  }

  function addFoodConcerns(grid, canManage) {
    const panel = makePanel(canManage ? "Cadet's Food Concerns" : "Food Concerns", `foodConcernsPortal-${grid.id || grid.className.split(" ")[0]}`);
    panel.section.classList.add("food-concerns-panel");
    grid.append(panel.section);
    const container = panel.content;
    const previewNote = document.createElement("p");
    previewNote.className = "portal-preview-note";
    previewNote.textContent = "Local preview only: concerns are saved in this browser and do not sync to Firebase.";
    const form = canManage ? null : document.createElement("form");
    if (form) {
      form.className = "portal-form";
      const concern = createInput(form, "Your concern", "concern", "textarea");
      concern.placeholder = "For example: I do not eat fish.";
      concern.rows = 3;
      form.append(createButton("Submit concern"));
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await request("food-concerns", { operation: "food-submit", concern: concern.value });
          form.reset();
          await refresh();
        } catch (error) {
          setStatus(container, error.message, true);
        }
      });
      container.append(form);
    }

    async function refresh() {
      container.querySelector(".portal-status")?.remove();
      container.querySelector(".portal-record-list")?.remove();
      container.querySelector(".portal-empty")?.remove();
      try {
        setStatus(container, "Loading food concerns...");
        const result = await request("food-concerns");
        container.querySelector(".portal-status")?.remove();
        if (result.storage === "local") container.prepend(previewNote);
        else previewNote.remove();
        const list = document.createElement("ul");
        list.className = "portal-record-list";
        result.records.forEach((record) => {
          const item = document.createElement("li");
          item.className = "food-concern-item";
          const identity = document.createElement("strong");
          identity.className = "food-concern-name";
          identity.textContent = record.cadetName || "Cadet";
          const concernText = document.createElement("p");
          concernText.className = "food-concern-text";
          concernText.textContent = record.concern;
          const itemHeader = document.createElement("div");
          itemHeader.className = "food-concern-card";
          itemHeader.append(identity, concernText);
          item.append(itemHeader);
          list.append(item);
        });
        if (!result.records.length) {
          const empty = document.createElement("p");
          empty.className = "portal-empty";
          empty.textContent = "No food concerns have been submitted.";
          container.append(empty);
        }
        else container.append(list);
      } catch (error) {
        setStatus(container, error.message, true);
      }
    }
    refresh();
  }

  async function addCadetProfiles(grid) {
    const panel = makePanel("Cadet Profile Information", "cadetProfilesPortal");
    grid.append(panel.section);
    const container = panel.content;
    setStatus(container, "Loading cadet profiles...");
    try {
      const result = await request("cadet-profiles");
      container.querySelector(".portal-status")?.remove();
      if (!result.cadets.length) {
        container.textContent = "No cadet profiles found.";
        return;
      }

      const searchControl = document.createElement("div");
      searchControl.className = "cadet-search-control";
      const searchLabel = document.createElement("label");
      searchLabel.className = "portal-search-label";
      searchLabel.htmlFor = "cadetProfileSearch";
      searchLabel.textContent = "Search cadets by name or cadet number";
      const search = document.createElement("input");
      search.id = "cadetProfileSearch";
      search.className = "portal-input";
      search.type = "search";
      search.placeholder = "Start typing a cadet's name...";
      search.autocomplete = "off";
      const results = document.createElement("div");
      results.id = "cadetProfileSearchResults";
      results.className = "cadet-search-results";
      results.setAttribute("role", "listbox");
      results.hidden = true;
      search.setAttribute("aria-controls", results.id);
      search.setAttribute("aria-expanded", "false");
      const profile = document.createElement("article");
      profile.className = "cadet-profile-card";
      profile.setAttribute("aria-live", "polite");
      const empty = document.createElement("p");
      empty.className = "portal-empty";
      empty.textContent = "Search for a cadet to view their profile.";
      profile.append(empty);
      searchControl.append(searchLabel, search, results);
      container.append(searchControl, profile);
      let activeProfileRequestId = 0;

      function showMatches() {
        const term = search.value.trim().toLocaleLowerCase();
        results.replaceChildren();
        if (!term) {
          results.hidden = true;
          search.setAttribute("aria-expanded", "false");
          return;
        }
        const matches = result.cadets.filter((cadet) =>
          `${cadet.name} ${cadet.cadetNumber}`.toLocaleLowerCase().includes(term)
        ).slice(0, 8);
        results.hidden = matches.length === 0;
        search.setAttribute("aria-expanded", "true");
        matches.forEach((cadet) => {
          const button = document.createElement("button");
          button.className = "cadet-search-result";
          button.type = "button";
          button.setAttribute("role", "option");
          button.textContent = `${cadet.name} — ${cadet.cadetNumber}`;
          button.addEventListener("click", () => {
            search.value = cadet.name;
            results.hidden = true;
            search.setAttribute("aria-expanded", "false");
            void showCadetProfile(cadet, profile, ++activeProfileRequestId);
          });
          results.append(button);
        });
        if (!matches.length) {
          const noMatches = document.createElement("p");
          noMatches.className = "portal-empty";
          noMatches.textContent = "No matching cadets found.";
          results.append(noMatches);
          results.hidden = false;
        }
      }
      search.addEventListener("input", showMatches);
    } catch (error) {
      setStatus(container, error.message, true);
    }
  }

  async function showCadetProfile(cadet, container, requestId) {
    container.dataset.dutyRequestId = String(requestId);
    const heading = document.createElement("div");
    heading.className = "cadet-profile-card-heading";
    heading.append(CadetLinkProfilePictures.createAvatar(cadet.profilePicture, cadet.name, "cadet-search-avatar"));
    const identity = document.createElement("div");
    identity.className = "cadet-profile-card-identity";
    const name = document.createElement("h3");
    name.textContent = cadet.name;
    const number = document.createElement("p");
    number.textContent = `Cadet number ${cadet.cadetNumber}`;
    identity.append(name, number);
    heading.append(identity);

    const details = document.createElement("dl");
    details.className = "cadet-profile-details";
    [["Category", cadet.category], ["Section", cadet.section || "Not set"]].forEach(([label, value]) => {
      const group = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      group.append(term, description);
      details.append(group);
    });

    const duty = document.createElement("p");
    duty.className = "cadet-duty-status";
    duty.textContent = "Checking daily duty schedule...";
    container.replaceChildren(heading, details, duty);
    try {
      const response = await fetch(`https://script.google.com/macros/s/AKfycbzXJb_COXV6HEraXVWH5podyrGSKAnjHKvTZmsEkn7GGHZRn5DYCVEi0jZj4RQMiAHd/exec?name=${encodeURIComponent(cadet.name)}`);
      if (!response.ok) throw new Error(`Duty schedule lookup failed: ${response.status}`);
      const duties = await response.json();
      if (!Array.isArray(duties)) throw new Error("Duty schedule returned an unexpected response.");
      if (!container.isConnected || requestId !== Number(container.dataset.dutyRequestId)) return;
      const isScheduled = duties.length > 0;
      duty.classList.toggle("is-scheduled", isScheduled);
      duty.classList.toggle("is-not-scheduled", !isScheduled);
      duty.textContent = isScheduled ? "Scheduled for daily duties" : "Not currently scheduled for daily duties";
    } catch (error) {
      if (!container.isConnected || requestId !== Number(container.dataset.dutyRequestId)) return;
      console.error("Daily duty schedule could not be checked:", error);
      duty.classList.add("is-unavailable");
      duty.textContent = "Daily duty schedule is unavailable right now.";
    }
  }

  function initializeCadetDashboard() {
    const session = getSession();
    if (!session?.uid || !session.accessToken || session.category !== "Normal Cadet") {
      window.location.replace("/index.html");
      return;
    }

    const grid = document.querySelector(".user-announcements-grid");
    if (!grid) return;
    addInfirmary(grid, false);
    void addPayables(grid, false);
    addFoodConcerns(grid, false);
  }

  function initializeCLCDashboard() {
    const session = getSession();
    if (!session?.uid || !session.accessToken || session.category !== "CLC") {
      window.location.replace("/index.html");
      return;
    }
    const grid = document.querySelector(".announcements-grid");
    if (!grid) return;
    addInfirmary(grid, false);
    void addPayables(grid, false);
    addFoodConcerns(grid, false);
  }

  function initializeStaffDashboard() {
    const session = getSession();
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

    const logout = document.getElementById("logoutBtn");
    logout?.addEventListener("click", () => {
      const returnUrl = session.entryPoint === "index" ? "/index.html" : "/Loading%20screen/Loadingscreen.html";
      sessionStorage.removeItem(sessionKey);
      window.location.replace(returnUrl);
    });

    const grid = document.querySelector(".admin-dashboard-grid");
    if (!grid) return;
    grid.classList.add("portal-dashboard-grid");
    const role = `${requiredCategory}-${requiredSubcategory}`;
    document.querySelector(".admin-nmo-section")?.remove();
    document.querySelector(".admin-nmo-issue-modal")?.remove();
    document.querySelector(".admin-nmo-history-modal")?.remove();
    if (role === "CCA-Nurse") {
      document.querySelector(".admin-announcement-section")?.remove();
      addAnnouncements(grid);
      addInfirmary(grid, true);
      document.querySelector(".admin-night-orders-section")?.remove();
      addNightOrders(grid);
      void renderDevilsReports();
    } else if (role === "CCA-Galley") {
      const devilsReports = document.querySelector(".admin-devils-report-section");
      grid.replaceChildren();
      addInfirmary(grid, false);
      addAnnouncements(grid);
      addFoodConcerns(grid, true);
      addDevilsReports(grid, devilsReports);
    } else if (role === "CAA-Instructor" || role === "CAA-KRC") {
      const devilsReports = document.querySelector(".admin-devils-report-section");
      grid.replaceChildren();
      addCadetProfiles(grid);
      addBooks(grid, role === "CAA-Instructor");
      addNightOrders(grid);
      addDevilsReports(grid, devilsReports);
      addAnnouncements(grid);
      if (role === "CAA-KRC") void addPayables(grid, true);
    }
  }

  function addDevilsReports(grid, section = document.querySelector(".admin-devils-report-section")) {
    if (section) grid.append(section);
  }

  async function renderDevilsReports() {
    const grid = document.querySelector(".admin-dashboard-grid");
    addDevilsReports(grid);
  }

  window.CadetLinkPortalSections = Object.freeze({
    request,
    initializeCadetDashboard,
    initializeCLCDashboard,
    initializeStaffDashboard
  });
})();
