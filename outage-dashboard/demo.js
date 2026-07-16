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
 *     count shown inside its bubble climbs (2, 3, 4 ...), and as it persists
 *     its user-minutes (lost users × minutes of duration) accumulate, ramping
 *     the bubble color toward red as it approaches 900k user-minutes.
 *   - CROSS 900k user-minutes: once the target reaches the threshold it becomes
 *     FCC reportable (the on-map red alert appears) while its linked PSAP is
 *     still "not_notified" — reached the threshold but NOT yet reported.
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
  // The reporting trigger is 900,000 user-minutes (users × minutes of duration).
  var THRESHOLD =
    (C && (C.FCC_USER_MINUTES_THRESHOLD || C.FCC_REPORT_THRESHOLD)) || 900000;

  // The outage that grows during the demo: New York City (otg-001), a
  // recognizable metro that reads well as "the one to watch".
  var TARGET_ID = "otg-001";

  // Each aggregated sub-outage contributes this many lost users. The target is
  // a modest-but-persistent outage: its user-minutes (lost users × minutes of
  // duration) climb over the scenario and cross the 900k threshold near the
  // end. With PER_OUTAGE=750 and STEP_MINUTES=25, user-minutes reaches 900k
  // when the count hits 8 (6,000 users × 150 min).
  var PER_OUTAGE = 750;
  var START_COUNT = 2;

  // Scenario clock: each step represents this many minutes of real time, so the
  // ~8 growth steps read as unfolding over ~3.5 hours.
  var STEP_MINUTES = 25;

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

  // Ordered ids of the OTHER seed outages the target aggregates as it grows.
  var otherIds = [];
  var maxCount = 10; // recomputed in start() as 1 + otherIds.length

  // Scenario clock: minutes of simulated time elapsed since the outage began,
  // and the elapsed value at the moment it crossed the threshold.
  var elapsedMinutes = 0;
  var crossElapsedMinutes = 0;

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
        // Freeze everyone else well below the threshold so the map is still,
        // and clear their own grouping so only the target tells a story.
        next.currentLostUsers = Math.min(next.currentLostUsers, CALM_USER_CAP);
        next.growthRatePerMin = Math.min(
          next.growthRatePerMin,
          CALM_GROWTH_CAP
        );
        next.thresholdReachedAt = null;
        next.aggregateCount = 0;
        next.relatedOutageIds = [];
        next.reassessed = false;
        // Start "just now" so their user-minutes are ~0 and they stay calm
        // (non-reportable, yellow) — only the target accumulates user-minutes.
        next.startedAt = new Date().toISOString();
      }
      return next;
    });
  }

  /** Rebuilds `list` from the current `count` (target grown, others frozen). */
  function rebuild() {
    var baseline = buildBaseline();
    var now = Date.now();
    for (var i = 0; i < baseline.length; i++) {
      if (baseline[i].id === TARGET_ID) {
        var t = baseline[i];
        t.currentLostUsers = usersForCount(count);
        t.aggregateCount = count;
        t.growthRatePerMin = TARGET_GROWTH;
        // Attach the REAL related outages the target has aggregated so far, so
        // the detail panel lists them and the bubble count matches the group
        // (bubble count = 1 primary + related). At count N there are N-1
        // related outages.
        t.relatedOutageIds = otherIds.slice(0, Math.max(0, count - 1));
        // Scenario clock: the outage began `elapsedMinutes` of simulated time
        // ago, and (once crossed) reached the threshold that many minutes after
        // it began — so the detail panel reads as hours of real activity.
        t.startedAt = new Date(now - elapsedMinutes * 60000).toISOString();
        t.thresholdReachedAt = crossed
          ? new Date(
              now - (elapsedMinutes - crossElapsedMinutes) * 60000
            ).toISOString()
          : null;
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
    elapsedMinutes = 0;
    crossElapsedMinutes = 0;

    // Ordered ids of the other seed outages the target aggregates as it grows.
    var MockData = ns("MockData");
    var seed =
      MockData && typeof MockData.getMockOutages === "function"
        ? MockData.getMockOutages()
        : [];
    otherIds = seed
      .filter(function (o) {
        return o.id !== TARGET_ID;
      })
      .map(function (o) {
        return o.id;
      });
    maxCount = otherIds.length + 1;

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
    if (count < maxCount) {
      count += 1;
      elapsedMinutes += STEP_MINUTES;
    }

    // Cross when accumulated user-minutes (lost users × elapsed minutes) reach
    // the 900k reporting threshold.
    var justCrossed = false;
    if (!crossed && usersForCount(count) * elapsedMinutes >= THRESHOLD) {
      crossed = true;
      crossElapsedMinutes = elapsedMinutes;
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
    /** Minutes of simulated scenario time elapsed since the outage began. */
    getElapsedMinutes: function () {
      return elapsedMinutes;
    },
    TARGET_ID: TARGET_ID,
  };

  global.DemoScenario = api;
})(typeof window !== "undefined" ? window : this);
