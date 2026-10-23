const ANNOUNCEMENTS_KEY = "cadetlinkAnnouncements";
const SESSION_KEY = "cadetlinkSession";
const DASHBOARD_URLS = {
	Admin: "Admin.html",
	CLC: "../CLC%20Panel/CLCDashboard.html",
	"Normal Cadet": "../Dashboard/Dashboard.html"
};

document.addEventListener("DOMContentLoaded", () => {
	let userSession;
	try {
		userSession = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
	} catch {
		userSession = null;
	}

	if (!userSession || !userSession.uid) {
		window.location.replace("../Loading%20screen/Loadingscreen.html");
		return;
	}
	if (userSession.category !== "Admin") {
		const dashboardUrl = Object.hasOwn(DASHBOARD_URLS, userSession.category)
			? DASHBOARD_URLS[userSession.category]
			: DASHBOARD_URLS["Normal Cadet"];
		window.location.replace(dashboardUrl);
		return;
	}

	const form = document.getElementById("announcementForm");
	const titleInput = document.getElementById("announcementTitle");
	const messageInput = document.getElementById("announcementMessage");
	const list = document.getElementById("announcementList");
	const count = document.getElementById("announcementCount");
	const status = document.getElementById("formStatus");
	const publishButton = document.getElementById("publishButton");
	const cancelEditButton = document.getElementById("cancelEditButton");
	let announcements = loadAnnouncements();
	let editingId = null;

	function loadAnnouncements() {
		try {
			const saved = JSON.parse(localStorage.getItem(ANNOUNCEMENTS_KEY) || "[]");
			return Array.isArray(saved) ? saved : [];
		} catch {
			return [];
		}
	}

	function saveAnnouncements() {
		localStorage.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(announcements));
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

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const title = titleInput.value.trim();
		const message = messageInput.value.trim();
		if (!title || !message) return;

		const now = new Date().toISOString();
		if (editingId) {
			announcements = announcements.map((announcement) => announcement.id === editingId
				? { ...announcement, title, message, updatedAt: now }
				: announcement);
			status.textContent = "Announcement updated.";
		} else {
			announcements.push({
				id: window.crypto?.randomUUID
					? window.crypto.randomUUID()
					: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
				title,
				message,
				createdAt: now
			});
			status.textContent = "Announcement published.";
		}

		saveAnnouncements();
		resetForm();
		renderAnnouncements();
	});

	list.addEventListener("click", (event) => {
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

		announcements = announcements.filter((item) => item.id !== announcement.id);
		saveAnnouncements();
		if (editingId === announcement.id) resetForm();
		status.textContent = "Announcement deleted.";
		renderAnnouncements();
	});

	cancelEditButton.addEventListener("click", () => {
		resetForm();
		status.textContent = "Edit canceled.";
	});

	renderAnnouncements();
});
