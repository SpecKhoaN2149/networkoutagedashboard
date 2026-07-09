/*
 * drift.js — Live Drift for the Spectrum + Cox outage dashboard mockup.
 *
 * Owns the Mock Data Module's `tickOutages`, which simulates gentle live
 * updates: on each low-frequency timer tick it produces a slightly mutated
 * copy of the outage list so counts wander realistically up and down over
 * time while the dashboard stays valid (Requirement 12).
 *
 * Buildless: loaded in the browser via a plain <script> tag and attaches its
 * exports to `window.Drift`. It also conditionally exports for Node/Vitest via
 * the dual-mode footer, so the same source imports cleanly into the test
 * runner without any build step. Reads shared bounds from
 * `window.DashboardConstants` in the browser, with a Node `require` fallback.
 */
(function (global) {
  "use strict";

  // Resolve shared constants: browser global first, Node require fallback.
  var C = global.DashboardConstants;
  if (!C && typeof require !== "undefined") {
    C = require("./constants");
  }

  var GROWTH_RATE_DOMAIN = C.GROWTH_RATE_DOMAIN; // { min: 0, max: 500 }
  var clamp = C.clamp;

  // Maximum fraction by which a drifting value may change on a single tick
  // (Requirement 12.4: change by no more than 20% of the previous value).
  var MAX_DRIFT_FRACTION = 0.2;

  /**
   * Returns `previous` nudged by a random delta within +/- `MAX_DRIFT_FRACTION`
   * of `previous`, floored at 0. Because the delta is bounded to a fraction of
   * the previous value, the absolute change never exceeds 20% of the previous
   * value (Requirement 12.4) and the result is never negative (Requirement
   * 12.3). A previous value of 0 stays 0 (0% of 0 is 0), which keeps the field
   * non-negative and within the 20%-of-previous bound.
   *
   * @param {number} previous - the field's value on the prior tick.
   * @returns {number} the drifted, non-negative value.
   */
  function driftValue(previous) {
    // Guard against non-finite inputs so a malformed record cannot break drift.
    if (typeof previous !== "number" || !isFinite(previous) || previous < 0) {
      return 0;
    }
    // Random factor in [-1, 1], scaled to +/- 20% of the previous value.
    var factor = Math.random() * 2 - 1; // [-1, 1]
    var delta = previous * MAX_DRIFT_FRACTION * factor; // [-20%, +20%]
    var next = previous + delta;
    return next < 0 ? 0 : next;
  }

  /**
   * Produces a slightly mutated copy of the outage list to simulate live
   * updates, invoked on the dashboard's low-frequency timer.
   *
   * Behavior (Requirements 12.2, 12.3, 12.4):
   *   - Returns a list of the SAME length as the input.
   *   - Every outage retains its identity fields unchanged: `id`, `network`,
   *     `lat`, `lng` (plus other identity fields such as `name`, `region`,
   *     `severity`, `startedAt`, `status`) via a shallow clone.
   *   - `currentLostUsers` and `growthRatePerMin` each drift by no more than
   *     20% of their previous value per tick and never go below 0.
   *   - `growthRatePerMin` is additionally clamped to the [0, 500] growth-rate
   *     domain so it stays a valid size-scale input.
   *
   * Pure: does not mutate the input array or any of its objects; returns a new
   * array of new outage objects.
   *
   * @param {Array<Object>} outages - the previous tick's outage list.
   * @returns {Array<Object>} a new, same-length list of drifted outage copies.
   */
  function tickOutages(outages) {
    if (!Array.isArray(outages)) {
      return [];
    }

    return outages.map(function (outage) {
      // Shallow clone preserves all identity fields (id, network, lat, lng,
      // name, region, severity, startedAt, status, ...) without mutating input.
      var next = {};
      for (var key in outage) {
        if (Object.prototype.hasOwnProperty.call(outage, key)) {
          next[key] = outage[key];
        }
      }

      // Drift the two live metrics within +/- 20% of their previous value,
      // never below 0 (Requirements 12.3, 12.4).
      next.currentLostUsers = driftValue(outage.currentLostUsers);

      // Growth rate drifts the same way, then is clamped to the [0, 500]
      // domain so it remains a valid size-scale input.
      var driftedGrowth = driftValue(outage.growthRatePerMin);
      next.growthRatePerMin = clamp(
        driftedGrowth,
        GROWTH_RATE_DOMAIN.min,
        GROWTH_RATE_DOMAIN.max
      );

      return next;
    });
  }

  var api = {
    tickOutages: tickOutages,
  };

  // Attach to the browser global so <script>-loaded modules can read it.
  global.Drift = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
