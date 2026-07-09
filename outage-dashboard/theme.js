/*
 * theme.js — light/dark theme toggle for the Spectrum + Cox outage dashboard.
 *
 * Loaded in <head> so the stored preference is applied to <html> before the
 * body paints (avoids a flash of the wrong theme). The toggle button lives in
 * the header; its click handler is wired once the DOM is ready. The preference
 * is persisted in localStorage.
 *
 * Dark is the default; data-theme="light" on the root element activates the
 * light palette defined in styles.css.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "dashboard-theme";
  var root = document.documentElement;

  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function writeStored(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* ignore (private mode / disabled storage) */
    }
  }

  function currentTheme() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  /**
   * Applies a theme by toggling the data-theme attribute on <html> and updating
   * the toggle button glyph (sun in light mode, moon in dark mode).
   */
  function apply(theme) {
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.textContent = theme === "light" ? "\u2600\uFE0F" : "\uD83C\uDF19";
    }
  }

  // Apply the initial theme immediately (root exists even before <body>).
  apply(readStored() || "dark");

  function wireToggle() {
    apply(currentTheme()); // ensure the button glyph matches once it exists
    var btn = document.getElementById("theme-toggle");
    if (!btn) {
      return;
    }
    btn.addEventListener("click", function () {
      var next = currentTheme() === "light" ? "dark" : "light";
      apply(next);
      writeStored(next);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireToggle);
  } else {
    wireToggle();
  }
})();
