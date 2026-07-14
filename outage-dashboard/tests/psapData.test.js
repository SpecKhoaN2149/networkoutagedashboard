// @vitest-environment jsdom
/*
 * psapData.test.js — Unit tests for the localStorage-backed PSAP status
 * management store (getPsaps / setPsapStatus / resetPsaps).
 *
 * Runs under jsdom so `localStorage` is available (mirroring the browser). The
 * store overlays saved status overrides on top of the seed PSAPs:
 *   - setPsapStatus writes an { status, updatedAt } override,
 *   - getPsaps merges overrides over the seed,
 *   - resetPsaps clears all overrides and restores the seed.
 * Isolated by clearing localStorage before each test.
 */

const PsapData = require("../psapData");

beforeEach(() => {
  // Fresh storage per test so overrides never leak between cases. The test
  // setup installs a localStorage polyfill on `window` under jsdom.
  window.localStorage.clear();
});

describe("PsapData seed baseline", () => {
  it("returns the full seed set with valid statuses when no overrides exist", () => {
    const psaps = PsapData.getPsaps();
    expect(psaps.length).toBeGreaterThan(0);
    psaps.forEach((p) => {
      expect(PsapData.ALLOWED_STATUSES).toContain(p.status);
      expect(typeof p.updatedAt).toBe("string");
      expect(Number.isNaN(Date.parse(p.updatedAt))).toBe(false);
    });
  });
});

describe("setPsapStatus", () => {
  it("overriding a status changes getPsaps output for that id only", () => {
    const before = PsapData.getPsaps();
    const target = before[0];
    // Pick a new status different from the current one.
    const newStatus = PsapData.ALLOWED_STATUSES.find(
      (s) => s !== target.status
    );

    const updated = PsapData.setPsapStatus(target.id, newStatus);
    expect(updated).not.toBeNull();
    expect(updated.id).toBe(target.id);
    expect(updated.status).toBe(newStatus);

    const after = PsapData.getPsaps();
    const changed = after.find((p) => p.id === target.id);
    expect(changed.status).toBe(newStatus);

    // Every other record is unchanged from the seed baseline.
    after
      .filter((p) => p.id !== target.id)
      .forEach((p) => {
        const seed = before.find((b) => b.id === p.id);
        expect(p.status).toBe(seed.status);
      });
  });

  it("stamps updatedAt to (approximately) now on override", () => {
    const target = PsapData.getPsaps()[0];
    const newStatus = PsapData.ALLOWED_STATUSES.find(
      (s) => s !== target.status
    );
    const t0 = Date.now();
    const updated = PsapData.setPsapStatus(target.id, newStatus);
    const stamped = Date.parse(updated.updatedAt);
    // Within a generous window of "now".
    expect(stamped).toBeGreaterThanOrEqual(t0 - 1000);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("rejects an invalid status (throws) and does not persist anything", () => {
    const target = PsapData.getPsaps()[0];
    expect(() => PsapData.setPsapStatus(target.id, "bogus")).toThrow();

    // Storage untouched: the record keeps its seed status.
    const after = PsapData.getPsaps().find((p) => p.id === target.id);
    expect(after.status).toBe(target.status);
  });

  it("returns null for an unknown PSAP id", () => {
    expect(
      PsapData.setPsapStatus("psap-does-not-exist", "notified")
    ).toBeNull();
  });
});

describe("resetPsaps", () => {
  it("clears all overrides and restores the seed statuses", () => {
    const seed = PsapData.getPsaps();
    const target = seed[0];
    const newStatus = PsapData.ALLOWED_STATUSES.find(
      (s) => s !== target.status
    );

    PsapData.setPsapStatus(target.id, newStatus);
    expect(
      PsapData.getPsaps().find((p) => p.id === target.id).status
    ).toBe(newStatus);

    PsapData.resetPsaps();

    const restored = PsapData.getPsaps();
    restored.forEach((p) => {
      const seedRecord = seed.find((s) => s.id === p.id);
      expect(p.status).toBe(seedRecord.status);
    });
  });
});
