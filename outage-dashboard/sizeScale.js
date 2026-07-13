/*
 * sizeScale.js — Size Scale for the Spectrum + Cox outage dashboard mockup.
 *
 * Owns the Bubble Encoding Layer's size mapping: growth rate (users lost per
 * minute) -> bubble radius in pixels. A faster-growing outage is drawn with a
 * larger bubble so escalating outages stand out (Requirement 2).
 *
 * Buildless: loaded in the browser via a plain <script> tag and attaches its
 * exports to `window.SizeScale`. It also conditionally exports for Node/Vitest
 * via the dual-mode footer, so the same source imports cleanly into the test
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
  var LOST_USERS_DOMAIN = C.LOST_USERS_DOMAIN; // { min: 0, max: 900000 }
  var RADIUS_BOUNDS = C.RADIUS_BOUNDS; // { min: 6, max: 40 }
  var clamp = C.clamp;

  /**
   * Maps an outage's growth rate (users lost per minute) to a bubble radius in
   * pixels.
   *
   * Behavior (Requirements 2.1, 2.2, 2.3, 2.4, 14.7):
   *   - Domain is [0, 500] users/min; the radius range is [6, 40] px inclusive.
   *   - Out-of-domain inputs (< 0 or > 500, including non-finite values) are
   *     clamped to the nearest domain bound BEFORE deriving the radius.
   *   - A square-root interpolation is used so bubble AREA scales more
   *     perceptually with the growth rate, while remaining monotonic
   *     non-decreasing: a >= b never yields a smaller radius.
   *   - Both endpoints map exactly: 0 -> 6 px, 500 -> 40 px. The result is
   *     finally clamped to [6, 40] to guarantee the bound invariant.
   *
   * @param {number} growthRatePerMin - lost users per minute.
   * @returns {number} radius in pixels within [6, 40].
   */
  function radiusForGrowthRate(growthRatePerMin) {
    var domainMin = GROWTH_RATE_DOMAIN.min;
    var domainMax = GROWTH_RATE_DOMAIN.max;
    var rMin = RADIUS_BOUNDS.min;
    var rMax = RADIUS_BOUNDS.max;

    // Treat non-numeric / NaN inputs as the coldest end of the domain so a
    // malformed record cannot break the encoding (Requirement 14.7). Finite
    // and +/-Infinity values are left to the domain clamp below, which maps
    // +Infinity to the max bound and -Infinity to the min bound.
    var rate = growthRatePerMin;
    if (typeof rate !== "number" || isNaN(rate)) {
      rate = domainMin;
    }

    // Clamp the growth rate to the domain BEFORE deriving the radius (Req 2.4).
    var clampedRate = clamp(rate, domainMin, domainMax);

    // Normalize to [0, 1] across the domain. Guard against a zero-width domain.
    var span = domainMax - domainMin;
    var t = span > 0 ? (clampedRate - domainMin) / span : 0;

    // Square-root interpolation for perceptual area scaling. Monotonic because
    // Math.sqrt is monotonic non-decreasing on [0, 1]. Endpoints are exact:
    // t = 0 -> rMin, t = 1 -> rMax.
    var radius = rMin + (rMax - rMin) * Math.sqrt(t);

    // Final clamp guarantees the [6, 40] bound invariant (Requirements 2.3).
    return clamp(radius, rMin, rMax);
  }

  /**
   * Maps an outage's CURRENT total lost users to a bubble radius in pixels.
   *
   * This is the primary "impact" size encoding: a bubble grows with the number
   * of users currently affected, reinforcing the color scale (which encodes the
   * same value / closeness to the 900k FCC threshold).
   *
   * Behavior (mirrors radiusForGrowthRate's guarantees):
   *   - Domain is [0, 900000] lost users; the radius range is [6, 40] px
   *     inclusive.
   *   - Out-of-domain inputs (< 0 or > 900000, including non-finite values) are
   *     clamped to the nearest domain bound BEFORE deriving the radius.
   *   - A square-root interpolation is used so bubble AREA scales more
   *     perceptually with the affected-user count, while remaining monotonic
   *     non-decreasing: a >= b never yields a smaller radius.
   *   - Both endpoints map exactly: 0 -> 6 px, 900000 -> 40 px. The result is
   *     finally clamped to [6, 40] to guarantee the bound invariant.
   *
   * @param {number} currentLostUsers - current total users affected.
   * @returns {number} radius in pixels within [6, 40].
   */
  function radiusForLostUsers(currentLostUsers) {
    var domainMin = LOST_USERS_DOMAIN.min;
    var domainMax = LOST_USERS_DOMAIN.max;
    var rMin = RADIUS_BOUNDS.min;
    var rMax = RADIUS_BOUNDS.max;

    // Treat non-numeric / NaN inputs as the coldest end of the domain so a
    // malformed record cannot break the encoding. Finite and +/-Infinity
    // values are left to the domain clamp below, which maps +Infinity to the
    // max bound and -Infinity to the min bound.
    var users = currentLostUsers;
    if (typeof users !== "number" || isNaN(users)) {
      users = domainMin;
    }

    // Clamp to the domain BEFORE deriving the radius.
    var clampedUsers = clamp(users, domainMin, domainMax);

    // Normalize to [0, 1] across the domain. Guard against a zero-width domain.
    var span = domainMax - domainMin;
    var t = span > 0 ? (clampedUsers - domainMin) / span : 0;

    // Square-root interpolation for perceptual area scaling. Monotonic because
    // Math.sqrt is monotonic non-decreasing on [0, 1]. Endpoints are exact.
    var radius = rMin + (rMax - rMin) * Math.sqrt(t);

    // Final clamp guarantees the [6, 40] bound invariant.
    return clamp(radius, rMin, rMax);
  }

  var api = {
    radiusForGrowthRate: radiusForGrowthRate,
    radiusForLostUsers: radiusForLostUsers,
  };

  // Attach to the browser global so <script>-loaded modules can read it.
  global.SizeScale = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
