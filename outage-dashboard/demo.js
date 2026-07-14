/*
 * demo.js — Scripted "live demo" scenario for the Spectrum outage dashboard
 * mockup.
 *
 * Purpose: for a live presentation the ambient random drift (drift.js) makes
 * every bubble wander at once, which is visually noisy and inconsistent between
 * runs. This module provides a deterministic, repeatable story instead:
 *
 *   - START: everything is calm. Every outage is frozen well BELOW the 900k
 *     FCC reporting threshold so nothing on the map moves — except one target
 *     outage.
 *   - GROW: on each tick the target outage aggregates one more sub-outage. A
 *     count shown inside its bubble climbs (2, 3, 4 ...), its lost-user total
 *     climbs with it, and its color ramps toward red as it approaches 900k.
 *   - CROSS 900k: once the target reaches the threshold it becomes FCC
 *     reportable (the on-map red alert appears) while its linked PSAP is still
 *     "not_notified" — reached 900k but NOT yet reported.
 *   - REPORT: the operator opens the FCC alert and clicks "Send PSAP alert",
 *     which persists the PSAP status as "notified" (reported).
 *
 * Buildless / browser-only: loaded via a plain <script> tag BEFORE app.js and
 * attaches its api to `window.DemoScenario`. It reads window.MockData,
 * window.PsapData, and window.DashboardConstants. No Node/Vitest dual-mode
 * footer (it is a DOM-adjacent controller, not imported by the test runner).
 */
