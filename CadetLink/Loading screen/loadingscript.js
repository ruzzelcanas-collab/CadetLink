


document.addEventListener("DOMContentLoaded", () => {
  const connectButton = document.getElementById("connectReaderBtn");
  const statusOutput = document.getElementById("readerStatus");
  const loginModal = document.getElementById("loginModal");
  const registrationModal = document.getElementById("registrationModal");
  const loginForm = document.getElementById("loginForm");
  const registrationForm = document.getElementById("registrationForm");
  const loginError = document.getElementById("loginError");
  const registrationError = document.getElementById("registrationError");
  const loginPassword = document.getElementById("loginPassword");
  const loginSubcategory = document.getElementById("loginSubcategory");
  const loginSubcategoryGroup = document.getElementById("loginSubcategoryGroup");
  const registrationName = document.getElementById("registrationName");
  const registrationNameLabel = document.getElementById("registrationNameLabel");
  const registrationNumber = document.getElementById("registrationNumber");
  const registrationNumberGroup = document.getElementById("registrationNumberGroup");
  const registrationCategory = document.getElementById("registrationCategory");
  const registrationSubcategory = document.getElementById("registrationSubcategory");
  const registrationSubcategoryGroup = document.getElementById("registrationSubcategoryGroup");
  const registrationPassword = document.getElementById("registrationPassword");
  const loginCadetName = document.getElementById("loginCadetName");
  const loginCadetNumber = document.getElementById("loginCadetNumber");
  const registrationTitle = document.getElementById("registrationTitle");
  const registrationDescription = document.getElementById("registrationDescription");

  if (!statusOutput || !loginForm || !registrationForm) return;

  let activeUid = "";
  let activeCadet = null;
  let registrationMode = "new";
  let activePort = null;
  let readerConnecting = false;

  loginForm.addEventListener("submit", signIn);
  registrationForm.addEventListener("submit", registerCadet);
  registrationCategory.addEventListener("change", updateRegistrationCategoryFields);
  connectButton?.addEventListener("click", authorizeReader);
  updateRegistrationCategoryFields();

  if ("serial" in navigator) {
    navigator.serial.addEventListener("connect", (event) => connectReader(event.target));
    navigator.serial.addEventListener("disconnect", (event) => {
      if (event.target === activePort) {
        activePort = null;
        setStatus("Reader disconnected. Reconnect it to scan.", "idle");
      }
    });
  }

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModals);
  });

  document.querySelectorAll(".auth-modal").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModals();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModals();
  });

  connectReader();

  async function authorizeReader() {
    if (!("serial" in navigator)) {
      setStatus("Web Serial requires Chrome or Edge over HTTPS or localhost.", "error");
      return;
    }

    connectButton.disabled = true;
    try {
      const port = await navigator.serial.requestPort();
      connectButton.hidden = true;
      await connectReader(port);
    } catch (error) {
      if (error.name === "NotFoundError") {
        setStatus("No reader selected. Choose Authorize RFID reader to try again.", "idle");
      } else {
        console.error("RFID reader authorization failed:", error);
        setStatus("Could not authorize the reader. Check the USB connection and try again.", "error");
      }
      connectButton.hidden = false;
      connectButton.disabled = false;
    }
  }

  async function connectReader(port = null) {
    if (!("serial" in navigator)) {
      setStatus("Web Serial requires Chrome or Edge over HTTPS or localhost.", "error");
      return;
    }
    if (!window.crypto?.subtle) {
      setStatus("Secure browser cryptography is unavailable. Open this page over HTTPS or localhost.", "error");
      return;
    }
    if (activePort || readerConnecting) return;

    readerConnecting = true;
    try {
      const authorizedPorts = port ? [port] : await navigator.serial.getPorts();
      const readerPort = authorizedPorts[0];
      if (!readerPort) {
        setStatus("First-time reader setup requires permission from your browser.", "idle");
        connectButton.hidden = false;
        return;
      }

      await readerPort.open({ baudRate: 9600 });
      connectButton.hidden = true;
      activePort = readerPort;
      readerConnecting = false;
      setStatus("Scan a card to continue.", "ready");
      await sendLcdCommand("HOME");

      const decoder = new TextDecoderStream();
      const pipeClosed = readerPort.readable.pipeTo(decoder.writable).catch(() => {});
      const reader = decoder.readable.getReader();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "LCD_READY") {
            await sendLcdCommand("HOME");
            continue;
          }
          const uid = line.trim().toUpperCase();
          if (/^[0-9A-F]{8,20}$/.test(uid)) await handleScan(uid);
        }
      }

      reader.releaseLock();
      await pipeClosed;
      if (activePort === readerPort) {
        activePort = null;
        setStatus("Reader disconnected. Reconnect it to scan.", "idle");
      }
    } catch (error) {
      console.error("RFID reader connection failed:", error);
      setStatus("Could not connect to the reader. Check its USB connection and authorize it again.", "error");
      connectButton.hidden = false;
    } finally {
      readerConnecting = false;
      connectButton.disabled = false;
    }
  }

  async function handleScan(uid) {
    if (document.querySelector(".auth-modal:not(.hidden)")) return;
    activeUid = uid;
    setStatus(`Checking card ${uid}...`, "checking");

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup-card", uid })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not check this card.");
      if (!result.exists) {
        activeCadet = null;
        registrationMode = "new";
        registrationForm.reset();
        updateRegistrationCategoryFields();
        registrationError.textContent = "";
        registrationTitle.textContent = "Register cadet";
        registrationDescription.textContent = "This card is new. Add the cadet details and choose a password to register.";
        document.getElementById("registrationUid").textContent = uid;
        await sendLcdCommand("SIGNUP");
        openModal(registrationModal);
        setStatus("New card detected. Complete registration.", "checking");
        registrationName.focus();
        return;
      }

      activeCadet = result.account;
      if (result.needsPasswordSetup) {
        registrationMode = "upgrade";
        registrationForm.reset();
        registrationName.value = activeCadet.name || "";
        registrationNumber.value = activeCadet.cadetNumber || "";
        registrationCategory.value = activeCadet.category || "Normal Cadet";
        registrationError.textContent = "";
        registrationTitle.textContent = "Set up your password";
        registrationDescription.textContent = "This card has an older registration. Complete the required account details and choose a password.";
        updateRegistrationCategoryFields();
        registrationSubcategory.value = activeCadet.subcategory || "";
        document.getElementById("registrationUid").textContent = uid;
        await sendLcdCommand("SIGNUP");
        openModal(registrationModal);
        setStatus("Card found. Finish account setup.", "checking");
        (["CCA", "CAA"].includes(registrationCategory.value) ? registrationName : registrationNumber).focus();
        return;
      }

      loginForm.reset();
      loginError.textContent = "";
      loginCadetName.textContent = activeCadet.name || "Registered cadet";
      loginCadetNumber.textContent = activeCadet.cadetNumber ? `Cadet ${activeCadet.cadetNumber}` : uid;
      updateLoginSubcategoryFields(activeCadet.category, activeCadet.subcategory);
      openModal(loginModal);
      setStatus("Registered card found. Enter the password to continue.", "ready");
      loginPassword.focus();
    } catch (error) {
      console.error("Could not look up RFID card:", error);
      setStatus("Could not check this card. Check your connection and try again.", "error");
    }
  }

  async function signIn(event) {
    event.preventDefault();
    if (!activeUid || !activeCadet) return;

    const submitButton = loginForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = "Checking...";
    loginError.textContent = "";
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: activeCadet.category === "Admin" ? "admin-login" : "login",
          category: activeCadet.category,
          subcategory: loginSubcategory.value,
          name: activeCadet.name || "",
          cadetNumber: activeCadet.cadetNumber || "",
          password: loginPassword.value
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "That password or account section did not match.");
      await sendLcdCommand("LOGIN_SUCCESS", activeCadet.name || "Cadet");
      await new Promise((resolve) => window.setTimeout(resolve, 3500));
      enterDashboard(result.uid, result.account, result.token);
    } catch (error) {
      console.error("Password verification failed:", error);
      loginError.textContent = error.message || "Could not verify the password. Please try again.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Continue to dashboard";
    }
  }

  async function registerCadet(event) {
    event.preventDefault();
    if (!activeUid) return;

    const name = registrationName.value.trim();
    const cadetNumber = registrationNumber.value.trim();
    const category = registrationCategory.value;
    const subcategory = registrationSubcategory.value;
    const password = registrationPassword.value;
    const usesNameAndPassword = ["CCA", "CAA"].includes(category);
    if (!name || (!usesNameAndPassword && !cadetNumber) || password.length < 8
      || (["CCA", "CAA"].includes(category) && !subcategory)) {
      registrationError.textContent = usesNameAndPassword
        ? "Enter a name and use a password of at least 8 characters."
        : "Enter all details and use a password of at least 8 characters.";
      return;
    }

    const submitButton = registrationForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
    registrationError.textContent = "";

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          uid: activeUid,
          name,
          cadetNumber,
          category,
          subcategory,
          password
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not save your registration.");
      const registeredCadet = result.account;
      await sendLcdCommand("SIGNUP_SUCCESS", registeredCadet?.name || name);
      await new Promise((resolve) => window.setTimeout(resolve, 6000));
      enterDashboard(result.uid, registeredCadet, result.token);
    } catch (error) {
      console.error("Cadet registration failed:", error);
      registrationError.textContent = error.message || "Could not save your registration. Please try again.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = registrationMode === "upgrade" ? "Save password" : "Register and continue";
    }
  }

  function enterDashboard(uid, cadet, accessToken) {
    setStatus("Access granted. Opening dashboard...", "registered");
    CadetLinkAuth.enterDashboard(uid, cadet, "loading", accessToken);
  }

  async function sendLcdCommand(command, name = "") {
    if (!activePort?.writable) {
      console.error("LCD update failed: the RFID reader is not connected.");
      setStatus("Reader is disconnected; the LCD could not be updated.", "error");
      return;
    }

    const safeName = String(name).replace(/[|\r\n]/g, " ").trim();
    const message = `LCD|${command}${safeName ? `|${safeName}` : ""}\n`;
    const writer = activePort.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(message));
    } catch (error) {
      console.error("LCD update failed:", error);
      setStatus("Could not update the LCD display.", "error");
    } finally {
      writer.releaseLock();
    }
  }

  function updateRegistrationCategoryFields() {
    const category = registrationCategory.value;
    const usesNameAndPassword = ["CCA", "CAA"].includes(category);
    const subcategories = category === "CCA"
      ? ["Nurse", "Galley", "CCO/TLU"]
      : category === "CAA"
        ? ["Instructor", "KRC"]
        : [];
    registrationForm.classList.toggle("is-staff-registration", usesNameAndPassword);
    registrationNameLabel.textContent = usesNameAndPassword ? "Name" : "Cadet name";
    registrationName.placeholder = usesNameAndPassword ? "" : "D/Cdt Lastname";
    registrationNumberGroup.hidden = usesNameAndPassword;
    registrationNumber.required = ["Normal Cadet", "CLC"].includes(category);
    if (usesNameAndPassword) registrationNumber.value = "";
    registrationSubcategoryGroup.hidden = subcategories.length === 0;
    registrationSubcategory.replaceChildren();
    if (subcategories.length) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose a section";
      placeholder.disabled = true;
      placeholder.selected = true;
      registrationSubcategory.append(placeholder);
      subcategories.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        registrationSubcategory.append(option);
      });
    }
    registrationSubcategory.required = subcategories.length > 0;
  }

  function updateLoginSubcategoryFields(category, subcategory) {
    const subcategories = category === "CCA"
      ? ["Nurse", "Galley", "CCO/TLU"]
      : category === "CAA"
        ? ["Instructor", "KRC"]
        : [];
    loginSubcategoryGroup.hidden = subcategories.length === 0;
    loginSubcategory.replaceChildren();
    if (subcategories.length) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose a section";
      placeholder.disabled = true;
      placeholder.selected = true;
      loginSubcategory.append(placeholder);
      subcategories.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        loginSubcategory.append(option);
      });
      loginSubcategory.value = subcategory || "";
    }
    loginSubcategory.required = subcategories.length > 0;
  }

  function openModal(modal) {
    closeModals();
    modal.classList.remove("hidden");
  }

  function closeModals() {
    document.querySelectorAll(".auth-modal").forEach((modal) => modal.classList.add("hidden"));
    loginForm.reset();
    loginError.textContent = "";
    if (registrationError) registrationError.textContent = "";
  }

  function setStatus(message, state) {
    statusOutput.textContent = message;
    statusOutput.className = `reader-status is-${state}`;
  }
});
