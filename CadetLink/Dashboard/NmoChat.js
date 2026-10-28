(() => {
  const NMO_CHAT_HISTORY_LIMIT = 12;
  const NMO_CHAT_MESSAGE_LIMIT = 1200;

  let recordContext = [];

  function setRecordContext(records) {
    recordContext = Array.isArray(records) ? records.slice(0, 30) : [];
  }

  window.CadetLinkNmoChat = { setRecordContext };

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("nmoChat");
    const openButton = document.getElementById("openNmoChat");
    const closeButton = document.getElementById("closeNmoChat");
    const dialog = root?.querySelector('[role="dialog"]');
    const messagesElement = document.getElementById("nmoChatMessages");
    const form = document.getElementById("nmoChatForm");
    const input = document.getElementById("nmoChatInput");
    const sendButton = document.getElementById("nmoChatSend");
    const clearButton = document.getElementById("nmoChatClear");
    const status = document.getElementById("nmoChatStatus");
    if (!root || !openButton || !closeButton || !dialog || !messagesElement || !form || !input || !sendButton || !clearButton || !status) return;

    let session;
    try {
      session = JSON.parse(sessionStorage.getItem("cadetlinkSession") || "null");
    } catch (error) {
      console.error("NMO chat could not read the current session:", error);
      status.textContent = "NMO chat is unavailable because the current session could not be read.";
      form.hidden = true;
      clearButton.hidden = true;
      return;
    }

    if (!session?.uid || !["CLC", "Normal Cadet"].includes(session.category)) {
      status.textContent = "NMO chat is available to CLC and cadet accounts.";
      form.hidden = true;
      clearButton.hidden = true;
      return;
    }

    const history = [];
    const greeting = "Hi! I can help explain the NMO section and summarize the records shown here. I don't replace official CLC or Admin guidance.";
    function openChat() {
      root.hidden = false;
      document.body.style.overflow = "hidden";
      input.focus();
    }

    function closeChat() {
      root.hidden = true;
      document.body.style.overflow = "";
      openButton.focus();
    }

    openButton.addEventListener("click", openChat);
    closeButton.addEventListener("click", closeChat);
    root.addEventListener("click", (event) => {
      if (event.target === root) closeChat();
    });
    document.addEventListener("keydown", (event) => {
      if (root.hidden) return;
      if (event.key === "Escape") {
        closeChat();
        return;
      }
      if (event.key !== "Tab") return;
      const focusableElements = [...dialog.querySelectorAll('button:not(:disabled), textarea:not(:disabled)')];
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    });

    function appendMessage(role, text) {
      const message = document.createElement("p");
      message.className = `nmo-chat-message is-${role}`;
      message.textContent = text;
      messagesElement.append(message);
      messagesElement.scrollTop = messagesElement.scrollHeight;
    }

    function clearConversation() {
      history.length = 0;
      messagesElement.replaceChildren();
      appendMessage("assistant", greeting);
      status.textContent = "";
      input.focus();
    }

    clearButton.addEventListener("click", clearConversation);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question || question.length > NMO_CHAT_MESSAGE_LIMIT || sendButton.disabled) return;

      history.push({ role: "user", text: question });
      appendMessage("user", question);
      input.value = "";
      status.textContent = "Thinking...";
      sendButton.disabled = true;
      input.disabled = true;

      try {
        const messages = history.slice(-NMO_CHAT_HISTORY_LIMIT);
        if (messages[0]?.role === "model") messages.shift();
        const response = await fetch("/.netlify/functions/nmo-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            records: recordContext
          })
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.error || "The NMO assistant could not respond. Please try again later.");
        }
        if (typeof result?.reply !== "string" || !result.reply.trim()) {
          throw new Error("The NMO assistant returned an empty response. Please try again.");
        }

        history.push({ role: "model", text: result.reply });
        while (history.length > NMO_CHAT_HISTORY_LIMIT) history.shift();
        appendMessage("assistant", result.reply);
        status.textContent = "";
      } catch (error) {
        console.error("NMO chat request failed:", error);
        status.textContent = error.message || "The NMO assistant could not respond. Please try again later.";
        history.pop();
      } finally {
        sendButton.disabled = false;
        input.disabled = false;
        input.focus();
      }
    });
  });
})();
