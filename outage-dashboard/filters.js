/*
 * filters.js — Pure outage filtering for the Spectrum outage dashboard mockup.
 *
 * Owns `filterOutages(outages, filter)`, a pure function shared by the map and
 * the outage table so both always show the same filtered subset. It performs
 * no DOM work; the view layer wires the controls and applies the result.
 *
 * Filter model:
 *   {
 *     severity: "all" | "critical" | "major" | "minor",
 *     reportableOnly: boolean,   // keep only outages at/over the 900k FCC threshold
 *     search: string             // case-insensitive substring vs name + region
 *   }
 *
 * Matching rules (AND semantics — an outage is kept only if it passes ALL):
 *   - severity: "all" (or missing) matches any severity; otherwise the outage's
 *     severity must equal the filter value.
 *   - reportableOnly: when true, keep only outages where
 *     currentLostUsers >= FCC_REPORT_THRESHOLD (via constants.isReportable).
 *   - search: an empty/whitespace-only string matches all; otherwise the
 *     trimmed, lower-cased query must be a substring of the outage's name or
 *     region (also lower-cased).
 *
 * Buildless dual-mode: loaded in the browser via a plain <script> tag (attaches
 * to `window.OutageFilters`) and also exported for Node/Vitest via the footer.
 * Reads shared constants from `window.DashboardConstants`, with a Node require
 * fallback so the pure helper stays testable.
 */
