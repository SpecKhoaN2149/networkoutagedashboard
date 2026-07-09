/*
 * filters.test.js — Unit + property tests for the pure outage filter helper.
 *
 * Covers:
 *   - severity filtering ("all" vs a specific level)
 *   - reportableOnly using the 900k FCC threshold (constants.isReportable)
 *   - case-insensitive name/region substring search
 *   - empty / "all" defaults returning everything
 *   - combined filters (AND semantics)
 */
const fc = require("fast-check");
const { filterOutages } = require("../filters");
const { FCC_REPORT_THRESHOLD, isReportable } = require("../constants");
const { validOutageListArb } = require("./arbitraries");

function mk(overrides) {
  return Object.assign(
    {
      id: "otg-x",
      name: "Fiber Backbone Degradation",
      network: "Spectrum",
      region: "New York, NY",
      lat: 40.7128,
      lng: -74.006,
      currentLostUsers: 50000,
      growthRatePerMin: 100,
      severity: "major",
      status: "active",
    },
    overrides || {}
  );
}

const SAMPLE = [
  mk({ id: "a", name: "Fiber Cut", region: "New York, NY", severity: "critical", currentLostUsers: 950000 }),
  mk({ id: "b", name: "DNS Fault", region: "Boston, MA", severity: "minor", currentLostUsers: 40000 }),
  mk({ id: "c", name: "Router Loss", region: "Chicago, IL", severity: "major", currentLostUsers: 900000 }),
  mk({ id: "d", name: "Power Event", region: "Dallas, TX", severity: "critical", currentLostUsers: 100000 }),
  mk({ id: "e", name: "Peering Congestion", region: "Newark, NJ", severity: "minor", currentLostUsers: 899999 }),
];

describe("filterOutages — defaults return everything", () => {
  it("no filter returns the full list", () => {
    expect(filterOutages(SAMPLE)).toHaveLength(SAMPLE.length);
  });

  it("all-defaults filter returns the full list", () => {
    const out = filterOutages(SAMPLE, {
      severity: "all",
      reportableOnly: false,
      search: "",
    });
    expect(out).toHaveLength(SAMPLE.length);
  });

  it("returns [] for a non-array input", () => {
    expect(filterOutages(null, { severity: "all" })).toEqual([]);
    expect(filterOutages(undefined)).toEqual([]);
  });

  it("does not mutate the input list", () => {
    const copy = SAMPLE.slice();
    filterOutages(SAMPLE, { severity: "critical" });
    expect(SAMPLE).toEqual(copy);
  });
});

describe("filterOutages — severity filtering", () => {
  it("keeps only outages of the chosen severity", () => {
    const crit = filterOutages(SAMPLE, { severity: "critical" });
    expect(crit.map((o) => o.id).sort()).toEqual(["a", "d"]);

    const minor = filterOutages(SAMPLE, { severity: "minor" });
    expect(minor.map((o) => o.id).sort()).toEqual(["b", "e"]);

    const major = filterOutages(SAMPLE, { severity: "major" });
    expect(major.map((o) => o.id)).toEqual(["c"]);
  });

  it("'all' matches every severity (property)", () => {
    fc.assert(
      fc.property(validOutageListArb, (outages) => {
        expect(filterOutages(outages, { severity: "all" })).toHaveLength(
          outages.length
        );
      })
    );
  });
});

describe("filterOutages — reportableOnly (900k FCC threshold)", () => {
  it("keeps only outages at/over 900k", () => {
    const out = filterOutages(SAMPLE, { reportableOnly: true });
    // a = 950000 (over), c = 900000 (exactly at threshold) -> kept
    expect(out.map((o) => o.id).sort()).toEqual(["a", "c"]);
  });

  it("exactly at the threshold is reportable; just under is not", () => {
    const atThreshold = mk({ id: "at", currentLostUsers: FCC_REPORT_THRESHOLD });
    const under = mk({ id: "under", currentLostUsers: FCC_REPORT_THRESHOLD - 1 });
    const out = filterOutages([atThreshold, under], { reportableOnly: true });
    expect(out.map((o) => o.id)).toEqual(["at"]);
  });

  it("reportableOnly matches constants.isReportable (property)", () => {
    fc.assert(
      fc.property(validOutageListArb, (outages) => {
        const out = filterOutages(outages, { reportableOnly: true });
        const expected = outages.filter(isReportable);
        expect(out).toEqual(expected);
      })
    );
  });

  it("reportableOnly false keeps everyone", () => {
    expect(filterOutages(SAMPLE, { reportableOnly: false })).toHaveLength(
      SAMPLE.length
    );
  });
});

describe("filterOutages — case-insensitive name/region search", () => {
  it("matches against the name (case-insensitive)", () => {
    const out = filterOutages(SAMPLE, { search: "fiber" });
    expect(out.map((o) => o.id)).toEqual(["a"]);
    const upper = filterOutages(SAMPLE, { search: "FIBER" });
    expect(upper.map((o) => o.id)).toEqual(["a"]);
  });

  it("matches against the region (case-insensitive)", () => {
    const out = filterOutages(SAMPLE, { search: "new" });
    // "New York, NY" (a) and "Newark, NJ" (e)
    expect(out.map((o) => o.id).sort()).toEqual(["a", "e"]);
  });

  it("empty/whitespace search matches everything", () => {
    expect(filterOutages(SAMPLE, { search: "" })).toHaveLength(SAMPLE.length);
    expect(filterOutages(SAMPLE, { search: "   " })).toHaveLength(
      SAMPLE.length
    );
  });

  it("a non-matching query returns []", () => {
    expect(filterOutages(SAMPLE, { search: "zzz-nomatch" })).toEqual([]);
  });
});

describe("filterOutages — combined filters (AND semantics)", () => {
  it("applies severity + reportableOnly + search together", () => {
    // critical AND reportable AND region/name contains "york"
    const out = filterOutages(SAMPLE, {
      severity: "critical",
      reportableOnly: true,
      search: "york",
    });
    expect(out.map((o) => o.id)).toEqual(["a"]);
  });

  it("returns [] when the combination excludes everything", () => {
    // minor AND reportable — none of the minors are at/over 900k
    const out = filterOutages(SAMPLE, {
      severity: "minor",
      reportableOnly: true,
    });
    expect(out).toEqual([]);
  });

  it("combined filter is the intersection of individual filters (property)", () => {
    const filterArb = fc.record({
      severity: fc.constantFrom("all", "critical", "major", "minor"),
      reportableOnly: fc.boolean(),
      search: fc.constantFrom("", "new", "fiber", "zzz", "ny"),
    });
    fc.assert(
      fc.property(validOutageListArb, filterArb, (outages, filter) => {
        const combined = filterOutages(outages, filter);
        const stepwise = filterOutages(
          filterOutages(
            filterOutages(outages, { severity: filter.severity }),
            { reportableOnly: filter.reportableOnly }
          ),
          { search: filter.search }
        );
        expect(combined).toEqual(stepwise);
      })
    );
  });
});
