# Implementation Plan: Outage Dashboard Mockup

## Overview

This plan builds the Spectrum + Cox post-merger outage dashboard as a self-contained, buildless HTML/CSS/JS artifact. The strategy is to implement the pure, testable logic modules first (mock data, summary aggregation, size/color scales, legend model, live drift) so the correctness properties can be validated with fast-check property tests, then layer the Leaflet map rendering and supporting UI components on top, and finally wire the live-drift timer and error/edge handling together.

To keep the mockup buildless (open via `file://`) while still allowing the pure logic to be imported by a test runner, each logic module attaches its functions to a browser global and also conditionally exports them for Node/Vitest using a small dual-mode footer:

```javascript
if (typeof module !== "undefined" && module.exports) module.exports = { /* fns */ };
```

Logic modules are loaded in the browser via plain `<script>` tags (no ES module imports, which fail over `file://`). All shared layout and component CSS classes are defined once in `styles.css` during scaffolding so later component tasks only write their own JS.

**Implementation language:** JavaScript (vanilla, per design). **Property test library:** fast-check with Vitest.

## Tasks

- [x] 1. Project scaffolding and shared data model
  - [x] 1.1 Create buildless file structure, shared constants, and validation helpers
    - Create `index.html` with the responsive dashboard layout skeleton (header region, KPI card row, main grid with map panel + side panel containing legend, trend sparkline, and outage table) and `<script>`/`<link>` tags wiring in Leaflet (local vendored copy) and all logic/component files
    - Create `styles.css` with all layout and component CSS classes up front (grid, KPI cards, severity chips, legend, sparkline, table, header, live indicator, tiles-unavailable notice) so later tasks add no CSS
    - Create `constants.js` defining shared domain bounds (US bounding box lat 24–50, lng -125 to -66; growth-rate domain 0–500; radius bounds 6–40; color heat-ramp thresholds/stops) plus `isValidOutage(outage)` and coordinate-range validation helpers, using the dual-mode export footer
    - Create empty `app.js` entry point that will later wire everything together
    - Vendor the Leaflet library and its stylesheet locally so no installation/CDN is required for the library itself
    - _Requirements: 13.1, 13.2, 13.3, 6.1_
  - [x]* 1.2 Write unit tests for validation helpers
    - Test `isValidOutage` accepts valid records and rejects out-of-range coordinates, negative counts, and invalid network values
    - _Requirements: 6.1, 14.6_

- [x] 2. Mock data seed set
  - [x] 2.1 Implement `getMockOutages` in `mockData.js`
    - Return at least 8 seed `Outage` records distributed across major US cities spanning the Northeast, Midwest, South, and West Census regions, each with a unique `id`, distinct lat/lng, a `network` of exactly "Spectrum" or "Cox", and varied severity, growth rate, and lost-user counts
    - Ensure every seed coordinate falls within the continental US bounding box (lat 24–50, lng -125 to -66)
    - _Requirements: 5.2, 5.3, 6.1_
  - [x]* 2.2 Write property test for seed placement
    - **Property 8: Seed outages fall within the US bounding box**
    - **Validates: Requirements 5.3**
  - [x]* 2.3 Write unit tests for seed dataset constraints
    - Assert at least 8 outages, coverage of 4 distinct regions, no duplicate coordinates, and only "Spectrum"/"Cox" network values
    - _Requirements: 5.2, 6.1_

- [x] 3. Dashboard summary aggregation
  - [x] 3.1 Implement `computeSummary` in `summary.js`
    - Compute `activeOutageCount`, `totalLostUsers`, `peakGrowthRatePerMin` (0 for empty), `mostSevereRegion`, and the per-network `lostUsersByNetwork` breakdown for Spectrum and Cox (0 when a network has no outages)
    - Ensure the Spectrum sum plus the Cox sum equals `totalLostUsers`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 6.2, 6.3, 6.4_
  - [x]* 3.2 Write property test for summary totals
    - **Property 1: Summary totals reflect the data**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
  - [x]* 3.3 Write property test for per-network partition
    - **Property 6: Per-network breakdown partitions the total**
    - **Validates: Requirements 6.1, 6.2, 6.3**
  - [x]* 3.4 Write unit tests for empty-set summary
    - Assert count, total, and peak growth are 0 and both network sums are 0 for an empty list
    - _Requirements: 7.5, 7.6, 6.4_