(function (global) {
  "use strict";

  // Resolve shared constants: browser global first, Node require fallback.
  var C =
    (global && global.DashboardConstants) ||
    (typeof require !== "undefined" ? require("./constants") : undefined);

  var FCC_REPORT_THRESHOLD = (C && C.FCC_REPORT_THRESHOLD) || 900000;

  /**
   * Returns true when the outage has reached the FCC/911 reporting threshold.
   * Prefers constants.isReportable; falls back to a direct threshold compare.
   * @param {Object} outage
   * @returns {boolean}
   */
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
   * Returns true if the outage passes the severity portion of the filter.
   * An "all" or missing severity filter matches every outage.
   */
  function matchesSeverity(outage, severity) {
    if (!severity || severity === "all") {
      return true;
    }
    return !!outage && outage.severity === severity;
  }

  /**
   * Returns true if the outage passes the search portion of the filter. An
   * empty or whitespace-only query matches every outage; otherwise the query is
   * a case-insensitive substring match against the name OR region.
   */
  function matchesSearch(outage, search) {
    if (search == null) {
      return true;
    }
    var query = String(search).trim().toLowerCase();
    if (query.length === 0) {
      return true;
    }
    if (!outage) {
      return false;
    }
    var name = String(outage.name == null ? "" : outage.name).toLowerCase();
    var region = String(
      outage.region == null ? "" : outage.region
    ).toLowerCase();
    return name.indexOf(query) !== -1 || region.indexOf(query) !== -1;
  }

  /**
   * Filters a list of outages by the given filter object (AND semantics).
   * Pure: does not mutate the input list or its records. A missing/partial
   * filter is treated permissively (defaults: severity "all", reportableOnly
   * false, empty search), so `filterOutages(list)` returns the full list.
   *
   * @param {Array<Object>} outages
   * @param {{severity?:string, reportableOnly?:boolean, search?:string}} [filter]
   * @returns {Array<Object>} the matching subset (a new array).
   */
  function filterOutages(outages, filter) {
    var list = Array.isArray(outages) ? outages : [];
    var f = filter || {};
    var severity = f.severity || "all";
    var reportableOnly = !!f.reportableOnly;
    var search = f.search;

    return list.filter(function (outage) {
      if (!matchesSeverity(outage, severity)) {
        return false;
      }
      if (reportableOnly && !isReportable(outage)) {
        return false;
      }
      if (!matchesSearch(outage, search)) {
        return false;
      }
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Per-column / per-category filters (task 3).
  //
  // These pure helpers back the compact filter rows under each table header.
  // They AND together like `filterOutages` and, in the app, are layered on top
  // of the shared dashboard filter that has already been applied to the list.
  // ---------------------------------------------------------------------------

  /**
   * Case-insensitive substring match. An empty/whitespace-only or null query
   * matches everything ("contains nothing" => keep all).
   * @param {*} value
   * @param {*} query
   * @returns {boolean}
   */
  function textContains(value, query) {
    if (query == null) {
      return true;
    }
    var q = String(query).trim().toLowerCase();
    if (q.length === 0) {
      return true;
    }
    var hay = String(value == null ? "" : value).toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  /**
   * Exact-match for select filters. An empty/null selection or the sentinel
   * "all" matches everything; otherwise the value must equal the selection.
   * @param {*} value
   * @param {*} selected
   * @returns {boolean}
   */
  function selectEquals(value, selected) {
    if (selected == null || selected === "" || selected === "all") {
      return true;
    }
    return value === selected;
  }

  /**
   * Filters outages by a set of per-column filters (AND semantics). Recognized
   * keys on `columnFilters`:
   *   - name        : case-insensitive substring vs outage.name
   *   - region      : case-insensitive substring vs outage.region
   *   - cause       : exact match vs outage.cause  ("all"/empty => any)
   *   - severity    : exact match vs outage.severity ("all"/empty => any)
   *   - psapStatus  : exact match vs outage.psapStatus ("all"/empty => any)
   * Any missing key is treated permissively (matches everything), so an empty
   * `columnFilters` returns the full list. Pure: does not mutate its inputs.
   *
   * @param {Array<Object>} outages
   * @param {Object} [columnFilters]
   * @returns {Array<Object>} the matching subset (a new array).
   */
  function filterOutagesByColumns(outages, columnFilters) {
    var list = Array.isArray(outages) ? outages : [];
    var f = columnFilters || {};
    return list.filter(function (o) {
      if (!o) return false;
      if (!textContains(o.name, f.name)) return false;
      if (!textContains(o.region, f.region)) return false;
      if (!selectEquals(o.cause, f.cause)) return false;
      if (!selectEquals(o.severity, f.severity)) return false;
      if (!selectEquals(o.psapStatus, f.psapStatus)) return false;
      return true;
    });
  }

  /**
   * Filters PSAP rows by a set of per-column filters (AND semantics).
   * Recognized keys on `columnFilters`:
   *   - name          : case-insensitive substring vs psap.name
   *   - countyState   : case-insensitive substring vs "county, state"
   *   - linkedOutage  : case-insensitive substring vs the linked outage's name
   *   - status        : exact match vs psap.status ("all"/empty => any)
   *
   * The linked-outage name is resolved from `outageLookup`, a plain object
   * mapping outageId -> outage (e.g. `{ "otg-001": {name: ...} }`). Pure: does
   * not mutate its inputs.
   *
   * @param {Array<Object>} psaps
   * @param {Object} [columnFilters]
   * @param {Object} [outageLookup] map of outageId -> outage
   * @returns {Array<Object>} the matching subset (a new array).
   */
  function filterPsaps(psaps, columnFilters, outageLookup) {
    var list = Array.isArray(psaps) ? psaps : [];
    var f = columnFilters || {};
    var lookup = outageLookup || {};
    return list.filter(function (p) {
      if (!p) return false;
      if (!textContains(p.name, f.name)) return false;
      var countyState =
        String(p.county == null ? "" : p.county) +
        ", " +
        String(p.state == null ? "" : p.state);
      if (!textContains(countyState, f.countyState)) return false;
      var linked = lookup[p.linkedOutageId];
      var linkedName = linked ? linked.name : "";
      if (!textContains(linkedName, f.linkedOutage)) return false;
      if (!selectEquals(p.status, f.status)) return false;
      return true;
    });
  }

  var api = {
    filterOutages: filterOutages,
    filterOutagesByColumns: filterOutagesByColumns,
    filterPsaps: filterPsaps,
    textContains: textContains,
    selectEquals: selectEquals,
  };

  // Attach to the browser global so <script>-loaded view modules can use it.
  global.OutageFilters = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
