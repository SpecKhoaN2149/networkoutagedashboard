/*
 * constants.test.js — Unit tests for the validation helpers (task 1.2).
 *
 * Covers isValidOutage acceptance/rejection and isValidCoordinate boundary
 * checks. _Requirements: 6.1, 14.6_
 */
const {
  isValidOutage,
  isValidCoordinate,
  COORD_LIMITS,
} = require("../constants");

function validOutage(overrides) {
  return Object.assign(
    {
      id: "otg-001",
      name: "Fiber Backbone Degradation",
      network: "Spectrum",
      region: "New York, NY",
      lat: 40.7128,
      lng: -74.006,
      currentLostUsers: 48200,
      growthRatePerMin: 320,
      severity: "critical",
      startedAt: "2024-01-01T00:00:00.000Z",
      status: "active",
    },
    overrides || {}
  );
}

describe("isValidOutage", () => {
  it("accepts a well-formed outage record", () => {
    expect(isValidOutage(validOutage())).toBe(true);
  });

  it("accepts the only allowed network value (Spectrum)", () => {
    expect(isValidOutage(validOutage({ network: "Spectrum" }))).toBe(true);
  });

  it("rejects the retired 'Cox' network value", () => {
    expect(isValidOutage(validOutage({ network: "Cox" }))).toBe(false);
  });

  it("accepts a record with no severity field (severity optional)", () => {
    const o = validOutage();
    delete o.severity;
    expect(isValidOutage(o)).toBe(true);
  });

  it("rejects latitude below the valid range", () => {
    expect(isValidOutage(validOutage({ lat: -91 }))).toBe(false);
  });

  it("rejects latitude above the valid range", () => {
    expect(isValidOutage(validOutage({ lat: 91 }))).toBe(false);
  });

  it("rejects longitude below the valid range", () => {
    expect(isValidOutage(validOutage({ lng: -181 }))).toBe(false);
  });

  it("rejects longitude above the valid range", () => {
    expect(isValidOutage(validOutage({ lng: 181 }))).toBe(false);
  });

  it("rejects negative currentLostUsers", () => {
    expect(isValidOutage(validOutage({ currentLostUsers: -1 }))).toBe(false);
  });

  it("rejects negative growthRatePerMin", () => {
    expect(isValidOutage(validOutage({ growthRatePerMin: -1 }))).toBe(false);
  });

  it("rejects an invalid network value", () => {
    expect(isValidOutage(validOutage({ network: "Verizon" }))).toBe(false);
  });

  it("rejects an empty network value", () => {
    expect(isValidOutage(validOutage({ network: "" }))).toBe(false);
  });

  it("rejects a null network value", () => {
    expect(isValidOutage(validOutage({ network: null }))).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(isValidOutage(validOutage({ id: "" }))).toBe(false);
  });

  it("rejects an invalid severity value", () => {
    expect(isValidOutage(validOutage({ severity: "catastrophic" }))).toBe(
      false
    );
  });

  it("rejects non-object / nullish inputs", () => {
    expect(isValidOutage(null)).toBe(false);
    expect(isValidOutage(undefined)).toBe(false);
    expect(isValidOutage(42)).toBe(false);
  });

  it("rejects non-finite numeric fields", () => {
    expect(isValidOutage(validOutage({ currentLostUsers: NaN }))).toBe(false);
    expect(isValidOutage(validOutage({ growthRatePerMin: Infinity }))).toBe(
      false
    );
  });
});

describe("isValidCoordinate boundary checks", () => {
  it("accepts coordinates exactly on the boundary", () => {
    expect(isValidCoordinate(COORD_LIMITS.latMin, COORD_LIMITS.lngMin)).toBe(
      true
    );
    expect(isValidCoordinate(COORD_LIMITS.latMax, COORD_LIMITS.lngMax)).toBe(
      true
    );
  });

  it("accepts the origin", () => {
    expect(isValidCoordinate(0, 0)).toBe(true);
  });

  it("rejects coordinates just outside the boundary", () => {
    expect(isValidCoordinate(COORD_LIMITS.latMin - 0.0001, 0)).toBe(false);
    expect(isValidCoordinate(COORD_LIMITS.latMax + 0.0001, 0)).toBe(false);
    expect(isValidCoordinate(0, COORD_LIMITS.lngMin - 0.0001)).toBe(false);
    expect(isValidCoordinate(0, COORD_LIMITS.lngMax + 0.0001)).toBe(false);
  });

  it("rejects non-numeric or non-finite coordinates", () => {
    expect(isValidCoordinate("40", -74)).toBe(false);
    expect(isValidCoordinate(NaN, 0)).toBe(false);
    expect(isValidCoordinate(0, Infinity)).toBe(false);
  });
});