- [x] 4. Size scale (growth rate → radius)
  - [x] 4.1 Implement `radiusForGrowthRate` in `sizeScale.js`
    - Map growth rate over the 0–500 users/min domain to a radius clamped inclusively within [6px, 40px], monotonic increasing, clamping out-of-domain inputs to the nearest bound before deriving the radius
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 14.7_
  - [x]* 4.2 Write property test for the size scale
    - **Property 2: Size scale is monotonic and bounded**
    - **Validates: Requirements 2.1, 2.2, 2.3, 14.4**

- [x] 5. Color scale (current lost users → color)
  - [x] 5.1 Implement `colorForLostUsers` in `colorScale.js`
    - Map current lost users onto a continuous yellow → orange → red heat ramp, deterministic for equal inputs, clamping values at or below the min bound to yellow and at or above the max bound to red
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 14.7_
  - [x]* 5.2 Write property test for the color scale
    - **Property 3: Color scale is monotonic**
    - **Validates: Requirements 3.1, 3.2**
  - [x]* 5.3 Write unit tests for color clamping and determinism
    - Test endpoint clamping below/above bounds and identical output for identical input
    - _Requirements: 3.3, 3.4, 14.7_

- [x] 6. Legend model
  - [x] 6.1 Implement `getLegendModel` in `legend.js`
    - Produce three size samples labeled "slow"/"medium"/"fast" with `radiusPx` derived from `radiusForGrowthRate`, and at least three color stops with `color` derived from `colorForLostUsers`, so the legend is generated from the same scale functions the map uses
    - _Requirements: 4.2, 4.3_
  - [x]* 6.2 Write property test for legend consistency
    - **Property 4: Legend matches the encoding**
    - **Validates: Requirements 4.2, 4.3**

- [x] 7. Live drift
  - [x] 7.1 Implement `tickOutages` in `drift.js`
    - Return a same-length list preserving each outage's `id`, `network`, `lat`, and `lng`, mutating `currentLostUsers` and `growthRatePerMin` by no more than 20% of the previous value per tick and never below 0
    - _Requirements: 12.2, 12.3, 12.4_
  - [x]* 7.2 Write property test for live-drift validity
    - **Property 7: Live drift preserves validity**
    - **Validates: Requirements 12.2, 12.3**

- [x] 8. Checkpoint - Ensure all logic tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Map initialization and US framing
  - [x] 9.1 Implement `initMap` in `map.js`
    - Initialize Leaflet with OpenStreetMap tiles and set the initial view so the continental US bounding box (lat 24–50 N, lng 125–66 W) is fully contained in the viewport (center ~39.5°N, -98.35°W, zoom ~4)
    - _Requirements: 5.1, 13.3_

- [x] 10. Bubble rendering and popups
  - [x] 10.1 Implement `renderOutages` and `updateOutages` in `map.js`
    - Draw one `circleMarker` per valid outage at its lat/lng with radius from `radiusForGrowthRate` and fill color from `colorForLostUsers`; skip records whose coordinates are out of range; attach a popup per bubble showing name, region, network, current lost users, growth rate (users/min), severity, and start time; close popups on pointer-off/dismiss while leaving bubbles in place; `updateOutages` mutates existing bubbles' radius/color in place
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 14.5, 14.6_
  - [x]* 10.2 Write example test for rendered bubble count
    - **Property 5: Rendered bubble count matches active outages**
    - **Validates: Requirements 1.1, 14.3**

- [x] 11. Legend rendering
  - [x] 11.1 Implement `renderLegend` in `legendView.js`
    - Render exactly three labeled size samples ("slow"/"medium"/"fast") and a color gradient with at least three labeled threshold values from the `LegendModel`
    - _Requirements: 4.1, 4.2_

