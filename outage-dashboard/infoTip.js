/*
 * infoTip.js — Reusable info ("i") tooltip helper for the Spectrum outage
 * dashboard mockup.
 *
 * Provides a tiny pure function `infoTipHtml(text)` that returns the HTML
 * string for a small circled "i" badge. The description is carried in a
 * `data-info-tip` attribute (and mirrored to `aria-label`) rather than an
 * inline bubble, so it can never be clipped by an ancestor's overflow.
 *
 * A single always-loaded initializer (`initInfoTips`) wires ONE shared bubble
 * element appended to `document.body` with `position: fixed` and, via event
 * delegation on `.info-tip`, shows/positions it next to the hovered/focused
 * icon (using getBoundingClientRect) and hides it on mouseleave/blur/scroll.
 * Because the bubble lives on <body> at a high z-index and is fixed-position,
 * it floats above the Leaflet map and escapes detail-panel / table overflow
 * on both index.html and psap.html, in light and dark themes.
 *
 * Accessibility: the badge stays `tabindex="0"` with an `aria-label` equal to
 * the description and `aria-describedby` pointing at the shared bubble, so the
 * tip is available to pointer AND keyboard users (it shows on focus too).
 *
 * The description text is escaped for safe insertion into the attribute, so
 * callers can pass trusted or untrusted strings without risking broken markup
 * or injection.
 *
 * Buildless dual-mode: loaded in the browser via a plain <script> tag (attaches
 * to `window.InfoTip`) BEFORE the view modules that use it, and also exported
 * for Node/Vitest via the dual-mode footer so the pure helper can be unit
 * tested without any build step.
 */
