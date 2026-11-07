export const INFERENCES_PAGE_SCRIPT = `
  const vscode =
    typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;

  if (vscode) {
    const savedState = vscode.getState() || {};
    if (savedState.expanded) {
      Object.keys(savedState.expanded).forEach((id) => {
        const card = document.getElementById(id);
        if (card) {
          if (savedState.expanded[id]) {
            card.classList.add("is-expanded");
          } else {
            card.classList.remove("is-expanded");
          }
        }
      });
    }
  }

  function toggleSample(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.classList.toggle("is-expanded");
    if (vscode) {
      const state = vscode.getState() || {};
      state.expanded = state.expanded || {};
      state.expanded[cardId] = card.classList.contains("is-expanded");
      vscode.setState(state);
    }
  }

  function toggleAllSamples(expanded) {
    const cards = document.querySelectorAll(".inference-card");
    const state = (vscode && vscode.getState()) || {};
    state.expanded = {};
    cards.forEach((c) => {
      if (expanded) {
        c.classList.add("is-expanded");
        state.expanded[c.id] = true;
      } else {
        c.classList.remove("is-expanded");
      }
    });
    if (vscode) {
      vscode.setState(state);
    }
  }

  function switchRequestTab(cardId, tabName) {
    const card = document.getElementById(cardId);
    if (!card) return;

    const buttons = card.querySelectorAll(".request-tab-btn");
    buttons.forEach((btn) => {
      if (btn.getAttribute("data-tab") === tabName) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    });

    const views = card.querySelectorAll(".request-tab-view");
    views.forEach((v) => {
      if (v.getAttribute("data-view") === tabName) {
        v.classList.add("is-active");
      } else {
        v.classList.remove("is-active");
      }
    });
  }

  function switchOutputTab(cardId, tabName) {
    const card = document.getElementById(cardId);
    if (!card) return;

    const buttons = card.querySelectorAll(".output-tab-btn");
    buttons.forEach((btn) => {
      if (btn.getAttribute("data-tab") === tabName) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    });

    const views = card.querySelectorAll(".output-code-view");
    views.forEach((v) => {
      if (v.getAttribute("data-view") === tabName) {
        v.classList.add("is-active");
      } else {
        v.classList.remove("is-active");
      }
    });
  }

  async function copyActiveOutput(button, cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;

    const activeView = card.querySelector(
      ".output-code-view.is-active",
    );
    if (!activeView) return;

    const text =
      activeView.getAttribute("data-raw") ||
      activeView.textContent ||
      "";
    try {
      await navigator.clipboard.writeText(text);
      const originalText = button.innerHTML;
      button.classList.add("copied");
      button.textContent = "Copied!";
      setTimeout(() => {
        button.classList.remove("copied");
        button.innerHTML = originalText;
      }, 1500);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  }
`;