- [x] 12. KPI cards — ⚠️ IMPLEMENTED THEN REMOVED IN REDESIGN
  - **Superseded:** The five KPI cards were built and worked, but the map-hero redesign removed them from the UI. Their summary figures are now surfaced through the Detail Panel, the Reportable Alert Banner, and the Report Details Modal (see section 24). `kpiCards.js` remains on disk only so its existing tests keep passing; it is no longer wired into `index.html`.
  - [x] 12.1 Implement `renderKpiCards` in `kpiCards.js`
    - Render four cards: active outage count, total lost users, fastest-growing outage (name + growth rate matching peak growth), and Spectrum-vs-Cox breakdown; show zeros and no fastest-growing outage when the set is empty
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 14.3 (original requirement numbering; these requirements were reworked in the redesign)_

- [x] 13. Outage table
  - [x] 13.1 Implement `renderOutageTable` in `outageTable.js`
    - Render one row per outage with name, region, network, current lost users, growth rate, a severity chip visually distinct per severity level, and start time; render an empty-state message with zero rows when the set is empty
    - _Requirements: 10.1, 10.2, 14.4_

- [x] 14. Trend sparkline — ⚠️ IMPLEMENTED THEN REMOVED IN REDESIGN
  - **Superseded:** The trend sparkline was built and worked, but the map-hero redesign removed it from the UI. `trendSparkline.js` remains on disk only so its existing tests keep passing; it is no longer wired into `index.html`. The `11.x` requirement numbers it referenced were reassigned in the redesign to the PSAP Reporting and Status Page (see section 27).
  - [x] 14.1 Implement `renderTrendSparkline` in `trendSparkline.js`
    - Render total lost users as an ordered series retaining at most 30 points (dropping the oldest when exceeding 30); show at least one point on load, including 0 for an empty set
    - _Requirements: original 11.1, 11.3, 11.4 (requirement numbering reassigned in the redesign)_

- [x] 15. Header
  - [x] 15.1 Implement `renderHeader` in `header.js`
    - Render the exact "Spectrum + Cox" branding text, a last-updated timestamp showing hours/minutes/seconds, and a live indicator in a visually active state
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 16. Live-drift wiring and synchronization
  - [x] 16.1 Wire the dashboard together in `app.js`
    - On load, get seed outages, compute the summary, and render the map bubbles, legend, KPI cards, outage table, trend sparkline, and header from the same data; start a fixed repeating timer between 2 and 10 seconds that calls `tickOutages`, recomputes the summary, appends one trend point, and refreshes map bubbles, KPI cards, outage table, sparkline, and last-updated timestamp from the single updated list within 1 second of the tick
    - _Requirements: 12.1, 12.5, 8.4, 10.3, 11.2_
  - [x]* 16.2 Write integration tests for tick synchronization
    - Verify a tick appends exactly one trend point (capped at 30), updates table rows to the new field values, and refreshes KPI totals from the same list
    - _Requirements: 12.5, 10.3, 11.2, 11.3_

- [x] 17. Error and edge-case handling
  - [x] 17.1 Implement tile-failure and empty-data handling in `app.js`/`map.js`/`index.html`
    - If tiles fail to load within 10 seconds (or network is unavailable), show a neutral/blank base layer with a "map tiles unavailable" notice while still rendering all bubbles, KPI cards, table, sparkline, legend, and header from mock data; ensure the empty-data path renders zero bubbles, empty-state table, and zero KPI values without erroring
    - _Requirements: 13.4, 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Post-redesign additions

> The sections below document the substantial iteration that occurred after the original 18-section plan was completed. The mockup was reworked into a map-hero layout with FCC reportable flagging, an outage detail panel, a persisted theme toggle, and a dedicated PSAP / 911 status page. Two further iterations then narrowed the mockup to a single Spectrum network (Cox removed, see section 29) and enlarged the map hero (see section 30). **All work in this region is implemented and verified — the full suite of 55 Vitest tests (9 files) passes.** Requirement references point at the updated `requirements.md`.

- [x] 19. FCC reporting threshold in scales and summary
  - [x] 19.1 Anchor the color scale to the FCC reporting threshold and add reportable helpers
    - Define `FCC_REPORT_THRESHOLD` (900,000) in `constants.js`; set the `colorForLostUsers` domain maximum equal to `FCC_REPORT_THRESHOLD` so the red endpoint denotes closeness to the mandatory FCC/911 reporting obligation
    - Add an `isReportable(outage)` helper (true when `currentLostUsers >= FCC_REPORT_THRESHOLD`)
    - Extend `computeSummary` in `summary.js` with `reportableCount` (number of outages at/above the threshold; 0 for an empty set)
    - _Requirements: 3.3, 3.4, 7.4, 15.1_
  - [x]* 19.2 Write property test for the FCC threshold color anchoring and reportable count
    - **Property 9: Color scale red endpoint and reportable count are anchored to FCC_REPORT_THRESHOLD**
    - **Validates: Requirements 3.3, 7.4, 15.1**

