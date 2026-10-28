


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
  const registrationName = document.getElementById("registrationName");
  const registrationNameLabel = document.getElementById("registrationNameLabel");
  const registrationNumber = document.getElementById("registrationNumber");
  const registrationNumberGroup = document.getElementById("registrationNumberGroup");
  const registrationCategory = document.getElementById("registrationCategory");
  const registrationPassword = document.getElementById("registrationPassword");
  const loginCadetName = document.getElementById("loginCadetName");
  const loginCadetNumber = document.getElementById("loginCadetNumber");
  const registrationTitle = document.getElementById("registrationTitle");
  const registrationDescription = document.getElementById("registrationDescription");

  if (!statusOutput || !loginForm || !registrationForm) return;

  if (!window.firebase || typeof firebase.database !== "function") {
    setStatus("Firebase did not load. Refresh this page to try again.", "error");
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(CadetLinkAuth.firebaseConfig);
  const database = firebase.database();
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
      const snapshot = await database.ref(`cadets/${uid}`).once("value");
      if (!snapshot.exists()) {
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

      activeCadet = snapshot.val();
      if (!activeCadet.password?.hash || !activeCadet.password?.salt) {
        registrationMode = "upgrade";
        registrationForm.reset();
        registrationName.value = activeCadet.name || "";
        registrationNumber.value = activeCadet.cadetNumber || "";
        registrationCategory.value = CadetLinkAuth.normalizeUserCategory(activeCadet.category);
        registrationError.textContent = "";
        registrationTitle.textContent = "Set up your password";
        registrationDescription.textContent = "This card has an older registration. Complete the required account details and choose a password.";
        updateRegistrationCategoryFields();
        document.getElementById("registrationUid").textContent = uid;
        await sendLcdCommand("SIGNUP");
        openModal(registrationModal);
        setStatus("Card found. Finish account setup.", "checking");
        (registrationCategory.value === "Admin" ? registrationName : registrationNumber).focus();
        return;
      }

      loginForm.reset();
      loginError.textContent = "";
      loginCadetName.textContent = activeCadet.name || "Registered cadet";
      loginCadetNumber.textContent = activeCadet.cadetNumber ? `Cadet ${activeCadet.cadetNumber}` : uid;
      openModal(loginModal);
      setStatus("Registered card found. Enter the password to continue.", "ready");
      loginPassword.focus();
    } catch (error) {
      console.error("Could not look up RFID card:", error);
      setStatus("Could not check this card in Firebase. Check your connection and try again.", "error");
    }
  }

  async function signIn(event) {
    event.preventDefault();
    if (!activeUid || !activeCadet?.password) return;

    const submitButton = loginForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = "Checking...";
    loginError.textContent = "";
    try {
      const credential = activeCadet.password;
      const actualHash = await CadetLinkAuth.derivePasswordHash(loginPassword.value, credential.salt, credential.iterations);
      if (!CadetLinkAuth.constantTimeEqual(actualHash, credential.hash)) {
        loginError.textContent = "That password did not match. Try again.";
        loginPassword.select();
        return;
      }
      await sendLcdCommand("LOGIN_SUCCESS", activeCadet.name || "Cadet");
      await new Promise((resolve) => window.setTimeout(resolve, 3500));
      enterDashboard(activeUid, activeCadet);
    } catch (error) {
      console.error("Password verification failed:", error);
      loginError.textContent = "Could not verify the password. Please try again.";
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
    const category = CadetLinkAuth.normalizeUserCategory(registrationCategory.value);
    const password = registrationPassword.value;
    if (!name || (category !== "Admin" && !cadetNumber) || password.length < 8) {
      registrationError.textContent = category === "Admin"
        ? "Enter a name and use a password of at least 8 characters."
        : "Enter all details and use a password of at least 8 characters.";
      return;
    }

    const submitButton = registrationForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
    registrationError.textContent = "";

    try {
      const accountsSnapshot = await database.ref("cadets").once("value");
      const accounts = accountsSnapshot.val();
      const otherAccounts = accounts && typeof accounts === "object"
        ? Object.entries(accounts)
          .filter(([uid, account]) => uid !== activeUid && account && typeof account === "object")
          .map(([, account]) => account)
        : [];
      const normalizedName = name.toLocaleLowerCase();
      const nameAlreadyRegistered = otherAccounts.some((account) =>
        typeof account.name === "string" && account.name.trim().toLocaleLowerCase() === normalizedName
      );
      const hasCadetNumber = category !== "Admin";
      const numberAlreadyRegistered = hasCadetNumber && otherAccounts.some((account) =>
        typeof account.cadetNumber === "string" && account.cadetNumber.trim() === cadetNumber
      );
      const accountAlreadyRegistered = hasCadetNumber && otherAccounts.some((account) =>
        typeof account.name === "string"
        && account.name.trim().toLocaleLowerCase() === normalizedName
        && typeof account.cadetNumber === "string"
        && account.cadetNumber.trim() === cadetNumber
      );

      if (accountAlreadyRegistered) {
        registrationError.textContent = "Account already exists";
        return;
      }
      if (numberAlreadyRegistered) {
        registrationError.textContent = "This Cadet Number is already registered.";
        return;
      }
      if (nameAlreadyRegistered) {
        const nameFieldLabel = category === "Admin" ? "Name" : "Cadet Name";
        registrationError.textContent = `This ${nameFieldLabel} is already registered.`;
        return;
      }

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const passwordHash = await CadetLinkAuth.derivePasswordHash(password, CadetLinkAuth.bytesToBase64(salt), CadetLinkAuth.passwordIterations);
      const passwordRecord = {
        algorithm: "PBKDF2-SHA-256",
        iterations: CadetLinkAuth.passwordIterations,
        salt: CadetLinkAuth.bytesToBase64(salt),
        hash: passwordHash
      };
      const cadetRef = database.ref(`cadets/${activeUid}`);
      const registrationTime = new Date().toISOString();
      const result = await cadetRef.transaction((current) => {
        if (registrationMode === "new") {
          if (current !== null) return;
          return { name, cadetNumber: category === "Admin" ? "" : cadetNumber, category, password: passwordRecord, registeredAt: registrationTime };
        }
        if (!current || current.password?.hash) return;
        return {
          ...current,
          name,
          cadetNumber: category === "Admin" ? "" : cadetNumber,
          category,
          password: passwordRecord,
          registeredAt: current.registeredAt || registrationTime
        };
      });

      if (!result.committed) {
        registrationError.textContent = "This card was registered elsewhere. Scan it again to sign in.";
        return;
      }
      const registeredCadet = result.snapshot.val();
      await sendLcdCommand("SIGNUP_SUCCESS", registeredCadet?.name || name);
      await new Promise((resolve) => window.setTimeout(resolve, 6000));
      enterDashboard(activeUid, registeredCadet);
    } catch (error) {
      console.error("Cadet registration failed:", error);
      registrationError.textContent = error.message || "Could not save your registration. Please try again.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = registrationMode === "upgrade" ? "Save password" : "Register and continue";
    }
  }

  function enterDashboard(uid, cadet) {
    setStatus("Access granted. Opening dashboard...", "registered");
    CadetLinkAuth.enterDashboard(uid, cadet, "loading");
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
    const isAdmin = registrationCategory.value === "Admin";
    registrationForm.classList.toggle("is-admin-registration", isAdmin);
    registrationNameLabel.textContent = isAdmin ? "Name" : "Cadet name";
    registrationName.placeholder = isAdmin ? "" : "D/Cdt Lastname";
    registrationNumberGroup.hidden = isAdmin;
    registrationNumber.required = !isAdmin;
    if (isAdmin) registrationNumber.value = "";
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
