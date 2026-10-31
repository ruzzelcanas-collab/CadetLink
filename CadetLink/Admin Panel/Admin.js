const ANNOUNCEMENTS_KEY = "cadetlinkAnnouncements";
const SESSION_KEY = "cadetlinkSession";
const DASHBOARD_URLS = {
	Admin: "Admin.html",
	CLC: "../CLC%20Panel/CLCDashboard.html",
	"CCA-CCO/TLU": "../CCA-CCO-TLU.html",
	"CCA-Nurse": "../CCA-Nurse.html",
	"CCA-Galley": "../CCA-Galley.html",
	"CAA-Instructor": "../CAA-Instructor.html",
	"CAA-KRC": "../CAA-KRC.html",
	"Normal Cadet": "../Dashboard/Dashboard.html"
};

document.addEventListener("DOMContentLoaded", () => {
	let userSession;
	try {
		userSession = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
	} catch {
		userSession = null;
	}

	if (!userSession || !userSession.uid || !userSession.accessToken) {
		window.location.replace("../Loading%20screen/Loadingscreen.html");
		return;
	}
	const requiredCategory = document.body.dataset.requiredCategory || "Admin";
	const requiredSubcategory = document.body.dataset.requiredSubcategory || "";
	if (userSession.category !== requiredCategory
		|| (requiredSubcategory && userSession.subcategory !== requiredSubcategory)) {
		const role = `${userSession.category}-${userSession.subcategory || ""}`;
		const dashboardUrl = DASHBOARD_URLS[role] || DASHBOARD_URLS[userSession.category] || DASHBOARD_URLS["Normal Cadet"];
		window.location.replace(dashboardUrl);
		return;
	}

	setupAdminImageViewer();

	const logoutButton = document.getElementById("logoutBtn");
	logoutButton?.addEventListener("click", () => {
		const returnPath = userSession.entryPoint === "admin-access"
			? "../admin-access.html"
			: userSession.entryPoint === "index"
				? "../index.html"
				: "../Loading%20screen/Loadingscreen.html";
		sessionStorage.removeItem(SESSION_KEY);
		window.location.replace(returnPath);
	});

	const form = document.getElementById("announcementForm");
	const titleInput = document.getElementById("announcementTitle");
	const messageInput = document.getElementById("announcementMessage");
	const list = document.getElementById("announcementList");
	const count = document.getElementById("announcementCount");
	const status = document.getElementById("formStatus");
	const publishButton = document.getElementById("publishButton");
	const cancelEditButton = document.getElementById("cancelEditButton");
	const nightOrdersForm = document.getElementById("nightOrdersForm");
	const nightOrdersInput = document.getElementById("nightOrdersText");
	const nightOrdersPublishButton = document.getElementById("publishNightOrders");
	const nightOrdersStatus = document.getElementById("nightOrdersStatus");
	let announcements = [];
	let announcementsRef = null;
	let nightOrdersRef = null;
	let editingId = null;
	let nightOrdersEdited = false;

	nightOrdersInput.addEventListener("input", () => {
		nightOrdersEdited = true;
	});

	nightOrdersForm.addEventListener("submit", async (event) => {
		event.preventDefault();
		const text = nightOrdersInput.value.trim();
		if (!text) {
			nightOrdersStatus.textContent = "Enter the Night Orders schedule before publishing.";
			nightOrdersStatus.classList.add("is-error");
			return;
		}
		if (!nightOrdersRef) {
			nightOrdersStatus.textContent = "Night Orders are not ready. Check your connection and Firebase database access.";
			nightOrdersStatus.classList.add("is-error");
			return;
		}

		nightOrdersPublishButton.disabled = true;
		nightOrdersStatus.classList.remove("is-error");
		nightOrdersStatus.textContent = "Publishing Night Orders...";
		try {
			await nightOrdersRef.set({ text, updatedAt: new Date().toISOString() });
			nightOrdersEdited = false;
			nightOrdersStatus.textContent = "Night Orders published to the CLC and User dashboards.";
		} catch (error) {
			console.error("Night Orders could not be published:", error);
			nightOrdersStatus.textContent = "Could not publish Night Orders. Check your connection and Firebase database access.";
			nightOrdersStatus.classList.add("is-error");
		} finally {
			nightOrdersPublishButton.disabled = false;
		}
	});

	function setupAdminImageViewer() {
		const viewer = document.getElementById("adminImageViewer");
		const viewerPicture = document.getElementById("adminImageViewerPicture");
		const closeButton = document.getElementById("closeAdminImageViewer");
		const imageContainers = [
			document.getElementById("adminNmoFeed"),
			document.getElementById("adminNmoHistoryList"),
			document.getElementById("devilsReportContainer")
		].filter(Boolean);
		if (!viewer || !viewerPicture || !closeButton || imageContainers.length === 0) return;

		let returnFocusTo = null;
		let previousBodyOverflow = "";

		function makeImagesKeyboardAccessible(container) {
			container.querySelectorAll("img").forEach((image) => {
				image.tabIndex = 0;
				image.setAttribute("role", "button");
				image.setAttribute("aria-label", `View ${image.alt || "attached picture"} full size`);
			});
		}

		function openViewer(image) {
			returnFocusTo = image;
			previousBodyOverflow = document.body.style.overflow;
			viewerPicture.src = image.src;
			viewerPicture.alt = image.alt;
			viewer.hidden = false;
			document.body.style.overflow = "hidden";
			closeButton.focus();
		}

		function closeViewer() {
			viewer.hidden = true;
			viewerPicture.removeAttribute("src");
			document.body.style.overflow = previousBodyOverflow;
			returnFocusTo?.focus();
		}

		imageContainers.forEach((container) => {
			makeImagesKeyboardAccessible(container);
			container.addEventListener("click", (event) => {
				const image = event.target.closest("img");
				if (image && container.contains(image)) openViewer(image);
			});
			container.addEventListener("keydown", (event) => {
				const image = event.target.closest("img");
				if (!image || !container.contains(image) || !["Enter", " "].includes(event.key)) return;
				event.preventDefault();
				openViewer(image);
			});
		});

		const imageObserver = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (!(node instanceof Element)) return;
					if (node.matches("img")) {
						node.tabIndex = 0;
						node.setAttribute("role", "button");
						node.setAttribute("aria-label", `View ${node.alt || "attached picture"} full size`);
					}
					makeImagesKeyboardAccessible(node);
				});
			});
		});
		imageContainers.forEach((container) => {
			imageObserver.observe(container, { childList: true, subtree: true });
		});

		closeButton.addEventListener("click", closeViewer);
		viewer.addEventListener("click", (event) => {
			if (event.target === viewer) closeViewer();
		});
		document.addEventListener("keydown", (event) => {
			if (viewer.hidden) return;
			if (event.key === "Escape") {
				closeViewer();
			} else if (event.key === "Tab") {
				event.preventDefault();
				closeButton.focus();
			}
		});
	}

	function renderAnnouncements() {
		list.replaceChildren();
		count.textContent = String(announcements.length);

		if (announcements.length === 0) {
			const emptyState = document.createElement("p");
			emptyState.className = "empty-announcements";
			emptyState.textContent = "No announcements have been published yet.";
			list.append(emptyState);
			return;
		}

		[...announcements].reverse().forEach((announcement) => {
			const item = document.createElement("article");
			item.className = "announcement-item";

			const heading = document.createElement("h3");
			heading.textContent = announcement.title;
			const date = document.createElement("p");
			date.className = "announcement-date";
			date.textContent = new Date(announcement.updatedAt || announcement.createdAt).toLocaleString();
			const message = document.createElement("p");
			message.className = "announcement-message";
			message.textContent = announcement.message;
			const actions = document.createElement("div");
			actions.className = "announcement-actions";

			const editButton = document.createElement("button");
			editButton.className = "edit-button";
			editButton.type = "button";
			editButton.dataset.action = "edit";
			editButton.dataset.id = announcement.id;
			editButton.textContent = "Edit";

			const deleteButton = document.createElement("button");
			deleteButton.className = "delete-button";
			deleteButton.type = "button";
			deleteButton.dataset.action = "delete";
			deleteButton.dataset.id = announcement.id;
			deleteButton.textContent = "Delete";

			actions.append(editButton, deleteButton);
			item.append(heading, date, message, actions);
			list.append(item);
		});
	}

	function resetForm() {
		form.reset();
		editingId = null;
		publishButton.textContent = "Publish announcement";
		cancelEditButton.hidden = true;
	}

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		const title = titleInput.value.trim();
		const message = messageInput.value.trim();
		if (!title || !message) return;
		if (!announcementsRef) {
			status.textContent = "Announcements are not ready. Check your connection and Firebase database access.";
			return;
		}

		const now = new Date().toISOString();
		publishButton.disabled = true;
		try {
			if (editingId) {
				await announcementsRef.child(editingId).update({ title, message, updatedAt: now });
				status.textContent = "Announcement updated.";
			} else {
				await announcementsRef.push().set({ title, message, createdAt: now });
				status.textContent = "Announcement published.";
			}
			resetForm();
		} catch (error) {
			console.error("Announcement could not be saved:", error);
			status.textContent = "Could not save the announcement. Check your connection and Firebase database access.";
		} finally {
			publishButton.disabled = false;
		}
	});

	list.addEventListener("click", async (event) => {
		const button = event.target.closest("button[data-action]");
		if (!button) return;

		const announcement = announcements.find((item) => item.id === button.dataset.id);
		if (!announcement) return;

		if (button.dataset.action === "edit") {
			titleInput.value = announcement.title;
			messageInput.value = announcement.message;
			editingId = announcement.id;
			publishButton.textContent = "Save changes";
			cancelEditButton.hidden = false;
			status.textContent = "Editing announcement.";
			titleInput.focus();
			return;
		}

		button.disabled = true;
		try {
			await announcementsRef.child(announcement.id).remove();
			if (editingId === announcement.id) resetForm();
			status.textContent = "Announcement deleted.";
		} catch (error) {
			console.error("Announcement could not be deleted:", error);
			status.textContent = "Could not delete the announcement. Check your connection and Firebase database access.";
			button.disabled = false;
		}
	});

	cancelEditButton.addEventListener("click", () => {
		resetForm();
		status.textContent = "Edit canceled.";
	});

	status.textContent = "Loading announcements...";
	CadetLinkAnnouncements.prepareLegacy("general", ANNOUNCEMENTS_KEY)
		.then((reference) => {
			announcementsRef = reference;
			reference.on("value", (snapshot) => {
				announcements = CadetLinkAnnouncements.fromSnapshot(snapshot);
				renderAnnouncements();
				if (status.textContent === "Loading announcements...") status.textContent = "";
			}, (error) => {
				console.error("Announcements could not be loaded:", error);
				status.textContent = "Could not load announcements. Check your connection and Firebase database access.";
				list.replaceChildren();
			});
		})
		.catch((error) => {
			console.error("Announcements could not be initialized:", error);
			status.textContent = "Could not load announcements. Check your connection and Firebase database access.";
		});

	nightOrdersStatus.textContent = "Loading Night Orders...";
	try {
		nightOrdersRef = CadetLinkAnnouncements.getReference("nightOrders");
		nightOrdersRef.on("value", (snapshot) => {
			const saved = snapshot.val();
			if (!nightOrdersEdited) {
				nightOrdersInput.value = saved && typeof saved.text === "string" ? saved.text : "";
			}
			if (nightOrdersStatus.textContent === "Loading Night Orders...") {
				nightOrdersStatus.textContent = saved && typeof saved.text === "string"
					? "Current Night Orders loaded."
					: "No Night Orders have been published yet.";
			}
		}, (error) => {
			console.error("Night Orders could not be loaded:", error);
			nightOrdersStatus.textContent = "Could not load Night Orders. Check your connection and Firebase database access.";
			nightOrdersStatus.classList.add("is-error");
		});
	} catch (error) {
		console.error("Night Orders could not be initialized:", error);
		nightOrdersStatus.textContent = "Could not load Night Orders. Check your connection and Firebase database access.";
		nightOrdersStatus.classList.add("is-error");
	}
});
