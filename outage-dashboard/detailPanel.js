/*
 * detailPanel.js — Outage detail panel for the Spectrum outage dashboard
 * mockup.
 *
 * Renders the right-hand detail panel of the map row. It has two states:
 *   - Empty:    a prompt inviting the operator to pick an outage.
 *   - Selected: full details for one outage plus its PSAP / 911 reporting
 *               record (the key new information this redesign surfaces).
 *
 * The PSAP / 911 section shows a SINGLE status line — the PSAP status badge
 * (Notified / Not notified) with an info "i" that explains what the status
 * means — alongside the PSAP name and county/state.
 * (The FCC-reportable badge is shown separately and is based on the 900k
 *  threshold; PSAP notification can happen independently of that flag.)
 *
 * Buildless / browser-only: loaded via a plain <script> tag and attaches its
 * exports to `window.DetailPanel`. It reads/writes the DOM directly, so it is
 * DOM/browser-only with NO Node/Vitest dual-mode `module.exports` footer
 * (mirroring map.js / outageTable.js) and is never imported by the test runner.
 */
(function (global) {
  "use strict";

  var DEFAULT_CONTAINER_ID = "detail-panel";

  // Shared constants (FCC threshold + reportable predicate). Browser global
  // first; a Node require fallback keeps parity with the rest of the app,
  // though this DOM module is never imported by tests.
  var C =
    (global && global.DashboardConstants) ||
    (typeof require !== "undefined" ? require("./constants") : undefined);

  // Human-readable label per PSAP status.
  var STATUS_LABEL = {
    notified: "Notified",
    not_notified: "Not notified",
  };

  function isReportable(outage) {
    if (C && typeof C.isReportable === "function") {
      return C.isReportable(outage);
    }
    return !!outage && outage.currentLostUsers >= 900000;
  }

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

  function formatStartTime(startedAt) {
    if (!startedAt) {
      return "\u2014";
    }
    var d = new Date(startedAt);
    if (isNaN(d.getTime())) {
      return escapeHtml(startedAt);
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

  /**
   * Resolves the PSAP linked to an outage from window.PsapData. Prefers the
   * outage's own `psapId`, falling back to a linkedOutageId match. Returns null
   * when PsapData is unavailable or no PSAP matches.
   */
  function resolvePsap(outage) {
    var PsapData = global.PsapData;
    if (!PsapData || typeof PsapData.getPsaps !== "function" || !outage) {
      return null;
    }
    var list = PsapData.getPsaps();
    var i;
    if (outage.psapId) {
      for (i = 0; i < list.length; i++) {
        if (list[i].id === outage.psapId) {
          return list[i];
        }
      }
    }
    for (i = 0; i < list.length; i++) {
      if (list[i].linkedOutageId === outage.id) {
        return list[i];
      }
    }
    return null;
  }

  function severityChipHtml(severity) {
    var modifier = "severity-chip--" + escapeHtml(severity);
    return (
      '<span class="severity-chip ' +
      modifier +
      '">' +
      escapeHtml(severity) +
      "</span>"
    );
  }

  function statusBadgeHtml(status) {
    var key = status || "not_notified";
    var label = STATUS_LABEL[key] || key;
    return (
      '<span class="psap-badge psap-badge--' +
      escapeHtml(key) +
      '">' +
      escapeHtml(label) +
      "</span>"
    );
  }

  /**
   * Returns the reusable info-tip markup for `text`, or "" when the InfoTip
   * helper is unavailable (keeps the panel rendering robust).
   */
  function tip(text) {
    var InfoTip = global.InfoTip;
    return InfoTip && typeof InfoTip.infoTipHtml === "function"
      ? InfoTip.infoTipHtml(text)
      : "";
  }

  // Concise plain-language descriptions surfaced via the "i" tooltips.
  var TIP = {
    psapStatus:
      "PSAP = the local 911 call center. Notified = the outage has been " +
      "reported to the PSAP; Not notified = the PSAP has not been alerted yet.",
    fcc:
      "Outages affecting 900,000 or more users must be reported to the FCC " +
      "(NORS) and the local 911/PSAP authorities.",
    growth:
      "Users lost per minute — how fast the outage is growing. Drives the " +
      "bubble size on the map.",
    lostUsers:
      "Total users currently affected. Drives the bubble color (yellow \u2192 " +
      "red as it approaches the 900k FCC threshold).",
    cause:
      "The underlying cause of the outage (separate from severity).",
    ticket:
      "The trouble-ticket tracking this outage in the incident system.",
    related:
      "This is a primary ticket that groups several related outage tickets " +
      "under one incident. Click a related outage to open it.",
    revised:
      "The impact estimate was corrected lower after investigation — the " +
      "outage was initially thought larger than it turned out to be.",
    threshold:
      "The time this outage reached the 900,000-user FCC/911 reporting " +
      "threshold.",
    impact:
      "Severity of the reporting event = time at/over the 900k threshold " +
      "\u00d7 affected telephone lines (line-minutes).",
  };

  function formatThresholdTime(iso) {
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

  /**
   * Builds an id -> { name, ticketId } lookup from the seed outages so the
   * related-outages list can show a name + ticket for each related id.
   */
  function outageLabelLookup() {
    var lookup = {};
    var MockData = global.MockData;
    if (MockData && typeof MockData.getMockOutages === "function") {
      MockData.getMockOutages().forEach(function (o) {
        lookup[o.id] = { name: o.name, ticketId: o.ticketId };
      });
    }
    return lookup;
  }

  /**
   * Computes the live impact (line-minutes) for an outage, preferring the
   * shared Impact helper. Returns 0 when unavailable/not applicable.
   */
  function impactValue(outage) {
    var Impact = global.Impact;
    if (Impact && typeof Impact.computeImpact === "function") {
      return Impact.computeImpact(outage, Date.now());
    }
    return 0;
  }

  function impactText(value) {
    var Impact = global.Impact;
    if (Impact && typeof Impact.formatImpact === "function") {
      return Impact.formatImpact(value);
    }
    return String(value);
  }

  function fieldRowHtml(label, valueHtml, infoHtml) {
    return (
      '<div class="detail-row">' +
      '<span class="detail-row__key">' +
      escapeHtml(label) +
      (infoHtml || "") +
      "</span>" +
      '<span class="detail-row__val">' +
      valueHtml +
      "</span>" +
      "</div>"
    );
  }

  function resolveContainer(containerId) {
    if (typeof document === "undefined") {
      return null;
    }
    return document.getElementById(containerId || DEFAULT_CONTAINER_ID);
  }

  /**
   * Renders the empty state prompting the operator to select an outage.
   * @param {string} [containerId]
   * @returns {HTMLElement|null}
   */
  function renderEmpty(containerId) {
    var el = resolveContainer(containerId);
    if (!el) {
      return null;
    }
    el.innerHTML =
      '<div class="detail-empty">' +
      '<div class="detail-empty__icon">\uD83D\uDCCD</div>' +
      '<p class="detail-empty__text">Select an outage on the map or in the ' +
      "table to view details.</p>" +
      "</div>";
    return el;
  }

  /**
   * Renders full details for the given outage, including its PSAP / 911
   * reporting record. Falls back to the empty state when no outage is given.
   * @param {Object} outage
   * @param {string} [containerId]
   * @returns {HTMLElement|null}
   */
  function render(outage, containerId) {
    var el = resolveContainer(containerId);
    if (!el) {
      return null;
    }
    if (!outage) {
      return renderEmpty(containerId);
    }

    var reportable = isReportable(outage);
    var reportableBadge =
      '<div class="detail-fcc-row">' +
      (reportable
        ? '<span class="detail-fcc detail-fcc--yes">\u26A0 FCC REPORTABLE</span>'
        : '<span class="detail-fcc detail-fcc--no">below threshold</span>') +
      tip(TIP.fcc) +
      "</div>";

    var psap = resolvePsap(outage);

    // "Revised down after investigation" indicator (task 4a).
    var revisedHtml = "";
    if (outage.reassessed) {
      revisedHtml =
        '<div class="detail-revised">' +
        '<span class="detail-revised__badge">Revised \u2193 after ' +
        "investigation</span>" +
        tip(TIP.revised) +
        '<span class="detail-revised__detail">was ' +
        formatNumber(outage.initialLostUsers) +
        " \u2192 now " +
        formatNumber(outage.currentLostUsers) +
        "</span>" +
        "</div>";
    }

    // Reportable-only fields: threshold-reached time + live impact (tasks 4c/4d).
    var reportableFields = "";
    if (reportable) {
      reportableFields =
        fieldRowHtml(
          "Threshold reached",
          formatThresholdTime(outage.thresholdReachedAt),
          tip(TIP.threshold)
        ) +
        fieldRowHtml(
          "Impact",
          escapeHtml(impactText(impactValue(outage))),
          tip(TIP.impact)
        );
    }

    // Related-outages section for a primary ticket (task 4b).
    var relatedHtml = "";
    var relatedIds = Array.isArray(outage.relatedOutageIds)
      ? outage.relatedOutageIds
      : [];
    if (relatedIds.length > 0) {
      var labels = outageLabelLookup();
      var items = relatedIds
        .map(function (id) {
          var info = labels[id] || { name: id, ticketId: "" };
          return (
            '<li class="detail-related__item" data-outage-id="' +
            escapeHtml(id) +
            '" role="button" tabindex="0">' +
            '<span class="detail-related__name">' +
            escapeHtml(info.name) +
            "</span>" +
            '<span class="detail-related__ticket">' +
            escapeHtml(info.ticketId || "") +
            "</span>" +
            "</li>"
          );
        })
        .join("");
      relatedHtml =
        '<div class="detail-section detail-section--related">' +
        '<div class="detail-section__title">Related outages (' +
        relatedIds.length +
        ")" +
        tip(TIP.related) +
        "</div>" +
        '<ul class="detail-related">' +
        items +
        "</ul>" +
        "</div>";
    }

    // A single PSAP status line (badge + info "i") replaces the old duplicated
    // "Reported to PSAP / 911" Yes/No row — the status tip already explains
    // what "reported" means, so showing both said the same thing twice.
    var psapBody;
    if (psap) {
      psapBody =
        fieldRowHtml("PSAP", escapeHtml(psap.name)) +
        fieldRowHtml("PSAP status", statusBadgeHtml(psap.status), tip(TIP.psapStatus)) +
        fieldRowHtml(
          "County / state",
          escapeHtml(psap.county + ", " + psap.state)
        );
    } else {
      psapBody =
        '<div class="detail-row detail-row--muted">No linked PSAP record.</div>';
    }

    el.innerHTML =
      '<div class="detail-card">' +
      '<div class="detail-card__head">' +
      '<h3 class="detail-card__title">' +
      escapeHtml(outage.name) +
      "</h3>" +
      '<div class="detail-card__chips">' +
      severityChipHtml(outage.severity) +
      "</div>" +
      reportableBadge +
      revisedHtml +
      "</div>" +
      '<div class="detail-section">' +
      fieldRowHtml("Region", escapeHtml(outage.region)) +
      fieldRowHtml(
        "Cause",
        escapeHtml(outage.cause == null ? "\u2014" : outage.cause),
        tip(TIP.cause)
      ) +
      fieldRowHtml(
        "Ticket",
        escapeHtml(outage.ticketId == null ? "\u2014" : outage.ticketId),
        tip(TIP.ticket)
      ) +
      fieldRowHtml(
        "Lost users",
        formatNumber(outage.currentLostUsers),
        tip(TIP.lostUsers)
      ) +
      fieldRowHtml(
        "Growth",
        formatNumber(outage.growthRatePerMin) + " users/min",
        tip(TIP.growth)
      ) +
      fieldRowHtml("Started", formatStartTime(outage.startedAt)) +
      reportableFields +
      "</div>" +
      relatedHtml +
      '<div class="detail-section detail-section--psap">' +
      '<div class="detail-section__title">PSAP / 911</div>' +
      psapBody +
      '<a class="detail-psap-link" href="psap.html?v=21">View all PSAPs \u2192</a>' +
      "</div>" +
      "</div>";

    return el;
  }

  var api = {
    render: render,
    renderEmpty: renderEmpty,
  };

  // Attach to the browser global so app.js can render/refresh the panel on
  // selection and on each live-drift tick.
  global.DetailPanel = api;

  // NOTE: intentionally NO dual-mode `module.exports` footer — this is a
  // browser/DOM-only module and is not imported by the Node/Vitest suite.
})(typeof window !== "undefined" ? window : this);