- [x] 20. FCC reportable flagging across the UI
  - [x] 20.1 Render the reportable alert banner and per-component reportable indicators
    - Show a `Reportable_Alert_Banner` directly below the header when one or more reportable outages exist (with the count and affected outage names), hidden otherwise
    - Render a pulsing ring on reportable map bubbles and an FCC-reportable flag in their popups (`map.js`)
    - Render an "FCC" badge and a tinted row on reportable rows in the outage table (`outageTable.js`)
    - Refresh all of these indicators on each live-drift tick as outages cross or fall back below the threshold
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 21. FCC report details modal
  - [x] 21.1 Implement the report details modal in `reportModal.js`
    - Open the `Report_Details_Modal` when the alert banner is clicked
    - Display the FCC/911 reporting obligation text, a table of the current reportable outages (name, network, region, current lost users, and amount over the threshold), and recommended actions
    - Close on the close control, backdrop click, or Escape key
    - Refresh the listed reportable outages from the updated list while the modal is open during a live-drift tick
    - _Requirements: 15.6, 15.7, 15.8, 15.9_

- [x] 22. Light/dark theme toggle
  - [x] 22.1 Implement the persisted theme toggle in `theme.js` and `header.js`
    - Add a header theme toggle control that switches the dashboard between light and dark themes
    - Apply the selected theme and persist it (localStorage) so it is restored on the next load, on both the dashboard and the PSAP page
    - _Requirements: 8.5, 8.6, 8.7_

- [x] 23. Viewport-fit map-hero layout
  - [x] 23.1 Rework the layout for a viewport-fit map hero
    - Restructure `index.html`/`styles.css` so the map is the hero element and the dashboard fits the viewport with no page scroll on desktop
    - Register a Leaflet `ResizeObserver` that calls `invalidateSize` so the map re-fits when its container resizes
    - Add a legend minimize/expand toggle in `legendView.js`
    - _Requirements: 4.1, 4.2, 13.1, 13.3_

- [x] 24. Remove KPI cards and trend sparkline from the UI
  - [x] 24.1 Unwire the KPI cards and trend sparkline
    - Remove the KPI card row and trend sparkline from `index.html`/`app.js`; their summary figures are now surfaced through the detail panel, the reportable alert banner, and the report modal
    - Keep `kpiCards.js` and `trendSparkline.js` on disk (unreferenced by the app) so their existing tests continue to pass — see the superseded sections 12 and 14 for history
    - _Requirements: 9 (reworked), 11 (reassigned)_

- [x] 25. Outage detail panel and selection
  - [x] 25.1 Implement the detail panel in `detailPanel.js`
    - Render a right-of-map panel that shows a select-an-outage prompt when nothing is selected, and the selected outage's name, network, region, severity, current lost users, growth rate, and start time when one is selected
    - Show an FCC-reportable badge when the selected outage is at/above the threshold, and a "Reported to PSAP / 911" value derived from the linked PSAP status ("Yes" for notified/acknowledged, "No" for pending, "Not required" for not_required)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 25.2 Wire outage selection from the map and table
    - Select an outage by clicking a map bubble (`MapRenderer.setSelectHandler`) or an outage-table row (`data-outage-id` + a delegated click handler) in `app.js`
    - On each live-drift tick, refresh the selected outage's panel values from the updated record, reverting to the prompt if the selected outage is no longer present
    - _Requirements: 9.2, 9.5, 10.6, 12.5_

- [x] 26. Full-width outage table strip
  - [x] 26.1 Move the outage table to a full-width strip below the map
    - Reposition the outage table as a full-width strip below the map that scrolls internally when rows exceed its height
    - Carry each outage's identifier on its row (`data-outage-id`) so rows are selectable and feed the detail panel
    - _Requirements: 10.4, 10.5, 10.6_

