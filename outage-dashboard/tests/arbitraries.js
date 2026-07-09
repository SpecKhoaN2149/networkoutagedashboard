/*
 * arbitraries.js — Shared fast-check generators for the logic-layer test suite.
 *
 * Produces VALID Outage objects (per the design's Model 1 / Requirement 6.1 and
 * the isValidOutage rules): a valid network, coordinates inside the continental
 * US bounding box (so isValidCoordinate and isWithinUsBounds both hold),
 * non-negative integer counts within their domains, a valid severity, and a
 * non-empty id string.
 *
 * Counts are generated as non-negative INTEGERS so that summed aggregates are
 * exact (no floating-point drift), which lets the summary/partition properties
 * assert exact equality.
 */
const fc = require("fast-check");

// A non-empty id string like "otg-abc".
const idArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .map((s) => "otg-" + s);

// A single valid Outage record placed within the US bounding box.
const validOutageArb = fc.record({
  id: idArb,
  name: fc.string({ maxLength: 40 }),
  network: fc.constant("Spectrum"),
  region: fc.string({ maxLength: 40 }),
  lat: fc.double({ min: 24, max: 50, noNaN: true }),
  lng: fc.double({ min: -125, max: -66, noNaN: true }),
  // Non-negative integer within the lost-users domain -> exact sums.
  currentLostUsers: fc.integer({ min: 0, max: 100000 }),
  // Non-negative integer within the growth-rate domain -> exact max.
  growthRatePerMin: fc.integer({ min: 0, max: 500 }),
  severity: fc.constantFrom("critical", "major", "minor"),
  status: fc.constant("active"),
});

// A list (possibly empty) of valid outages.
const validOutageListArb = fc.array(validOutageArb, { maxLength: 30 });

// A non-empty list of valid outages.
const nonEmptyOutageListArb = fc.array(validOutageArb, {
  minLength: 1,
  maxLength: 30,
});

module.exports = {
  idArb,
  validOutageArb,
  validOutageListArb,
  nonEmptyOutageListArb,
};
