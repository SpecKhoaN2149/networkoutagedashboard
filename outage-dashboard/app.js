/*
 * app.js — Entry point for the Spectrum + Cox outage dashboard mockup.
 *
 * Wires the dashboard together (task 16.1):
 *   - On load: read the seed outages once, compute the summary, and render the
 *     map bubbles, legend, KPI cards, outage table, trend sparkline, and header
 *     all from that SAME single outage list.
 *   - Live drift: a single fixed repeating timer (interval in the [2000, 10000]
 *     ms range) calls Drift.tickOutages, recomputes the summary, appends exactly
 *     one trend point, and refreshes the map bubbles, KPI cards, outage table,
 *     sparkline, and last-updated timestamp — all from the single updated list
 *     produced by that tick (Req 12.5). The timestamp is updated synchronously
 *     inside the tick handler, well within 1 second of the tick (Req 8.4).
 *
 * Browser/DOM-only: loaded last via a plain <script> tag in index.html. It has
 * NO Node/Vitest dual-mode export footer and must never be imported by the test
 * runner.
 *
 * Requirements: 12.1, 12.5, 8.4, 10.3, 11.2
 */
(function () {
  "use strict";

  // Live-drift tick interval. Requirement 12.1 mandates a fixed repeating
  // interval between 2 and 10 seconds inclusive; 3000ms sits comfortably in
  // that range.
  var TICK_INTERVAL_MS = 3000;

  // Map container id (see index.html: <div id="map">).
  var MAP_CONTAINER_ID = "map";

  /**
   * Invoke `fn` guarded so that a single missing global or a thrown error in
   * one piece of the dashboard does not halt the rest of the wiring. Any error
   * is reported to the console but swallowed so the remaining renders proceed.
   *
   * @param {string} label  Human-readable label for diagnostics.
   * @param {Function} fn   Work to perform.
   * @returns {*} Whatever `fn` returns, or undefined if it was skipped/threw.
   */
  function safely(label, fn) {
    try {
      return fn();
    } catch (err) {
      // Non-fatal: log and continue so one bad piece does not break the board.
      if (typeof console !== "undefined" && console.error) {
        console.error("[dashboard] " + label + " failed:", err);
      }
      return undefined;
    }
  }

  /**
   * Resolve a browser global (namespace) by name, returning null when it is not
   * present so callers can no-op instead of throwing.
   *
   * @param {string} name
   * @returns {object|null}
   */
  function ns(name) {
    return (typeof window !== "undefined" && window[name]) || null;
  }

  // Id of the on-map FCC reportable alert overlay (see index.html: the
  // absolutely-positioned <div id="fcc-alert"> inside .map-panel).
  var FCC_ALERT_ID = "fcc-alert";

  /**
   * Shows/hides the on-map FCC reportable alert overlay based on how many
   * outages have crossed the 900k FCC/911 reporting threshold. It is an
   * absolutely-positioned pill over the map, so showing/hiding it never shifts
   * any other page content. When one or more outages are reportable it shows
   * the count as a compact, pulsing, clickable toast; otherwise it is hidden.
   * Guarded so a missing element/global never throws.
   *
   * @param {Array} list - the current outage list.
   */
  function updateFccBanner(list) {
    safely("updateFccBanner", function () {
      if (typeof document === "undefined") return;
      var alertEl = document.getElementById(FCC_ALERT_ID);
      if (!alertEl) return;

      var C = ns("DashboardConstants");
      var isReportable =
        C && C.isReportable
          ? C.isReportable
          : function (o) {
              return !!o && o.currentLostUsers >= 900000;
            };

      var reportable = (Array.isArray(list) ? list : []).filter(isReportable);

      if (reportable.length === 0) {
        alertEl.hidden = true;
        alertEl.innerHTML = "";
        return;
      }

      var InfoTip = ns("InfoTip");
      var thresholdTip =
        InfoTip && InfoTip.infoTipHtml
          ? InfoTip.infoTipHtml(
              "Outages affecting 900,000 or more users must be reported to " +
                "the FCC (NORS) and the local 911/PSAP authorities."
            )
          : "";

      // Compact pill/toast: icon + count + short label + "click for details".
      // The affected outage names are intentionally omitted so the overlay
      // stays small enough to sit comfortably over the map.
      alertEl.innerHTML =
        '<span class="fcc-alert__icon">\u26A0</span>' +
        '<span class="fcc-alert__count">' +
        reportable.length +
        "</span>" +
        '<span class="fcc-alert__label">FCC reportable (\u2265900k)' +
        thresholdTip +
        "</span>" +
        '<span class="fcc-alert__hint">details \u2192</span>';
      alertEl.hidden = false;
    });
  }

  function init() {
    // Single source of truth for the outage list. Every render on load — and
    // every refresh on tick — is derived from this one array.
    var outages = safely("MockData.getMockOutages", function () {
      var MockData = ns("MockData");
      return MockData ? MockData.getMockOutages() : [];
    }) || [];

    // Id of the outage currently shown in the right-hand detail panel, or null
    // when nothing is selected. Kept in sync across map/table selections and
    // re-resolved from the updated list on each drift tick.
    var selectedId = null;

    /**
     * Looks up an outage in the current list by id.
     * @param {string} id
     * @returns {Object|null}
     */
    function findOutageById(id) {
      if (!id) return null;
      for (var i = 0; i < outages.length; i++) {
        if (outages[i] && outages[i].id === id) {
          return outages[i];
        }
      }
      return null;
    }

    /**
     * Applies the `.is-selected` highlight to the matching outage table row,
     * clearing it from any previously-selected row.
     */
    function highlightTableRow(id) {
      if (typeof document === "undefined") return;
      var table = document.getElementById("outage-table");
      if (!table || !table.querySelectorAll) return;
      var rows = table.querySelectorAll("tr[data-outage-id]");
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.getAttribute("data-outage-id") === id) {
          row.classList.add("is-selected");
        } else {
          row.classList.remove("is-selected");
        }
      }
    }

    /**
     * Selects an outage: records it as the current selection, renders it in the
     * detail panel, and highlights its table row. Passing a falsy value clears
     * the selection back to the empty state.
     */
    function selectOutage(outage) {
      selectedId = outage && outage.id ? outage.id : null;
      // Re-resolve from the current list so we always render the freshest
      // record (map marker click handlers may capture an older reference).
      var current = selectedId ? findOutageById(selectedId) || outage : null;
      safely("DetailPanel.render (select)", function () {
        var DetailPanel = ns("DetailPanel");
        if (!DetailPanel) return;
        if (current) {
          DetailPanel.render(current);
        } else {
          DetailPanel.renderEmpty();
        }
      });
      highlightTableRow(selectedId);
    }

    function computeSummary(list) {
      return safely("Summary.computeSummary", function () {
        var Summary = ns("Summary");
        return Summary ? Summary.computeSummary(list) : null;
      });
    }

    // --- Shared filter state ------------------------------------------------
    // Drives BOTH the outage table (which rows render) and the map (which
    // bubbles are visible). Defaults are permissive so everything shows.
    var filter = { severity: "all", reportableOnly: false, search: "" };

    // Current map display mode: "bubbles" (default) or "heatmap". Remembered
    // across filter changes and live-drift ticks so the heat layer keeps
    // refreshing from the current filtered list while the toggle stays put.
    var mapMode = "bubbles";

    // Per-column table filters (task 3). Layered ON TOP of the shared filter,
    // applied to the TABLE ONLY. Read live from the table's filter row.
    var columnFilters = {};

    // Index of PSAP status by outage, so table rows can show/filter the linked
    // PSAP status. Built once (statuses are static seed data).
    var psapIndex = (function () {
      var byOutage = {};
      var byPsapId = {};
      var PsapData = ns("PsapData");
      if (PsapData && typeof PsapData.getPsaps === "function") {
        PsapData.getPsaps().forEach(function (p) {
          byPsapId[p.id] = p.status;
          if (p.linkedOutageId) byOutage[p.linkedOutageId] = p.status;
        });
      }
      return { byOutage: byOutage, byPsapId: byPsapId };
    })();

    /**
     * Returns copies of the outages annotated with `psapStatus` resolved from
     * the linked PSAP record (by outage id, falling back to psapId).
     */
    function annotateWithPsap(list) {
      return (Array.isArray(list) ? list : []).map(function (o) {
        var status = psapIndex.byOutage[o.id];
        if (!status && o.psapId) {
          status = psapIndex.byPsapId[o.psapId];
        }
        var copy = {};
        for (var k in o) {
          if (Object.prototype.hasOwnProperty.call(o, k)) copy[k] = o[k];
        }
        copy.psapStatus = status || null;
        return copy;
      });
    }

    /**
     * Reads the per-column filter-row controls in the outage table into
     * `columnFilters`. No-op if the DOM/controls are absent.
     */
    function readColumnFilters() {
      if (typeof document === "undefined") return;
      var table = document.getElementById("outage-table");
      if (!table || !table.querySelectorAll) return;
      var inputs = table.querySelectorAll("[data-col-filter]");
      var next = {};
      for (var i = 0; i < inputs.length; i++) {
        var key = inputs[i].getAttribute("data-col-filter");
        if (key) next[key] = inputs[i].value;
      }
      columnFilters = next;
    }

    /**
     * Reads the current filter values from the dashboard filter-bar controls
     * into the module-scoped `filter` state. No-op if the DOM/controls are
     * absent.
     */
    function readFilterControls() {
      if (typeof document === "undefined") return;
      var sev = document.getElementById("filter-severity");
      var rep = document.getElementById("filter-reportable");
      var search = document.getElementById("filter-search");
      filter = {
        severity: sev ? sev.value : "all",
        reportableOnly: rep ? !!rep.checked : false,
        search: search ? search.value : "",
      };
    }

    /**
     * Returns the current outage list narrowed by the active filter via the
     * pure OutageFilters helper. Falls back to the full list if the helper is
     * unavailable.
     */
    function getFilteredOutages() {
      var OF = ns("OutageFilters");
      if (OF && OF.filterOutages) {
        return OF.filterOutages(outages, filter);
      }
      return outages;
    }

    /**
     * Builds a Set of ids present in `list` for map visibility toggling.
     */
    function idSetOf(list) {
      var set = {};
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id) {
          set[list[i].id] = true;
        }
      }
      return set;
    }

    /**
     * Updates the "showing X of Y" count next to the filter bar.
     */
    function updateFilterCount(shown, total) {
      if (typeof document === "undefined") return;
      var el = document.getElementById("filter-count");
      if (!el) return;
      if (shown === total) {
        el.textContent =
          "Showing all " + total + " outage" + (total === 1 ? "" : "s");
      } else {
        el.textContent = "Showing " + shown + " of " + total + " outages";
      }
    }

    /**
     * Applies the current filter to both views: re-renders the outage table
     * with the filtered subset and toggles map bubble visibility to match
     * (without tearing markers down). Re-applies the row selection highlight
     * since the table body was just replaced. Reused on control change and on
     * every drift tick (so drifting values that cross the reportable filter
     * update visibility).
     */
    function applyFilter() {
      // Shared dashboard filter governs the MAP (Req: map stays on the shared
      // filter). The per-column table filters apply to the TABLE only, layered
      // on top of the shared subset.
      var filtered = getFilteredOutages();
      var annotated = annotateWithPsap(filtered);

      var tableRows = annotated;
      var OF = ns("OutageFilters");
      if (OF && OF.filterOutagesByColumns) {
        tableRows = OF.filterOutagesByColumns(annotated, columnFilters);
      }

      safely("OutageTable.renderOutageTable (filter)", function () {
        var OutageTable = ns("OutageTable");
        if (OutageTable) OutageTable.renderOutageTable(tableRows);
      });

      safely("MapRenderer.applyVisibility", function () {
        var MapRenderer = ns("MapRenderer");
        if (MapRenderer && MapRenderer.applyVisibility && mapHandle) {
          MapRenderer.applyVisibility(mapHandle, idSetOf(filtered));
        }
      });

      // In Heatmap mode, rebuild the heat points from the current filtered
      // list so the heatmap tracks filter changes and live drift.
      if (mapMode === "heatmap") {
        safely("MapRenderer.updateHeatmap (filter)", function () {
          var MapRenderer = ns("MapRenderer");
          if (MapRenderer && MapRenderer.updateHeatmap && mapHandle) {
            MapRenderer.updateHeatmap(mapHandle, filtered);
          }
        });
      }

      updateFilterCount(tableRows.length, outages.length);

      // The table rows were re-rendered — re-apply the current selection.
      if (selectedId !== null) {
        highlightTableRow(selectedId);
      }
    }

    var summary = computeSummary(outages);

    // --- Initial render: map ------------------------------------------------
    // initMap returns a handle we keep for in-place bubble updates on tick.
    var mapHandle = safely("MapRenderer.initMap", function () {
      var MapRenderer = ns("MapRenderer");
      return MapRenderer ? MapRenderer.initMap(MAP_CONTAINER_ID) : null;
    });

    // Clicking a bubble selects that outage and renders it in the detail
    // panel (the primary detail view now that popups are secondary).
    safely("MapRenderer.setSelectHandler", function () {
      var MapRenderer = ns("MapRenderer");
      if (MapRenderer && MapRenderer.setSelectHandler) {
        MapRenderer.setSelectHandler(function (outage) {
          selectOutage(outage);
        });
      }
    });

    safely("MapRenderer.renderOutages", function () {
      var MapRenderer = ns("MapRenderer");
      if (MapRenderer && mapHandle) {
        MapRenderer.renderOutages(mapHandle, outages);
      }
    });

    // --- Wire the on-map "Bubbles | Heatmap" toggle ------------------------
    // Switching to Heatmap hides the bubbles and shows a heat layer built from
    // the current filtered list; switching back removes the heat layer and
    // restores the bubbles. The chosen mode is remembered in `mapMode` so the
    // heatmap keeps refreshing on filter changes and drift ticks.
    safely("MapRenderer.addMapModeToggle", function () {
      var MapRenderer = ns("MapRenderer");
      if (!MapRenderer || !MapRenderer.addMapModeToggle || !mapHandle) {
        return;
      }
      MapRenderer.addMapModeToggle(mapHandle, function (mode) {
        mapMode = mode === "heatmap" ? "heatmap" : "bubbles";
        if (mapMode === "heatmap") {
          if (MapRenderer.showHeatmap) {
            MapRenderer.showHeatmap(mapHandle, getFilteredOutages());
          }
        } else if (MapRenderer.hideHeatmap) {
          MapRenderer.hideHeatmap(mapHandle);
        }
      });
    });

    // --- Initial render: legend --------------------------------------------
    // renderLegend defaults to the shared legend model + #legend container.
    safely("LegendView.renderLegend", function () {
      var LegendView = ns("LegendView");
      if (LegendView) LegendView.renderLegend();
    });

    // --- Initial render: outage table --------------------------------------
    safely("OutageTable.renderOutageTable", function () {
      var OutageTable = ns("OutageTable");
      if (OutageTable) OutageTable.renderOutageTable(outages);
    });

    // --- Initial render: detail panel (empty state) ------------------------
    safely("DetailPanel.renderEmpty", function () {
      var DetailPanel = ns("DetailPanel");
      if (DetailPanel) DetailPanel.renderEmpty();
    });

    // --- Initial render: header --------------------------------------------
    safely("Header.renderHeader", function () {
      var Header = ns("Header");
      if (Header) Header.renderHeader(summary, new Date());
    });

    // --- Initial render: FCC reportable banner -----------------------------
    updateFccBanner(outages);

    // --- Wire the FCC details modal trigger --------------------------------
    // Clicking the alert banner opens the FCC details modal with the current
    // outage list. (The FCC modal is now opened only from the banner.)
    safely("wire FCC modal trigger", function () {
      var ReportModal = ns("ReportModal");
      if (!ReportModal || typeof document === "undefined") return;

      var alertEl = document.getElementById(FCC_ALERT_ID);
      if (alertEl) {
        alertEl.addEventListener("click", function () {
          ReportModal.open(outages);
        });
      }
    });

    // --- Wire outage-table row selection -----------------------------------
    // Clicking a table row selects the corresponding outage (looked up by its
    // data-outage-id) and renders it in the detail panel. Delegated because the
    // table body is re-rendered on every drift tick.
    safely("wire outage table selection", function () {
      if (typeof document === "undefined") return;
      var table = document.getElementById("outage-table");
      if (!table) return;
      table.addEventListener("click", function (evt) {
        var row = evt.target && evt.target.closest
          ? evt.target.closest("tr[data-outage-id]")
          : null;
        if (!row) return;
        var id = row.getAttribute("data-outage-id");
        var outage = findOutageById(id);
        if (outage) {
          selectOutage(outage);
        }
      });
    });

    // --- Wire the shared filter bar ----------------------------------------
    // Any control change re-reads the filter state and re-applies it to both
    // the table and the map. Search uses `input` for responsive typing.
    safely("wire dashboard filter", function () {
      if (typeof document === "undefined") return;
      var sev = document.getElementById("filter-severity");
      var rep = document.getElementById("filter-reportable");
      var search = document.getElementById("filter-search");

      function onFilterChange() {
        readFilterControls();
        applyFilter();
      }

      if (sev) sev.addEventListener("change", onFilterChange);
      if (rep) rep.addEventListener("change", onFilterChange);
      if (search) search.addEventListener("input", onFilterChange);
    });

    // --- Wire the per-column table filter row ------------------------------
    // Delegated on the table container so it survives tbody re-renders on each
    // tick. Text inputs use `input` (responsive typing); selects use `change`.
    safely("wire outage column filters", function () {
      if (typeof document === "undefined") return;
      var table = document.getElementById("outage-table");
      if (!table) return;

      function onColumnFilterChange(evt) {
        var t = evt.target;
        if (!t || !t.getAttribute || !t.getAttribute("data-col-filter")) {
          return;
        }
        readColumnFilters();
        applyFilter();
      }

      table.addEventListener("input", onColumnFilterChange);
      table.addEventListener("change", onColumnFilterChange);
    });

    // --- Wire detail-panel related-outage selection ------------------------
    // Clicking a related outage (or any element carrying data-outage-id) inside
    // the detail panel selects that outage. Delegated because the panel is
    // re-rendered on selection and on each drift tick.
    safely("wire detail panel related selection", function () {
      if (typeof document === "undefined") return;
      var panel = document.getElementById("detail-panel");
      if (!panel) return;
      panel.addEventListener("click", function (evt) {
        var el = evt.target && evt.target.closest
          ? evt.target.closest("[data-outage-id]")
          : null;
        if (!el) return;
        var id = el.getAttribute("data-outage-id");
        var outage = findOutageById(id);
        if (outage) {
          selectOutage(outage);
        }
      });
    });

    // Initial filter pass: syncs the count indicator and (harmlessly, since the
    // defaults are permissive) the table/map with the starting filter state.
    readFilterControls();
    readColumnFilters();
    applyFilter();

    // --- Live drift ---------------------------------------------------------
    // A single repeating timer. Each tick produces ONE updated list and every
    // component refresh below reads from that same `outages` reference so the
    // dashboard stays in sync (Req 12.5).
    function tick() {
      var Drift = ns("Drift");
      if (!Drift) return; // No drift module -> dashboard stays on seed data.

      var next = safely("Drift.tickOutages", function () {
        return Drift.tickOutages(outages);
      });
      if (!next) return; // Skip this tick if drift failed; try again next time.

      // Commit the single updated list as the new source of truth.
      outages = next;
      summary = computeSummary(outages);

      // Refresh the map bubbles in place from the updated list.
      safely("MapRenderer.updateOutages", function () {
        var MapRenderer = ns("MapRenderer");
        if (MapRenderer && mapHandle) {
          MapRenderer.updateOutages(mapHandle, outages);
        }
      });

      // Refresh the outage table + map visibility from the same list, narrowed
      // by the active filter (Req 10.3). Recomputing the filtered id set each
      // tick means drifting values that cross the reportable threshold update
      // their bubble visibility live.
      applyFilter();

      // Keep the currently-selected outage's detail panel fresh. The table was
      // just re-rendered, so re-apply the row highlight too. If the selected
      // outage is gone, fall back to the empty state.
      safely("DetailPanel refresh (tick)", function () {
        if (selectedId === null) return;
        var current = findOutageById(selectedId);
        var DetailPanel = ns("DetailPanel");
        if (DetailPanel) {
          if (current) {
            DetailPanel.render(current);
          } else {
            DetailPanel.renderEmpty();
          }
        }
        if (current) {
          highlightTableRow(selectedId);
        } else {
          selectedId = null;
        }
      });

      // Update the last-updated timestamp synchronously within the tick
      // handler, so it reflects this tick well within 1 second (Req 8.4).
      safely("Header.updateLastUpdated", function () {
        var Header = ns("Header");
        if (Header) Header.updateLastUpdated(new Date());
      });

      // Refresh the FCC reportable banner as outages cross/leave 900k.
      updateFccBanner(outages);

      // Keep the FCC details modal current if it happens to be open.
      safely("ReportModal.refresh", function () {
        var ReportModal = ns("ReportModal");
        if (ReportModal) ReportModal.refresh(outages);
      });
    }

    // Start the single fixed repeating timer (Req 12.1).
    if (typeof window !== "undefined" && window.setInterval) {
      window.setInterval(tick, TICK_INTERVAL_MS);
    }
  }

  // Run after the DOM is ready. The script is at the end of <body>, but guard
  // against being parsed while the document is still loading just in case.
  if (typeof document !== "undefined" &&
      document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
