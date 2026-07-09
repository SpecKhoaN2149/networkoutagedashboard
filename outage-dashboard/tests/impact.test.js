/*
 * impact.test.js — Unit tests for the pure `computeImpact` helper (task 4d).
 *
 * impact = minutesSince(thresholdReachedAt) * currentLostUsers, but only for a
 * reportable outage with a valid thresholdReachedAt; 0 otherwise.
 */
const { computeImpact, formatImpact } = require("../impact");
const { FCC_REPORT_THRESHOLD } = require("../constants");

function mk(overrides) {
  return Object.assign(
    {
      id: "otg-x",
      name: "Data Center Power Event",
      network: "Spectrum",
      region: "Dallas, TX",
      currentLostUsers: FCC_REPORT_THRESHOLD, // reportable
      growthRatePerMin: 100,
      severity: "critical",
      thresholdReachedAt: null,
      status: "active",
    },
    overrides || {}
  );
}

describe("computeImpact — reportable outage with a threshold time", () => {
  it("returns minutes-elapsed * currentLostUsers (line-minutes)", () => {
    const now = new Date("2024-01-01T12:00:00Z").getTime();
    const reachedAt = new Date("2024-01-01T10:00:00Z").toISOString(); // 120 min ago
    const outage = mk({ currentLostUsers: 950000, thresholdReachedAt: reachedAt });
    expect(computeImpact(outage, now)).toBe(120 * 950000);
  });

  it("grows as `now` advances", () => {
    const reachedAt = new Date("2024-01-01T10:00:00Z").toISOString();
    const outage = mk({ currentLostUsers: 900000, thresholdReachedAt: reachedAt });
    const t1 = new Date("2024-01-01T10:30:00Z").getTime(); // 30 min
    const t2 = new Date("2024-01-01T11:00:00Z").getTime(); // 60 min
    expect(computeImpact(outage, t1)).toBe(30 * 900000);
    expect(computeImpact(outage, t2)).toBe(60 * 900000);
    expect(computeImpact(outage, t2)).toBeGreaterThan(computeImpact(outage, t1));
  });

  it("accepts a Date instance for `now`", () => {
    const reachedAt = new Date("2024-01-01T10:00:00Z").toISOString();
    const outage = mk({ currentLostUsers: 950000, thresholdReachedAt: reachedAt });
    expect(computeImpact(outage, new Date("2024-01-01T11:00:00Z"))).toBe(
      60 * 950000
    );
  });
});

describe("computeImpact — returns 0 when not applicable", () => {
  it("returns 0 for a non-reportable outage (below threshold)", () => {
    const now = new Date("2024-01-01T12:00:00Z").getTime();
    const reachedAt = new Date("2024-01-01T10:00:00Z").toISOString();
    const outage = mk({
      currentLostUsers: FCC_REPORT_THRESHOLD - 1,
      thresholdReachedAt: reachedAt,
    });
    expect(computeImpact(outage, now)).toBe(0);
  });

  it("returns 0 when thresholdReachedAt is null", () => {
    const now = new Date("2024-01-01T12:00:00Z").getTime();
    const outage = mk({ currentLostUsers: 950000, thresholdReachedAt: null });
    expect(computeImpact(outage, now)).toBe(0);
  });

  it("returns 0 when the threshold time is in the future", () => {
    const now = new Date("2024-01-01T09:00:00Z").getTime();
    const reachedAt = new Date("2024-01-01T10:00:00Z").toISOString();
    const outage = mk({ currentLostUsers: 950000, thresholdReachedAt: reachedAt });
    expect(computeImpact(outage, now)).toBe(0);
  });

  it("returns 0 for a null/invalid outage", () => {
    expect(computeImpact(null, Date.now())).toBe(0);
    expect(computeImpact(undefined)).toBe(0);
  });
});

describe("formatImpact — compact formatting", () => {
  it("formats millions/thousands/billions compactly", () => {
    expect(formatImpact(1200000)).toBe("1.2M line-min");
    expect(formatImpact(950000)).toBe("950K line-min");
    expect(formatImpact(2000000000)).toBe("2B line-min");
  });

  it("formats zero / invalid as 0 line-min", () => {
    expect(formatImpact(0)).toBe("0 line-min");
    expect(formatImpact(-5)).toBe("0 line-min");
    expect(formatImpact(NaN)).toBe("0 line-min");
  });
});
