/*
 * tests/setup.js — Vitest global setup.
 *
 * The bundled jsdom build does not expose a `localStorage`, so the PSAP status
 * management store (psapData.js) would have no browser storage under test. This
 * setup installs a minimal in-memory Web Storage polyfill on both `globalThis`
 * and `window` (when present) so tests can exercise the real localStorage-backed
 * code paths. It mirrors the browser API surface the store uses: getItem,
 * setItem, removeItem, and clear.
 */
function createMemoryStorage() {
  var map = Object.create(null);
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
    },
    setItem: function (key, value) {
      map[key] = String(value);
    },
    removeItem: function (key) {
      delete map[key];
    },
    clear: function () {
      map = Object.create(null);
    },
    key: function (i) {
      return Object.keys(map)[i] || null;
    },
    get length() {
      return Object.keys(map).length;
    },
  };
}

// Only install under jsdom (where `window` exists). Node's own environment has
// an experimental `localStorage` getter we deliberately avoid touching, and the
// node-env logic tests never need browser storage.
if (typeof window !== "undefined" && !window.localStorage) {
  var storage = createMemoryStorage();
  try {
    window.localStorage = storage;
  } catch (e) {
    /* window.localStorage read-only in some builds; fall back to global */
  }
  if (!window.localStorage) {
    globalThis.localStorage = storage;
  }
}
