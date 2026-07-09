/*
 * psapData.js — Seed PSAP / 911 dataset for the Spectrum outage dashboard
 * mockup.
 *
 * Buildless: loaded in the browser via a plain <script> tag and attaches its
 * exports to `window.PsapData`. It also conditionally exports for Node/Vitest
 * via the dual-mode footer at the bottom, so the same source can be imported by
 * the test runner without any build step (mirrors mockData.js / constants.js).
 *
 * Each PSAP corresponds to exactly one seed outage region and carries a
 * reporting `status` used across the detail panel and the PSAP status page:
 *   - "acknowledged" — PSAP has acknowledged the outage report (green)
 *   - "notified"     — the outage has been reported to the PSAP (blue)
 *   - "pending"      — not yet reported / awaiting action (amber/alert)
 *   - "not_required" — outage is below the FCC 900k threshold (grey)
 */
(function (global) {
  "use strict";

  /**
   * Seed PSAP definitions, one per seed outage. `updatedMinutesAgo` is turned
   * into an ISO 8601 `updatedAt` (in the recent past) at call time so the demo
   * always reads as freshly updated regardless of when it is opened.
   *
   * Status guidance (so the demo reads well against the scaled-up outage
   * numbers in mockData.js):
   *   - Dallas (otg-005, ~912k, over the FCC threshold) -> "acknowledged"
   *   - New York (otg-001, ~712k) & Los Angeles-adjacent highs -> "pending"/"notified"
   *   - clearly-low outages -> "not_required"
   * At least one of each status is present for visual variety.
   */
  var SEED_DEFS = [
    {
      id: "psap-001",
      name: "New York City PSAP",
      county: "New York County",
      state: "NY",
      phone: "911 / +1-212-555-0101",
      status: "pending",
      linkedOutageId: "otg-001",
      updatedMinutesAgo: 12,
    },
    {
      id: "psap-002",
      name: "Boston PSAP",
      county: "Suffolk County",
      state: "MA",
      phone: "911 / +1-617-555-0102",
      status: "not_required",
      linkedOutageId: "otg-002",
      updatedMinutesAgo: 34,
    },
    {
      id: "psap-003",
      name: "Chicago OEMC PSAP",
      county: "Cook County",
      state: "IL",
      phone: "911 / +1-312-555-0103",
      status: "not_required",
      linkedOutageId: "otg-003",
      updatedMinutesAgo: 27,
    },
    {
      id: "psap-004",
      name: "Minneapolis PSAP",
      county: "Hennepin County",
      state: "MN",
      phone: "911 / +1-612-555-0104",
      status: "not_required",
      linkedOutageId: "otg-004",
      updatedMinutesAgo: 41,
    },
    {
      id: "psap-005",
      name: "Dallas PSAP",
      county: "Dallas County",
      state: "TX",
      phone: "911 / +1-214-555-0105",
      status: "acknowledged",
      linkedOutageId: "otg-005",
      updatedMinutesAgo: 5,
    },
    {
      id: "psap-006",
      name: "Atlanta PSAP",
      county: "Fulton County",
      state: "GA",
      phone: "911 / +1-404-555-0106",
      status: "not_required",
      linkedOutageId: "otg-006",
      updatedMinutesAgo: 19,
    },
    {
      id: "psap-007",
      name: "Miami-Dade PSAP",
      county: "Miami-Dade County",
      state: "FL",
      phone: "911 / +1-305-555-0107",
      status: "not_required",
      linkedOutageId: "otg-007",
      updatedMinutesAgo: 23,
    },
    {
      id: "psap-008",
      name: "Los Angeles PSAP",
      county: "Los Angeles County",
      state: "CA",
      phone: "911 / +1-213-555-0108",
      status: "notified",
      linkedOutageId: "otg-008",
      updatedMinutesAgo: 8,
    },
    {
      id: "psap-009",
      name: "Phoenix PSAP",
      county: "Maricopa County",
      state: "AZ",
      phone: "911 / +1-602-555-0109",
      status: "not_required",
      linkedOutageId: "otg-009",
      updatedMinutesAgo: 46,
    },
    {
      id: "psap-010",
      name: "Seattle PSAP",
      county: "King County",
      state: "WA",
      phone: "911 / +1-206-555-0110",
      status: "pending",
      linkedOutageId: "otg-010",
      updatedMinutesAgo: 15,
    },
  ];

  /**
   * Returns the full seed set of PSAPs. A fresh array of fresh objects is
   * returned on every call so callers can freely sort/mutate copies without
   * corrupting the canonical definitions. `updatedAt` is derived from `now` so
   * it is always a valid ISO 8601 timestamp in the recent past.
   */
  function getPsaps() {
    var now = Date.now();
    return SEED_DEFS.map(function (def) {
      return {
        id: def.id,
        name: def.name,
        county: def.county,
        state: def.state,
        phone: def.phone,
        status: def.status,
        linkedOutageId: def.linkedOutageId,
        updatedAt: new Date(
          now - def.updatedMinutesAgo * 60 * 1000
        ).toISOString(),
      };
    });
  }

  /**
   * Returns the PSAP linked to a given outage id, or null when none matches.
   * @param {string} outageId
   * @returns {Object|null}
   */
  function getPsapForOutage(outageId) {
    if (!outageId) {
      return null;
    }
    var list = getPsaps();
    for (var i = 0; i < list.length; i++) {
      if (list[i].linkedOutageId === outageId) {
        return list[i];
      }
    }
    return null;
  }

  var api = {
    getPsaps: getPsaps,
    getPsapForOutage: getPsapForOutage,
  };

  // Attach to the browser global so <script>-loaded modules can read it.
  global.PsapData = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
