/*
 * psapData.js — Seed PSAP / 911 dataset for the Spectrum outage dashboard
 * mockup.
 *
 * Buildless: loaded in the browser via a plain <script> tag and attaches its
 * exports to `window.PsapData`. It also conditionally exports for Node/Vitest
 * via the dual-mode footer at the bottom, so the same source can be imported by
 * the test runner without any build step (mirrors mockData.js / constants.js).
 *
 * Each PSAP corresponds to exactly one seed outage region and carries a
 * reporting `status` used across the detail panel and the PSAP status page:
 *   - "notified"     — the outage has been reported to the PSAP (blue)
 *   - "not_notified" — the PSAP has not been notified yet (amber/alert)
 */
(function (global) {
  "use strict";

  /**
   * Seed PSAP definitions, one per seed outage. `updatedMinutesAgo` is turned
   * into an ISO 8601 `updatedAt` (in the recent past) at call time so the demo
   * always reads as freshly updated regardless of when it is opened.
   *
   * Status guidance: PSAPs that have already been reported to read "notified";
   * the rest read "not_notified". At least one of each is present for variety.
   */
  var SEED_DEFS = [
    {
      id: "psap-001",
      name: "New York City PSAP",
      county: "New York County",
      state: "NY",
      phone: "911 / +1-212-555-0101",
      status: "not_notified",
      linkedOutageId: "otg-001",
      updatedMinutesAgo: 12,
    },
    {
      id: "psap-002",
      name: "Boston PSAP",
      county: "Suffolk County",
      state: "MA",
      phone: "911 / +1-617-555-0102",
      status: "not_notified",
      linkedOutageId: "otg-002",
      updatedMinutesAgo: 34,
    },
    {
      id: "psap-003",
      name: "Chicago OEMC PSAP",
      county: "Cook County",
      state: "IL",
      phone: "911 / +1-312-555-0103",
      status: "not_notified",
      linkedOutageId: "otg-003",
      updatedMinutesAgo: 27,
    },
    {
      id: "psap-004",
      name: "Minneapolis PSAP",
      county: "Hennepin County",
      state: "MN",
      phone: "911 / +1-612-555-0104",
      status: "not_notified",
      linkedOutageId: "otg-004",
      updatedMinutesAgo: 41,
    },
    {
      id: "psap-005",
      name: "Dallas PSAP",
      county: "Dallas County",
      state: "TX",
      phone: "911 / +1-214-555-0105",
      status: "notified",
      linkedOutageId: "otg-005",
      updatedMinutesAgo: 5,
    },
    {
      id: "psap-006",
      name: "Atlanta PSAP",
      county: "Fulton County",
      state: "GA",
      phone: "911 / +1-404-555-0106",
      status: "not_notified",
      linkedOutageId: "otg-006",
      updatedMinutesAgo: 19,
    },
    {
      id: "psap-007",
      name: "Miami-Dade PSAP",
      county: "Miami-Dade County",
      state: "FL",
      phone: "911 / +1-305-555-0107",
      status: "not_notified",
      linkedOutageId: "otg-007",
      updatedMinutesAgo: 23,
    },
    {
      id: "psap-008",
      name: "Los Angeles PSAP",
      county: "Los Angeles County",
      state: "CA",
      phone: "911 / +1-213-555-0108",
      status: "notified",
      linkedOutageId: "otg-008",
      updatedMinutesAgo: 8,
    },
    {
      id: "psap-009",
      name: "Phoenix PSAP",
      county: "Maricopa County",
      state: "AZ",
      phone: "911 / +1-602-555-0109",
      status: "not_notified",
      linkedOutageId: "otg-009",
      updatedMinutesAgo: 46,
    },
    {
      id: "psap-010",
      name: "Seattle PSAP",
      county: "King County",
      state: "WA",
      phone: "911 / +1-206-555-0110",
      status: "not_notified",
      linkedOutageId: "otg-010",
      updatedMinutesAgo: 15,
    },
  ];

  // --- localStorage-backed status override store --------------------------
  // This is a client-side mockup (no backend): the seed PSAPs above are the
  // canonical base, and the PSAP management page can override an individual
  // PSAP's reporting status. Overrides are persisted in localStorage keyed by
  // PSAP id as { status, updatedAt } and merged over the seed on read, so a
  // status change made on the PSAP page is reflected on the dashboard too
  // (both pages share the same localStorage origin).

  var STORAGE_KEY = "psap-status-overrides";

  // The four allowed reporting statuses. Kept local so this module stays
  // self-contained (and testable under Node/Vitest without other modules).
  var ALLOWED_STATUSES = ["notified", "not_notified"];

  /**
   * Resolves a browser-like localStorage, preferring a bare `localStorage`
   * global and falling back to `global.localStorage` (e.g. jsdom exposes it on
   * `window`). Returns null when none is available.
   */
  function getStorage() {
    // Prefer the module's own global (window in the browser / jsdom) so we do
    // not touch a bare `localStorage` global unnecessarily.
    if (global && global.localStorage) {
      return global.localStorage;
    }
    if (typeof localStorage !== "undefined" && localStorage !== null) {
      return localStorage;
    }
    return null;
  }

  /**
   * Returns true when a browser-like localStorage is available. Guards every
   * storage access so the module still works under Node/Vitest with no storage
   * (in which case getPsaps simply returns the seed).
   */
  function hasStorage() {
    return getStorage() !== null;
  }

  /**
   * Reads the override map ({ [psapId]: { status, updatedAt } }) from storage.
   * Returns {} when storage is unavailable or the stored value is missing or
   * malformed (so a corrupt entry never breaks reads).
   */
  function readOverrides() {
    var storage = getStorage();
    if (!storage) {
      return {};
    }
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) {
        return {};
      }
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * Persists the override map to storage. No-op when storage is unavailable.
   */
  function writeOverrides(overrides) {
    var storage = getStorage();
    if (!storage) {
      return;
    }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(overrides || {}));
    } catch (e) {
      /* ignore quota / serialization errors in this mockup */
    }
  }

  /**
   * Builds a fresh seed PSAP record for a definition. `updatedAt` is derived
   * from `now` so it is always a valid ISO 8601 timestamp in the recent past.
   */
  function seedRecord(def, now) {
    return {
      id: def.id,
      name: def.name,
      county: def.county,
      state: def.state,
      phone: def.phone,
      status: def.status,
      linkedOutageId: def.linkedOutageId,
      updatedAt: new Date(now - def.updatedMinutesAgo * 60 * 1000).toISOString(),
    };
  }

  /**
   * Returns the full set of PSAPs: the seed definitions with any saved
   * localStorage status overrides merged in. A fresh array of fresh objects is
   * returned on every call so callers can freely sort/mutate copies without
   * corrupting the canonical definitions. When an override exists for a PSAP,
   * its `status` and `updatedAt` come from the override (only valid statuses
   * are applied); otherwise the seed values are used.
   */
  function getPsaps() {
    var now = Date.now();
    var overrides = readOverrides();
    return SEED_DEFS.map(function (def) {
      var record = seedRecord(def, now);
      var override = overrides[def.id];
      if (
        override &&
        typeof override === "object" &&
        ALLOWED_STATUSES.indexOf(override.status) !== -1
      ) {
        record.status = override.status;
        if (override.updatedAt) {
          record.updatedAt = override.updatedAt;
        }
      }
      return record;
    });
  }

  /**
   * Overrides a PSAP's reporting status and persists it to localStorage as
   * { status, updatedAt: <now ISO> }. Returns the updated (merged) PSAP record,
   * or null if no PSAP matches the given id. Throws a RangeError when `status`
   * is not one of the four allowed values.
   *
   * @param {string} psapId
   * @param {string} status - one of "notified" | "not_notified".
   * @returns {Object|null}
   */
  function setPsapStatus(psapId, status) {
    if (ALLOWED_STATUSES.indexOf(status) === -1) {
      throw new RangeError(
        "Invalid PSAP status: " +
          status +
          " (expected one of " +
          ALLOWED_STATUSES.join(", ") +
          ")"
      );
    }
    // Only allow overriding a known seed PSAP.
    var known = SEED_DEFS.some(function (def) {
      return def.id === psapId;
    });
    if (!known) {
      return null;
    }

    var overrides = readOverrides();
    overrides[psapId] = { status: status, updatedAt: new Date().toISOString() };
    writeOverrides(overrides);

    // Return the merged record so callers can reflect the change immediately.
    var list = getPsaps();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === psapId) {
        return list[i];
      }
    }
    return null;
  }

  /**
   * Clears all status overrides, restoring every PSAP to its seed status.
   * No-op (beyond returning the seed) when storage is unavailable.
   */
  function resetPsaps() {
    var storage = getStorage();
    if (storage) {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch (e) {
        /* ignore */
      }
    }
    return getPsaps();
  }

  /**
   * Returns the PSAP linked to a given outage id, or null when none matches.
   * @param {string} outageId
   * @returns {Object|null}
   */
  function getPsapForOutage(outageId) {
    if (!outageId) {
      return null;
    }
    var list = getPsaps();
    for (var i = 0; i < list.length; i++) {
      if (list[i].linkedOutageId === outageId) {
        return list[i];
      }
    }
    return null;
  }

  var api = {
    getPsaps: getPsaps,
    getPsapForOutage: getPsapForOutage,
    setPsapStatus: setPsapStatus,
    resetPsaps: resetPsaps,
    // Exposed for tests / callers that want the allowed status list + key.
    ALLOWED_STATUSES: ALLOWED_STATUSES,
    STORAGE_KEY: STORAGE_KEY,
  };

  // Attach to the browser global so <script>-loaded modules can read it.
  global.PsapData = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
