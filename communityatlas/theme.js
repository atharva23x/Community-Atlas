(function () {
  "use strict";

  const C = (window.CommunityAtlas = window.CommunityAtlas || {});
  const KEY = "communityatlas.theme.v1";
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let button = null;

  function readStored() {
    try {
      const value = window.localStorage.getItem(KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function current() {
    return root.dataset.theme === "dark" ? "dark" : "light";
  }

  function updateMeta(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "dark" ? "#0c141f" : "#f4f6f9");
    }
  }

  function updateButton(theme) {
    if (!button) {
      return;
    }
    const isDark = theme === "dark";
    const label = isDark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  function apply(theme, persist) {
    const next = theme === "dark" ? "dark" : "light";
    root.dataset.theme = next;
    if (persist) {
      try {
        window.localStorage.setItem(KEY, next);
      } catch (error) {
        persist = false;
      }
    }
    updateMeta(next);
    updateButton(next);
  }

  function toggle() {
    apply(current() === "dark" ? "light" : "dark", true);
  }

  function init() {
    button = document.getElementById("themeToggle");
    if (button) {
      button.addEventListener("click", toggle);
    }
    updateMeta(current());
    updateButton(current());

    if (media) {
      const handleChange = function (event) {
        if (!readStored()) {
          apply(event.matches ? "dark" : "light", false);
        }
      };
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", handleChange);
      } else if (typeof media.addListener === "function") {
        media.addListener(handleChange);
      }
    }
  }

  C.Theme = {
    init: init,
    current: current,
    toggle: toggle
  };
})();