(function (global) {
  "use strict";

  var C = global.DashboardConstants;
  var THRESHOLD = (C && C.FCC_REPORT_THRESHOLD) || 900000;

  // The outage that grows during the demo. otg-004 (Minneapolis) starts as a
  // small, clearly-below-threshold outage in the seed data, so it reads well as
  // "the one to watch".
  var TARGET_ID = "otg-004";

  // Each aggregated sub-outage contributes this many lost users. START_COUNT
  // aggregated outages is the opening state; the target grows by one sub-outage
  // per tick up to MAX_COUNT. PER_OUTAGE * 10 == 900,000, so the target crosses
  // the FCC threshold exactly when the count reaches 10.
  var PER_OUTAGE = 90000;
  var START_COUNT = 2;
  var MAX_COUNT = 11; // ~990k at the end, comfortably over the threshold

  // Ceilings applied to every NON-target outage so the demo baseline is calm:
  // nobody else is anywhere near 900k and their velocity pulse is gentle.
  var CALM_USER_CAP = 460000;
  var CALM_GROWTH_CAP = 120;

  // A high, steady growth rate for the target so its velocity pulse reads as
  // "actively growing" throughout the demo.
  var TARGET_GROWTH = 340;

  var active = false;
  var count = START_COUNT;
  var crossed = false; // becomes true once the target reaches the threshold
  var list = []; // current demo outage list (source of truth while active)

  function ns(name) {
    return (global && global[name]) || null;
  }

  /** Shallow clone of an outage object. */
  function clone(o) {
    var copy = {};
    for (var k in o) {
      if (Object.prototype.hasOwnProperty.call(o, k)) copy[k] = o[k];
    }
    return copy;
  }

  /** Lost users implied by an aggregate count. */
  function usersForCount(n) {
    return n * PER_OUTAGE;
  }

  /**
   * Builds the calm baseline: the seed outages with every NON-target record
   * frozen below the threshold, and the target reset to its opening (small)
   * aggregated state.
   */
  function buildBaseline() {
    var MockData = ns("MockData");
    var seed =
      MockData && typeof MockData.getMockOutages === "function"
        ? MockData.getMockOutages()
        : [];

    return seed.map(function (o) {
      var next = clone(o);
      if (next.id === TARGET_ID) {
        next.currentLostUsers = usersForCount(START_COUNT);
        next.growthRatePerMin = TARGET_GROWTH;
        next.aggregateCount = START_COUNT;
        next.severity = "major";
        next.thresholdReachedAt = null;
        // Declutter: the target tells its own story in the demo.
        next.relatedOutageIds = [];
        next.reassessed = false;
      } else {
        // Freeze everyone else well below the threshold so the map is still.
        next.currentLostUsers = Math.min(next.currentLostUsers, CALM_USER_CAP);
        next.growthRatePerMin = Math.min(
          next.growthRatePerMin,
          CALM_GROWTH_CAP
        );
        next.thresholdReachedAt = null;
        next.aggregateCount = 0;
      }
      return next;
    });
  }

  /** Rebuilds `list` from the current `count` (target grown, others frozen). */
  function rebuild() {
    var baseline = buildBaseline();
    for (var i = 0; i < baseline.length; i++) {
      if (baseline[i].id === TARGET_ID) {
        baseline[i].currentLostUsers = usersForCount(count);
        baseline[i].aggregateCount = count;
        baseline[i].growthRatePerMin = TARGET_GROWTH;
        if (crossed) {
          // Keep a stable "reached threshold" stamp once crossed.
          if (!baseline[i].thresholdReachedAt) {
            baseline[i].thresholdReachedAt = new Date().toISOString();
          }
        }
      }
    }
    list = baseline;
    return list;
  }

  /**
   * Enters demo mode: resets to the calm initial state, restores PSAP statuses
   * to their seed defaults (so re-running the demo is repeatable), and returns
   * the opening outage list.
   */
  function start() {
    active = true;
    count = START_COUNT;
    crossed = false;

    // Reset PSAP overrides so a repeated demo always starts clean, then make
    // the target's PSAP explicitly "not required" (it is below threshold).
    var PsapData = ns("PsapData");
    if (PsapData && typeof PsapData.resetPsaps === "function") {
      PsapData.resetPsaps();
    }
    if (PsapData && typeof PsapData.getPsapForOutage === "function") {
      var psap = PsapData.getPsapForOutage(TARGET_ID);
      if (psap && typeof PsapData.setPsapStatus === "function") {
        try {
          PsapData.setPsapStatus(psap.id, "not_notified");
        } catch (e) {
          /* ignore */
        }
      }
    }

    return rebuild();
  }

  /** Leaves demo mode. Returns a fresh normal (seed) outage list. */
  function stop() {
    active = false;
    var MockData = ns("MockData");
    return MockData && typeof MockData.getMockOutages === "function"
      ? MockData.getMockOutages()
      : [];
  }

  /**
   * Advances the scenario by one step: the target aggregates one more outage
   * (until MAX_COUNT). The first time it reaches the threshold its linked PSAP
   * is ensured "not_notified" (reached 900k, awaiting reporting) so the
   * operator can send the alert from the FCC modal. Returns the updated outage
   * list, or null when not active.
   */
  function advance() {
    if (!active) {
      return null;
    }
    if (count < MAX_COUNT) {
      count += 1;
    }

    var justCrossed = false;
    if (!crossed && usersForCount(count) >= THRESHOLD) {
      crossed = true;
      justCrossed = true;
    }

    if (justCrossed) {
      // Reached the FCC threshold but not yet reported -> PSAP "not_notified".
      // Do NOT clobber a status the operator may have already advanced.
      var PsapData = ns("PsapData");
      if (PsapData && typeof PsapData.getPsapForOutage === "function") {
        var psap = PsapData.getPsapForOutage(TARGET_ID);
        if (
          psap &&
          psap.status !== "notified" &&
          typeof PsapData.setPsapStatus === "function"
        ) {
          try {
            PsapData.setPsapStatus(psap.id, "not_notified");
          } catch (e) {
            /* ignore invalid status */
          }
        }
      }
    }

    return rebuild();
  }

  var api = {
    start: start,
    stop: stop,
    advance: advance,
    isActive: function () {
      return active;
    },
    getList: function () {
      return list;
    },
    TARGET_ID: TARGET_ID,
  };

  global.DemoScenario = api;
})(typeof window !== "undefined" ? window : this);
