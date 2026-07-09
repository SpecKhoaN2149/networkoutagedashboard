/*
 * mockData.js — Seed mock-outage dataset for the Spectrum outage dashboard
 * mockup.
 *
 * Buildless: this file is loaded in the browser via a plain <script> tag and
 * attaches its exports to `window.MockData`. It also conditionally exports for
 * Node/Vitest via the dual-mode footer at the bottom, so the same source can be
 * imported by the test runner without any build step.
 *
 * This module provides ONLY `getMockOutages` (task 2.1). Summary aggregation,
 * scales, legend, and live drift live in their own modules.
 */
(function (global) {
  "use strict";

  // Resolve shared constants from the browser global, with a Node fallback so
  // the same source works under Vitest. Mirrors the dual-mode pattern used by
  // every logic module in this project.
  var Constants =
    (global && global.DashboardConstants) ||
    (typeof require !== "undefined" ? require("./constants") : undefined);

  /**
   * Seed outages are placed at real US city coordinates spanning the four US
   * Census regions (Northeast, Midwest, South, West). `startedAt` timestamps
   * are computed at module-load time as offsets *before* `now`, so every seed
   * outage always has a start time in the past regardless of when the mockup
   * is opened (Outage model rule: startedAt is not in the future).
   *
   * Each entry carries a `startedMinutesAgo` used to derive `startedAt`, and a
   * `psapId` linking the outage to its region's PSAP / 911 authority (see
   * psapData.js). The link lets the detail panel and PSAP status page cross
   * reference an outage with its reporting record.
   */
  var SEED_DEFS = [
    // --- Northeast ---
    {
      id: "otg-001",
      name: "Fiber Backbone Degradation",
      network: "Spectrum",
      region: "New York, NY",
      lat: 40.7128,
      lng: -74.006,
      currentLostUsers: 712000,
      growthRatePerMin: 320,
      severity: "critical",
      cause: "Fiber cut",
      ticketId: "INC-100231",
      startedMinutesAgo: 145,
      psapId: "psap-001",
    },
    {
      id: "otg-002",
      name: "Regional DNS Resolver Fault",
      network: "Spectrum",
      region: "Boston, MA",
      lat: 42.3601,
      lng: -71.0589,
      currentLostUsers: 46000,
      growthRatePerMin: 55,
      severity: "minor",
      cause: "DNS/Config error",
      ticketId: "INC-100232",
      startedMinutesAgo: 38,
      psapId: "psap-002",
    },
    // --- Midwest ---
    {
      id: "otg-003",
      name: "Core Router Packet Loss",
      network: "Spectrum",
      region: "Chicago, IL",
      lat: 41.8781,
      lng: -87.6298,
      currentLostUsers: 318000,
      growthRatePerMin: 210,
      severity: "major",
      cause: "Equipment failure",
      ticketId: "INC-100233",
      startedMinutesAgo: 92,
      psapId: "psap-003",
    },
    {
      id: "otg-004",
      name: "Upstream Peering Congestion",
      network: "Spectrum",
      region: "Minneapolis, MN",
      lat: 44.9778,
      lng: -93.265,
      currentLostUsers: 21000,
      growthRatePerMin: 18,
      severity: "minor",
      cause: "Upstream congestion",
      ticketId: "INC-100234",
      startedMinutesAgo: 20,
      psapId: "psap-004",
    },
    // --- South ---
    {
      id: "otg-005",
      name: "Data Center Power Event",
      network: "Spectrum",
      region: "Dallas, TX",
      lat: 32.7767,
      lng: -96.797,
      currentLostUsers: 912000,
      growthRatePerMin: 465,
      severity: "critical",
      cause: "Power event",
      ticketId: "INC-100235",
      // Primary "parent" ticket: this incident groups several related outage
      // tickets under one umbrella (one ticket attached to many others).
      relatedOutageIds: [
        "otg-001",
        "otg-003",
        "otg-006",
        "otg-008",
        "otg-010",
      ],
      // Reached the 900k FCC threshold ~2 hours ago (reportable outage).
      thresholdReachedMinutesAgo: 120,
      startedMinutesAgo: 175,
      psapId: "psap-005",
    },
    {
      id: "otg-006",
      name: "CMTS Node Overload",
      network: "Spectrum",
      region: "Atlanta, GA",
      lat: 33.749,
      lng: -84.388,
      currentLostUsers: 268000,
      growthRatePerMin: 140,
      severity: "major",
      cause: "Equipment failure",
      ticketId: "INC-100236",
      // Initially estimated ABOVE the 900k threshold, then revised DOWN to the
      // current (much lower) number after investigation ("annoyance" case).
      reassessed: true,
      initialLostUsers: 950000,
      startedMinutesAgo: 63,
      psapId: "psap-006",
    },
    {
      id: "otg-007",
      name: "Coastal Fiber Cut",
      network: "Spectrum",
      region: "Miami, FL",
      lat: 25.7617,
      lng: -80.1918,
      currentLostUsers: 187000,
      growthRatePerMin: 88,
      severity: "major",
      cause: "Fiber cut",
      ticketId: "INC-100237",
      startedMinutesAgo: 47,
      psapId: "psap-007",
    },
    // --- West ---
    {
      id: "otg-008",
      name: "Transit Provider Outage",
      network: "Spectrum",
      region: "Los Angeles, CA",
      lat: 34.0522,
      lng: -118.2437,
      currentLostUsers: 631000,
      growthRatePerMin: 385,
      severity: "critical",
      cause: "Upstream congestion",
      ticketId: "INC-100238",
      startedMinutesAgo: 120,
      psapId: "psap-008",
    },
    {
      id: "otg-009",
      name: "Regional DHCP Saturation",
      network: "Spectrum",
      region: "Phoenix, AZ",
      lat: 33.4484,
      lng: -112.074,
      currentLostUsers: 74000,
      growthRatePerMin: 72,
      severity: "minor",
      cause: "DNS/Config error",
      ticketId: "INC-100239",
      startedMinutesAgo: 31,
      psapId: "psap-009",
    },
    {
      id: "otg-010",
      name: "Metro Ring Fiber Fault",
      network: "Spectrum",
      region: "Seattle, WA",
      lat: 47.6062,
      lng: -122.3321,
      currentLostUsers: 358000,
      growthRatePerMin: 165,
      severity: "major",
      cause: "Fiber cut",
      ticketId: "INC-100240",
      startedMinutesAgo: 78,
      psapId: "psap-010",
    },
  ];

  /**
   * Returns the full seed set of mock outages, distributed across US cities,
   * each tagged with the single "Spectrum" network source.
   *
   * A fresh array of fresh objects is returned on every call so callers (and
   * the live-drift ticker) can freely mutate copies without corrupting the
   * canonical seed definitions. `startedAt` is derived from `now` so it is
   * always a valid ISO 8601 timestamp in the past.
   */
  function getMockOutages() {
    var now = Date.now();
    return SEED_DEFS.map(function (def) {
      return {
        id: def.id,
        name: def.name,
        network: def.network,
        region: def.region,
        lat: def.lat,
        lng: def.lng,
        currentLostUsers: def.currentLostUsers,
        growthRatePerMin: def.growthRatePerMin,
        severity: def.severity,
        // Cause of the outage — a separate field from severity (task 2).
        cause: def.cause,
        // Trouble-ticket id for this outage.
        ticketId: def.ticketId,
        // Related-tickets grouping: a primary outage references the ids of the
        // other outages grouped under its ticket (empty array otherwise).
        relatedOutageIds: Array.isArray(def.relatedOutageIds)
          ? def.relatedOutageIds.slice()
          : [],
        // "Reassessed down after investigation" annoyance case: the pre-
        // investigation estimate, and whether the number was revised lower.
        reassessed: !!def.reassessed,
        initialLostUsers:
          typeof def.initialLostUsers === "number"
            ? def.initialLostUsers
            : null,
        // The moment this outage crossed the 900k FCC reporting threshold, as
        // ISO 8601 — or null if it never has.
        thresholdReachedAt:
          typeof def.thresholdReachedMinutesAgo === "number"
            ? new Date(
                now - def.thresholdReachedMinutesAgo * 60 * 1000
              ).toISOString()
            : null,
        startedAt: new Date(now - def.startedMinutesAgo * 60 * 1000).toISOString(),
        status: "active",
        psapId: def.psapId,
      };
    });
  }

  var api = {
    getMockOutages: getMockOutages,
  };

  // Attach to the browser global so <script>-loaded modules can read it.
  global.MockData = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
