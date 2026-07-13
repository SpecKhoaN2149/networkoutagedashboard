/*
 * reportModal.js — FCC / 911 report details modal for the Spectrum outage
 * dashboard mockup.
 *
 * Opened by clicking the reportable alert banner or the "Reportable · FCC" KPI
 * card. Shows the reporting obligation, the list of currently reportable
 * outages (>= 900k lost users) with how far each is over the threshold, and a
 * short recommended-actions checklist. While open it can be refreshed on each
 * live-drift tick so the details stay current.
 *
 * Browser/DOM-only: loaded via a plain <script> tag, attaches its api to
 * `window.ReportModal`, and has no Node dual-mode export footer (never imported
 * by the test runner).
 */
(function (global) {
  "use strict";

  var OVERLAY_ID = "fcc-modal";
  var BODY_ID = "fcc-modal-body";
  var CLOSE_ID = "fcc-modal-close";

  var doc = global.document;

  // Shared constants (threshold + reportable predicate), browser global first.
  var C =
    (global && global.DashboardConstants) ||
    (typeof require !== "undefined" ? require("./constants") : undefined);

  var THRESHOLD = (C && C.FCC_REPORT_THRESHOLD) || 900000;

  function isReportable(o) {
    if (C && typeof C.isReportable === "function") {
      return C.isReportable(o);
    }
    return !!o && o.currentLostUsers >= THRESHOLD;
  }

  function fmt(n) {
    var v = Number(n);
    return isFinite(v) ? Math.round(v).toLocaleString("en-US") : "\u2014";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTime(iso) {
    if (!iso) return "\u2014";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "\u2014";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * Returns the reusable info-tip markup for `text`, or "" when unavailable.
   */
  function tip(text) {
    var InfoTip = global.InfoTip;
    return InfoTip && typeof InfoTip.infoTipHtml === "function"
      ? InfoTip.infoTipHtml(text)
      : "";
  }

  var IMPACT_TIP =
    "Severity of the reporting event = time at/over the 900k threshold " +
    "\u00d7 affected telephone lines (line-minutes).";
  var THRESHOLD_TIP =
    "The time this outage reached the 900,000-user FCC/911 reporting threshold.";

  /** Live impact (line-minutes) via the shared Impact helper; 0 otherwise. */
  function impactFor(outage) {
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
    return fmt(value) + " line-min";
  }

  /**
   * Builds the modal body HTML from the current outage list: an intro
   * describing the obligation, a table of reportable outages (sorted by lost
   * users, descending, with amount over threshold), and a recommended-actions
   * checklist. Shows an empty state when nothing is currently reportable.
   */
  function bodyHtml(outages) {
    var list = (Array.isArray(outages) ? outages : []).filter(isReportable);
    list.sort(function (a, b) {
      return b.currentLostUsers - a.currentLostUsers;
    });

    var intro =
      '<p class="modal__intro">An outage that affects <strong>' +
      fmt(THRESHOLD) +
      "</strong> or more users must be reported to the <strong>FCC</strong> " +
      "(via the Network Outage Reporting System) and the affected " +
      "<strong>PSAP / 911</strong> authorities. The outages below have reached " +
      "or exceeded that threshold on the Spectrum network.</p>";

    var body;
    if (list.length === 0) {
      body =
        '<div class="modal__empty">No outages are currently at or over the ' +
        fmt(THRESHOLD) +
        "-user FCC reporting threshold.</div>";
    } else {
      var rows = list
        .map(function (o) {
          var over = Math.max(0, o.currentLostUsers - THRESHOLD);
          return (
            "<tr>" +
            "<td>" + escapeHtml(o.name) + "</td>" +
            "<td>" + escapeHtml(o.region) + "</td>" +
            '<td class="num">' + fmt(o.currentLostUsers) + "</td>" +
            '<td class="num over">+' + fmt(over) + "</td>" +
            '<td class="num">' + fmt(o.growthRatePerMin) + "</td>" +
            "<td>" + formatTime(o.thresholdReachedAt) + "</td>" +
            '<td class="num">' + escapeHtml(impactText(impactFor(o))) + "</td>" +
            "<td>" + formatTime(o.startedAt) + "</td>" +
            "</tr>"
          );
        })
        .join("");

      body =
        '<div class="modal__section-title">' +
        list.length +
        " reportable outage" +
        (list.length === 1 ? "" : "s") +
        "</div>" +
        '<table class="report-table">' +
        "<thead><tr>" +
        "<th>Outage</th><th>Region</th>" +
        "<th>Lost users</th><th>Over 900k</th><th>Growth /min</th>" +
        "<th>Threshold reached" + tip(THRESHOLD_TIP) + "</th>" +
        "<th>Impact" + tip(IMPACT_TIP) + "</th>" +
        "<th>Started</th>" +
        "</tr></thead><tbody>" +
        rows +
        "</tbody></table>";
    }

    var actions =
      '<div class="modal__section-title">Recommended actions</div>' +
      '<ul class="report-actions">' +
      "<li>File / update the FCC NORS report for each outage above.</li>" +
      "<li>Notify the affected PSAP / 911 authorities in the impacted regions.</li>" +
      "<li>Confirm the Spectrum user count and restoration ETA.</li>" +
      "<li>Track each outage until it drops back below " + fmt(THRESHOLD) + " users.</li>" +
      "</ul>";

    return intro + body + actions;
  }

  function overlay() {
    return doc ? doc.getElementById(OVERLAY_ID) : null;
  }

  function isOpen() {
    var el = overlay();
    return !!el && !el.hidden;
  }

  /**
   * Renders the modal body from the given outage list (only if the element
   * exists). Safe to call whether or not the modal is open.
   */
  function render(outages) {
    if (!doc) return;
    var body = doc.getElementById(BODY_ID);
    if (body) {
      body.innerHTML = bodyHtml(outages);
    }
  }

  /** Opens the modal and renders it from the current outage list. */
  function open(outages) {
    var el = overlay();
    if (!el) return;
    render(outages);
    el.hidden = false;
  }

  /** Closes the modal. */
  function close() {
    var el = overlay();
    if (el) el.hidden = true;
  }

  /** Refreshes the modal content if it is currently open (used on each tick). */
  function refresh(outages) {
    if (isOpen()) {
      render(outages);
    }
  }

  // Wire the intrinsic dismiss controls once the DOM is ready: the close
  // button, a click on the backdrop (outside the dialog), and the Escape key.
  function wireDismiss() {
    var el = overlay();
    if (!el) return;

    var closeBtn = doc.getElementById(CLOSE_ID);
    if (closeBtn) {
      closeBtn.addEventListener("click", close);
    }

    // Backdrop click (but not clicks inside the dialog panel).
    el.addEventListener("click", function (evt) {
      if (evt.target === el) {
        close();
      }
    });

    doc.addEventListener("keydown", function (evt) {
      if (evt.key === "Escape" && isOpen()) {
        close();
      }
    });
  }

  if (doc) {
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", wireDismiss);
    } else {
      wireDismiss();
    }
  }

  global.ReportModal = {
    open: open,
    close: close,
    refresh: refresh,
    isOpen: isOpen,
    render: render,
  };
})(typeof window !== "undefined" ? window : this);
