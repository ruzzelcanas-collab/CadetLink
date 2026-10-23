const CLC_PANEL_ANNOUNCEMENTS_STORAGE_KEY = "cadetlinkCLCAnnouncements";

document.addEventListener("DOMContentLoaded", () => {
	let userSession;
	try {
		userSession = JSON.parse(sessionStorage.getItem("cadetlinkSession") || "null");
	} catch {
		userSession = null;
	}
	if (!userSession || !userSession.uid) return;

	const logoutButton = document.getElementById("logoutBtn");
	logoutButton?.addEventListener("click", () => {
		sessionStorage.removeItem("cadetlinkSession");
		const signInPage = userSession.entryPoint === "url"
			? "../index.html"
			: "../Loading%20screen/Loadingscreen.html";
		window.location.replace(signInPage);
	});

	const modal = document.getElementById("clcAnnouncementModal");
	const openButton = document.getElementById("openCLCAnnouncementEditor");
	const closeButton = document.getElementById("closeCLCAnnouncementEditor");
	const form = document.getElementById("clcAnnouncementForm");
	const titleInput = document.getElementById("clcAnnouncementTitle");
	const messageInput = document.getElementById("clcAnnouncementMessage");
	const publishButton = document.getElementById("publishCLCAnnouncement");
	const cancelEditButton = document.getElementById("cancelCLCEdit");
	const status = document.getElementById("clcFormStatus");
	const list = document.getElementById("clcAnnouncementList");
	const count = document.getElementById("clcAnnouncementCount");

	if (!modal || !openButton || !closeButton || !form || !list || !count) return;

	let announcements = loadAnnouncements();
	let editingId = null;

	function loadAnnouncements() {
		try {
			const saved = JSON.parse(localStorage.getItem(CLC_PANEL_ANNOUNCEMENTS_STORAGE_KEY) || "[]");
			return Array.isArray(saved) ? saved : [];
		} catch {
			return [];
		}
	}

	function saveAnnouncements() {
		try {
			localStorage.setItem(CLC_PANEL_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(announcements));
			window.dispatchEvent(new Event("cadetlink:announcements-updated"));
			return true;
		} catch {
			status.textContent = "Could not save the announcement in this browser.";
			return false;
		}
	}

	function renderAnnouncements() {
		list.replaceChildren();
		count.textContent = String(announcements.length);

		if (announcements.length === 0) {
			const emptyState = document.createElement("p");
			emptyState.className = "clc-empty-announcements";
			emptyState.textContent = "No CLC announcements have been published yet.";
			list.append(emptyState);
			return;
		}

		[...announcements].reverse().forEach((announcement) => {
			const item = document.createElement("article");
			item.className = "clc-announcement-item";

			const heading = document.createElement("h4");
			heading.textContent = announcement.title;
			const date = document.createElement("p");
			date.className = "clc-announcement-date";
			date.textContent = new Date(announcement.updatedAt || announcement.createdAt).toLocaleString();
			const message = document.createElement("p");
			message.className = "clc-announcement-message";
			message.textContent = announcement.message;
			const actions = document.createElement("div");
			actions.className = "clc-announcement-actions";

			const editButton = document.createElement("button");
			editButton.className = "clc-edit-btn";
			editButton.type = "button";
			editButton.dataset.action = "edit";
			editButton.dataset.id = announcement.id;
			editButton.textContent = "Edit";

			const deleteButton = document.createElement("button");
			deleteButton.className = "clc-delete-btn";
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

	function closeModal() {
		modal.hidden = true;
		document.body.style.overflow = "";
		openButton.focus();
	}

	openButton.addEventListener("click", () => {
		modal.hidden = false;
		document.body.style.overflow = "hidden";
		titleInput.focus();
	});

	closeButton.addEventListener("click", closeModal);
	modal.addEventListener("click", (event) => {
		if (event.target === modal) closeModal();
	});
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && !modal.hidden) closeModal();
	});

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
			status.textContent = "CLC announcement updated.";
		} else {
			announcements.push({
				id: window.crypto?.randomUUID
					? window.crypto.randomUUID()
					: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
				title,
				message,
				createdAt: now
			});
			status.textContent = "CLC announcement published.";
		}

		if (!saveAnnouncements()) return;
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
			status.textContent = "Editing CLC announcement.";
			titleInput.focus();
			return;
		}

		announcements = announcements.filter((item) => item.id !== announcement.id);
		if (!saveAnnouncements()) return;
		if (editingId === announcement.id) resetForm();
		status.textContent = "CLC announcement deleted.";
		renderAnnouncements();
	});

	cancelEditButton.addEventListener("click", () => {
		resetForm();
		status.textContent = "Edit canceled.";
	});

	window.addEventListener("storage", (event) => {
		if (event.key !== CLC_PANEL_ANNOUNCEMENTS_STORAGE_KEY) return;
		announcements = loadAnnouncements();
		renderAnnouncements();
	});

	renderAnnouncements();
});
