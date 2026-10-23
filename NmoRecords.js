const NMO_RECORDS_PATH = "cadetsNmo";
const NMO_VOIDED_RETENTION_MS = 24 * 60 * 60 * 1000;
const ADMIN_NMO_HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const NMO_RECORDS_FIREBASE_CONFIG = {
	apiKey: "AIzaSyCsBK8esC6Nwd-xp2cce9UtKi5xDEhWwgY",
	authDomain: "cadetlink-d53c4.firebaseapp.com",
	databaseURL: "https://cadetlink-d53c4-default-rtdb.asia-southeast1.firebasedatabase.app",
	projectId: "cadetlink-d53c4",
	storageBucket: "cadetlink-d53c4.firebasestorage.app",
	messagingSenderId: "936082286663",
	appId: "1:936082286663:web:9406ef4ee08c9ca7efe962",
	measurementId: "G-L6SQ6ZW1XY"
};

document.addEventListener("DOMContentLoaded", () => {
	const pictureInput = document.getElementById("issuedNmoPicture");
	const cadetNameInput = document.getElementById("issuedNmoCadetName");
	const uploadForm = document.getElementById("issuedNmoForm");
	const uploadStatus = document.getElementById("issuedNmoStatus");
	const cadetLookupStatus = document.getElementById("nmoCadetLookupStatus");
	const submitButton = document.getElementById("submitNmoSlip");
	const confirmationModal = document.getElementById("nmoConfirmationModal");
	const confirmationCadetName = document.getElementById("nmoConfirmationCadetName");
	const confirmButton = document.getElementById("confirmNmoSubmission");
	const cancelConfirmationButton = document.getElementById("cancelNmoSubmission");
	const closeConfirmationButton = document.getElementById("closeNmoConfirmation");
	const confirmationStatus = document.getElementById("nmoConfirmationStatus");
	const historyButton = document.getElementById("openNmoHistory");
	const historyModal = document.getElementById("nmoHistoryModal");
	const closeHistoryButton = document.getElementById("closeNmoHistory");
	const historyList = document.getElementById("nmoHistoryList");
	const adminFeed = document.getElementById("adminNmoFeed");
	const adminHistoryButton = document.getElementById("openAdminNmoHistory");
	const adminHistoryModal = document.getElementById("adminNmoHistoryModal");
	const closeAdminHistoryButton = document.getElementById("closeAdminNmoHistory");
	const adminHistoryList = document.getElementById("adminNmoHistoryList");
	const pendingRecords = document.getElementById("pendingNmoRecords");
	const approvedRecords = document.getElementById("approvedNmoRecords");
	const isClcPage = Boolean(uploadForm);
	const isAdminPage = Boolean(adminFeed);
	const isCadetPage = Boolean(pendingRecords || approvedRecords);

	if (!isClcPage && !isAdminPage && !isCadetPage) return;

	let userSession;
	try {
		userSession = JSON.parse(sessionStorage.getItem("cadetlinkSession") || "null");
	} catch {
		userSession = null;
	}

	if (!userSession || !userSession.uid) return;
	if (isClcPage && userSession.category !== "CLC") return;
	if (isAdminPage && userSession.category !== "Admin") return;
	if (isCadetPage && userSession.category !== "Normal Cadet") return;

	if (!window.firebase || typeof firebase.database !== "function") {
		showUploadStatus("NMO records are unavailable because Firebase did not load.", true);
		showCadetLookupStatus("NMO records are unavailable because Firebase did not load.", true);
		disableNmoActions();
		showFeedError("NMO records are unavailable because Firebase did not load.");
		showAdminHistoryMessage("NMO history is unavailable because Firebase did not load.", true);
		renderCadetFeedError("NMO records are unavailable because Firebase did not load.");
		console.error("NMO records could not start because Firebase did not load.");
		return;
	}

	let nmoRecordsRef;
	let cadetsRef;
	try {
		if (!firebase.apps.length) firebase.initializeApp(NMO_RECORDS_FIREBASE_CONFIG);
		const database = firebase.database();
		nmoRecordsRef = database.ref(NMO_RECORDS_PATH);
		if (isClcPage) cadetsRef = database.ref("cadets");
	} catch (error) {
		console.error("NMO records could not connect to Firebase:", error);
		showUploadStatus("NMO records are unavailable because the database connection could not start.", true);
		showCadetLookupStatus("NMO records are unavailable because the database connection could not start.", true);
		disableNmoActions();
		showFeedError("NMO records are unavailable because the database connection could not start.");
		showAdminHistoryMessage("NMO history is unavailable because the database connection could not start.", true);
		renderCadetFeedError("NMO records are unavailable because the database connection could not start.");
		return;
	}

	let verifiedCadet = null;
	let cadetLookupVersion = 0;

	if (isClcPage && uploadForm && uploadStatus && submitButton && confirmationModal && confirmButton) {
		uploadForm.addEventListener("submit", async (event) => {
			event.preventDefault();
			if (!validateSelectedPicture()) return;
			if (!verifiedCadet || verifiedCadet.typedName !== cadetNameInput.value.trim()) {
				verifiedCadet = await verifyCadetName();
			}
			if (!verifiedCadet) return;
			confirmationCadetName.textContent = verifiedCadet.name;
			showConfirmationStatus("", false);
			openDialog(confirmationModal, submitButton);
		});

		cadetNameInput.addEventListener("input", () => {
			cadetLookupVersion += 1;
			verifiedCadet = null;
			submitButton.disabled = true;
			showCadetLookupStatus("Enter the cadet's name exactly as registered.", false);
		});
		cadetNameInput.addEventListener("blur", verifyCadetName);
		pictureInput.addEventListener("change", () => {
			showUploadStatus("", false);
			submitButton.disabled = !pictureInput.files[0] || !verifiedCadet;
		});
		confirmButton.addEventListener("click", uploadNmoPicture);
		cancelConfirmationButton?.addEventListener("click", closeConfirmation);
		closeConfirmationButton?.addEventListener("click", closeConfirmation);
		confirmationModal.addEventListener("click", (event) => {
			if (event.target === confirmationModal && !confirmButton.disabled) closeConfirmation();
		});
	}

	if (isClcPage && historyButton && historyModal && historyList) {
		historyButton.addEventListener("click", openNmoHistory);
		closeHistoryButton?.addEventListener("click", closeHistory);
		historyModal.addEventListener("click", (event) => {
			if (event.target === historyModal) closeHistory();
		});
		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && !historyModal.hidden) closeHistory();
			else if (event.key === "Escape" && confirmationModal && !confirmationModal.hidden && !confirmButton?.disabled) closeConfirmation();
		});
	}

	if (isAdminPage && adminHistoryButton && adminHistoryModal && adminHistoryList) {
		adminHistoryButton.addEventListener("click", openAdminNmoHistory);
		closeAdminHistoryButton?.addEventListener("click", closeAdminNmoHistory);
		adminHistoryModal.addEventListener("click", (event) => {
			if (event.target === adminHistoryModal) closeAdminNmoHistory();
		});
		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && !adminHistoryModal.hidden) closeAdminNmoHistory();
		});
	}

	if (isAdminPage) {
		nmoRecordsRef.on("value", (snapshot) => renderAdminRecords(snapshot.val()), (error) => {
			console.error("NMO record updates could not be received:", error);
			showFeedError("NMO records are unavailable. Check your connection and database access.");
		});
	}

	if (isCadetPage) {
		let currentCadetRecords = [];
		nmoRecordsRef.orderByChild("cadetUid").equalTo(userSession.uid).on("value", (snapshot) => {
			currentCadetRecords = getNmoRecords(snapshot.val());
			renderCadetRecords(currentCadetRecords);
		}, (error) => {
			console.error("Your NMO records could not be received:", error);
			renderCadetFeedError("Your NMO records are unavailable. Check your connection and database access.");
		});
		window.setInterval(() => {
			const now = Date.now();
			const visibleRecords = currentCadetRecords.filter((record) => {
				const expiresAt = getVoidedExpiry(record);
				return expiresAt === null || expiresAt > now;
			});
			if (visibleRecords.length !== currentCadetRecords.length) {
				currentCadetRecords = visibleRecords;
				renderCadetRecords(currentCadetRecords);
				return;
			}
			updateVoidedCountdowns(now);
		}, 1000);
	}

	async function verifyCadetName() {
		const typedName = cadetNameInput.value.trim();
		const requestVersion = ++cadetLookupVersion;
		verifiedCadet = null;
		submitButton.disabled = true;
		if (!typedName) {
			showCadetLookupStatus("Enter the cadet's registered name.", true);
			return null;
		}

		showCadetLookupStatus("Checking registered cadet...", false);
		try {
			const snapshot = await cadetsRef.orderByChild("name").equalTo(typedName).once("value");
			if (requestVersion !== cadetLookupVersion || typedName !== cadetNameInput.value.trim()) return null;
			const matches = snapshot.val() && typeof snapshot.val() === "object"
				? Object.entries(snapshot.val())
					.filter(([, cadet]) => cadet && cadet.category === "Normal Cadet" && typeof cadet.name === "string")
					.map(([uid, cadet]) => ({ uid, name: cadet.name }))
				: [];

			if (matches.length === 0) {
				showCadetLookupStatus("No registered cadet found with that exact name.", true);
				return null;
			}
			if (matches.length > 1) {
				showCadetLookupStatus("More than one cadet has that name. Ask Admin to resolve the duplicate.", true);
				return null;
			}

			verifiedCadet = { ...matches[0], typedName };
			showCadetLookupStatus(`Verified: ${verifiedCadet.name}`, false);
			submitButton.disabled = !pictureInput.files[0];
			return verifiedCadet;
		} catch (error) {
			if (requestVersion !== cadetLookupVersion) return null;
			console.error("NMO cadet name verification failed:", error);
			showCadetLookupStatus("Could not verify the cadet. Check your connection and try again.", true);
			return null;
		}
	}

	function validateSelectedPicture() {
		const pictureFile = pictureInput.files[0];
		if (!pictureFile) {
			showUploadStatus("Choose an image file before sending.", true);
			return false;
		}
		if (!pictureFile.type.startsWith("image/")) {
			showUploadStatus("Choose an image file to submit.", true);
			return false;
		}
		if (pictureFile.size > 10 * 1024 * 1024) {
			showUploadStatus("Choose an image smaller than 10 MB.", true);
			return false;
		}
		return true;
	}

	async function uploadNmoPicture() {
		if (!verifiedCadet || !validateSelectedPicture()) return;
		const pictureFile = pictureInput.files[0];
		pictureInput.disabled = true;
		cadetNameInput.disabled = true;
		submitButton.disabled = true;
		confirmButton.disabled = true;
		cancelConfirmationButton.disabled = true;
		closeConfirmationButton.disabled = true;
		showConfirmationStatus("Uploading NMO slip...", false);
		let submissionSucceeded = false;
		try {
			const image = await readCompressedReportImage(pictureFile);
			if (image.length > 1_100_000) {
				throw new Error("The compressed picture is too large to share. Choose a smaller image.");
			}

			await nmoRecordsRef.push().set({
				image,
				cadetUid: verifiedCadet.uid,
				cadetName: verifiedCadet.name,
				senderUid: userSession.uid,
				senderName: userSession.name || "CLC",
				status: "pending",
				sentAt: new Date().toISOString()
			});
			uploadForm.reset();
			verifiedCadet = null;
			showCadetLookupStatus("Enter the cadet's name exactly as registered.", false);
			showUploadStatus("NMO slip sent to Admin and the cadet's dashboard.", false);
			submissionSucceeded = true;
		} catch (error) {
			console.error("NMO slip could not be sent:", error);
			showConfirmationStatus(error.message || "Could not send the NMO slip. Check your connection and try again.", true);
		} finally {
			pictureInput.disabled = false;
			cadetNameInput.disabled = false;
			submitButton.disabled = true;
			confirmButton.disabled = false;
			cancelConfirmationButton.disabled = false;
			closeConfirmationButton.disabled = false;
			if (submissionSucceeded) closeDialog(confirmationModal, historyButton);
		}
	}

	async function openNmoHistory() {
		openDialog(historyModal, historyButton);
		renderHistoryMessage("Loading your NMO history...");
		try {
			const snapshot = await nmoRecordsRef.orderByChild("senderUid").equalTo(userSession.uid).once("value");
			const records = getNmoRecords(snapshot.val());
			records.sort(compareNewestFirst);
			renderHistory(records);
		} catch (error) {
			console.error("NMO submission history could not be loaded:", error);
			renderHistoryMessage("Your NMO history is unavailable. Check your connection and database access.", true);
		}
	}

	function renderHistory(records) {
		historyList.replaceChildren();
		if (records.length === 0) {
			renderHistoryMessage("You have not submitted any NMO slips yet.");
			return;
		}

		records.forEach((record) => {
			const item = document.createElement("article");
			item.className = "nmo-history-item";
			appendSlipImage(item, record.image, "Your submitted NMO slip");
			const info = document.createElement("div");
			info.className = "nmo-history-info";
			appendText(info, "nmo-history-cadet", `NMO of Cadet: ${record.cadetName || "Name unavailable"}`);
			appendText(info, `nmo-history-status is-${getRecordStatus(record)}`, getStatusLabel(record));
			appendText(info, "nmo-history-date", formatDate(record.sentAt, "Submission time unavailable"));
			if (getRecordStatus(record) === "approved") {
				appendText(info, "nmo-history-date", `Approved ${formatDate(record.approvedAt, "Time unavailable")}`);
			} else if (getRecordStatus(record) === "voided") {
				appendText(info, "nmo-history-date", `Voided ${formatDate(record.voidedAt, "Time unavailable")}`);
			}
			item.append(info);
			historyList.append(item);
		});
	}

	async function openAdminNmoHistory() {
		adminHistoryModal.hidden = false;
		document.body.style.overflow = "hidden";
		closeAdminHistoryButton?.focus();
		showAdminHistoryMessage("Loading reviewed NMO slips...");
		try {
			const snapshot = await nmoRecordsRef.once("value");
			const historyCutoff = Date.now() - ADMIN_NMO_HISTORY_WINDOW_MS;
			const records = getNmoRecords(snapshot.val())
				.filter((record) => ["approved", "voided"].includes(getRecordStatus(record)))
				.filter((record) => {
					const historyDate = Date.parse(record.approvedAt || record.voidedAt || record.sentAt);
					return !Number.isNaN(historyDate) && historyDate >= historyCutoff;
				})
				.sort((first, second) => {
					const firstDecision = Date.parse(first.approvedAt || first.voidedAt || first.sentAt) || 0;
					const secondDecision = Date.parse(second.approvedAt || second.voidedAt || second.sentAt) || 0;
					return secondDecision - firstDecision || second.id.localeCompare(first.id);
				});
			renderAdminNmoHistory(records);
		} catch (error) {
			console.error("Admin NMO history could not be loaded:", error);
			showAdminHistoryMessage("NMO history is unavailable. Check your connection and database access.", true);
		}
	}

	function renderAdminNmoHistory(records) {
		adminHistoryList.replaceChildren();
		if (records.length === 0) {
			showAdminHistoryMessage("No NMO slips have been approved or voided yet.");
			return;
		}

		records.forEach((record) => {
			const status = getRecordStatus(record);
			const card = document.createElement("article");
			card.className = "admin-nmo-history-card";
			appendSlipImage(card, record.image, "Reviewed NMO slip");
			const info = document.createElement("div");
			info.className = "admin-nmo-history-info";
			appendText(info, "admin-nmo-sender", `NMO of Cadet: ${record.cadetName || "Name unavailable"}`);
			appendText(info, `admin-nmo-history-status is-${status}`, getStatusLabel(record));
			appendText(info, "admin-nmo-date", `Submitted by ${record.senderName || "CLC"} · ${formatDate(record.sentAt, "Time unavailable")}`);
			const decisionDate = status === "approved" ? record.approvedAt : record.voidedAt;
			appendText(info, "admin-nmo-date", `${getStatusLabel(record)} ${formatDate(decisionDate, "time unavailable")}`);
			card.append(info);
			adminHistoryList.append(card);
		});
	}

	function showAdminHistoryMessage(message, isError = false) {
		if (!adminHistoryList) return;
		adminHistoryList.replaceChildren();
		appendText(adminHistoryList, isError ? "admin-nmo-history-error" : "admin-nmo-history-empty", message);
	}

	function closeAdminNmoHistory() {
		adminHistoryModal.hidden = true;
		document.body.style.overflow = "";
		adminHistoryButton.focus();
	}

	function renderAdminRecords(savedRecords) {
		adminFeed.replaceChildren();
		const records = getNmoRecords(savedRecords)
			.filter((record) => getRecordStatus(record) === "pending")
			.sort(compareNewestFirst);
		if (records.length === 0) {
			showFeedError("No pending NMO slips.");
			return;
		}

		records.forEach((record) => {
			const card = document.createElement("article");
			card.className = "admin-nmo-card";
			appendSlipImage(card, record.image, "Submitted NMO slip");
			const info = document.createElement("div");
			info.className = "admin-nmo-card-info";
			appendText(info, "admin-nmo-sender", `NMO of Cadet: ${record.cadetName || "Name unavailable"}`);
			appendText(info, "admin-nmo-date", `Submitted by ${record.senderName || "CLC"} · ${formatDate(record.sentAt, "Time unavailable")}`);

			if (!record.cadetUid || !record.cadetName) {
				appendText(info, "admin-nmo-status is-unassigned", "No registered cadet is linked to this slip; it cannot be reviewed.");
			} else {
				const actions = document.createElement("div");
				actions.className = "admin-nmo-actions";
				const approveButton = document.createElement("button");
				approveButton.className = "admin-nmo-approve";
				approveButton.type = "button";
				approveButton.textContent = "Approved";
				const voidButton = document.createElement("button");
				voidButton.className = "admin-nmo-void";
				voidButton.type = "button";
				voidButton.textContent = "Voided";
				const actionError = document.createElement("p");
				actionError.className = "admin-nmo-action-error";
				approveButton.addEventListener("click", () => updateNmoStatus(record.id, "approved", actions, actionError));
				voidButton.addEventListener("click", () => updateNmoStatus(record.id, "voided", actions, actionError));
				actions.append(approveButton, voidButton);
				info.append(actions, actionError);
			}
			card.append(info);
			adminFeed.append(card);
		});
	}

	async function updateNmoStatus(recordId, status, actions, actionError) {
		actions.querySelectorAll("button").forEach((button) => {
			button.disabled = true;
		});
		actionError.textContent = "";
		const decidedAt = new Date().toISOString();
		try {
			const result = await nmoRecordsRef.child(recordId).transaction((record) => {
				if (!record || (record.status && record.status !== "pending")) return;
				return status === "approved"
					? { ...record, status, approvedAt: decidedAt, decidedBy: userSession.uid }
					: { ...record, status, voidedAt: decidedAt, decidedBy: userSession.uid };
			});
			if (!result.committed) {
				actionError.textContent = "This NMO slip has already been reviewed. The list will refresh.";
			}
		} catch (error) {
			console.error(`NMO slip could not be marked ${status}:`, error);
			actionError.textContent = "Could not update this NMO slip. Check access and connection, then try again.";
			actions.querySelectorAll("button").forEach((button) => {
				button.disabled = false;
			});
		}
	}

	function renderCadetRecords(savedRecords) {
		const records = (Array.isArray(savedRecords) ? savedRecords : getNmoRecords(savedRecords)).sort(compareNewestFirst);
		const now = Date.now();
		const pending = records.filter((record) => {
			if (getRecordStatus(record) === "approved") return false;
			const expiresAt = getVoidedExpiry(record);
			return expiresAt === null || expiresAt > now;
		});
		const approved = records.filter((record) => getRecordStatus(record) === "approved");
		renderCadetRecordList(pendingRecords, pending, "No pending NMO records.");
		renderCadetRecordList(approvedRecords, approved, "No approved NMO records.");
	}

	function renderCadetRecordList(container, records, emptyMessage) {
		container.replaceChildren();
		if (records.length === 0) {
			appendText(container, "nmo-record-empty", emptyMessage);
			return;
		}
		records.forEach((record) => {
			const status = getRecordStatus(record);
			const card = document.createElement("article");
			card.className = "nmo-user-record";
			const imageWrap = document.createElement("div");
			imageWrap.className = "nmo-user-picture-wrap";
			appendSlipImage(imageWrap, record.image, "NMO slip");
			if (status === "voided") {
				const overlay = document.createElement("div");
				overlay.className = "nmo-voided-overlay";
				appendText(overlay, "nmo-voided-label", "Voided");
				const expiresAt = getVoidedExpiry(record);
				if (expiresAt !== null) {
					const countdown = appendText(overlay, "nmo-voided-countdown", "");
					countdown.dataset.expiresAt = String(expiresAt);
					countdown.textContent = formatRemainingTime(expiresAt - Date.now());
				}
				imageWrap.append(overlay);
			}
			const info = document.createElement("div");
			info.className = "nmo-user-record-info";
			appendText(info, "nmo-user-cadet-name", `NMO of Cadet: ${record.cadetName || "Name unavailable"}`);
			appendText(info, "nmo-user-record-date", `Submitted ${formatDate(record.sentAt, "Time unavailable")}`);
			if (status === "approved") {
				appendText(info, "nmo-user-approved-date", `Approved ${formatDate(record.approvedAt, "Time unavailable")}`);
			}

			card.append(imageWrap, info);
			container.append(card);
		});
	}

	function updateVoidedCountdowns(now) {
		pendingRecords?.querySelectorAll("[data-expires-at]").forEach((countdown) => {
			countdown.textContent = formatRemainingTime(Number(countdown.dataset.expiresAt) - now);
		});
	}

	function appendSlipImage(container, image, altText) {
		if (typeof image === "string" && /^data:image\/jpeg;base64,/i.test(image)) {
			const picture = document.createElement("img");
			picture.className = container.classList.contains("nmo-user-picture-wrap")
				? "nmo-user-picture"
				: container.classList.contains("nmo-history-item")
					? "nmo-history-picture"
					: "admin-nmo-picture";
			picture.src = image;
			picture.alt = altText;
			picture.loading = "lazy";
			container.append(picture);
			return;
		}
		const className = container.classList.contains("nmo-user-picture-wrap")
			? "nmo-user-image-empty"
			: container.classList.contains("nmo-history-item")
				? "nmo-history-empty"
				: "admin-nmo-empty";
		appendText(container, className, "NMO slip unavailable.");
	}

	function renderHistoryMessage(message, isError = false) {
		historyList.replaceChildren();
		appendText(historyList, isError ? "nmo-history-error" : "nmo-history-empty", message);
	}

	function openDialog(dialog, returnFocusTo) {
		dialog.hidden = false;
		document.body.style.overflow = "hidden";
		dialog.querySelector(".clc-editor-close")?.focus();
	}

	function closeDialog(dialog, returnFocusTo) {
		dialog.hidden = true;
		document.body.style.overflow = "";
		returnFocusTo?.focus();
	}

	function closeConfirmation() {
		submitButton.disabled = !pictureInput.files[0] || !verifiedCadet;
		closeDialog(confirmationModal, submitButton);
	}

	function closeHistory() {
		closeDialog(historyModal, historyButton);
	}

	function showUploadStatus(message, isError) {
		if (!uploadStatus) return;
		uploadStatus.textContent = message;
		uploadStatus.classList.toggle("is-error", isError);
	}

	function showCadetLookupStatus(message, isError) {
		if (!cadetLookupStatus) return;
		cadetLookupStatus.textContent = message;
		cadetLookupStatus.classList.toggle("is-error", isError);
	}

	function showConfirmationStatus(message, isError) {
		if (!confirmationStatus) return;
		confirmationStatus.textContent = message;
		confirmationStatus.classList.toggle("is-error", isError);
	}

	function showFeedError(message) {
		if (!adminFeed) return;
		adminFeed.replaceChildren();
		appendText(adminFeed, "admin-nmo-empty", message);
	}

	function renderCadetFeedError(message) {
		if (pendingRecords) {
			pendingRecords.replaceChildren();
			appendText(pendingRecords, "nmo-record-empty", message);
		}
		if (approvedRecords) {
			approvedRecords.replaceChildren();
			appendText(approvedRecords, "nmo-record-empty", message);
		}
	}

	function disableNmoActions() {
		if (submitButton) submitButton.disabled = true;
		if (historyButton) historyButton.disabled = true;
	}
});

