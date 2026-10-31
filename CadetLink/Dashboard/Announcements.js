(function () {
  const DATABASE_PATHS = {
    general: "announcements",
    clc: "clcAnnouncements",
    nightOrders: "nightOrders"
  };
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCsBK8esC6Nwd-xp2cce9UtKi5xDEhWwgY",
    authDomain: "cadetlink-d53c4.firebaseapp.com",
    databaseURL: "https://cadetlink-d53c4-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cadetlink-d53c4",
    storageBucket: "cadetlink-d53c4.firebasestorage.app",
    messagingSenderId: "936082286663",
    appId: "1:936082286663:web:9406ef4ee08c9ca7efe962",
    measurementId: "G-L6SQ6ZW1XY"
  };

  function getReference(type) {
    if (!Object.hasOwn(DATABASE_PATHS, type)) {
      throw new Error(`Unknown announcement type: ${type}`);
    }
    if (!window.firebase || typeof firebase.database !== "function") {
      throw new Error("Firebase did not load.");
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return firebase.database().ref(DATABASE_PATHS[type]);
  }

  function fromSnapshot(snapshot) {
    const saved = snapshot.val();
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return [];
    return Object.entries(saved)
      .filter(([, announcement]) => announcement && typeof announcement === "object")
      .map(([id, announcement]) => ({ ...announcement, id }))
      .filter((announcement) =>
        typeof announcement.title === "string" && typeof announcement.message === "string");
  }

  async function prepareLegacy(type, storageKey) {
    const reference = getReference(type);
    let legacyAnnouncements = [];
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved)) {
        legacyAnnouncements = saved.filter((announcement) =>
          announcement
          && typeof announcement.title === "string"
          && typeof announcement.message === "string");
      }
    } catch (error) {
      console.warn("Could not read legacy announcements from this browser:", error);
    }

    if (legacyAnnouncements.length === 0) return reference;

    const existing = await reference.once("value");
    if (existing.exists()) {
      localStorage.removeItem(storageKey);
      return reference;
    }

    const migrated = {};
    legacyAnnouncements.forEach(({ title, message, createdAt, updatedAt }) => {
      const announcement = { title, message };
      if (typeof createdAt === "string") announcement.createdAt = createdAt;
      if (typeof updatedAt === "string") announcement.updatedAt = updatedAt;
      migrated[reference.push().key] = announcement;
    });
    const result = await reference.transaction(
      (current) => current === null ? migrated : undefined,
      undefined,
      false
    );
    if (result.committed || result.snapshot.exists()) localStorage.removeItem(storageKey);
    return reference;
  }

  window.CadetLinkAnnouncements = Object.freeze({
    getReference,
    fromSnapshot,
    prepareLegacy
  });
})();