(function (global) {
  "use strict";

  /**
   * Escapes a value for safe insertion as HTML text/attribute content.
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Builds the HTML string for an inline info tooltip. The returned markup is a
   * small circular badge containing an "i" glyph plus a hover/focus bubble that
   * shows `text`.
   *
   * Accessibility:
   *   - The badge is `tabindex="0"` so it is reachable by keyboard, and its
   *     `aria-label` equals the description so screen readers announce it.
   *   - `:hover` and `:focus`/`:focus-within` in styles.css reveal the bubble,
   *     so the description is available to both pointer and keyboard users.
   *
   * @param {string} text - the short plain-language description.
   * @returns {string} the info-tip HTML string.
   */
  function infoTipHtml(text) {
    var safe = escapeHtml(text);
    // The description lives in data-info-tip (+ aria-label). No inline bubble:
    // the shared, body-level fixed bubble (see initInfoTips) renders it so it
    // is never clipped by an ancestor's overflow.
    return (
      '<span class="info-tip" tabindex="0" role="note" aria-label="' +
      safe +
      '" aria-describedby="info-tip-bubble" data-info-tip="' +
      safe +
      '">' +
      '<span class="info-tip__icon" aria-hidden="true">i</span>' +
      "</span>"
    );
  }

  var SHARED_BUBBLE_ID = "info-tip-bubble";
  var GAP = 8; // px between the icon and the bubble

  /**
   * Lazily creates (once) and returns the single shared, body-level bubble
   * element used to render every info tip. Returns null outside a browser.
   */
  function ensureBubble() {
    if (typeof document === "undefined" || !document.body) {
      return null;
    }
    var bubble = document.getElementById(SHARED_BUBBLE_ID);
    if (!bubble) {
      bubble = document.createElement("div");
      bubble.id = SHARED_BUBBLE_ID;
      bubble.className = "info-tip-bubble";
      bubble.setAttribute("role", "tooltip");
      bubble.hidden = true;
      document.body.appendChild(bubble);
    }
    return bubble;
  }

  /**
   * Positions `bubble` next to `icon` using viewport coordinates (position:
   * fixed). Prefers below the icon; flips above when there is not enough room.
   * Horizontally centers on the icon and clamps to the viewport edges.
   */
  function positionBubble(bubble, icon) {
    var rect = icon.getBoundingClientRect();
    // Make it measurable first.
    bubble.hidden = false;
    bubble.style.left = "0px";
    bubble.style.top = "0px";
    var bw = bubble.offsetWidth;
    var bh = bubble.offsetHeight;
    var vw =
      window.innerWidth || document.documentElement.clientWidth || 0;
    var vh =
      window.innerHeight || document.documentElement.clientHeight || 0;

    var left = rect.left + rect.width / 2 - bw / 2;
    if (left < 6) left = 6;
    if (left + bw > vw - 6) left = vw - 6 - bw;
    if (left < 6) left = 6;

    var below = rect.bottom + GAP;
    var top;
    if (below + bh <= vh - 6) {
      top = below; // room below
      bubble.classList.remove("info-tip-bubble--above");
    } else {
      top = rect.top - GAP - bh; // flip above
      if (top < 6) top = 6;
      bubble.classList.add("info-tip-bubble--above");
    }

    bubble.style.left = Math.round(left) + "px";
    bubble.style.top = Math.round(top) + "px";
  }

  function showFor(icon) {
    var bubble = ensureBubble();
    if (!bubble || !icon) return;
    var text = icon.getAttribute("data-info-tip") || "";
    bubble.textContent = text;
    positionBubble(bubble, icon);
    bubble.classList.add("is-visible");
  }

  function hide() {
    var bubble =
      typeof document !== "undefined"
        ? document.getElementById(SHARED_BUBBLE_ID)
        : null;
    if (!bubble) return;
    bubble.classList.remove("is-visible");
    bubble.hidden = true;
  }

  /**
   * Resolves the nearest `.info-tip` ancestor of an event target, or null.
   */
  function closestInfoTip(target) {
    if (!target || !target.closest) {
      return typeof target === "object" && target && target.classList &&
        target.classList.contains("info-tip")
        ? target
        : null;
    }
    return target.closest(".info-tip");
  }

  var wired = false;

  /**
   * Wires the shared bubble via event delegation on the document, so it works
   * for info tips added dynamically (tables re-rendered on each drift tick).
   * Safe to call more than once (no-op after the first) and outside a browser.
   */
  function initInfoTips() {
    if (wired || typeof document === "undefined") {
      return;
    }
    wired = true;
    ensureBubble();

    // Pointer: show on hover over an icon, hide when leaving it.
    document.addEventListener("mouseover", function (evt) {
      var icon = closestInfoTip(evt.target);
      if (icon) showFor(icon);
    });
    document.addEventListener("mouseout", function (evt) {
      var from = closestInfoTip(evt.target);
      if (!from) return;
      // Only hide when the pointer actually left the icon (not moving to a
      // child element inside it).
      var to = evt.relatedTarget ? closestInfoTip(evt.relatedTarget) : null;
      if (to === from) return;
      hide();
    });

    // Keyboard: show on focus, hide on blur.
    document.addEventListener("focusin", function (evt) {
      var icon = closestInfoTip(evt.target);
      if (icon) showFor(icon);
    });
    document.addEventListener("focusout", function (evt) {
      var icon = closestInfoTip(evt.target);
      if (icon) hide();
    });

    // Reposition/hide on scroll or resize so the bubble never floats stale.
    window.addEventListener(
      "scroll",
      function () {
        hide();
      },
      true
    );
    window.addEventListener("resize", function () {
      hide();
    });
    document.addEventListener("keydown", function (evt) {
      if (evt.key === "Escape") hide();
    });
  }

  // Auto-init on load so every page (index.html + psap.html) gets the shared
  // bubble wired without any per-page code.
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initInfoTips);
    } else {
      initInfoTips();
    }
  }

  var api = {
    infoTipHtml: infoTipHtml,
    escapeHtml: escapeHtml,
    initInfoTips: initInfoTips,
  };

  // Attach to the browser global so <script>-loaded view modules can reuse it.
  global.InfoTip = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
