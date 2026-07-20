/*
 * outageTable.js — Outage Table component for the Spectrum + Cox outage
 * dashboard mockup.
 *
 * Renders the tabular list of active outages into the side panel. Each row
 * shows the outage name, region, cause, current lost users, growth rate
 * (users/min), a severity chip that is visually distinct per severity level,
 * the linked PSAP status, and the start time. The originating network is no
 * longer shown (the product is a single Spectrum network, so it was redundant
 * with the header branding). When the outage set is empty, the table is
 * replaced by an empty-state message with zero rows.
 *
 * Requirements: 10.1 (one row per outage with the required fields),
 * 10.2 (severity chip style corresponds to severity, visually distinct per
 * level), 14.4 (empty-state message with zero rows when the set is empty).
 *
 * Buildless / browser-only: loaded via a plain <script> tag and attaches its
 * exports to `window.OutageTable`. It reads/writes the DOM directly, so it is
 * DOM/browser-only and is intentionally NOT imported by the Node/Vitest suite.
 * There is deliberately no dual-mode `module.exports` footer (mirroring
 * map.js) so nothing pulls this DOM-dependent module into a Node context.
 */
(function (global) {
  "use strict";

  var DEFAULT_CONTAINER_ID = "outage-table";

  // Severity -> chip modifier class. Each severity maps to its own modifier so
  // the CSS renders a visually distinct chip per level (Requirement 10.2).
  var SEVERITY_MODIFIER = {
    critical: "severity-chip--critical",
    major: "severity-chip--major",
    minor: "severity-chip--minor",
  };

  // Shared constants (for the FCC reportable check + filter option lists).
  // Browser global first, Node require fallback so this module stays testable.
  var C =
    (global && global.DashboardConstants) ||
    (typeof require !== "undefined" ? require("./constants") : undefined);

  var CAUSES = (C && C.CAUSES) || [
    "Fiber cut",
    "Power event",
    "Equipment failure",
    "Upstream congestion",
    "DNS/Config error",
  ];
  var SEVERITIES = (C && C.SEVERITIES) || ["critical", "major", "minor"];
  var PSAP_STATUSES = (C && C.PSAP_STATUSES) || ["notified", "not_notified"];

  // Friendly labels for PSAP status option/badge text.
  var PSAP_STATUS_LABEL = {
    reached_not_notified: "900k \u00b7 Not notified",
    not_notified: "Not notified",
    reached_notified: "900k \u00b7 Notified",
    notified: "Notified",
  };

  // Column model in display order. `filter` describes the per-column filter
  // control rendered in the filter row under the header (task 3). A null
  // filter renders an empty filter cell.
  var COLUMNS = [
    { label: "Outage", filter: { type: "text", key: "name", placeholder: "Filter name" } },
    { label: "Region", filter: { type: "text", key: "region", placeholder: "Filter region" } },
    { label: "Cause", filter: { type: "select", key: "cause", options: CAUSES } },
    { label: "Lost users", filter: null },
    { label: "Growth /min", filter: null },
    { label: "Severity", filter: { type: "select", key: "severity", options: SEVERITIES } },
    {
      label: "PSAP",
      filter: {
        type: "select",
        key: "psapStatus",
        options: PSAP_STATUSES,
        labels: PSAP_STATUS_LABEL,
      },
    },
    { label: "Started", filter: null },
  ];

  var COLUMN_COUNT = COLUMNS.length;

  /**
   * Returns the reusable info-tip markup for `text`, or "" when the InfoTip
   * helper is unavailable.
   */
  function tip(text) {
    var InfoTip = global.InfoTip;
    return InfoTip && typeof InfoTip.infoTipHtml === "function"
      ? InfoTip.infoTipHtml(text)
      : "";
  }

  // Column header -> info-tip description (only the encoded metrics get one).
  var COLUMN_TIPS = {
    "Lost users":
      "Total users currently affected. Drives the bubble color (yellow " +
      "\u2192 red as it approaches the 900k FCC threshold).",
    "Growth /min":
      "Users lost per minute — how fast the outage is growing. Drives the " +
      "bubble size on the map.",
  };

  /**
   * Returns true when the outage has crossed the FCC/911 reporting threshold.
   * Falls back to a direct 900k comparison if constants are unavailable.
   */
  function isReportable(outage) {
    if (C && typeof C.isReportable === "function") {
      return C.isReportable(outage);
    }
    return !!outage && outage.currentLostUsers >= 900000;
  }

  /**
   * Escapes a value for safe insertion as HTML text content. Mock data is
   * trusted, but escaping keeps the renderer robust and injection-proof.
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
   * Formats a numeric field with locale grouping (e.g. 48,200). Falls back to
   * a dash for missing/non-finite values so a bad record cannot break a row.
   * @param {number} value
   * @returns {string}
   */
  function formatNumber(value) {
    var n = Number(value);
    if (!isFinite(n)) {
      return "—";
    }
    return n.toLocaleString();
  }

  /**
   * Formats an ISO 8601 start timestamp into a readable local clock time
   * (e.g. "2:45 PM"). Returns the raw value (or a dash) if it cannot be parsed,
   * keeping the row robust against malformed timestamps.
   * @param {string} startedAt - ISO 8601 timestamp.
   * @returns {string}
   */
  function formatStartTime(startedAt) {
    if (!startedAt) {
      return "—";
    }
    var d = new Date(startedAt);
    if (isNaN(d.getTime())) {
      return escapeHtml(startedAt);
    }
    return escapeHtml(
      d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    );
  }

  /**
   * Builds the HTML for a severity chip, applying the modifier class that
   * corresponds to the outage severity so each level is visually distinct
   * (Requirement 10.2).
   * @param {string} severity - "critical" | "major" | "minor".
   * @returns {string}
   */
  function severityChipHtml(severity) {
    var modifier = SEVERITY_MODIFIER[severity] || "";
    return (
      '<span class="severity-chip ' +
      modifier +
      '">' +
      escapeHtml(severity) +
      "</span>"
    );
  }

  /**
   * Builds the HTML for the PSAP status badge cell. Reads `outage.psapStatus`
   * (annotated by the app from the linked PSAP record); shows a dash when it is
   * unavailable so the row stays robust.
   */
  function psapStatusCellHtml(outage) {
    var status = outage && outage.psapStatus;
    if (!status) {
      return '<span class="psap-badge psap-badge--none">\u2014</span>';
    }
    var label = PSAP_STATUS_LABEL[status] || status;
    return (
      '<span class="psap-badge psap-badge--' +
      escapeHtml(status) +
      '">' +
      escapeHtml(label) +
      "</span>"
    );
  }

  /**
   * Builds the small "revised down after investigation" badge shown when an
   * outage's estimate was reassessed lower (task 4a). Empty string otherwise.
   */
  function revisedBadgeHtml(outage) {
    if (!outage || !outage.reassessed) {
      return "";
    }
    var was = formatNumber(outage.initialLostUsers);
    var now = formatNumber(outage.currentLostUsers);
    return (
      ' <span class="revised-badge" title="Estimate revised lower after ' +
      'investigation: was ' +
      was +
      " \u2192 now " +
      now +
      '">Revised \u2193</span>'
    );
  }

  /**
   * Builds the HTML for a single outage table row (Requirement 10.1).
   * @param {Object} outage
   * @returns {string}
   */
  function rowHtml(outage) {
    var reportable = isReportable(outage);
    var reportableBadge = reportable
      ? ' <span class="fcc-badge" title="At/over 900k lost users — must be reported to the FCC and 911/PSAP">FCC</span>'
      : "";
    return (
      "<tr" +
      ' data-outage-id="' +
      escapeHtml(outage.id) +
      '"' +
      (reportable ? ' class="row--reportable"' : "") +
      ">" +
      '<td class="outage-name">' +
      escapeHtml(outage.name) +
      reportableBadge +
      revisedBadgeHtml(outage) +
      "</td>" +
      '<td class="outage-region">' +
      escapeHtml(outage.region) +
      "</td>" +
      '<td class="outage-cause">' +
      escapeHtml(outage.cause == null ? "\u2014" : outage.cause) +
      "</td>" +
      '<td class="num">' +
      formatNumber(outage.currentLostUsers) +
      "</td>" +
      '<td class="num">' +
      formatNumber(outage.growthRatePerMin) +
      "</td>" +
      "<td>" +
      severityChipHtml(outage.severity) +
      "</td>" +
      "<td>" +
      psapStatusCellHtml(outage) +
      "</td>" +
      "<td>" +
      formatStartTime(outage.startedAt) +
      "</td>" +
      "</tr>"
    );
  }

  /**
   * Builds a single per-column filter control cell for the filter row.
   */
  function filterCellHtml(col) {
    var f = col.filter;
    if (!f) {
      return "<th></th>";
    }
    if (f.type === "text") {
      return (
        '<th><input type="search" class="col-filter col-filter--text" ' +
        'data-col-filter="' +
        escapeHtml(f.key) +
        '" placeholder="' +
        escapeHtml(f.placeholder || "Filter") +
        '" aria-label="Filter by ' +
        escapeHtml(col.label) +
        '" /></th>'
      );
    }
    // select
    var opts =
      '<option value="all">All</option>' +
      f.options
        .map(function (value) {
          var label = (f.labels && f.labels[value]) || value;
          return (
            '<option value="' +
            escapeHtml(value) +
            '">' +
            escapeHtml(label) +
            "</option>"
          );
        })
        .join("");
    return (
      '<th><select class="col-filter col-filter--select" data-col-filter="' +
      escapeHtml(f.key) +
      '" aria-label="Filter by ' +
      escapeHtml(col.label) +
      '">' +
      opts +
      "</select></th>"
    );
  }

  /**
   * Builds the table skeleton (header row + per-column filter row + empty
   * tbody). Rendered ONCE per container so the filter inputs keep their values
   * and focus across the tbody refreshes that happen on every drift tick.
   */
  function buildSkeleton(container) {
    var headerCells = COLUMNS.map(function (col) {
      var info = COLUMN_TIPS[col.label] ? tip(COLUMN_TIPS[col.label]) : "";
      return "<th>" + escapeHtml(col.label) + info + "</th>";
    }).join("");

    var filterCells = COLUMNS.map(filterCellHtml).join("");

    container.innerHTML =
      '<table class="outage-table">' +
      "<thead>" +
      "<tr>" +
      headerCells +
      "</tr>" +
      '<tr class="outage-table__filters">' +
      filterCells +
      "</tr>" +
      "</thead>" +
      "<tbody></tbody>" +
      "</table>";
  }

  /**
   * Renders the outage table into the given container.
   *
   * Builds the header + per-column filter row once (so the filter inputs are
   * preserved across ticks), then refreshes only the <tbody> with one row per
   * outage (Requirement 10.1). With an empty list, the tbody shows a neutral
   * empty-state row with zero data rows (Requirement 14.4).
   *
   * @param {Array<Object>} outages - list of outage records to display.
   * @param {string} [containerId="outage-table"] - id of the container element.
   * @returns {HTMLElement|null} the container element, or null if not found.
   */
  function renderOutageTable(outages, containerId) {
    var id = containerId || DEFAULT_CONTAINER_ID;
    var container =
      typeof document !== "undefined" ? document.getElementById(id) : null;
    if (!container) {
      return null;
    }

    var list = Array.isArray(outages) ? outages : [];

    // Build (or rebuild) the skeleton only when the table is missing, so the
    // filter row survives tbody refreshes on each tick.
    var table = container.querySelector("table.outage-table");
    if (!table) {
      buildSkeleton(container);
      table = container.querySelector("table.outage-table");
    }

    var tbody = table.querySelector("tbody");
    if (!tbody) {
      return container;
    }

    if (list.length === 0) {
      // Empty state (Requirement 14.4): zero data rows + a neutral message.
      tbody.innerHTML =
        '<tr class="table-empty-row"><td colspan="' +
        COLUMN_COUNT +
        '"><div class="table-empty">No active outages</div></td></tr>';
      return container;
    }

    tbody.innerHTML = list
      .map(function (outage) {
        return rowHtml(outage);
      })
      .join("");

    return container;
  }

  var api = {
    renderOutageTable: renderOutageTable,
  };

  // Attach to the browser global so app.js (task 16.1) can render/refresh the
  // table on load and on each live-drift tick.
  global.OutageTable = api;

  // NOTE: intentionally NO dual-mode `module.exports` footer. outageTable.js is
  // a browser/DOM-only module (it reads `document`), so it is never imported by
  // the Node/Vitest suite.
})(typeof window !== "undefined" ? window : this);