- [x] 27. PSAP data model and PSAP / 911 status page
  - [x] 27.1 Add the PSAP data model in `psapData.js`
    - Provide `getPsaps` and link each outage to exactly one PSAP via `outage.psapId`; each PSAP carries a status of exactly one of "acknowledged", "notified", "pending", or "not_required"
    - _Requirements: 11.1_
  - [x] 27.2 Build the PSAP status page in `psap.html` and `psapPage.js`
    - Render per-status summary counts and a table of all PSAPs (name, county/state, linked outage name, that outage's current lost users, status, phone, last-updated)
    - Sort rows so the actionable statuses "pending" and "notified" appear before "acknowledged" and "not_required"
    - Add header navigation links from the dashboard to the PSAP page and back
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 8.7_

- [x] 28. Post-redesign checkpoint - Ensure all tests pass
  - All 54 Vitest tests pass, including the new FCC-threshold property test.

- [x] 29. Spectrum-only (Cox network removed)
  - Set `NETWORKS = ["Spectrum"]` in `constants.js` (`isValidOutage` now rejects "Cox"); changed all seed outages in `mockData.js` to network "Spectrum" (ids/coords/psapId/values unchanged); `computeSummary`'s `lostUsersByNetwork` is now Spectrum-only (equals `totalLostUsers`); rebranded all UI/page-title copy from "Spectrum + Cox" to "Spectrum" (`index.html`, `psap.html`, `header.js`, `reportModal.js`, `psapPage.js`) and dropped the merger/combined-view framing.
  - Updated tests for the single network: `tests/arbitraries.js` generates only "Spectrum"; `tests/summary.test.js` Property 6 now asserts the single-network partition (Spectrum == total); `tests/constants.test.js` rejects "Cox"; `tests/mockData.test.js` expects only "Spectrum".
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 8.1, 9.2, 10.1_

- [x] 30. Bigger map-hero layout
  - Reworked `styles.css` so the map row fills approximately the whole first screen (height ≈ `calc(100vh - 150px)`) with the page scrolling normally (removed the fixed `100vh`/`overflow:hidden`); narrowed the outage detail panel from ~340px to ~300px; made the active outage table an optional full-width section below the fold (max-height ~60vh, internal scroll) reached by scrolling. Bumped cache-busting to `?v=4` on `index.html` and `psap.html`.
  - _Requirements: 1.5, 10.4_

## Notes

- **This plan was reconciled after implementation** to document the current, fully-built state of the mockup. Sections 1–18 are the original plan (all complete). Sections 12 and 14 (KPI cards, trend sparkline) were implemented and then removed in the map-hero redesign; their files remain on disk only for their tests. Sections 19–28 capture the post-redesign additions, all complete and verified.
- Two later iterations are captured in sections 29 and 30: section 29 narrowed the mockup to a single Spectrum network (the Cox network was removed), and section 30 enlarged the map-hero layout. Both are complete and verified.
- **Requirement 6 was reworked to a single-network "Network Attribution (Spectrum)"** — the per-network breakdown is now Spectrum-only, so **Property 6 is now the single-network partition** (the Spectrum figure equals the total lost users).
- The full suite of **55 Vitest tests (9 files) passes**, including the FCC-threshold property test (Property 9) and the single-network Property 6.
- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Pure logic modules are implemented and property-tested first so the correctness properties are validated before UI work begins.
- Each property test task maps to one property from the design's Correctness Properties section and the requirement clauses it validates.
- Rendering/UI behavior is validated with a small number of example-based checks rather than property tests.
- All logic modules use the dual-mode export footer so they load over `file://` in the browser and import cleanly into Vitest.

## Task Dependency Graph

> The graph below reflects the original 18-section plan and is preserved as the historical build order. The post-redesign additions (sections 19–28) were implemented iteratively on top of that foundation and are all complete, so they are not re-scheduled here.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "4.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "4.2", "5.2", "5.3", "6.1", "7.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "6.2", "7.2", "9.1"] },
    { "id": 4, "tasks": ["10.1", "11.1", "12.1", "13.1", "14.1", "15.1"] },
    { "id": 5, "tasks": ["10.2", "16.1"] },
    { "id": 6, "tasks": ["16.2", "17.1"] }
  ]
}
```
