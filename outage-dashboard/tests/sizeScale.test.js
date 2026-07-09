/*
 * sizeScale.test.js — Property 2: size scale is monotonic and bounded (task 4.2).
 */
const fc = require("fast-check");
const { radiusForGrowthRate } = require("../sizeScale");
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
