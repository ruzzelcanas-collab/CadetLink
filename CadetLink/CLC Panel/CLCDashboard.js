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
		const returnPath = userSession.entryPoint === "index"
			? "../index.html"
			: "../Loading%20screen/Loadingscreen.html";
		sessionStorage.removeItem("cadetlinkSession");
		window.location.replace(returnPath);
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

	let announcements = [];
	let announcementsRef = null;
	let editingId = null;

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
				status.textContent = "CLC announcement updated.";
			} else {
				await announcementsRef.push().set({ title, message, createdAt: now });
				status.textContent = "CLC announcement published.";
			}
			resetForm();
		} catch (error) {
			console.error("CLC announcement could not be saved:", error);
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
			status.textContent = "Editing CLC announcement.";
			titleInput.focus();
			return;
		}

		button.disabled = true;
		try {
			await announcementsRef.child(announcement.id).remove();
			if (editingId === announcement.id) resetForm();
			status.textContent = "CLC announcement deleted.";
		} catch (error) {
			console.error("CLC announcement could not be deleted:", error);
			status.textContent = "Could not delete the announcement. Check your connection and Firebase database access.";
			button.disabled = false;
		}
	});

	cancelEditButton.addEventListener("click", () => {
		resetForm();
		status.textContent = "Edit canceled.";
	});

	status.textContent = "Loading announcements...";
	CadetLinkAnnouncements.prepareLegacy("clc", CLC_PANEL_ANNOUNCEMENTS_STORAGE_KEY)
		.then((reference) => {
			announcementsRef = reference;
			reference.on("value", (snapshot) => {
				announcements = CadetLinkAnnouncements.fromSnapshot(snapshot);
				renderAnnouncements();
				if (status.textContent === "Loading announcements...") status.textContent = "";
			}, (error) => {
				console.error("CLC announcements could not be loaded:", error);
				status.textContent = "Could not load announcements. Check your connection and Firebase database access.";
				list.replaceChildren();
			});
		})
		.catch((error) => {
			console.error("CLC announcements could not be initialized:", error);
			status.textContent = "Could not load announcements. Check your connection and Firebase database access.";
		});
});
