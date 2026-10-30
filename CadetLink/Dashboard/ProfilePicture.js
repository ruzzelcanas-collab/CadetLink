const PROFILE_PICTURE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCsBK8esC6Nwd-xp2cce9UtKi5xDEhWwgY",
  authDomain: "cadetlink-d53c4.firebaseapp.com",
  databaseURL: "https://cadetlink-d53c4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cadetlink-d53c4",
  storageBucket: "cadetlink-d53c4.firebasestorage.app",
  messagingSenderId: "936082286663",
  appId: "1:936082286663:web:9406ef4ee08c9ca7efe962",
  measurementId: "G-L6SQ6ZW1XY"
};
const PROFILE_PICTURE_MAX_FILE_SIZE = 10 * 1024 * 1024;
const PROFILE_PICTURE_MAX_DATA_LENGTH = 120_000;

window.CadetLinkProfilePictures = Object.freeze({
  getCurrentPicture() {
    try {
      const userSession = JSON.parse(sessionStorage.getItem("cadetlinkSession") || "null");
      return this.isValidPicture(userSession?.profilePicture) ? userSession.profilePicture : "";
    } catch (error) {
      console.error("Could not read the current profile picture:", error);
      return "";
    }
  },
  isValidPicture(picture) {
    return typeof picture === "string"
      && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(picture);
  },
  createAvatar(picture, name, className = "") {
    const avatar = document.createElement("span");
    avatar.className = `cadet-profile-avatar${className ? ` ${className}` : ""}`;
    avatar.setAttribute("aria-hidden", "true");

    if (this.isValidPicture(picture)) {
      const image = document.createElement("img");
      image.src = picture;
      image.alt = "";
      avatar.append(image);
    } else {
      const initials = document.createElement("span");
      initials.textContent = String(name || "Cadet")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0] || "")
        .join("")
        .toUpperCase();
      avatar.append(initials);
    }
    return avatar;
  },
  createIdentity(picture, name, className = "") {
    const identity = document.createElement("div");
    identity.className = `cadet-profile-identity${className ? ` ${className}` : ""}`;
    identity.append(this.createAvatar(picture, name));
    const label = document.createElement("span");
    label.className = "cadet-profile-name";
    label.textContent = name || "Cadet";
    identity.append(label);
    return identity;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const pictureButton = document.getElementById("profilePictureButton");
  const pictureInput = document.getElementById("profilePictureInput");
  const picturePreview = document.getElementById("profilePicturePreview");
  const initials = document.getElementById("profilePictureInitials");
  const status = document.getElementById("profilePictureStatus");
  if (!pictureButton || !pictureInput || !picturePreview || !initials || !status) return;

  let userSession;
  try {
    userSession = JSON.parse(sessionStorage.getItem("cadetlinkSession") || "null");
  } catch (error) {
    console.error("Could not read the signed-in profile:", error);
    return;
  }
  if (!userSession?.uid) return;

  function renderProfilePicture(picture) {
    pictureButton.setAttribute("aria-label", `Change profile picture for ${userSession.name || "your account"}`);
    if (window.CadetLinkProfilePictures.isValidPicture(picture)) {
      picturePreview.src = picture;
      picturePreview.hidden = false;
      initials.hidden = true;
      pictureButton.title = "Change profile picture";
      return;
    }

    picturePreview.removeAttribute("src");
    picturePreview.hidden = true;
    initials.textContent = String(userSession.name || "Cadet")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase();
    initials.hidden = false;
    pictureButton.title = "Add profile picture";
  }

  renderProfilePicture(userSession.profilePicture);
  pictureButton.addEventListener("click", () => pictureInput.click());
  pictureInput.addEventListener("change", async () => {
    const file = pictureInput.files?.[0];
    pictureInput.value = "";
    status.textContent = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      status.textContent = "Choose an image file.";
      return;
    }
    if (file.size > PROFILE_PICTURE_MAX_FILE_SIZE) {
      status.textContent = "Choose an image smaller than 10 MB.";
      return;
    }
    if (!window.firebase || typeof firebase.database !== "function") {
      status.textContent = "Profile pictures are unavailable because Firebase did not load.";
      return;
    }

    pictureButton.disabled = true;
    pictureButton.title = "Saving profile picture";
    status.textContent = "Saving profile picture...";
    try {
      const picture = await compressProfilePicture(file);
      if (!firebase.apps.length) firebase.initializeApp(PROFILE_PICTURE_FIREBASE_CONFIG);
      await firebase.database().ref(`cadets/${userSession.uid}/profilePicture`).set(picture);

      userSession.profilePicture = picture;
      sessionStorage.setItem("cadetlinkSession", JSON.stringify(userSession));
      renderProfilePicture(picture);
      status.textContent = "Profile picture updated.";
    } catch (error) {
      console.error("Profile picture could not be saved:", error);
      status.textContent = error.message || "Could not save the profile picture. Check your connection and try again.";
    } finally {
      pictureButton.disabled = false;
    }
  });
});

function compressProfilePicture(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("The selected file is not a readable image."));
      image.onload = () => {
        if (!image.naturalWidth || !image.naturalHeight) {
          reject(new Error("The selected image has no readable dimensions."));
          return;
        }
        const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
        let width = Math.max(1, Math.round(image.naturalWidth * scale));
        let height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not process the selected image."));
          return;
        }

        let picture = "";
        do {
          canvas.width = width;
          canvas.height = height;
          context.clearRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          picture = canvas.toDataURL("image/jpeg", 0.78);
          width = Math.max(1, Math.round(width * 0.8));
          height = Math.max(1, Math.round(height * 0.8));
        } while (picture.length > PROFILE_PICTURE_MAX_DATA_LENGTH && Math.max(width, height) > 64);

        if (picture.length > PROFILE_PICTURE_MAX_DATA_LENGTH) {
          reject(new Error("The compressed picture is too large. Choose a simpler image."));
          return;
        }
        resolve(picture);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
