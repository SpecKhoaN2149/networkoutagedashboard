/*
 * colorScale.test.js — Property 3 (monotonic color) + clamping/determinism
 * unit tests (tasks 5.2, 5.3).
 */
const fc = require("fast-check");
const { colorForLostUsers } = require("../colorScale");
const { LOST_USERS_DOMAIN, HEAT_RAMP_STOPS } = require("../constants");

const YELLOW = HEAT_RAMP_STOPS[0].color; // coldest endpoint
const RED = HEAT_RAMP_STOPS[HEAT_RAMP_STOPS.length - 1].color; // hottest endpoint

/**
 * Numeric "hotness" metric on a #rrggbb color consistent with the
 * yellow -> orange -> red ramp. Along the ramp both the green and blue channels
 * decrease monotonically (yellow has the highest G/B, red the lowest), so a
 * larger (510 - G - B) denotes a hotter color. This is a monotonically
 * increasing function of ramp position.
 */
function hotness(hex) {
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 255 - g + (255 - b);
}

describe("Property 3: Color scale is monotonic (task 5.2)", () => {
  // **Property 3: Color scale is monotonic**
  // **Validates: Requirements 3.1, 3.2**
  it("a <= b implies colorForLostUsers(b) is at least as hot as (a)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5000, max: 120000 }),
        fc.integer({ min: -5000, max: 120000 }),
        (x, y) => {
          const a = Math.min(x, y);
          const b = Math.max(x, y);
          expect(hotness(colorForLostUsers(b))).toBeGreaterThanOrEqual(
            hotness(colorForLostUsers(a))
          );
        }
      )
    );
  });

  it("returns a well-formed #rrggbb string", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), (n) => {
        expect(colorForLostUsers(n)).toMatch(/^#[0-9a-f]{6}$/);
      })
    );
  });
});

describe("Color clamping + determinism (task 5.3)", () => {
  // _Requirements: 3.3, 3.4, 14.7_
  it("maps values <= min bound to the yellow endpoint color", () => {
    expect(colorForLostUsers(LOST_USERS_DOMAIN.min)).toBe(YELLOW);
    expect(colorForLostUsers(LOST_USERS_DOMAIN.min - 1)).toBe(YELLOW);
    expect(colorForLostUsers(-99999)).toBe(YELLOW);
  });

  it("maps values >= max bound to the red endpoint color", () => {
    expect(colorForLostUsers(LOST_USERS_DOMAIN.max)).toBe(RED);
    expect(colorForLostUsers(LOST_USERS_DOMAIN.max + 1)).toBe(RED);
    expect(colorForLostUsers(999999999)).toBe(RED);
  });

  it("yields identical output for identical input (determinism)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), (n) => {
        expect(colorForLostUsers(n)).toBe(colorForLostUsers(n));
      })
    );
  });
});
