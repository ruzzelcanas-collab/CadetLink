document.addEventListener("DOMContentLoaded", () => {
  const firebaseConfig = {
    apiKey: "AIzaSyCsBK8esC6Nwd-xp2cce9UtKi5xDEhWwgY",
    authDomain: "cadetlink-d53c4.firebaseapp.com",
    databaseURL: "https://cadetlink-d53c4-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cadetlink-d53c4",
    storageBucket: "cadetlink-d53c4.firebasestorage.app",
    messagingSenderId: "936082286663",
    appId: "1:936082286663:web:9406ef4ee08c9ca7efe962",
    measurementId: "G-L6SQ6ZW1XY"
  };
  const overlay = createEmergencyOverlay();
  const readerStatus = createReaderStatus();
  document.body.append(overlay);
  document.body.append(readerStatus);

  const locationOutput = overlay.querySelector("#alertLocation");
  const timeOutput = overlay.querySelector("#alertTime");
  const dateOutput = overlay.querySelector("#alertDate");
  const dismissButton = overlay.querySelector("#dismissEmergencyBtn");
  const readerStatusText = readerStatus.querySelector("[data-reader-status]");
  const readerConnectButton = readerStatus.querySelector("[data-reader-connect]");
  const readerHideButton = readerStatus.querySelector("[data-reader-hide]");
  let activePort = null;
  let readerConnecting = false;
  let audioContext = null;
  let sirenOscillator = null;
  let sirenGain = null;
  let sirenTimer = null;
  let displayedEventId = "";
  let emergencyDatabase = null;

  document.addEventListener("pointerdown", unlockEmergencyAudio, { once: true });
  document.addEventListener("keydown", unlockEmergencyAudio, { once: true });

  if (window.firebase && typeof firebase.database === "function") {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    emergencyDatabase = firebase.database();
    emergencyDatabase.ref("emergencyAlerts/current").on("value", (snapshot) => {
      const alertEvent = snapshot.val();
      if (!alertEvent?.location || !alertEvent.eventId || !alertEvent.timestamp) return;
      if (alertEvent.timestamp < Date.now() - 5000) return;
      showEmergencyAlert(alertEvent.location, new Date(alertEvent.timestamp), alertEvent.eventId);
    }, (error) => {
      console.error("Emergency alert updates could not be received:", error);
    });
  }

  dismissButton.addEventListener("click", () => {
    overlay.classList.add("hidden");
    stopEmergencySound();
  });

  readerConnectButton.addEventListener("click", async () => {
    try {
      const port = await navigator.serial.requestPort();
      readerConnectButton.hidden = true;
      await connectToEmergencyReader(port);
    } catch (error) {
      if (error.name !== "NotFoundError") console.error("Emergency reader authorization failed:", error);
      showReaderUnavailable("Reader permission required");
    }
  });

  readerHideButton.addEventListener("click", () => {
    readerStatus.hidden = true;
  });

  if (!("serial" in navigator)) {
    showReaderUnavailable("Use Chrome or Edge over HTTPS for RFID alerts", false);
    return;
  }

  navigator.serial.addEventListener("connect", (event) => {
    connectToEmergencyReader(event.target);
  });
  navigator.serial.addEventListener("disconnect", (event) => {
    if (event.target === activePort) activePort = null;
    showReaderUnavailable("Reader disconnected");
  });
  connectToEmergencyReader();

  function showReaderUnavailable(message, canConnect = true) {
    readerStatus.hidden = false;
    delete readerStatus.dataset.connected;
    readerStatusText.textContent = message;
    readerConnectButton.hidden = !canConnect;
    readerHideButton.hidden = false;
  }

  function createEmergencyOverlay() {
    const dialog = document.createElement("div");
    dialog.id = "emergencyOverlay";
    dialog.className = "emergency-overlay hidden";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "emergencyTitle");
    dialog.setAttribute("aria-describedby", "emergencySubtitle");
    dialog.setAttribute("aria-live", "assertive");

    const box = document.createElement("section");
    box.className = "emergency-box";

    const icon = document.createElement("div");
    icon.className = "siren-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "!";

    const title = document.createElement("h1");
    title.id = "emergencyTitle";
    title.className = "emergency-title";
    title.textContent = "EMERGENCY ALERT";

    const subtitle = document.createElement("p");
    subtitle.id = "emergencySubtitle";
    subtitle.className = "emergency-subtitle";
    subtitle.textContent = "Emergency button activated. Follow your emergency procedures.";

    const infoCard = document.createElement("div");
    infoCard.className = "alert-info-card";
    infoCard.append(
      createEmergencyInfoRow("Location", "alertLocation", "highlight"),
      createEmergencyInfoRow("Date", "alertDate"),
      createEmergencyInfoRow("Time", "alertTime")
    );

    const dismissButton = document.createElement("button");
    dismissButton.className = "btn-dismiss";
    dismissButton.id = "dismissEmergencyBtn";
    dismissButton.type = "button";
    dismissButton.textContent = "Acknowledge alert";

    box.append(icon, title, subtitle, infoCard, dismissButton);
    dialog.append(box);
    return dialog;
  }

  function createReaderStatus() {
    const status = document.createElement("div");
    status.className = "emergency-reader-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const message = document.createElement("span");
    message.dataset.readerStatus = "";
    message.textContent = "Connecting to reader...";

    const connectButton = document.createElement("button");
    connectButton.type = "button";
    connectButton.dataset.readerConnect = "";
    connectButton.textContent = "Enable reader";
    connectButton.hidden = true;

    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.dataset.readerHide = "";
    hideButton.textContent = "Hide";
    hideButton.hidden = true;

    status.append(message, connectButton, hideButton);
    return status;
  }

  function createEmergencyInfoRow(label, valueId, valueClass = "") {
    const row = document.createElement("div");
    row.className = "info-row";
    const labelElement = document.createElement("span");
    labelElement.className = "info-label";
    labelElement.textContent = label;
    const valueElement = document.createElement("span");
    valueElement.id = valueId;
    valueElement.className = `info-value${valueClass ? ` ${valueClass}` : ""}`;
    row.append(labelElement, valueElement);
    return row;
  }

  async function connectToEmergencyReader(port = null) {
    if (activePort || readerConnecting) return;
    readerConnecting = true;

    try {
      const ports = port ? [port] : await navigator.serial.getPorts();
      const readerPort = ports[0];
      if (!readerPort) {
        showReaderUnavailable("Reader permission required");
        return;
      }

      if (!readerPort.readable) await readerPort.open({ baudRate: 9600 });
      activePort = readerPort;
      readerStatus.hidden = false;
      readerStatus.dataset.connected = "true";
      readerStatusText.textContent = "Emergency reader connected";
      readerConnectButton.hidden = true;
      readerHideButton.hidden = true;
      await restoreSessionWelcome(readerPort);
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
        lines.forEach(processEmergencySerialInput);
      }

      reader.releaseLock();
      await pipeClosed;
      if (activePort === readerPort) activePort = null;
      if (!activePort) {
        showReaderUnavailable("Reader disconnected");
      }
    } catch (error) {
      console.error("Emergency reader connection failed:", error);
      activePort = null;
      showReaderUnavailable("Reader connection failed");
    } finally {
      readerConnecting = false;
    }
  }

  async function restoreSessionWelcome(port) {
    let userSession;
    try {
      userSession = JSON.parse(sessionStorage.getItem("cadetlinkSession") || "null");
    } catch (error) {
      console.error("Could not read the signed-in user for the LCD:", error);
      return;
    }

    if (!userSession?.uid || typeof userSession.name !== "string" || !port.writable) return;

    const name = userSession.name.replace(/[|\r\n]/g, " ").trim();
    const writer = port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(`LCD|WELCOME|${name}\n`));
    } catch (error) {
      console.error("Could not restore the LCD welcome message:", error);
    } finally {
      writer.releaseLock();
    }
  }

  function processEmergencySerialInput(data) {
    const emergencyLocations = {
      EMERGENCY_MARINERS: "Mariner's Building",
      EMERGENCY_ACADEMIC: "Academic Building"
    };
    const location = emergencyLocations[data.trim()];
    if (!location) return;

    const eventId = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pressedAt = new Date();
    showEmergencyAlert(location, pressedAt, eventId);

    if (emergencyDatabase) {
      emergencyDatabase.ref("emergencyAlerts/current").set({
        eventId,
        location,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      }).catch((error) => {
        console.error("Emergency alert could not be broadcast:", error);
      });
    }
  }

  function showEmergencyAlert(location, pressedAt, eventId) {
    if (displayedEventId === eventId) return;
    displayedEventId = eventId;
    locationOutput.textContent = location;
    dateOutput.textContent = pressedAt.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
    timeOutput.textContent = pressedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    overlay.classList.remove("hidden");
    dismissButton.focus();
    startEmergencySound();
  }

  function startEmergencySound() {
    stopEmergencySound();
    try {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return;

      if (!audioContext) audioContext = new AudioContextType();
      sirenOscillator = audioContext.createOscillator();
      sirenGain = audioContext.createGain();
      sirenOscillator.type = "sawtooth";
      sirenGain.gain.setValueAtTime(0.28, audioContext.currentTime);
      sirenOscillator.connect(sirenGain);
      sirenGain.connect(audioContext.destination);
      sirenOscillator.start();

      const sweepSiren = () => {
        const now = audioContext.currentTime;
        sirenOscillator.frequency.cancelScheduledValues(now);
        sirenOscillator.frequency.setValueAtTime(700, now);
        sirenOscillator.frequency.linearRampToValueAtTime(1200, now + 0.4);
        sirenOscillator.frequency.linearRampToValueAtTime(700, now + 0.8);
      };
      sweepSiren();
      sirenTimer = window.setInterval(sweepSiren, 800);
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    } catch (error) {
      console.warn("Emergency sound could not play:", error);
      stopEmergencySound();
    }
  }

  function unlockEmergencyAudio() {
    try {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return;
      if (!audioContext) audioContext = new AudioContextType();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    } catch (error) {
      console.warn("Emergency audio is unavailable:", error);
    }
  }

  function stopEmergencySound() {
    window.clearInterval(sirenTimer);
    sirenTimer = null;
    if (sirenOscillator) {
      try {
        sirenOscillator.stop();
      } catch {}
      sirenOscillator.disconnect();
      sirenOscillator = null;
    }
    if (sirenGain) {
      sirenGain.disconnect();
      sirenGain = null;
    }
  }
});