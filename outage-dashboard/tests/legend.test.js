/*
 * legend.test.js — Property 4: legend matches the encoding (task 6.2).
 */
const fc = require("fast-check");
const { getLegendModel } = require("../legend");
const { radiusForLostUsers } = require("../sizeScale");
const { colorForLostUsers } = require("../colorScale");

describe("Property 4: Legend matches the encoding (task 6.2)", () => {
  // **Property 4: Legend matches the encoding**
  // **Validates: Requirements 4.2, 4.3**
  it("every size sample radiusPx equals radiusForLostUsers of its lostUsers", () => {
    // getLegendModel is deterministic; wrap in a property so it is exercised
    // consistently and reads as a property assertion.
    fc.assert(
      fc.property(fc.constant(null), () => {
        const model = getLegendModel();
        return model.sizeSamples.every(
          (s) => s.radiusPx === radiusForLostUsers(s.lostUsers)
        );
      })
    );
  });

  it("every color stop color equals colorForLostUsers of its lostUsers", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const model = getLegendModel();
        return model.colorStops.every(
          (s) => s.color === colorForLostUsers(s.lostUsers)
        );
      })
    );
  });
});
