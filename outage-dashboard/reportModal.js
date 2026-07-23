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
 * PSAP / 911 notification is AUTOMATIC: once an outage reaches the 900k
 * threshold the platform (app.js) sends the PSAP alert itself, so each card
 * shows either "automatically notifying…" or "sent automatically" rather than
 * a manual "Send PSAP alert" button.
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
    reached_not_notified: "900k \u00b7 Not notified",
    not_notified: "Not notified",
    reached_notified: "900k \u00b7 Notified",
    notified: "Notified",
  };

  // The most recent outage list rendered into the modal, so the modal can be
  // re-rendered in place (e.g. on each live-drift tick, or when the automatic
  // PSAP notification updates a status).
  var lastOutages = [];

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
    return status === "notified" || status === "reached_notified";
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

  var USERMIN_TIP =
    "Users affected \u00d7 minutes of duration. The FCC/911 report trigger is " +
    "900,000 user-minutes.";
  var THRESHOLD_TIP =
    "The time this outage reached the 900,000 user-minute FCC/911 reporting " +
    "threshold.";

  /** Resolves an outage's live user-minutes (annotated field, else computed). */
  function userMinutesFor(o) {
    if (o && typeof o.userMinutes === "number" && isFinite(o.userMinutes)) {
      return o.userMinutes;
    }
    if (C && typeof C.computeUserMinutes === "function") {
      return C.computeUserMinutes(o, Date.now());
    }
    return 0;
  }

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
      '<p class="modal__intro">An outage that reaches <strong>' +
      fmt(THRESHOLD) +
      " user-minutes</strong> (users affected \u00d7 minutes of duration) must " +
      "be reported to the <strong>FCC</strong> (via the Network Outage " +
      "Reporting System) and the affected <strong>PSAP / 911</strong> " +
      "authorities. The outages below have reached or exceeded that threshold " +
      "on the Spectrum network.</p>";

    var body;
    if (list.length === 0) {
      body =
        '<div class="modal__empty">No outages are currently at or over the ' +
        fmt(THRESHOLD) +
        " user-minute FCC reporting threshold.</div>";
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
          var um = userMinutesFor(o);
          var over = Math.max(0, um - THRESHOLD);
          var psap = psapForOutage(o);
          var status = psap ? psap.status : null;
          var reported = isReported(status);
          // Derived display status (these cards are all at/over 900k).
          var displayStatus =
            status && C && typeof C.psapDisplayStatus === "function"
              ? C.psapDisplayStatus(status, isReportable(o))
              : status;

          // Link to the PSAP status page, pre-filtered to just this outage's
          // PSAP (see psapPage.applyUrlFilter).
          var psapLink = psap
            ? '<a class="report-psap__link" href="psap.html?v=30&psap=' +
              encodeURIComponent(psap.id) +
              '">View PSAP status \u2192</a>'
            : "";

          // PSAP reporting action row. There is no manual "send" step anymore:
          // once an outage reaches 900k the platform notifies the linked PSAP /
          // 911 automatically. So the row shows either "sent automatically"
          // (once notified) or a brief "automatically notifying…" state while
          // the automatic hand-off completes.
          var psapRow;
          if (reported) {
            psapRow =
              '<div class="report-card__psap">' +
              '<span class="report-psap report-psap--sent">\u2713 PSAP alert sent automatically' +
              (psap ? " \u2014 " + escapeHtml(psap.name) : "") +
              "</span>" +
              psapLink +
              "</div>";
          } else {
            psapRow =
              '<div class="report-card__psap">' +
              '<span class="report-psap report-psap--auto">\u21BB Reached 900k \u2014 automatically notifying PSAP' +
              (psap ? " (" + escapeHtml(psap.name) + ")" : "") +
              "\u2026</span>" +
              psapLink +
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
            stat("User-minutes" + tip(USERMIN_TIP), fmt(um)) +
            stat("Over 900k user-min", "+" + fmt(over), "over") +
            stat("Growth /min", fmt(o.growthRatePerMin)) +
            stat("Threshold reached" + tip(THRESHOLD_TIP), formatTime(o.thresholdReachedAt)) +
            stat(
              "PSAP status",
              escapeHtml(
                displayStatus
                  ? PSAP_STATUS_LABEL[displayStatus] || displayStatus
                  : "\u2014"
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
      "<li>The affected PSAP / 911 authorities are notified " +
      "<strong>automatically</strong> when an outage crosses 900k user-minutes " +
      "\u2014 no manual step required.</li>" +
      "<li>Confirm the Spectrum user count and restoration ETA.</li>" +
      "<li>Update / close the report as each outage is restored.</li>" +
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

    // NOTE: PSAP notification is fully automatic (handled in app.js once an
    // outage reaches 900k), so there is no manual "Send PSAP alert" click to
    // wire here anymore. The modal simply reflects the status the platform
    // sets, re-rendering itself on each live-drift tick via refresh().
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
