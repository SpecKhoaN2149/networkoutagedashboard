/*
 * mockData.test.js — Property 8 + seed dataset constraint tests (tasks 2.2, 2.3).
 */
const fc = require("fast-check");
const { getMockOutages } = require("../mockData");
const {
  isWithinUsBounds,
  isValidOutage,
  NETWORKS,
} = require("../constants");

// Known US Census region membership by seed city coordinate. Used to assert
// the seed set spans at least 4 distinct regions.
function regionForCoord(lat, lng) {
  // Northeast: NY, Boston
  if (lat >= 38 && lng >= -80) return "Northeast";
  // Midwest: Chicago, Minneapolis
  if (lat >= 38 && lng < -80 && lng >= -100) return "Midwest";
  // West: LA, Phoenix, Seattle (lng < -100)
  if (lng < -100) return "West";
  // South: Dallas, Atlanta, Miami (lat < 38, lng >= -100)
  return "South";
}

describe("Property 8: Seed outages fall within the US bounding box", () => {
  // **Property 8: Seed outages fall within the US bounding box**
  // **Validates: Requirements 5.3**
  it("every seed outage lat/lng is within US_BOUNDS", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const outages = getMockOutages();
        return outages.every((o) => isWithinUsBounds(o.lat, o.lng));
      })
    );
  });
});

describe("Seed dataset constraints (task 2.3)", () => {
  it("provides at least 8 outages", () => {
    expect(getMockOutages().length).toBeGreaterThanOrEqual(8);
  });

  it("covers all 4 US Census regions", () => {
    const regions = new Set(
      getMockOutages().map((o) => regionForCoord(o.lat, o.lng))
    );
    expect(regions.size).toBeGreaterThanOrEqual(4);
    expect(regions.has("Northeast")).toBe(true);
    expect(regions.has("Midwest")).toBe(true);
    expect(regions.has("South")).toBe(true);
    expect(regions.has("West")).toBe(true);
  });

  it("has no two outages sharing identical lat/lng", () => {
    const outages = getMockOutages();
    const coords = outages.map((o) => o.lat + "," + o.lng);
    expect(new Set(coords).size).toBe(outages.length);
  });

  it("has unique ids", () => {
    const outages = getMockOutages();
    const ids = outages.map((o) => o.id);
    expect(new Set(ids).size).toBe(outages.length);
  });

  it("only uses the 'Spectrum' network value", () => {
    const outages = getMockOutages();
    outages.forEach((o) => {
      expect(NETWORKS).toContain(o.network);
      expect(o.network).toBe("Spectrum");
    });
  });

  it("every seed outage passes isValidOutage", () => {
    getMockOutages().forEach((o) => {
      expect(isValidOutage(o)).toBe(true);
    });
  });
});
