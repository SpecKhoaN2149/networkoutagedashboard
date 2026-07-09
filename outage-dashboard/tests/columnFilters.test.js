/*
 * columnFilters.test.js — Unit tests for the pure per-column filter helpers
 * `filterOutagesByColumns` and `filterPsaps` (task 3).
 *
 * Covers: text-contains case-insensitivity, select exact match, AND semantics,
 * empty = all, and non-mutation of inputs.
 */
const {
  filterOutagesByColumns,
  filterPsaps,
} = require("../filters");

function mk(overrides) {
  return Object.assign(
    {
      id: "otg-x",
      name: "Fiber Backbone Degradation",
      network: "Spectrum",
      region: "New York, NY",
      currentLostUsers: 50000,
      growthRatePerMin: 100,
      severity: "major",
      cause: "Fiber cut",
      psapStatus: "pending",
      status: "active",
    },
    overrides || {}
  );
}

const OUTAGES = [
  mk({ id: "a", name: "Fiber Cut", region: "New York, NY", cause: "Fiber cut", severity: "critical", psapStatus: "acknowledged" }),
  mk({ id: "b", name: "DNS Fault", region: "Boston, MA", cause: "DNS/Config error", severity: "minor", psapStatus: "not_required" }),
  mk({ id: "c", name: "Router Loss", region: "Chicago, IL", cause: "Equipment failure", severity: "major", psapStatus: "notified" }),
  mk({ id: "d", name: "Power Event", region: "Dallas, TX", cause: "Power event", severity: "critical", psapStatus: "acknowledged" }),
  mk({ id: "e", name: "Peering Congestion", region: "Newark, NJ", cause: "Upstream congestion", severity: "minor", psapStatus: "pending" }),
];

describe("filterOutagesByColumns — empty = all", () => {
  it("no filter returns the full list", () => {
    expect(filterOutagesByColumns(OUTAGES)).toHaveLength(OUTAGES.length);
    expect(filterOutagesByColumns(OUTAGES, {})).toHaveLength(OUTAGES.length);
  });

  it("empty strings and 'all' selects match everything", () => {
    const out = filterOutagesByColumns(OUTAGES, {
      name: "",
      region: "   ",
      cause: "all",
      severity: "all",
      psapStatus: "",
    });
    expect(out).toHaveLength(OUTAGES.length);
  });

  it("returns [] for non-array input", () => {
    expect(filterOutagesByColumns(null, { name: "x" })).toEqual([]);
    expect(filterOutagesByColumns(undefined)).toEqual([]);
  });

  it("does not mutate the input list", () => {
    const copy = OUTAGES.slice();
    filterOutagesByColumns(OUTAGES, { name: "fiber" });
    expect(OUTAGES).toEqual(copy);
  });
});

describe("filterOutagesByColumns — text contains (case-insensitive)", () => {
  it("matches name substring regardless of case", () => {
    expect(filterOutagesByColumns(OUTAGES, { name: "fiber" }).map((o) => o.id)).toEqual(["a"]);
    expect(filterOutagesByColumns(OUTAGES, { name: "FIBER" }).map((o) => o.id)).toEqual(["a"]);
    expect(filterOutagesByColumns(OUTAGES, { name: "loss" }).map((o) => o.id)).toEqual(["c"]);
  });

  it("matches region substring regardless of case", () => {
    expect(
      filterOutagesByColumns(OUTAGES, { region: "new" }).map((o) => o.id).sort()
    ).toEqual(["a", "e"]);
    expect(
      filterOutagesByColumns(OUTAGES, { region: "TX" }).map((o) => o.id)
    ).toEqual(["d"]);
  });
});

describe("filterOutagesByColumns — select exact match", () => {
  it("cause select matches exactly", () => {
    expect(
      filterOutagesByColumns(OUTAGES, { cause: "Fiber cut" }).map((o) => o.id)
    ).toEqual(["a"]);
    // Exact match: partial value does not match a select.
    expect(filterOutagesByColumns(OUTAGES, { cause: "Fiber" })).toEqual([]);
  });

  it("severity select matches exactly", () => {
    expect(
      filterOutagesByColumns(OUTAGES, { severity: "critical" }).map((o) => o.id).sort()
    ).toEqual(["a", "d"]);
  });

  it("psapStatus select matches exactly", () => {
    expect(
      filterOutagesByColumns(OUTAGES, { psapStatus: "acknowledged" }).map((o) => o.id).sort()
    ).toEqual(["a", "d"]);
  });
});

