/*
 * impact.js — "Impact" metric for reportable outages (task 4d).
 *
 * The impact metric quantifies the severity of a reporting event as the time
 * an outage has spent at/over the 900k FCC threshold multiplied by the number
 * of affected telephone lines (currentLostUsers), expressed in line-minutes:
 *
 *     impact = minutesSince(thresholdReachedAt) * currentLostUsers
 *
 * It is only meaningful for a REPORTABLE outage that has a `thresholdReachedAt`
 * timestamp; otherwise it is 0. Because it depends on "now", it grows live and
 * the app recomputes it on each drift tick for the selected outage / open
 * modal.
 *
 * Buildless dual-mode: loaded in the browser via a plain <script> tag (attaches
 * to `window.Impact`) and also exported for Node/Vitest via the footer. Reads
 * shared constants from `window.DashboardConstants` with a Node require
 * fallback so the pure helper stays testable.
 */
(function (global) {
  "use strict";

  // Resolve shared constants: browser global first, Node require fallback.
  var C =
    (global && global.DashboardConstants) ||
    (typeof require !== "undefined" ? require("./constants") : undefined);

  var FCC_REPORT_THRESHOLD = (C && C.FCC_REPORT_THRESHOLD) || 900000;

  function isReportable(outage) {
    if (C && typeof C.isReportable === "function") {
      return C.isReportable(outage);
    }
    return (
      !!outage &&
      typeof outage.currentLostUsers === "number" &&
      isFinite(outage.currentLostUsers) &&
      outage.currentLostUsers >= FCC_REPORT_THRESHOLD
    );
  }

  /**
   * Computes the live impact (line-minutes) for an outage relative to `now`.
   *
   * Returns `minutes * currentLostUsers` where `minutes` is the whole number of
   * minutes elapsed since `thresholdReachedAt`, but ONLY when the outage is
   * currently reportable AND has a valid `thresholdReachedAt`. In every other
   * case (not reportable, missing/invalid threshold time, or a threshold time
   * in the future) it returns 0.
   *
   * Pure: does not mutate the outage.
   *
   * @param {Object} outage
   * @param {number|Date} [now=Date.now()] - reference time (ms epoch or Date).
   * @returns {number} impact in line-minutes (>= 0).
   */
  function computeImpact(outage, now) {
    if (!outage || !isReportable(outage)) {
      return 0;
    }
    var t = outage.thresholdReachedAt;
    if (!t) {
      return 0;
    }
    var reached = new Date(t).getTime();
    if (isNaN(reached)) {
      return 0;
    }
    var nowMs = now == null ? Date.now() : (now instanceof Date ? now.getTime() : Number(now));
    if (!isFinite(nowMs)) {
      return 0;
    }
    var minutes = Math.floor((nowMs - reached) / 60000);
    if (minutes <= 0) {
      return 0;
    }
    var lines = Number(outage.currentLostUsers);
    if (!isFinite(lines) || lines < 0) {
      return 0;
    }
    return minutes * lines;
  }

  /**
   * Formats a line-minute impact value compactly (e.g. 1_200_000 -> "1.2M
   * line-min"). Returns "0 line-min" for a zero/invalid value.
   * @param {number} value
   * @returns {string}
   */
  function formatImpact(value) {
    var v = Number(value);
    if (!isFinite(v) || v <= 0) {
      return "0 line-min";
    }
    var out;
    if (v >= 1e9) {
      out = (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    } else if (v >= 1e6) {
      out = (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    } else if (v >= 1e3) {
      out = (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    } else {
      out = String(Math.round(v));
    }
    return out + " line-min";
  }

  var api = {
    computeImpact: computeImpact,
    formatImpact: formatImpact,
  };

  // Attach to the browser global so <script>-loaded view modules can use it.
  global.Impact = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
