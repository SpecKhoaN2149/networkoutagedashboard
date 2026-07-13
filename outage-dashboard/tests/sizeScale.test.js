/*
 * sizeScale.test.js — Property 2: size scale is monotonic and bounded (task 4.2).
 */
const fc = require("fast-check");
const { radiusForGrowthRate, radiusForLostUsers } = require("../sizeScale");
const { RADIUS_BOUNDS } = require("../constants");

describe("Property 2: Size scale is monotonic and bounded (task 4.2)", () => {
  // **Property 2: Size scale is monotonic and bounded**
  // **Validates: Requirements 2.1, 2.2, 2.3, 14.4**

  it("returns a radius within [6, 40] for any input (incl. out-of-domain)", () => {
    fc.assert(
      fc.property(
        // Include out-of-domain values (below 0 and above 500) plus extremes.
        fc.double({ min: -1000, max: 2000, noNaN: true }),
        (rate) => {
          const r = radiusForGrowthRate(rate);
          expect(r).toBeGreaterThanOrEqual(RADIUS_BOUNDS.min);
          expect(r).toBeLessThanOrEqual(RADIUS_BOUNDS.max);
        }
      )
    );
  });

  it("stays within bounds even for non-finite / NaN inputs", () => {
    [NaN, Infinity, -Infinity, undefined, null].forEach((bad) => {
      const r = radiusForGrowthRate(bad);
      expect(r).toBeGreaterThanOrEqual(RADIUS_BOUNDS.min);
      expect(r).toBeLessThanOrEqual(RADIUS_BOUNDS.max);
    });
  });

  it("is monotonic non-decreasing: a <= b implies radius(a) <= radius(b)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 2000, noNaN: true }),
        fc.double({ min: -1000, max: 2000, noNaN: true }),
        (x, y) => {
          const a = Math.min(x, y);
          const b = Math.max(x, y);
          expect(radiusForGrowthRate(a)).toBeLessThanOrEqual(
            radiusForGrowthRate(b)
          );
        }
      )
    );
  });
});

describe("Property 2b: Lost-users size scale is monotonic and bounded", () => {
  // radiusForLostUsers maps CURRENT lost users (domain [0, 900000]) to a radius
  // within [6, 40]; both size and color now encode impact (lost users).

  it("returns a radius within [6, 40] for any input (incl. out-of-domain)", () => {
    fc.assert(
      fc.property(
        // Include out-of-domain values (below 0 and above 900000) plus extremes.
        fc.double({ min: -100000, max: 2000000, noNaN: true }),
        (users) => {
          const r = radiusForLostUsers(users);
          expect(r).toBeGreaterThanOrEqual(RADIUS_BOUNDS.min);
          expect(r).toBeLessThanOrEqual(RADIUS_BOUNDS.max);
        }
      )
    );
  });

  it("stays within bounds even for non-finite / NaN inputs", () => {
    [NaN, Infinity, -Infinity, undefined, null].forEach((bad) => {
      const r = radiusForLostUsers(bad);
      expect(r).toBeGreaterThanOrEqual(RADIUS_BOUNDS.min);
      expect(r).toBeLessThanOrEqual(RADIUS_BOUNDS.max);
    });
  });

  it("is monotonic non-decreasing: a <= b implies radius(a) <= radius(b)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100000, max: 2000000, noNaN: true }),
        fc.double({ min: -100000, max: 2000000, noNaN: true }),
        (x, y) => {
          const a = Math.min(x, y);
          const b = Math.max(x, y);
          expect(radiusForLostUsers(a)).toBeLessThanOrEqual(
            radiusForLostUsers(b)
          );
        }
      )
    );
  });

  it("maps domain endpoints exactly: 0 -> 6px, 900000 -> 40px", () => {
    expect(radiusForLostUsers(0)).toBe(RADIUS_BOUNDS.min);
    expect(radiusForLostUsers(900000)).toBe(RADIUS_BOUNDS.max);
  });
});
