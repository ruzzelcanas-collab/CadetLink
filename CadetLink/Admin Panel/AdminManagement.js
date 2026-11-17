document.addEventListener("DOMContentLoaded", () => {
  const session = readSession();
  if (!session?.uid || !session.accessToken || session.category !== "Admin") return;

  const accountBody = document.getElementById("adminAccountBody");
  const accountStatus = document.getElementById("adminAccountStatus");
  const accountSearch = document.getElementById("adminAccountSearch");
  const categoryFilter = document.getElementById("adminCategoryFilter");
  const accountCount = document.getElementById("adminAccountCount");
  const accountModal = document.getElementById("adminAccountModal");
  const accountForm = document.getElementById("adminAccountForm");
  const formStatus = document.getElementById("adminAccountFormStatus");
  const categoryInput = document.getElementById("adminAccountCategory");
  const subcategoryLabel = document.getElementById("adminAccountSubcategoryLabel");
  const subcategoryInput = document.getElementById("adminAccountSubcategory");
  const numberInput = document.getElementById("adminAccountNumber");
  const passwordInput = document.getElementById("adminAccountPassword");
  const passwordLabel = document.getElementById("adminAccountPasswordLabel");
  const saveButton = document.getElementById("saveAdminAccount");
  const modalTitle = document.getElementById("adminAccountModalTitle");
  let accounts = [];
  let modalMode = "create";
  let isLoadingAccounts = false;

  document.getElementById("reloadAdminAccounts").addEventListener("click", loadAccounts);
  document.getElementById("reloadAdminActivity").addEventListener("click", loadActivity);
  document.getElementById("reloadAdminSummary").addEventListener("click", loadSummary);
  document.getElementById("adminCreateAccountButton").addEventListener("click", () => openAccountForm());
  accountSearch.addEventListener("input", renderAccounts);
  categoryFilter.addEventListener("change", renderAccounts);
  categoryInput.addEventListener("change", updateCategoryFields);
  accountBody.addEventListener("click", handleAccountAction);
  accountForm.addEventListener("submit", saveAccount);
  document.getElementById("cancelAdminAccountForm").addEventListener("click", closeAccountForm);
  document.getElementById("closeAdminAccountModal").addEventListener("click", closeAccountForm);
  accountModal.addEventListener("click", (event) => {
    if (event.target === accountModal) closeAccountForm();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !accountModal.hidden) closeAccountForm();
  });

  const dutiesLink = document.getElementById("dailyDutiesDataLink");
  const dutiesUrl = new URL(dutiesLink.href);
  if (session.name) dutiesUrl.searchParams.set("name", session.name);
  dutiesLink.href = dutiesUrl.href;

  loadAccounts();
  loadSummary();
  loadActivity();

  async function apiRequest(path, options = {}) {
    const headers = new Headers(options.headers);
    const accessToken = session["access" + "Token"];
    headers.set("Authorization", ["Bearer", accessToken].join(" "));
    if (options.body) headers.set("Content-Type", "application/json");
    const response = await fetch(path, {
      ...options,
      headers
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "The Admin request could not be completed.");
    return result;
  }

  async function loadAccounts({ silent = false } = {}) {
    if (isLoadingAccounts) return;
    isLoadingAccounts = true;
    if (!silent) accountStatus.textContent = "Loading account directory…";
    try {
      const result = await apiRequest("/api/admin?kind=accounts");
      accounts = Array.isArray(result.accounts) ? result.accounts : [];
      renderAccounts();
      if (!silent) accountStatus.textContent = "";
    } catch (error) {
      console.error("Admin account list could not be loaded:", error);
      accountBody.replaceChildren(makeMessageRow("Accounts could not be loaded. Refresh and try again.", 6));
      accountStatus.textContent = error.message;
    } finally {
      isLoadingAccounts = false;
    }
  }

  function renderAccounts() {
    if (!accountBody) return;
    const query = accountSearch.value.trim().toLocaleLowerCase();
    const category = categoryFilter.value;
    const visibleAccounts = accounts
      .filter((account) => !category || account.category === category)
      .filter((account) => [
        account.name,
        account.cadetNumber,
        account.uid,
        account.category,
        account.subcategory
      ].some((value) => String(value || "").toLocaleLowerCase().includes(query)))
      .sort((left, right) => String(left.name).localeCompare(String(right.name)));

    accountCount.textContent = `${visibleAccounts.length} / ${accounts.length}`;
    if (visibleAccounts.length === 0) {
      accountBody.replaceChildren(makeMessageRow(accounts.length ? "No accounts match your search." : "No registered accounts found.", 6));
      return;
    }

    const rows = visibleAccounts.map((account) => {
      const row = document.createElement("tr");
      appendCell(row, account.name || "—");
      appendCell(row, account.uid || "—", "admin-uid-cell");
      appendCell(row, account.cadetNumber || "—");
      appendCell(row, account.subcategory ? `${account.category} · ${account.subcategory}` : account.category || "—");

      const statusCell = document.createElement("td");
      const statusPill = document.createElement("span");
      statusPill.className = `admin-status-pill ${account.active ? "is-active" : "is-inactive"}`;
      statusPill.textContent = account.active ? "Active" : "Inactive";
      statusCell.append(statusPill);
      row.append(statusCell);

      const actionsCell = document.createElement("td");
      actionsCell.className = "admin-row-actions";
      actionsCell.append(makeActionButton("View", "view", account.uid));
      if (account.category !== "Admin") {
        actionsCell.append(makeActionButton("Edit", "edit", account.uid));
        actionsCell.append(makeActionButton(account.active ? "Deactivate" : "Activate", account.active ? "deactivate" : "activate", account.uid));
      }
      row.append(actionsCell);
      return row;
    });
    accountBody.replaceChildren(...rows);
  }

  async function handleAccountAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    const account = accounts.find((item) => item.uid === button.dataset.uid);
    if (!account) return;

    if (button.dataset.action === "view") {
      openAccountForm(account, "view");
      return;
    }
    if (button.dataset.action === "edit") {
      openAccountForm(account, "edit");
      return;
    }

    const active = button.dataset.action === "activate";
    const confirmation = active
      ? `Reactivate ${account.name}'s account?`
      : `Deactivate ${account.name}'s account? They will no longer be able to sign in.`;
    if (!window.confirm(confirmation)) return;

    button.disabled = true;
    accountStatus.textContent = active ? "Reactivating account…" : "Deactivating account…";
    try {
      await apiRequest("/api/admin", {
        method: "POST",
        body: JSON.stringify({ action: "set-account-active", uid: account.uid, active })
      });
      await loadAccounts({ silent: true });
      accountStatus.textContent = `${account.name}'s account is ${active ? "active" : "inactive"}.`;
    } catch (error) {
      console.error("Admin account status could not be changed:", error);
      accountStatus.textContent = error.message;
      button.disabled = false;
    }
  }

  function openAccountForm(account = null, mode = "create") {
    modalMode = mode;
    accountForm.reset();
    formStatus.textContent = "";
    document.getElementById("adminOriginalUid").value = account?.uid || "";
    document.getElementById("adminAccountName").value = account?.name || "";
    document.getElementById("adminAccountUid").value = account?.uid || "";
    numberInput.value = account?.cadetNumber || "";
    categoryInput.value = account?.category || "Normal Cadet";
    document.getElementById("adminAccountSection").value = account?.section || "";
    passwordInput.value = "";
    modalTitle.textContent = mode === "create"
      ? "Register account"
      : mode === "view" ? "Cadet profile" : "Edit account";
    passwordLabel.hidden = mode !== "create";
    passwordInput.required = mode === "create";
    saveButton.hidden = mode === "view";
    document.getElementById("adminAccountUid").readOnly = mode === "view";
    accountForm.querySelectorAll("input:not([type=hidden]), select").forEach((input) => {
      input.disabled = mode === "view";
    });
    updateCategoryFields();
    document.getElementById("adminAccountSubcategory").value = account?.subcategory || "";
    if (mode === "view" && account) {
      formStatus.textContent = `${account.active ? "Active" : "Inactive"} account · ${account.section ? `Section ${account.section}` : "No section assigned"}`;
    }
    accountModal.hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("adminAccountName").focus();
  }

  function closeAccountForm() {
    accountModal.hidden = true;
    document.body.style.overflow = "";
    accountForm.querySelectorAll("input, select").forEach((input) => {
      input.disabled = false;
    });
  }

  function updateCategoryFields() {
    const category = categoryInput.value;
    const subcategories = category === "CCA"
      ? ["Nurse", "Galley", "CCO/TLU"]
      : category === "CAA"
        ? ["Instructor", "KRC"]
        : [];
    subcategoryLabel.hidden = subcategories.length === 0;
    subcategoryInput.required = subcategories.length > 0;
    subcategoryInput.replaceChildren(...subcategories.map((subcategory) => {
      const option = document.createElement("option");
      option.value = subcategory;
      option.textContent = subcategory;
      return option;
    }));
    numberInput.required = ["Normal Cadet", "CLC"].includes(category);
  }

  async function saveAccount(event) {
    event.preventDefault();
    if (modalMode === "view") return;
    const originalUid = document.getElementById("adminOriginalUid").value;
    const uid = document.getElementById("adminAccountUid").value.trim().toUpperCase();
    const payload = {
      uid: originalUid || uid,
      newUid: uid,
      name: document.getElementById("adminAccountName").value.trim(),
      cadetNumber: numberInput.value.trim(),
      category: categoryInput.value,
      subcategory: subcategoryInput.value,
      section: document.getElementById("adminAccountSection").value.trim()
    };
    if (!originalUid) {
      payload.action = "create-account";
      payload.password = passwordInput.value;
      payload.uid = uid;
      delete payload.newUid;
    } else {
      payload.action = "update-account";
    }

    saveButton.disabled = true;
    formStatus.textContent = "Saving account…";
    try {
      const result = await apiRequest("/api/admin", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      closeAccountForm();
      const successMessage = originalUid
        ? `Account updated${result.uid !== originalUid ? ` and UID changed to ${result.uid}` : ""}.`
        : "Account registered.";
      await loadAccounts({ silent: true });
      accountStatus.textContent = successMessage;
    } catch (error) {
      console.error("Admin account could not be saved:", error);
      formStatus.textContent = error.message;
    } finally {
      saveButton.disabled = false;
    }
  }

  async function loadSummary() {
    const infirmaryOutput = document.getElementById("infirmaryPatientCount");
    const infirmaryStatus = document.getElementById("infirmaryStatus");
    const reportOutput = document.getElementById("devilReportCount");
    try {
      const result = await apiRequest("/api/admin?kind=summary");
      infirmaryOutput.textContent = String(result.infirmaryPatientCount);
      reportOutput.textContent = String(result.devilReportCount);
      infirmaryStatus.textContent = "Patient details are not displayed in this dashboard.";
    } catch (error) {
      console.error("Admin dashboard summary could not be loaded:", error);
      infirmaryOutput.textContent = "—";
      reportOutput.textContent = "—";
      infirmaryStatus.textContent = "Counts could not be loaded. Refresh the dashboard and try again.";
    }
  }

  async function loadActivity() {
    const body = document.getElementById("adminActivityBody");
    const status = document.getElementById("adminActivityStatus");
    status.textContent = "Loading sign-in activity…";
    try {
      const result = await apiRequest("/api/admin?kind=activity");
      const activity = Array.isArray(result.activity) ? result.activity : [];
      if (activity.length === 0) {
        body.replaceChildren(makeMessageRow("No sign-in activity has been recorded yet.", 5));
      } else {
        body.replaceChildren(...activity.map((event) => {
          const row = document.createElement("tr");
          appendCell(row, event.name || "—");
          appendCell(row, event.category || "—");
          appendCell(row, event.uid || "—", "admin-uid-cell");
          appendCell(row, formatDate(event.occurredAt));
          const resultCell = document.createElement("td");
          const resultPill = document.createElement("span");
          const resultLabels = { success: "Success", failure: "Failed", blocked: "Blocked" };
          resultPill.className = `admin-status-pill ${event.result === "success" ? "is-active" : event.result === "blocked" ? "is-blocked" : "is-inactive"}`;
          resultPill.textContent = resultLabels[event.result] || "Unknown";
          resultCell.append(resultPill);
          row.append(resultCell);
          return row;
        }));
      }
      status.textContent = activity.length
        ? `Showing up to ${activity.length} recent sign-in attempts for recognized accounts. History starts when sign-in tracking is deployed.`
        : "No sign-in activity has been recorded yet. History starts when sign-in tracking is deployed.";
    } catch (error) {
      console.error("Admin sign-in activity could not be loaded:", error);
      body.replaceChildren(makeMessageRow("Sign-in activity could not be loaded.", 5));
      status.textContent = error.message;
    }
  }

  function makeActionButton(text, action, uid) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `admin-row-action${action === "deactivate" ? " is-warning" : ""}`;
    button.dataset.action = action;
    button.dataset.uid = uid;
    button.textContent = text;
    return button;
  }

  function appendCell(row, text, className = "") {
    const cell = document.createElement("td");
    cell.textContent = text;
    if (className) cell.className = className;
    row.append(cell);
  }

  function makeMessageRow(message, columnCount) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = columnCount;
    cell.className = "admin-table-message";
    cell.textContent = message;
    row.append(cell);
    return row;
  }

  function formatDate(value) {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? "—" : new Date(timestamp).toLocaleString();
  }

  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem("cadetlinkSession") || "null");
    } catch (error) {
      console.error("Admin session could not be read:", error);
      return null;
    }
  }
});
