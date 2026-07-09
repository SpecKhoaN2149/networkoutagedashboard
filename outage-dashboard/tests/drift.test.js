/*
 * drift.test.js — Property 7: live drift preserves validity (task 7.2).
 */
const fc = require("fast-check");
const { tickOutages } = require("../drift");
const { validOutageListArb } = require("./arbitraries");

describe("Property 7: Live drift preserves validity (task 7.2)", () => {
  // **Property 7: Live drift preserves validity**
  // **Validates: Requirements 12.2, 12.3**
  it("preserves length, id/network per element, and non-negative metrics", () => {
    fc.assert(
      fc.property(validOutageListArb, (outages) => {
        const next = tickOutages(outages);

        // Same length (Req 12.2).
        expect(next.length).toBe(outages.length);

        for (let i = 0; i < outages.length; i++) {
          // Same id and network per element (Req 12.2).
          expect(next[i].id).toBe(outages[i].id);
          expect(next[i].network).toBe(outages[i].network);

          // Metrics remain non-negative (Req 12.3).
          expect(next[i].currentLostUsers).toBeGreaterThanOrEqual(0);
          expect(next[i].growthRatePerMin).toBeGreaterThanOrEqual(0);
        }
      })
    );
  });
});
