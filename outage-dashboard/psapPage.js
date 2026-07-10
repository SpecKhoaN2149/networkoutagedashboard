/*
 * psapPage.js — Renderer for the PSAP / 911 status page (psap.html) of the
 * Spectrum outage dashboard mockup.
 *
 * Renders two things into psap.html:
 *   - Summary counts by status (Acknowledged / Notified / Pending / Not
 *     required).
 *   - A table of all PSAPs joined to their linked outage, sorted so the most
 *     actionable rows (pending, then notified) surface near the top.
 *
 * Buildless / browser-only: loaded via a plain <script> tag on psap.html and
 * attaches its exports to `window.PsapPage`. It reads window.PsapData and
 * window.MockData (and window.DashboardConstants for formatting). DOM-only, so
 * NO Node/Vitest dual-mode `module.exports` footer.
 */
(function (global) {
  "use strict";

  var SUMMARY_ID = "psap-summary";
  var TABLE_ID = "psap-table";

  // Display order for the summary tiles + sort priority (lower = higher up).
  var STATUS_ORDER = ["pending", "notified", "acknowledged", "not_required"];

  var STATUS_LABEL = {
    acknowledged: "Acknowledged",
    notified: "Notified",
    pending: "Pending",
    not_required: "Not required",
  };

  // Shared constants (status list). Browser global first, Node require fallback
  // (though this DOM module is never imported by tests).
  var C =
    (global && global.DashboardConstants) ||
    (typeof require !== "undefined" ? require("./constants") : undefined);

  var PSAP_STATUSES =
    (C && C.PSAP_STATUSES) || [
      "acknowledged",
      "notified",
      "pending",
      "not_required",
    ];

  var PSAP_STATUS_TIP =
    "PSAP = the local 911 call center. Acknowledged = PSAP confirmed " +
    "receipt; Notified = report sent, awaiting acknowledgement; Pending = " +
    "not yet reported; Not required = below the 900k FCC reporting threshold.";

  // Per-status descriptions for the summary tiles' info "i".
  var STATUS_TIP = {
    acknowledged:
      "The PSAP has confirmed receipt of the outage notification.",
    notified:
      "A report has been sent to the PSAP; awaiting their acknowledgement.",
    pending:
      "This outage has not yet been reported to the PSAP.",
    not_required:
      "The outage is below the 900k FCC reporting threshold, so no PSAP " +
      "report is required.",
  };

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

  // All joined rows (PSAP + linked outage). Cached at render time so the
  // summary always reflects the FULL set while the table can filter.
  var allRows = [];

  // Per-column table filter state (task 3): PSAP name (text), County/State
  // (text), Linked outage (text), Status (select).
  var psapFilter = { name: "", countyState: "", linkedOutage: "", status: "all" };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatNumber(value) {
    var n = Number(value);
    if (!isFinite(n)) {
      return "\u2014";
    }
    return n.toLocaleString("en-US");
  }

  function formatUpdated(iso) {
    if (!iso) {
      return "\u2014";
    }
    var d = new Date(iso);
    if (isNaN(d.getTime())) {
      return escapeHtml(iso);
    }
    return escapeHtml(
      d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }

  function statusLabel(status) {
    return STATUS_LABEL[status] || status || "\u2014";
  }

  function statusBadgeHtml(status) {
    var key = status || "pending";
    return (
      '<span class="psap-badge psap-badge--' +
      escapeHtml(key) +
      '">' +
      escapeHtml(statusLabel(key)) +
      "</span>"
    );
  }

  /**
   * Builds a lookup of outageId -> outage from window.MockData so each PSAP row
   * can show its linked outage's name and current lost users.
   */
  function outageIndex() {
    var index = {};
    var MockData = global.MockData;
    if (MockData && typeof MockData.getMockOutages === "function") {
      var list = MockData.getMockOutages();
      for (var i = 0; i < list.length; i++) {
        index[list[i].id] = list[i];
      }
    }
    return index;
  }

  /**
   * Joins PSAPs with their linked outage and sorts them so actionable statuses
   * surface first (pending, then notified, then acknowledged, then
   * not_required). Ties break by descending linked-outage lost users.
   */
  function buildRows() {
    var PsapData = global.PsapData;
    if (!PsapData || typeof PsapData.getPsaps !== "function") {
      return [];
    }
    var index = outageIndex();
    var rows = PsapData.getPsaps().map(function (psap) {
      var outage = index[psap.linkedOutageId] || null;
      return {
        psap: psap,
        outage: outage,
        lostUsers: outage ? outage.currentLostUsers : 0,
      };
    });

    rows.sort(function (a, b) {
      var pa = STATUS_ORDER.indexOf(a.psap.status);
      var pb = STATUS_ORDER.indexOf(b.psap.status);
      if (pa === -1) pa = STATUS_ORDER.length;
      if (pb === -1) pb = STATUS_ORDER.length;
      if (pa !== pb) {
        return pa - pb;
      }
      return (b.lostUsers || 0) - (a.lostUsers || 0);
    });

    return rows;
  }

  /**
   * Renders the summary tiles (count per status) into #psap-summary.
   */
  function renderSummary(rows) {
    if (typeof document === "undefined") {
      return;
    }
    var container = document.getElementById(SUMMARY_ID);
    if (!container) {
      return;
    }

    var counts = { acknowledged: 0, notified: 0, pending: 0, not_required: 0 };
    rows.forEach(function (row) {
      var s = row.psap.status;
      if (counts[s] === undefined) {
        counts[s] = 0;
      }
      counts[s] += 1;
    });

    var tiles = STATUS_ORDER.map(function (status) {
      return (
        '<div class="psap-summary__tile psap-summary__tile--' +
        escapeHtml(status) +
        '">' +
        '<span class="psap-summary__count">' +
        formatNumber(counts[status] || 0) +
        "</span>" +
        '<span class="psap-summary__label">' +
        escapeHtml(statusLabel(status)) +
        tip(STATUS_TIP[status] || PSAP_STATUS_TIP) +
        "</span>" +
        "</div>"
      );
    }).join("");

    container.innerHTML = tiles;
  }

  // PSAP table column model. `filter` describes the per-column control in the
  // filter row (null => empty filter cell).
  var PSAP_COLUMNS = [
    { label: "PSAP", filter: { type: "text", key: "name", placeholder: "Filter PSAP" } },
    { label: "County / State", filter: { type: "text", key: "countyState", placeholder: "Filter county / state" } },
    { label: "Linked outage", filter: { type: "text", key: "linkedOutage", placeholder: "Filter outage" } },
    { label: "Lost users", filter: null },
    {
      label: "Status",
      tip: PSAP_STATUS_TIP,
      filter: { type: "select", key: "status", options: PSAP_STATUSES, labels: STATUS_LABEL },
    },
    { label: "Phone", filter: null },
    { label: "Last updated", filter: null },
  ];

  var PSAP_COLUMN_COUNT = PSAP_COLUMNS.length;

  /**
   * Builds a single per-column filter control cell for the PSAP filter row.
   */
  function psapFilterCellHtml(col) {
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
   * Builds the PSAP table skeleton (header row + per-column filter row + empty
   * tbody) once, so the filter inputs keep value/focus while typing.
   */
  function buildPsapSkeleton(container) {
    var headerCells = PSAP_COLUMNS.map(function (col) {
      return "<th>" + escapeHtml(col.label) + (col.tip ? tip(col.tip) : "") + "</th>";
    }).join("");
    var filterCells = PSAP_COLUMNS.map(psapFilterCellHtml).join("");

    container.innerHTML =
      '<table class="psap-table">' +
      "<thead>" +
      "<tr>" +
      headerCells +
      "</tr>" +
      '<tr class="psap-table__filters">' +
      filterCells +
      "</tr>" +
      "</thead>" +
      "<tbody></tbody>" +
      "</table>";
  }

  /**
   * Renders the PSAP table into #psap-table. Builds the header + filter row
   * once; refreshes only the tbody thereafter.
   */
  function renderTable(rows) {
    if (typeof document === "undefined") {
      return;
    }
    var container = document.getElementById(TABLE_ID);
    if (!container) {
      return;
    }

    var table = container.querySelector("table.psap-table");
    if (!table) {
      buildPsapSkeleton(container);
      table = container.querySelector("table.psap-table");
    }
    var tbody = table.querySelector("tbody");
    if (!tbody) {
      return;
    }

    if (!rows.length) {
      tbody.innerHTML =
        '<tr class="table-empty-row"><td colspan="' +
        PSAP_COLUMN_COUNT +
        '"><div class="table-empty">No matching PSAP records</div></td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (row) {
        var psap = row.psap;
        var outage = row.outage;
        var outageName = outage ? outage.name : "\u2014";
        var lost = outage ? formatNumber(outage.currentLostUsers) : "\u2014";
        return (
          "<tr>" +
          '<td class="psap-name">' +
          escapeHtml(psap.name) +
          "</td>" +
          '<td class="psap-region">' +
          escapeHtml(psap.county + ", " + psap.state) +
          "</td>" +
          "<td>" +
          escapeHtml(outageName) +
          "</td>" +
          '<td class="num">' +
          lost +
          "</td>" +
          "<td>" +
          statusBadgeHtml(psap.status) +
          "</td>" +
          '<td class="psap-phone">' +
          escapeHtml(psap.phone) +
          "</td>" +
          "<td>" +
          formatUpdated(psap.updatedAt) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  /**
   * Reads the per-column PSAP filter-row controls into `psapFilter`. No-op if
   * absent.
   */
  function readPsapFilterControls() {
    if (typeof document === "undefined") return;
    var table = document.getElementById(TABLE_ID);
    if (!table || !table.querySelectorAll) return;
    var inputs = table.querySelectorAll("[data-col-filter]");
    var next = { name: "", countyState: "", linkedOutage: "", status: "all" };
    for (var i = 0; i < inputs.length; i++) {
      var key = inputs[i].getAttribute("data-col-filter");
      if (key) next[key] = inputs[i].value;
    }
    psapFilter = next;
  }

  /**
   * Updates the "showing X of Y" count next to the PSAP filter bar.
   */
  function updatePsapCount(shown, total) {
    if (typeof document === "undefined") return;
    var el = document.getElementById("psap-filter-count");
    if (!el) return;
    if (shown === total) {
      el.textContent =
        "Showing all " + total + " PSAP" + (total === 1 ? "" : "s");
    } else {
      el.textContent = "Showing " + shown + " of " + total + " PSAPs";
    }
  }

  /**
   * Re-renders ONLY the table body for the active per-column filter, using the
   * pure `filterPsaps` helper; the summary tiles keep reflecting the full set.
   */
  function applyPsapFilter() {
    var OF = global.OutageFilters;
    var filteredRows;
    if (OF && typeof OF.filterPsaps === "function") {
      var psaps = allRows.map(function (r) {
        return r.psap;
      });
      var lookup = {};
      allRows.forEach(function (r) {
        if (r.outage) lookup[r.psap.linkedOutageId] = r.outage;
      });
      var kept = OF.filterPsaps(psaps, psapFilter, lookup);
      var keepIds = {};
      kept.forEach(function (p) {
        keepIds[p.id] = true;
      });
      filteredRows = allRows.filter(function (r) {
        return keepIds[r.psap.id];
      });
    } else {
      filteredRows = allRows;
    }
    renderTable(filteredRows);
    updatePsapCount(filteredRows.length, allRows.length);
  }

  /**
   * Renders the whole page: the summary reflects ALL PSAPs; the table reflects
   * the active filter.
   */
  function render() {
    allRows = buildRows();
    renderSummary(allRows);
    // Build the table skeleton (header + filter row), then read the (possibly
    // user-set) filter values and render the filtered body.
    renderTable(allRows);
    readPsapFilterControls();
    applyPsapFilter();
  }

  function init() {
    render();

    // Wire the per-column PSAP filter row. Delegated on the table container so
    // it survives tbody re-renders. Text inputs use `input`; selects `change`.
    if (typeof document !== "undefined") {
      var table = document.getElementById(TABLE_ID);
      if (table) {
        function onColumnFilterChange(evt) {
          var t = evt.target;
          if (!t || !t.getAttribute || !t.getAttribute("data-col-filter")) {
            return;
          }
          readPsapFilterControls();
          applyPsapFilter();
        }
        table.addEventListener("input", onColumnFilterChange);
        table.addEventListener("change", onColumnFilterChange);
      }
    }

    // Keep the last-updated header time in sync if the Header module is present.
    if (global.Header && typeof global.Header.updateLastUpdated === "function") {
      global.Header.updateLastUpdated(new Date());
    }
  }

  var api = {
    render: render,
    buildRows: buildRows,
  };

  global.PsapPage = api;

  // Auto-run on load when in a browser (the page has no other entry point).
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : this);
