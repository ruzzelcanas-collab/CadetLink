(() => {
	if ("serviceWorker" in navigator && window.isSecureContext) {
		navigator.serviceWorker.register("/service-worker.js").catch((error) => {
			console.error("CadetLink offline support could not be initialized:", error);
		});
	}

	const installButton = document.createElement("button");
	installButton.className = "pwa-install-button";
	installButton.type = "button";
	installButton.textContent = "Install CadetLink";
	installButton.setAttribute("aria-label", "Install CadetLink app");
	document.body.append(installButton);

	let deferredInstallPrompt = null;
	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		deferredInstallPrompt = event;
	});

	window.addEventListener("appinstalled", () => {
		installButton.hidden = true;
		deferredInstallPrompt = null;
	});

	installButton.addEventListener("click", async () => {
		if (!deferredInstallPrompt) {
			const userAgent = navigator.userAgent;
			const isAppleMobile = /iPad|iPhone|iPod/.test(userAgent)
				|| (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
			const isMacSafari = /Macintosh/.test(userAgent)
				&& /Safari/.test(userAgent)
				&& !/(Chrome|Chromium|Edg|OPR)/.test(userAgent);
			const instruction = isAppleMobile
				? "To install CadetLink, tap Share in Safari, then choose Add to Home Screen."
				: isMacSafari
					? "To install CadetLink in Safari on Mac, choose File, then Add to Dock."
					: "To install CadetLink, open your browser menu and choose Install app or Add to Home Screen. If that option is unavailable, try Chrome or Edge.";
			window.alert(instruction);
			return;
		}

		deferredInstallPrompt.prompt();
		await deferredInstallPrompt.userChoice;
		deferredInstallPrompt = null;
	});
})();
