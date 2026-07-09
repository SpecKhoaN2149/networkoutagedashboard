/*
 * summary.test.js — Property 1, Property 6, and empty-set summary tests
 * (tasks 3.2, 3.3, 3.4).
 */
const fc = require("fast-check");
const { computeSummary } = require("../summary");
const { validOutageListArb } = require("./arbitraries");

describe("Property 1: Summary totals reflect the data (task 3.2)", () => {
  // **Property 1: Summary totals reflect the data**
  // **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
  it("count/total/peak match the input list", () => {
    fc.assert(
      fc.property(validOutageListArb, (outages) => {
        const summary = computeSummary(outages);

        const expectedTotal = outages.reduce(
          (acc, o) => acc + o.currentLostUsers,
          0
        );
        const expectedPeak = outages.reduce(
          (max, o) => Math.max(max, o.growthRatePerMin),
          0
        );

        expect(summary.activeOutageCount).toBe(outages.length);
        expect(summary.totalLostUsers).toBe(expectedTotal);
        expect(summary.peakGrowthRatePerMin).toBe(expectedPeak);
      })
    );
  });
});

describe("Property 6: Per-network breakdown partitions the total (task 3.3)", () => {
  // **Property 6: Per-network breakdown partitions the total**
  // **Validates: Requirements 6.1, 6.2, 6.3**
  //
  // The product is a single Spectrum network, so the per-network breakdown has
  // exactly one entry. Its Spectrum sum equals the sum of every outage's
  // currentLostUsers, which is the whole total — i.e. Spectrum alone partitions
  // (trivially, as the sole partition) the total.
  it("Spectrum sum equals the total lost users across all outages", () => {
    fc.assert(
      fc.property(validOutageListArb, (outages) => {
        const summary = computeSummary(outages);

        const expectedSpectrum = outages
          .filter((o) => o.network === "Spectrum")
          .reduce((acc, o) => acc + o.currentLostUsers, 0);

        expect(summary.lostUsersByNetwork.Spectrum).toBe(expectedSpectrum);
        expect(summary.lostUsersByNetwork.Spectrum).toBe(summary.totalLostUsers);
      })
    );
  });
});

describe("Empty-set summary (task 3.4)", () => {
  // _Requirements: 7.5, 7.6, 6.4_
  it("returns zeros for an empty list", () => {
    const summary = computeSummary([]);
    expect(summary.activeOutageCount).toBe(0);
    expect(summary.totalLostUsers).toBe(0);
    expect(summary.peakGrowthRatePerMin).toBe(0);
    expect(summary.reportableCount).toBe(0);
    expect(summary.lostUsersByNetwork.Spectrum).toBe(0);
  });
});

describe("Property 9: Reportable count reflects the threshold", () => {
  // **Property 9: Reportable count reflects the threshold**
  // **Validates: Requirements 15.1, 15.2**
  const { FCC_REPORT_THRESHOLD } = require("../constants");

  it("reportableCount equals the number of outages at/over 900k (0 for empty)", () => {
    fc.assert(
      fc.property(validOutageListArb, (outages) => {
        const summary = computeSummary(outages);
        const expected = outages.filter(
          (o) => o.currentLostUsers >= FCC_REPORT_THRESHOLD
        ).length;
        expect(summary.reportableCount).toBe(expected);
      })
    );
    expect(computeSummary([]).reportableCount).toBe(0);
  });

  it("counts explicit at/over-threshold outages (example)", () => {
    const mk = (id, network, lost) => ({
      id,
      name: id,
      network,
      region: "R",
      lat: 40,
      lng: -100,
      currentLostUsers: lost,
      growthRatePerMin: 10,
      severity: "major",
      startedAt: new Date().toISOString(),
    });
    const outages = [
      mk("a", "Spectrum", FCC_REPORT_THRESHOLD), // exactly at threshold -> reportable
      mk("b", "Spectrum", FCC_REPORT_THRESHOLD + 50000), // over -> reportable
      mk("c", "Spectrum", FCC_REPORT_THRESHOLD - 1), // just under -> not
      mk("d", "Spectrum", 1000), // low -> not
    ];
    expect(computeSummary(outages).reportableCount).toBe(2);
  });
});
