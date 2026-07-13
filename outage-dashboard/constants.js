/*
 * constants.js — Shared domain bounds and validation helpers for the
 * Spectrum outage dashboard mockup.
 *
 * Buildless: this file is loaded in the browser via a plain <script> tag and
 * attaches its exports to `window.DashboardConstants`. It also conditionally
 * exports for Node/Vitest via the dual-mode footer at the bottom, so the same
 * source can be imported by the test runner without any build step.
 */
(function (global) {
  "use strict";

  // --- Continental US bounding box (Requirement 5.1, 5.3) ---
  // Latitude 24 N to 50 N; longitude 125 W (-125) to 66 W (-66).
  var US_BOUNDS = {
    latMin: 24,
    latMax: 50,
    lngMin: -125,
    lngMax: -66,
  };

  // Absolute geographic coordinate limits (Requirement 14.6).
  var COORD_LIMITS = {
    latMin: -90,
    latMax: 90,
    lngMin: -180,
    lngMax: 180,
  };

  // --- Growth-rate domain for the size scale (Requirement 2.1, 2.4) ---
  // Users lost per minute, mapped to bubble radius.
  var GROWTH_RATE_DOMAIN = {
    min: 0,
    max: 500,
  };

  // --- Bubble radius bounds in pixels (Requirement 2.3) ---
  var RADIUS_BOUNDS = {
    min: 6,
    max: 40,
  };

  // --- Color heat-ramp for the color scale (Requirement 3.1, 3.3) ---
  // Current lost users mapped onto a yellow -> orange -> red sequential ramp.
  // `domain` defines the min/max lost-user bounds; values at or below `min`
  // clamp to the yellow endpoint, values at or above `max` clamp to red.
  //
  // The max is anchored to the FCC / 911 reporting threshold: at ~900,000
  // affected users an outage must be reported to the FCC and PSAP/911
  // operators, so a bubble turning deep red signals "at/near the reporting
  // threshold". Color therefore encodes closeness to that 900k threshold.
  var FCC_REPORT_THRESHOLD = 900000;
  var LOST_USERS_DOMAIN = {
    min: 0,
    max: FCC_REPORT_THRESHOLD,
  };

  // Ordered heat-ramp stops from coldest (yellow) to hottest (red).
  // `position` is the normalized position (0..1) of each stop along the ramp;
  // `color` is the hex color at that stop. Reused by the legend so it always
  // matches what the map draws.
  var HEAT_RAMP_STOPS = [
    { position: 0.0, color: "#ffe14d" }, // yellow  (coldest)
    { position: 0.5, color: "#ff9d2e" }, // orange  (middle)
    { position: 1.0, color: "#d7191c" }, // deep red (hottest)
  ];

  // Legend threshold labels for the color gradient (Requirement 4.2).
  // Three labeled thresholds corresponding to the yellow/orange/red stops,
  // anchored to the FCC/911 reporting threshold at the hot end (900k).
  var COLOR_LEGEND_THRESHOLDS = [
    { label: "low", lostUsers: 0 },
    { label: "elevated", lostUsers: FCC_REPORT_THRESHOLD / 2 },
    { label: "FCC report (900k)", lostUsers: FCC_REPORT_THRESHOLD },
  ];

  // Legend growth-rate samples for the size gradient (Requirement 4.1).
  // Retained for backwards-compat; the map no longer sizes bubbles by growth
  // rate (velocity is now shown as a pulse), so the legend uses the lost-user
  // samples below instead.
  var SIZE_LEGEND_SAMPLES = [
    { label: "slow", growthRatePerMin: 25 },
    { label: "medium", growthRatePerMin: 150 },
    { label: "fast", growthRatePerMin: 400 },
  ];

  // Legend lost-user samples for the bubble SIZE (and color) legend. Both the
  // bubble size and fill color now encode CURRENT lost users (closeness to the
  // 900k FCC reporting threshold), so these samples drive the size swatches.
  var LOST_USERS_LEGEND_SAMPLES = [
    { label: "low", lostUsers: 100000 },
    { label: "elevated", lostUsers: 450000 },
    { label: "FCC 900k", lostUsers: FCC_REPORT_THRESHOLD },
  ];

  // Allowed network/brand values. The product is a single Spectrum network
  // (Req 6.1); "Cox" is no longer a valid network.
  var NETWORKS = ["Spectrum"];

  // Allowed severity levels for chips.
  var SEVERITIES = ["critical", "major", "minor"];

  // Allowed outage "cause" values (distinct from severity). Used to populate
  // the per-column Cause filter select and to optionally validate seed data.
  var CAUSES = [
    "Fiber cut",
    "Power event",
    "Equipment failure",
    "Upstream congestion",
    "DNS/Config error",
  ];

  // Allowed PSAP reporting statuses. Mirrors psapData.js status values and
  // powers the per-column PSAP status filters on both tables.
  var PSAP_STATUSES = ["acknowledged", "notified", "pending", "not_required"];

  /**
   * Returns true if `lat`/`lng` are finite numbers within absolute geographic
   * coordinate limits (lat in [-90, 90], lng in [-180, 180]).
   * Used by the map renderer to skip out-of-range records (Requirement 14.6).
   */
  function isValidCoordinate(lat, lng) {
    return (
      typeof lat === "number" &&
      typeof lng === "number" &&
      isFinite(lat) &&
      isFinite(lng) &&
      lat >= COORD_LIMITS.latMin &&
      lat <= COORD_LIMITS.latMax &&
      lng >= COORD_LIMITS.lngMin &&
      lng <= COORD_LIMITS.lngMax
    );
  }

  /**
   * Returns true if `lat`/`lng` fall within the continental US bounding box.
   * Used to assert seed outages are placed within the framed map view (Req 5.3).
   */
  function isWithinUsBounds(lat, lng) {
    return (
      typeof lat === "number" &&
      typeof lng === "number" &&
      isFinite(lat) &&
      isFinite(lng) &&
      lat >= US_BOUNDS.latMin &&
      lat <= US_BOUNDS.latMax &&
      lng >= US_BOUNDS.lngMin &&
      lng <= US_BOUNDS.lngMax
    );
  }

  /**
   * Validates a single Outage record against the data-model rules from the
   * design doc (Requirement 6.1, 14.6, 14.7):
   *   - id is a non-empty string
   *   - network is exactly "Spectrum"
   *   - currentLostUsers is a finite number >= 0
   *   - growthRatePerMin is a finite number >= 0
   *   - lat/lng are valid geographic coordinates
   *   - severity, when present, is one of the allowed levels
   * Returns a boolean; does not throw.
   */
  function isValidOutage(outage) {
    if (!outage || typeof outage !== "object") {
      return false;
    }
    if (typeof outage.id !== "string" || outage.id.length === 0) {
      return false;
    }
    if (NETWORKS.indexOf(outage.network) === -1) {
      return false;
    }
    if (
      typeof outage.currentLostUsers !== "number" ||
      !isFinite(outage.currentLostUsers) ||
      outage.currentLostUsers < 0
    ) {
      return false;
    }
    if (
      typeof outage.growthRatePerMin !== "number" ||
      !isFinite(outage.growthRatePerMin) ||
      outage.growthRatePerMin < 0
    ) {
      return false;
    }
    if (!isValidCoordinate(outage.lat, outage.lng)) {
      return false;
    }
    if (
      outage.severity !== undefined &&
      SEVERITIES.indexOf(outage.severity) === -1
    ) {
      return false;
    }
    // `cause` is optional; when present it must be a non-empty string. This is
    // a soft rule so records without a cause (e.g. generated test data) still
    // validate.
    if (
      outage.cause !== undefined &&
      (typeof outage.cause !== "string" || outage.cause.length === 0)
    ) {
      return false;
    }
    return true;
  }

  /**
   * Returns true when an outage's current lost users has reached the FCC / 911
   * reporting threshold (>= 900,000), meaning it must be reported to the FCC
   * and PSAP/911 operators. Used to flag "reportable" outages across the UI.
   */
  function isReportable(outage) {
    return (
      !!outage &&
      typeof outage.currentLostUsers === "number" &&
      isFinite(outage.currentLostUsers) &&
      outage.currentLostUsers >= FCC_REPORT_THRESHOLD
    );
  }

  /**
   * Clamps `value` to the inclusive [min, max] range. Shared helper reused by
   * the size and color scales for domain/endpoint clamping.
   */
  function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  var api = {
    US_BOUNDS: US_BOUNDS,
    COORD_LIMITS: COORD_LIMITS,
    GROWTH_RATE_DOMAIN: GROWTH_RATE_DOMAIN,
    RADIUS_BOUNDS: RADIUS_BOUNDS,
    FCC_REPORT_THRESHOLD: FCC_REPORT_THRESHOLD,
    LOST_USERS_DOMAIN: LOST_USERS_DOMAIN,
    HEAT_RAMP_STOPS: HEAT_RAMP_STOPS,
    COLOR_LEGEND_THRESHOLDS: COLOR_LEGEND_THRESHOLDS,
    SIZE_LEGEND_SAMPLES: SIZE_LEGEND_SAMPLES,
    LOST_USERS_LEGEND_SAMPLES: LOST_USERS_LEGEND_SAMPLES,
    NETWORKS: NETWORKS,
    SEVERITIES: SEVERITIES,
    CAUSES: CAUSES,
    PSAP_STATUSES: PSAP_STATUSES,
    isValidCoordinate: isValidCoordinate,
    isWithinUsBounds: isWithinUsBounds,
    isValidOutage: isValidOutage,
    isReportable: isReportable,
    clamp: clamp,
  };

  // Attach to the browser global so <script>-loaded modules can read it.
  global.DashboardConstants = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
