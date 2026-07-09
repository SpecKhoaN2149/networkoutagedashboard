/*
 * colorScale.js — Color scale for the Spectrum + Cox outage dashboard mockup.
 *
 * Maps an outage's CURRENT total lost users onto the classic
 * yellow -> orange -> red sequential heat ramp (Requirement 3.1-3.4, 14.7).
 * Yellow is the coldest endpoint, red the hottest. The mapping is:
 *   - deterministic: equal inputs always yield an identical color (Req 3.4)
 *   - monotonic: a higher lost-user count is never cooler (Req 3.2)
 *   - clamped: values at/below the min bound map to the yellow endpoint,
 *     values at/above the max bound map to the red endpoint (Req 3.3)
 *
 * Buildless: loaded in the browser via a plain <script> tag, attaching its
 * exports to `window.ColorScale`. It also conditionally exports for Node/Vitest
 * via the dual-mode footer, resolving DashboardConstants from the browser
 * global with a Node `require('./constants')` fallback.
 */
(function (global) {
  "use strict";

  // Resolve shared constants/helpers: browser global first, Node fallback.
  var Constants =
    (global && global.DashboardConstants) ||
    (typeof require !== "undefined" ? require("./constants") : undefined);

  var LOST_USERS_DOMAIN = Constants.LOST_USERS_DOMAIN;
  var HEAT_RAMP_STOPS = Constants.HEAT_RAMP_STOPS;
  var clamp = Constants.clamp;

  /**
   * Parses a "#rrggbb" hex color string into an {r, g, b} object of integers
   * in [0, 255]. Assumes a well-formed 6-digit hex string (the ramp stops in
   * constants.js are all 6-digit hex).
   */
  function parseHex(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  /**
   * Formats an integer channel value into a two-digit hex string.
   */
  function channelToHex(value) {
    var h = value.toString(16);
    return h.length === 1 ? "0" + h : h;
  }

  /**
   * Formats an {r, g, b} object (integer channels) into a "#rrggbb" string.
   */
  function rgbToHex(rgb) {
    return "#" + channelToHex(rgb.r) + channelToHex(rgb.g) + channelToHex(rgb.b);
  }

  /**
   * Linearly interpolates a single channel between a and b at fraction t,
   * rounding to the nearest integer so the output is a valid 0..255 channel.
   */
  function lerpChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  /**
   * Maps the CURRENT total lost users to a color on the yellow -> orange -> red
   * heat ramp, returned as a "#rrggbb" hex string.
   *
   * Steps:
   *   1. Clamp the input to [LOST_USERS_DOMAIN.min, LOST_USERS_DOMAIN.max] so
   *      values at/below min map to yellow and at/above max map to red (Req 3.3).
   *   2. Normalize the clamped value to a position in [0, 1] over the domain.
   *   3. Locate the surrounding pair of HEAT_RAMP_STOPS and linearly interpolate
   *      the RGB channels between them, producing a continuous color (Req 3.1).
   *
   * The result is deterministic for equal inputs (pure function of the input,
   * Req 3.4) and monotonic along the ramp: as the input rises the normalized
   * position never decreases, and each interpolation segment moves strictly
   * toward the hotter stop, so the color never regresses toward yellow (Req 3.2).
   *
   * Non-finite or non-numeric inputs are treated as the minimum bound so a bad
   * value cannot break the encoding (defensive; see Req 14.7).
   */
  function colorForLostUsers(currentLostUsers) {
    var min = LOST_USERS_DOMAIN.min;
    var max = LOST_USERS_DOMAIN.max;

    // Defensive: coerce invalid inputs to the cold (min) endpoint.
    var value = currentLostUsers;
    if (typeof value !== "number" || !isFinite(value)) {
      value = min;
    }

    var clamped = clamp(value, min, max);

    // Normalize to [0, 1]. Guard against a zero-width domain.
    var span = max - min;
    var position = span > 0 ? (clamped - min) / span : 0;

    var stops = HEAT_RAMP_STOPS;

    // Exact endpoints map precisely to the first/last stop colors (Req 3.1).
    if (position <= stops[0].position) {
      return rgbToHex(parseHex(stops[0].color));
    }
    var last = stops[stops.length - 1];
    if (position >= last.position) {
      return rgbToHex(parseHex(last.color));
    }

    // Find the stop pair that brackets `position` and interpolate between them.
    for (var i = 0; i < stops.length - 1; i++) {
      var lo = stops[i];
      var hi = stops[i + 1];
      if (position >= lo.position && position <= hi.position) {
        var segmentSpan = hi.position - lo.position;
        var t = segmentSpan > 0 ? (position - lo.position) / segmentSpan : 0;
        var loRgb = parseHex(lo.color);
        var hiRgb = parseHex(hi.color);
        return rgbToHex({
          r: lerpChannel(loRgb.r, hiRgb.r, t),
          g: lerpChannel(loRgb.g, hiRgb.g, t),
          b: lerpChannel(loRgb.b, hiRgb.b, t),
        });
      }
    }

    // Fallback (should be unreachable given the endpoint guards above).
    return rgbToHex(parseHex(last.color));
  }

  var api = {
    colorForLostUsers: colorForLostUsers,
  };

  // Attach to the browser global so <script>-loaded modules can read it.
  global.ColorScale = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