describe("filterOutagesByColumns — AND semantics", () => {
  it("combines text and select filters with AND", () => {
    const out = filterOutagesByColumns(OUTAGES, {
      severity: "critical",
      region: "york",
    });
    expect(out.map((o) => o.id)).toEqual(["a"]);
  });

  it("returns [] when the combination excludes everything", () => {
    const out = filterOutagesByColumns(OUTAGES, {
      severity: "minor",
      cause: "Fiber cut",
    });
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

function psap(overrides) {
  return Object.assign(
    {
      id: "psap-x",
      name: "New York City PSAP",
      county: "New York County",
      state: "NY",
      status: "pending",
      linkedOutageId: "otg-001",
    },
    overrides || {}
  );
}

const PSAPS = [
  psap({ id: "p1", name: "New York City PSAP", county: "New York County", state: "NY", status: "pending", linkedOutageId: "o1" }),
  psap({ id: "p2", name: "Boston PSAP", county: "Suffolk County", state: "MA", status: "not_required", linkedOutageId: "o2" }),
  psap({ id: "p3", name: "Dallas PSAP", county: "Dallas County", state: "TX", status: "acknowledged", linkedOutageId: "o3" }),
];

const OUTAGE_LOOKUP = {
  o1: { id: "o1", name: "Fiber Backbone Degradation" },
  o2: { id: "o2", name: "Regional DNS Resolver Fault" },
  o3: { id: "o3", name: "Data Center Power Event" },
};

describe("filterPsaps — empty = all + non-mutation", () => {
  it("no filter returns the full list", () => {
    expect(filterPsaps(PSAPS, {}, OUTAGE_LOOKUP)).toHaveLength(PSAPS.length);
    expect(filterPsaps(PSAPS)).toHaveLength(PSAPS.length);
  });

  it("returns [] for non-array input", () => {
    expect(filterPsaps(null, { name: "x" })).toEqual([]);
  });

  it("does not mutate the input list", () => {
    const copy = PSAPS.slice();
    filterPsaps(PSAPS, { name: "boston" }, OUTAGE_LOOKUP);
    expect(PSAPS).toEqual(copy);
  });
});

describe("filterPsaps — text + select filters", () => {
  it("matches PSAP name (case-insensitive)", () => {
    expect(
      filterPsaps(PSAPS, { name: "boston" }, OUTAGE_LOOKUP).map((p) => p.id)
    ).toEqual(["p2"]);
  });

  it("matches county/state combined text", () => {
    expect(
      filterPsaps(PSAPS, { countyState: "tx" }, OUTAGE_LOOKUP).map((p) => p.id)
    ).toEqual(["p3"]);
    expect(
      filterPsaps(PSAPS, { countyState: "county" }, OUTAGE_LOOKUP).map((p) => p.id).sort()
    ).toEqual(["p1", "p2", "p3"]);
  });

  it("matches linked outage name via lookup (case-insensitive)", () => {
    expect(
      filterPsaps(PSAPS, { linkedOutage: "power" }, OUTAGE_LOOKUP).map((p) => p.id)
    ).toEqual(["p3"]);
  });

  it("status select matches exactly ('all' => everything)", () => {
    expect(
      filterPsaps(PSAPS, { status: "acknowledged" }, OUTAGE_LOOKUP).map((p) => p.id)
    ).toEqual(["p3"]);
    expect(filterPsaps(PSAPS, { status: "all" }, OUTAGE_LOOKUP)).toHaveLength(
      PSAPS.length
    );
  });

  it("AND-combines text + select filters", () => {
    const out = filterPsaps(
      PSAPS,
      { countyState: "county", status: "pending" },
      OUTAGE_LOOKUP
    );
    expect(out.map((p) => p.id)).toEqual(["p1"]);
  });
});
