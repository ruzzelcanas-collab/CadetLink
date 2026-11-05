(function () {
  function appendFormattedText(container, text) {
    const emphasisPattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let lastIndex = 0;

    for (const match of text.matchAll(emphasisPattern)) {
      if (match.index > lastIndex) {
        container.append(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const isBold = match[0].startsWith("**");
      const emphasis = document.createElement(isBold ? "strong" : "em");
      emphasis.textContent = match[0].slice(isBold ? 2 : 1, isBold ? -2 : -1);
      container.append(emphasis);
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      container.append(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function cleanMarkup(text) {
    return text.replace(/\*\*/g, "").replace(/\*/g, "").trim();
  }

  function createDay(container, title, className = "") {
    const day = document.createElement("section");
    day.className = `night-order-day${className ? ` ${className}` : ""}`;
    const heading = document.createElement("h3");
    heading.className = "night-order-date";
    appendFormattedText(heading, title);
    day.append(heading);
    container.append(day);
    return day;
  }

  function createEntry(day, timeText, description) {
    const entry = document.createElement("div");
    entry.className = "night-order-entry";

    if (timeText) {
      const time = document.createElement("span");
      time.className = "night-order-time";
      time.textContent = timeText;
      entry.append(time);
    }

    const details = document.createElement("div");
    details.className = "night-order-details";
    if (description) appendFormattedText(details, description);
    entry.append(details);
    day.append(entry);
    return entry;
  }

  function render(container, text) {
    container.replaceChildren();
    const schedule = document.createElement("div");
    schedule.className = "night-orders-schedule";
    let currentDay = null;
    let lastEntry = null;

    text.split(/\r?\n/).forEach((sourceLine) => {
      const line = sourceLine.trim();
      if (!line) return;

      const plainLine = cleanMarkup(line);
      if (/^NIGHT ORDERS$/i.test(plainLine)) return;

      if (/^\d{4}\s+[A-Za-z]{3,9}\s+\d{1,2},?\s+[A-Za-z]+$/.test(plainLine)) {
        currentDay = createDay(schedule, plainLine);
        lastEntry = null;
        return;
      }

      if (!currentDay) currentDay = createDay(schedule, "Schedule", "night-order-undated");

      const timeMatch = line.match(/^(?:\*\*)?(\d{3,4}H(?:\s*-\s*\d{3,4}H)?)/i);
      if (timeMatch) {
        let description = line.slice(timeMatch[0].length).trim();
        description = description.replace(/^\*\*/, "").replace(/^:\s*/, "").replace(/^\*\*/, "").replace(/^:\s*/, "");
        lastEntry = createEntry(currentDay, timeMatch[1].replace(/\s*-\s*/g, "-"), description);
        return;
      }

      const bulletMatch = line.match(/^[-•]\s*(.*)$/);
      if (bulletMatch) {
        let list = lastEntry?.querySelector(".night-order-bullets");
        if (!list) {
          list = document.createElement("ul");
          list.className = "night-order-bullets";
          (lastEntry?.querySelector(".night-order-details") || currentDay).append(list);
        }
        const item = document.createElement("li");
        appendFormattedText(item, bulletMatch[1]);
        list.append(item);
        return;
      }

      const note = document.createElement("p");
      note.className = "night-order-note";
      appendFormattedText(note, line);
      currentDay.append(note);
      lastEntry = null;
    });

    if (!schedule.childElementCount) {
      const empty = document.createElement("p");
      empty.className = "night-orders-empty";
      empty.textContent = "No Night Orders have been published yet.";
      container.append(empty);
      return;
    }

    container.append(schedule);
  }

  function subscribe(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      CadetLinkAnnouncements.getReference("nightOrders").on("value", (snapshot) => {
        const saved = snapshot.val();
        if (saved && typeof saved.text === "string" && saved.text.trim()) {
          render(container, saved.text);
        } else {
          render(container, "");
        }
      }, (error) => {
        console.error("Night Orders could not be loaded:", error);
        container.replaceChildren();
        const message = document.createElement("p");
        message.className = "night-orders-empty is-error";
        message.textContent = "Night Orders are unavailable. Check your connection and database access.";
        container.append(message);
      });
    } catch (error) {
      console.error("Night Orders could not be initialized:", error);
      container.replaceChildren();
      const message = document.createElement("p");
      message.className = "night-orders-empty is-error";
      message.textContent = "Night Orders are unavailable. Check your connection and database access.";
      container.append(message);
    }
  }

  window.CadetLinkNightOrders = Object.freeze({ render, subscribe });

  document.addEventListener("DOMContentLoaded", () => subscribe("nightOrdersContent"));
})();
