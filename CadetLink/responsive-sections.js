(() => {
  const setupMobileSections = () => {
    const mobileViewport = window.matchMedia("(max-width: 720px)");
    const sections = [];
    document.querySelectorAll("main .announcements-section").forEach((section) => {
      const header = [...section.children].find((child) => child.classList.contains("announcements-header"));
      const content = [...section.children].find((child) => child.classList.contains("announcements-content")
        || child.classList.contains("admin-nmo-content")
        || child.classList.contains("admin-night-orders-content"));
      const title = header?.querySelector(".announcements-title");
      if (!header || !content || !title) return;

      const toggle = document.createElement("button");
      toggle.className = "mobile-section-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent = "Hide";

      if (!content.id) {
        content.id = `mobileSectionContent${sections.length + 1}`;
      }
      toggle.setAttribute("aria-controls", content.id);
      toggle.setAttribute("aria-label", `Collapse ${title.textContent.trim()}`);
      header.append(toggle);
      content.classList.add("mobile-section-content");

      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        setExpanded(section, content, toggle, !expanded);
      });

      sections.push({ section, content, toggle, title });
    });

    const applyViewport = () => {
      sections.forEach(({ section, content, toggle, title }) => {
        const expanded = !mobileViewport.matches;
        setExpanded(section, content, toggle, expanded, title.textContent.trim());
      });
    };

    applyViewport();
    mobileViewport.addEventListener("change", applyViewport);
  };

  function setExpanded(section, content, toggle, expanded, title = "") {
    section.classList.toggle("is-mobile-collapsed", !expanded);
    content.hidden = !expanded;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "Hide" : "Show";
    if (title) {
      toggle.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${title}`);
    } else {
      const heading = section.querySelector(".announcements-title")?.textContent.trim() || "section";
      toggle.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${heading}`);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupMobileSections, { once: true });
  } else {
    setupMobileSections();
  }
})();
