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

  // Human-readable PSAP status labels (mirrors psapData.js statuses).
  var PSAP_STATUS_LABEL = {
    notified: "Notified",
    not_notified: "Not notified",
  };

  // The most recent outage list rendered into the modal, so the "Send PSAP
  // alert" action can re-render the modal in place after updating a status.
  var lastOutages = [];

  // Optional callback invoked after a PSAP alert is sent, so the host page can
  // refresh the dashboard (detail panel / table) immediately.
  var onPsapAlert = null;

  /** Resolves the PSAP linked to an outage, or null. */
  function psapForOutage(outage) {
    var PsapData = global.PsapData;
    if (PsapData && typeof PsapData.getPsapForOutage === "function" && outage) {
      return PsapData.getPsapForOutage(outage.id);
    }
    return null;
  }

  /** True when a PSAP status counts as "reported" (notified). */
  function isReported(status) {
    return status === "notified";
  }

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
      // Render each reportable outage as a card with a wrapping stat grid
      // (instead of a wide table) so the modal never scrolls left/right.
      function stat(label, value, cls) {
        return (
          '<div class="report-stat">' +
          '<span class="report-stat__label">' +
          label +
          "</span>" +
          '<span class="report-stat__value' +
          (cls ? " " + cls : "") +
          '">' +
          value +
          "</span>" +
          "</div>"
        );
      }

      var cards = list
        .map(function (o) {
          var over = Math.max(0, o.currentLostUsers - THRESHOLD);
          var psap = psapForOutage(o);
          var status = psap ? psap.status : null;
          var reported = isReported(status);

          // PSAP reporting action row: shows whether the affected 911/PSAP has
          // been notified, with a one-click "Send PSAP alert" when it has not.
          var psapRow;
          if (reported) {
            psapRow =
              '<div class="report-card__psap">' +
              '<span class="report-psap report-psap--sent">\u2713 PSAP alert sent' +
              (psap ? " \u2014 " + escapeHtml(psap.name) : "") +
              "</span>" +
              "</div>";
          } else {
            psapRow =
              '<div class="report-card__psap">' +
              '<span class="report-psap report-psap--pending">\u26A0 Reached 900k \u2014 not yet reported to PSAP</span>' +
              (psap
                ? '<button type="button" class="report-psap__btn" data-send-psap="' +
                  escapeHtml(psap.id) +
                  '">Send PSAP alert</button>'
                : "") +
              "</div>";
          }

          return (
            '<div class="report-card">' +
            '<div class="report-card__head">' +
            '<span class="report-card__name">' +
            escapeHtml(o.name) +
            "</span>" +
            '<span class="report-card__region">' +
            escapeHtml(o.region) +
            "</span>" +
            "</div>" +
            '<div class="report-card__stats">' +
            stat("Lost users", fmt(o.currentLostUsers)) +
            stat("Over 900k", "+" + fmt(over), "over") +
            stat("Growth /min", fmt(o.growthRatePerMin)) +
            stat("Threshold reached" + tip(THRESHOLD_TIP), formatTime(o.thresholdReachedAt)) +
            stat("Impact" + tip(IMPACT_TIP), escapeHtml(impactText(impactFor(o)))) +
            stat(
              "PSAP status",
              escapeHtml(
                status ? PSAP_STATUS_LABEL[status] || status : "\u2014"
              )
            ) +
            "</div>" +
            psapRow +
            "</div>"
          );
        })
        .join("");

      body =
        '<div class="modal__section-title">' +
        list.length +
        " reportable outage" +
        (list.length === 1 ? "" : "s") +
        "</div>" +
        '<div class="report-cards">' +
        cards +
        "</div>";
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
    // Remember the list so the PSAP action can re-render in place.
    lastOutages = Array.isArray(outages) ? outages : [];
    var body = doc.getElementById(BODY_ID);
    if (body) {
      body.innerHTML = bodyHtml(lastOutages);
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

    // "Send PSAP alert": persist the linked PSAP status as "notified", then
    // re-render the modal (and notify the host page) so the change is visible.
    el.addEventListener("click", function (evt) {
      var btn =
        evt.target && evt.target.closest
          ? evt.target.closest("[data-send-psap]")
          : null;
      if (!btn) return;
      var psapId = btn.getAttribute("data-send-psap");
      var PsapData = global.PsapData;
      if (!psapId || !PsapData || typeof PsapData.setPsapStatus !== "function") {
        return;
      }
      try {
        PsapData.setPsapStatus(psapId, "notified");
      } catch (e) {
        return;
      }
      // Re-render the modal from the same list so the card now shows "sent".
      render(lastOutages);
      if (typeof onPsapAlert === "function") {
        try {
          onPsapAlert(psapId);
        } catch (e2) {
          /* never let a host callback break the modal */
        }
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
    /** Registers a callback fired after a PSAP alert is sent from the modal. */
    setPsapAlertHandler: function (fn) {
      onPsapAlert = typeof fn === "function" ? fn : null;
    },
  };
})(typeof window !== "undefined" ? window : this);
