const firebaseScriptUrl = document.currentScript.src;
const scriptDirectory = new URL(".", firebaseScriptUrl);
const isNestedLayout = decodeURIComponent(scriptDirectory.pathname).endsWith("/Loading screen/");
const appRoot = isNestedLayout ? new URL("../", firebaseScriptUrl) : scriptDirectory;
const dashboardPaths = isNestedLayout
  ? {
      Admin: "Admin%20Panel/Admin.html",
      CLC: "CLC%20Panel/CLCDashboard.html",
      "Normal Cadet": "Dashboard/Dashboard.html"
    }
  : {
      Admin: "Admin.html",
      CLC: "CLCDashboard.html",
      "Normal Cadet": "Dashboard.html"
    };

window.CadetLinkAuth = Object.freeze({
  firebaseConfig: {
    apiKey: "AIzaSyCsBK8esC6Nwd-xp2cce9UtKi5xDEhWwgY",
    authDomain: "cadetlink-d53c4.firebaseapp.com",
    databaseURL: "https://cadetlink-d53c4-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cadetlink-d53c4",
    storageBucket: "cadetlink-d53c4.firebasestorage.app",
    messagingSenderId: "936082286663",
    appId: "1:936082286663:web:9406ef4ee08c9ca7efe962",
    measurementId: "G-L6SQ6ZW1XY"
  },
  passwordIterations: 210000,
  sessionKey: "cadetlinkSession",
  dashboardUrls: {
    Admin: new URL(dashboardPaths.Admin, appRoot).href,
    CLC: new URL(dashboardPaths.CLC, appRoot).href,
    "Normal Cadet": new URL(dashboardPaths["Normal Cadet"], appRoot).href
  },
  async derivePasswordHash(password, saltBase64, iterations) {
    const salt = this.base64ToBytes(saltBase64);
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const hashBuffer = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, keyMaterial, 256);
    return this.bytesToBase64(new Uint8Array(hashBuffer));
  },
  bytesToBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
  },
  base64ToBytes(value) {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  },
  constantTimeEqual(left, right) {
    if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return difference === 0;
  },
  normalizeUserCategory(category) {
    return Object.hasOwn(this.dashboardUrls, category) ? category : "Normal Cadet";
  },
  enterDashboard(uid, cadet, entryPoint = "rfid") {
    const category = this.normalizeUserCategory(cadet.category);
    sessionStorage.setItem(this.sessionKey, JSON.stringify({
      uid,
      name: cadet.name || "Cadet",
      cadetNumber: cadet.cadetNumber || "",
      category,
      entryPoint,
      signedInAt: new Date().toISOString()
    }));
    window.location.assign(this.dashboardUrls[category]);
  }
});
