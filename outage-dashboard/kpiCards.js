/*
 * kpiCards.js — KPI summary cards for the Spectrum outage dashboard mockup.
 *
 * Renders exactly four `.kpi-card` elements into the `#kpi-row` container from
 * a DashboardSummary (produced by window.Summary.computeSummary) plus the
 * outage list used to identify the fastest-growing outage by name:
 *
 *   1. "Active outages"   -> summary.activeOutageCount
 *   2. "Users affected"   -> summary.totalLostUsers (thousands separators)
 *   3. "Fastest-growing"  -> name of the outage whose growthRatePerMin equals
 *                            summary.peakGrowthRatePerMin, with its growth rate
 *                            (users/min) as the sub-line; an em dash / "no
 *                            fastest-growing outage" when the set is empty
 *   4. "Users by network" -> per-network (Spectrum) lost-user breakdown row
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 14.3.
 *
 * Buildless + browser/DOM-only: loaded via a plain <script> tag in index.html
 * and attaches its API to `window.KpiCards`. Unlike the pure logic modules,
 * this component touches the DOM, so it uses NO Node/Vitest dual-mode export
 * footer and must never be imported by the test runner.
 */
(function (global) {
  "use strict";

  var DEFAULT_CONTAINER_ID = "kpi-row";
  var EM_DASH = "\u2014";

  var doc = global.document;

  // Shared constants (for the FCC reportable check). Browser global first,
  // Node require fallback so behavior matches the rest of the app.
  var C =
    (global && global.DashboardConstants) ||
    (typeof require !== "undefined" ? require("./constants") : undefined);

  /**
   * Counts how many outages have crossed the 900k FCC/911 reporting threshold.
   * @param {Array} outages
   * @returns {number}
   */
  function countReportable(outages) {
    if (!Array.isArray(outages)) {
      return 0;
    }
    var isReportable =
      C && C.isReportable
        ? C.isReportable
        : function (o) {
            return !!o && o.currentLostUsers >= 900000;
          };
    return outages.filter(isReportable).length;
  }

  /**
   * Formats a number with locale thousands separators, guarding against
   * missing / non-finite values (treated as 0) so a stray field can never
   * break the render.
   * @param {number} value
   * @returns {string}
   */
  function formatNumber(value) {
    var n = typeof value === "number" && isFinite(value) ? value : 0;
    return n.toLocaleString();
  }

  /**
   * Creates an element with an optional class and text content.
   * @param {string} tag
   * @param {string} [className]
   * @param {string} [text]
   * @returns {HTMLElement}
   */
  function el(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text != null) {
      node.textContent = text;
    }
    return node;
  }

  /**
   * Builds a simple KPI card with a label, a headline value, and an optional
   * sub-line.
   * @param {string} label
   * @param {string} value
   * @param {string} [sub]
   * @returns {HTMLElement}
   */
  function buildValueCard(label, value, sub) {
    var card = el("div", "kpi-card");
    card.appendChild(el("span", "kpi-card__label", label));
    card.appendChild(el("span", "kpi-card__value", value));
    if (sub != null) {
      card.appendChild(el("span", "kpi-card__sub", sub));
    }
    return card;
  }

  /**
   * Finds the fastest-growing outage: the outage whose growthRatePerMin equals
   * the summary's peak growth rate (Requirement 9.3). Returns null for an empty
   * or missing list so the caller can render the empty state (Req 9.5).
   * @param {Array} outages
   * @param {number} peakGrowthRatePerMin
   * @returns {Object|null}
   */
  function findFastestGrowing(outages, peakGrowthRatePerMin) {
    if (!Array.isArray(outages) || outages.length === 0) {
      return null;
    }
    var peak = typeof peakGrowthRatePerMin === "number" && isFinite(peakGrowthRatePerMin)
      ? peakGrowthRatePerMin
      : 0;
    for (var i = 0; i < outages.length; i++) {
      var o = outages[i];
      if (o && o.growthRatePerMin === peak) {
        return o;
      }
    }
    // Fallback: no exact match (shouldn't happen for a well-formed summary) —
    // pick the outage with the largest growth rate so the card stays useful.
    var best = null;
    for (var j = 0; j < outages.length; j++) {
      var cand = outages[j];
      if (!cand) {
        continue;
      }
      var g = typeof cand.growthRatePerMin === "number" && isFinite(cand.growthRatePerMin)
        ? cand.growthRatePerMin
        : 0;
      if (best === null || g > best.growth) {
        best = { outage: cand, growth: g };
      }
    }
    return best ? best.outage : null;
  }

  /**
   * Builds the "Fastest-growing" card. When an outage is found its name is the
   * headline value and its growth rate (users/min) is the sub-line. When the
   * set is empty the value is an em dash and the sub-line reads "no
   * fastest-growing outage" (Req 9.5, 14.3).
   * @param {Object|null} outage
   * @returns {HTMLElement}
   */
  function buildFastestCard(outage) {
    if (!outage) {
      return buildValueCard("Fastest-growing", EM_DASH, "no fastest-growing outage");
    }
    var name = outage.name != null ? String(outage.name) : EM_DASH;
    var growth = typeof outage.growthRatePerMin === "number" && isFinite(outage.growthRatePerMin)
      ? outage.growthRatePerMin
      : 0;
    var sub = formatNumber(growth) + " users/min";
    return buildValueCard("Fastest-growing", name, sub);
  }

  /**
   * Builds one breakdown row (swatch + network name on the left, lost-user sum
   * on the right). A missing/non-finite value renders as 0.
   * @param {string} network - "Spectrum"
   * @param {string} swatchModifier - "spectrum"
   * @param {number} value
   * @returns {HTMLElement}
   */
  function buildBreakdownRow(network, swatchModifier, value) {
    var row = el("div", "kpi-breakdown__row");

    var name = el("span", "kpi-breakdown__name");
    name.appendChild(
      el("span", "kpi-breakdown__swatch kpi-breakdown__swatch--" + swatchModifier)
    );
    name.appendChild(doc.createTextNode(network));
    row.appendChild(name);

    row.appendChild(el("span", "kpi-breakdown__value", formatNumber(value)));
    return row;
  }

  /**
   * Builds the per-network breakdown card from the per-network sums (Req 9.4).
   * The product is a single Spectrum network, so this shows just the Spectrum
   * row. A missing sum defaults to 0 (Req 6.4 / empty set), so it never throws
   * even if an old "Cox" key is absent.
   * @param {Object} byNetwork - { Spectrum: number }
   * @returns {HTMLElement}
   */
  function buildBreakdownCard(byNetwork) {
    var breakdown = byNetwork || {};
    var card = el("div", "kpi-card");
    card.appendChild(el("span", "kpi-card__label", "Users by network"));

    var body = el("div", "kpi-breakdown");
    body.appendChild(buildBreakdownRow("Spectrum", "spectrum", breakdown.Spectrum));
    card.appendChild(body);
    return card;
  }

  /**
   * Renders the four KPI cards into the container.
   *
   * @param {Object} summary - DashboardSummary from computeSummary. Fields:
   *   activeOutageCount, totalLostUsers, peakGrowthRatePerMin,
   *   lostUsersByNetwork: { Spectrum }.
   * @param {Array} [outages] - the outage list, used to resolve the
   *   fastest-growing outage's name. When empty/omitted the fastest-growing
   *   card shows the empty state.
   * @param {string} [containerId] - target container id; defaults to "kpi-row".
   */
  function renderKpiCards(summary, outages, containerId) {
    if (!doc) {
      return;
    }
    var id = containerId || DEFAULT_CONTAINER_ID;
    var container = doc.getElementById(id);
    if (!container) {
      return;
    }

    var s = summary || {};
    var list = Array.isArray(outages) ? outages : [];

    // Clear any previously-rendered cards so re-renders (live-drift ticks)
    // replace rather than append.
    container.innerHTML = "";

    // Card 1: Active outages (Req 9.1, 9.2, 9.5, 14.3).
    container.appendChild(
      buildValueCard("Active outages", formatNumber(s.activeOutageCount))
    );

    // Card 2: FCC reportable count — outages at/over the 900k threshold. Prefer
    // the summary's reportableCount; fall back to counting the list directly.
    // The card is styled as an alert when the count is greater than 0.
    var reportableCount =
      s && typeof s.reportableCount === "number"
        ? s.reportableCount
        : countReportable(list);
    var reportableCard = buildValueCard(
      "Reportable \u00B7 FCC",
      formatNumber(reportableCount),
      reportableCount > 0 ? "report to FCC & 911/PSAP" : "none \u2265 900k"
    );
    if (reportableCount > 0) {
      reportableCard.className = "kpi-card kpi-card--alert";
    }
    container.appendChild(reportableCard);

    // Card 2: Users affected / total lost users (Req 9.2, 14.3).
    container.appendChild(
      buildValueCard("Users affected", formatNumber(s.totalLostUsers))
    );

    // Card 3: Fastest-growing outage (Req 9.3, 9.5, 14.3).
    var fastest = list.length > 0 ? findFastestGrowing(list, s.peakGrowthRatePerMin) : null;
    container.appendChild(buildFastestCard(fastest));

    // Card 4: per-network (Spectrum) breakdown (Req 9.4).
    container.appendChild(buildBreakdownCard(s.lostUsersByNetwork));
  }

  // Attach to the browser global so <script>-loaded modules (app.js) can call
  // it. No Node/Vitest dual-mode footer: this is a DOM-only component and must
  // not be imported by the test runner.
  global.KpiCards = {
    renderKpiCards: renderKpiCards,
  };
})(typeof window !== "undefined" ? window : this);
