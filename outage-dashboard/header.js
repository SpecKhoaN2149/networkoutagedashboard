/*
 * header.js — dashboard header for the Spectrum outage dashboard mockup.
 *
 * The header markup already exists statically in index.html:
 *
 *   <header class="header" id="header">
 *     <div class="header__brand">
 *       <h1 class="header__title">
 *         <span class="brand-spectrum">Spectrum</span>
 *       </h1>
 *       ...
 *     </div>
 *     <div class="header__meta">
 *       <div class="header__updated">
 *         Last updated:
 *         <span class="header__updated-value" id="last-updated">—</span>
 *       </div>
 *       <div class="live-indicator is-active" id="live-indicator">...</div>
 *     </div>
 *   </header>
 *
 * This component's job is therefore to (a) guarantee the branding text
 * "Spectrum" is present/correct, (b) put the live indicator into its
 * visually active state (the "is-active" class drives the CSS pulse), and
 * (c) update the last-updated timestamp to a clock time that includes hours,
 * minutes, AND seconds.
 *
 * Requirements: 8.1 (exact "Spectrum" branding), 8.2 / 8.3 (last-updated
 * clock time with h/m/s), 8.3 (live indicator in an active state).
 *
 * Buildless + browser/DOM-only: loaded via a plain <script> tag in index.html
 * and attaches its API to `window.Header`. Like the other view components it
 * uses NO Node/Vitest dual-mode export footer and must never be imported by the
 * test runner.
 */
(function (global) {
  "use strict";

  var DEFAULT_CONTAINER_ID = "header";
  var LAST_UPDATED_ID = "last-updated";
  var LIVE_INDICATOR_ID = "live-indicator";
  var BRAND_TEXT = "Spectrum";

  var doc = global.document;

  /**
   * Formats a Date as a clock time including hours, minutes, and seconds
   * (Req 8.2, 8.3). Falls back to the current time for a missing / invalid
   * input so the header always shows a sensible value.
   * @param {Date} [date]
   * @returns {string}
   */
  function formatClockTime(date) {
    var d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
    // toLocaleTimeString defaults to h/m/s in most locales, but request them
    // explicitly so the seconds component is always present (Req 8.2).
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  /**
   * Sets the last-updated timestamp text to the clock time of `date`
   * (Req 8.2, 8.4). Called on load and on every live-drift tick by app.js.
   * Robust if the element is missing.
   * @param {Date} [date]
   */
  function updateLastUpdated(date) {
    if (!doc) {
      return;
    }
    var el = doc.getElementById(LAST_UPDATED_ID);
    if (!el) {
      return;
    }
    el.textContent = formatClockTime(date);
  }

  /**
   * Guarantees the branding reads exactly "Spectrum" (Req 8.1). Prefers to
   * preserve the styled brand span when present, only correcting its text; if
   * the expected span is missing it falls back to setting the title text
   * directly.
   * @param {HTMLElement} header
   */
  function ensureBranding(header) {
    if (!header) {
      return;
    }
    var title = header.querySelector(".header__title");
    if (!title) {
      return;
    }

    var spectrum = title.querySelector(".brand-spectrum");

    if (spectrum) {
      spectrum.textContent = "Spectrum";
    } else if ((title.textContent || "").replace(/\s+/g, " ").trim() !== BRAND_TEXT) {
      // Styled span is absent — set the text so the exact branding string is
      // still present.
      title.textContent = BRAND_TEXT;
    }
  }

  /**
   * Puts the live indicator into its visually active state by ensuring the
   * "is-active" class is present (Req 8.3). The class drives the pulsing
   * animation defined in styles.css. Robust if the element is missing.
   * @param {HTMLElement} [header]
   */
  function setLiveIndicatorActive(header) {
    if (!doc) {
      return;
    }
    var indicator =
      (header && header.querySelector("#" + LIVE_INDICATOR_ID)) ||
      doc.getElementById(LIVE_INDICATOR_ID);
    if (!indicator) {
      return;
    }
    if (indicator.classList) {
      indicator.classList.add("is-active");
    } else if (indicator.className.indexOf("is-active") === -1) {
      indicator.className = (indicator.className + " is-active").trim();
    }
  }

  /**
   * Renders the header: guarantees the "Spectrum" branding is present,
   * activates the live indicator, and sets the last-updated timestamp.
   *
   * @param {Object} [summary] - DashboardSummary (unused for now; accepted to
   *   match the design interface renderHeader(summary, lastUpdated) and to
   *   allow future summary-driven header content without changing callers).
   * @param {Date} [lastUpdated] - time of the most recent data update; defaults
   *   to now.
   * @param {string} [containerId] - header element id; defaults to "header".
   */
  function renderHeader(summary, lastUpdated, containerId) {
    if (!doc) {
      return;
    }
    var id = containerId || DEFAULT_CONTAINER_ID;
    var header = doc.getElementById(id);

    // (a) Guarantee the unified branding text (Req 8.1).
    ensureBranding(header);

    // (b) Put the live indicator into its active state (Req 8.3).
    setLiveIndicatorActive(header);

    // (c) Update the last-updated timestamp (Req 8.2).
    updateLastUpdated(lastUpdated instanceof Date ? lastUpdated : new Date());
  }

  // Attach to the browser global so <script>-loaded modules (app.js) can call
  // it. No Node/Vitest dual-mode footer: this is a DOM-only component and must
  // not be imported by the test runner.
  global.Header = {
    renderHeader: renderHeader,
    updateLastUpdated: updateLastUpdated,
  };
})(typeof window !== "undefined" ? window : this);
