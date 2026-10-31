function initializeAdminAccess() {
  const signInForm = document.getElementById("adminSignInForm");
  const setupForm = document.getElementById("adminSetupForm");
  const accessStatus = document.getElementById("adminAccessStatus");
  const scanAdminCardButton = document.getElementById("scanAdminCardButton");
  const adminCardScanStatus = document.getElementById("adminCardScanStatus");
  const adminSetupUid = document.getElementById("adminSetupUid");
  if (!window.CadetLinkAuth) {
    accessStatus.textContent = "Admin access could not be initialized. Refresh this page to try again.";
    return;
  }

  signInForm.addEventListener("submit", signIn);
  setupForm.addEventListener("submit", setupAdmin);
  scanAdminCardButton.addEventListener("click", scanAdminCard);

  async function signIn(event) {
    event.preventDefault();
    const submitButton = signInForm.querySelector("button[type=submit]");
    const errorOutput = document.getElementById("adminSignInError");
    errorOutput.textContent = "";
    accessStatus.textContent = "";
    accessStatus.dataset.state = "";
    submitButton.disabled = true;
    submitButton.textContent = "Checking...";
    try {
      const result = await sendAuthRequest({
        action: "admin-login",
        name: document.getElementById("adminSignInName").value.trim(),
        password: document.getElementById("adminSignInPassword").value
      });
      if (result.account?.category !== "Admin") throw new Error("This account does not have Admin access.");
      CadetLinkAuth.enterDashboard(result.uid, result.account, "admin-access", result.token);
    } catch (error) {
      console.error("Admin sign-in failed:", error);
      errorOutput.textContent = error.message || "Could not verify the Admin account. Check your connection and try again.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Sign in as Admin";
    }
  }

  async function setupAdmin(event) {
    event.preventDefault();
    const submitButton = setupForm.querySelector("button[type=submit]");
    const errorOutput = document.getElementById("adminSetupError");
    errorOutput.textContent = "";
    accessStatus.textContent = "";
    accessStatus.dataset.state = "";
    submitButton.disabled = true;
    submitButton.textContent = "Creating account...";
    try {
      await sendAuthRequest({
        action: "setup-admin",
        setupSecret: document.getElementById("adminSetupSecret").value,
        uid: document.getElementById("adminSetupUid").value.trim(),
        name: document.getElementById("adminSetupName").value.trim(),
        password: document.getElementById("adminSetupPassword").value
      });
      setupForm.reset();
      accessStatus.dataset.state = "success";
      accessStatus.textContent = "Admin account created and linked to the RFID card. Remove the setup code from Vercel, redeploy, then sign in above or scan the card.";
    } catch (error) {
      console.error("Admin setup failed:", error);
      errorOutput.textContent = error.message || "Could not create the Admin account. Check your connection and try again.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Create the first Admin account";
    }
  }

  async function scanAdminCard() {
    if (!("serial" in navigator)) {
      adminCardScanStatus.textContent = "RFID scanning requires Chrome or Edge over HTTPS or localhost.";
      return;
    }

    scanAdminCardButton.disabled = true;
    adminCardScanStatus.textContent = "Connecting to the RFID reader...";
    let port;
    let reader;
    let pipeClosed;
    let cardScanned = false;
    try {
      const authorizedPorts = await navigator.serial.getPorts();
      port = authorizedPorts[0] || await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      if (!port.readable) throw new Error("The RFID reader did not provide a readable connection.");

      const decoder = new TextDecoderStream();
      pipeClosed = port.readable.pipeTo(decoder.writable).catch((error) => {
        if (error?.name !== "AbortError") throw error;
      });
      reader = decoder.readable.getReader();
      adminCardScanStatus.textContent = "Reader connected. Scan the card you want to link to Admin.";

      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        const uid = lines.map((line) => line.trim().toUpperCase()).find((line) => /^[A-F0-9]{8,20}$/.test(line));
        if (!uid) continue;

        adminSetupUid.value = uid;
        cardScanned = true;
        adminCardScanStatus.textContent = `Card scanned: ${uid}. This UID will be linked to the Admin account.`;
        return;
      }
      throw new Error("The reader disconnected before a card was scanned.");
    } catch (error) {
      if (error?.name === "NotFoundError") {
        adminCardScanStatus.textContent = "No reader was selected. Choose Scan Admin card to try again.";
      } else {
        console.error("Admin RFID scan failed:", error);
        adminCardScanStatus.textContent = error.message || "Could not read the card. Check the reader and try again.";
      }
    } finally {
      if (reader) {
        const reason = cardScanned ? new DOMException("Card scanned", "AbortError") : undefined;
        await reader.cancel(reason).catch((error) => console.error("Could not stop the RFID reader:", error));
        reader.releaseLock();
      }
      if (pipeClosed) await pipeClosed.catch((error) => console.error("RFID reader stream failed:", error));
      if (port?.readable || port?.writable) {
        await port.close().catch((error) => console.error("Could not close the RFID reader:", error));
      }
      scanAdminCardButton.disabled = false;
    }
  }

  async function sendAuthRequest(body) {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Could not complete the request. Try again.");
    return result;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAdminAccess, { once: true });
} else {
  initializeAdminAccess();
}
