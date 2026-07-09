/*
 * summary.js — Dashboard summary aggregation for the Spectrum outage dashboard
 * mockup.
 *
 * Owns the Mock Data Module's `computeSummary`: it derives the dashboard-level
 * aggregate figures from a list of outages, including the per-network
 * (Spectrum) lost-user breakdown.
 *
 * Buildless: loaded in the browser via a plain <script> tag and attaches its
 * exports to `window.Summary`. It also conditionally exports for Node/Vitest
 * via the dual-mode footer, so the same source imports cleanly into the test
 * runner without any build step. Reads shared network constants from
 * `window.DashboardConstants` in the browser, with a Node `require` fallback.
 */
(function (global) {
  "use strict";

  // Resolve shared constants: browser global first, Node require fallback.
  var C = global.DashboardConstants;
  if (!C && typeof require !== "undefined") {
    C = require("./constants");
  }

  // Allowed network/brand values. Fall back to the single Spectrum network if
  // constants are somehow unavailable so the aggregation stays robust.
  var NETWORKS = (C && C.NETWORKS) || ["Spectrum"];

  // Severity ranking used only as a deterministic tie-breaker when selecting
  // the most-severe region. Higher rank = more severe.
  var SEVERITY_RANK = { critical: 3, major: 2, minor: 1 };

  function severityRank(severity) {
    return SEVERITY_RANK[severity] || 0;
  }

  /**
   * Computes dashboard-level aggregates from a list of outages.
   *
   * Pure function: it does not mutate the input list or any of its outage
   * objects; it only reads their fields.
   *
   * Returned shape (Model 2: DashboardSummary):
   *   {
   *     activeOutageCount: number,     // count of outages (Req 7.1, 7.5)
   *     totalLostUsers: number,        // sum of currentLostUsers (Req 7.2, 7.6)
   *     peakGrowthRatePerMin: number,  // max growthRatePerMin, 0 empty (Req 7.3, 7.4)
   *     mostSevereRegion: string,      // region of highest-impact outage, "" empty
   *     lostUsersByNetwork: {          // per-network partition (Req 6.2, 6.3, 6.4)
   *       Spectrum: number
   *     }
   *   }
   *
   * mostSevereRegion tie-break (deterministic):
   *   The "highest-impact" outage is selected by, in order:
   *     1. highest currentLostUsers,
   *     2. then highest severity rank (critical > major > minor),
   *     3. then highest growthRatePerMin.
   *   Its `region` is returned. For an empty list the region is "".
   *
   * Per-network breakdown (Req 6.2, 6.3, 6.4):
   *   lostUsersByNetwork contains one entry per known network ("Spectrum"),
   *   summing currentLostUsers over outages of that network, and 0 when a
   *   network has no outages. Because every valid outage's network is
   *   "Spectrum", the Spectrum sum exactly equals totalLostUsers.
   *
   * @param {Array} outages - list of outage records.
   * @returns {Object} the DashboardSummary aggregate.
   */
  function computeSummary(outages) {
    var list = Array.isArray(outages) ? outages : [];

    // Initialize per-network sums to 0 so a network with no outages reports 0
    // (Requirement 6.4).
    var lostUsersByNetwork = {};
    for (var n = 0; n < NETWORKS.length; n++) {
      lostUsersByNetwork[NETWORKS[n]] = 0;
    }

    var totalLostUsers = 0;
    var peakGrowthRatePerMin = 0;
    var reportableCount = 0; // outages at/over the FCC 900k threshold
    var mostSevere = null; // the currently selected highest-impact outage

    // FCC/911 reporting threshold. Falls back to 900k if constants are absent.
    var fccThreshold = (C && C.FCC_REPORT_THRESHOLD) || 900000;

    for (var i = 0; i < list.length; i++) {
      var o = list[i];

      // Coerce numeric fields defensively; treat missing/NaN as 0 so a stray
      // record cannot poison the totals.
      var lost = typeof o.currentLostUsers === "number" && isFinite(o.currentLostUsers)
        ? o.currentLostUsers
        : 0;
      var growth = typeof o.growthRatePerMin === "number" && isFinite(o.growthRatePerMin)
        ? o.growthRatePerMin
        : 0;

      totalLostUsers += lost;

      if (growth > peakGrowthRatePerMin) {
        peakGrowthRatePerMin = growth;
      }

      // Count outages at/over the FCC reporting threshold (Property 9).
      if (lost >= fccThreshold) {
        reportableCount += 1;
      }

      // Add to the owning network's sum. Only known networks are tracked; the
      // seed data guarantees every outage is Spectrum so the partition holds
      // (Requirement 6.3). A stray "Cox" key is simply ignored, not counted.
      if (Object.prototype.hasOwnProperty.call(lostUsersByNetwork, o.network)) {
        lostUsersByNetwork[o.network] += lost;
      }

      // Track the most-severe (highest-impact) outage via the documented
      // deterministic tie-break.
      if (mostSevere === null || isHigherImpact(o, lost, growth, mostSevere)) {
        mostSevere = { outage: o, lost: lost, growth: growth };
      }
    }

    return {
      activeOutageCount: list.length,
      totalLostUsers: totalLostUsers,
      peakGrowthRatePerMin: peakGrowthRatePerMin,
      reportableCount: reportableCount,
      mostSevereRegion: mostSevere ? String(mostSevere.outage.region || "") : "",
      lostUsersByNetwork: lostUsersByNetwork,
    };
  }

  /**
   * Returns true if the candidate outage outranks the current best per the
   * documented tie-break: currentLostUsers, then severity rank, then
   * growthRatePerMin. `current` is the previously-selected wrapper
   * { outage, lost, growth }.
   */
  function isHigherImpact(candidate, candLost, candGrowth, current) {
    if (candLost !== current.lost) {
      return candLost > current.lost;
    }
    var candSev = severityRank(candidate.severity);
    var curSev = severityRank(current.outage.severity);
    if (candSev !== curSev) {
      return candSev > curSev;
    }
    return candGrowth > current.growth;
  }

  var api = {
    computeSummary: computeSummary,
  };

  // Attach to the browser global so <script>-loaded modules can read it.
  global.Summary = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