function getNmoRecords(savedRecords) {
	return savedRecords && typeof savedRecords === "object"
		? Object.entries(savedRecords)
			.filter(([, record]) => record && typeof record === "object")
			.map(([id, record]) => ({ ...record, id }))
		: [];
}

function compareNewestFirst(first, second) {
	const firstTime = Date.parse(first.sentAt) || 0;
	const secondTime = Date.parse(second.sentAt) || 0;
	return secondTime - firstTime || second.id.localeCompare(first.id);
}

function getRecordStatus(record) {
	return ["approved", "voided"].includes(record.status) ? record.status : "pending";
}

function getVoidedExpiry(record) {
	if (getRecordStatus(record) !== "voided") return null;
	const voidedAt = Date.parse(record.voidedAt);
	return Number.isNaN(voidedAt) ? null : voidedAt + NMO_VOIDED_RETENTION_MS;
}

function formatRemainingTime(milliseconds) {
	const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `Removed in ${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function getStatusLabel(record) {
	const status = getRecordStatus(record);
	return status === "approved" ? "Approved" : status === "voided" ? "Voided" : "Pending";
}

function formatDate(value, fallback) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}

function appendText(container, className, text) {
	const element = document.createElement("p");
	element.className = className;
	element.textContent = text;
	container.append(element);
	return element;
}
