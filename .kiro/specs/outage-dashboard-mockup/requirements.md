# Requirements Document

## Introduction

The Outage Dashboard Mockup is a self-contained, buildless web dashboard that presents a single-network outage operations view for **Spectrum (Charter Communications)**. It is a demonstration artifact driven entirely by realistic mock data — there is no live backend, API, or streaming source.

The layout is a map-hero design: an interactive US-focused geographic map fills approximately the whole first screen at the center of the dashboard, with a narrower (~300px) right-hand **detail panel** that shows the full details of the selected outage — including its **PSAP / 911 reporting status**. The page scrolls normally, and an optional full-width outage table section sits below the map row, below the fold, that the user scrolls to reach. Each active outage is rendered on the map as a bubble using a dual encoding: bubble **size** encodes the rate of increasing lost users (growth per minute), and bubble **color** encodes the current total lost users on a yellow → orange → red heat ramp. The color ramp is anchored to the **FCC 900,000-user reporting threshold**: the hottest (red) endpoint corresponds to the FCC_Report_Threshold, so color encodes closeness to the mandatory FCC/911 reporting obligation. Any outage that reaches or exceeds this threshold is explicitly flagged as reportable across the dashboard (alert banner, report modal, table badge, detail-panel badge, and map ring).

A separate **PSAP status page** (psap.html) lists every PSAP (Public Safety Answering Point) and its 911 reporting status, reachable from a header navigation link. Supporting components (Spectrum-branded header with a persisted light/dark theme toggle, outage table, legend) surround the map, and a low-frequency timer gently drifts values so the dashboard feels live. This redesign removed the earlier KPI cards and trend sparkline; their summary figures are now surfaced through the detail panel, the reportable alert banner, and the report modal. The mockup is delivered as self-contained HTML/CSS/JS using Leaflet with OpenStreetMap tiles.

## Glossary

- **Dashboard**: The complete client-side mockup application rendered in the browser, comprising the map and all supporting components.
- **Outage**: A mock record representing an active service disruption, attributed to the Spectrum network and placed at a US geographic coordinate.
- **Network**: The originating brand of an outage, which is always the single value "Spectrum".
- **Mock_Data_Module**: The component that provides the seed set of outages, computes aggregate summaries, and produces drifted copies for live updates.
- **Bubble_Encoding_Layer**: The component that maps an outage's numeric fields to visual properties (radius in pixels, fill color) using explicit scale functions.
- **Size_Scale**: The function `radiusForGrowthRate` mapping growth rate (users lost per minute) to a bubble radius in pixels, clamped between a minimum and maximum radius.
- **Color_Scale**: The function `colorForLostUsers` mapping current total lost users to a color on the yellow → orange → red sequential heat ramp.
- **Map_Renderer**: The component that initializes the Leaflet map, frames the United States, and renders/updates outage bubbles and popups.
- **Legend**: The overlay that explains the size and color encodings, generated from the same scale functions the map uses.
- **Detail_Panel**: The right-hand panel of the map row that shows the selected outage's full details, including its PSAP / 911 reporting status.
- **PSAP**: A Public Safety Answering Point (911 authority) record for an outage's region, with a reporting status.
- **PSAP_Status_Page**: A separate page (psap.html) listing every PSAP and its 911 reporting status.
- **Outage_Table**: The tabular list of outages showing name, region, network, lost users, growth rate, severity chip, and start/duration.
- **Header**: The top region showing "Spectrum" branding, a last-updated timestamp, a live indicator, a light/dark theme toggle, and a navigation link to the PSAP_Status_Page.
- **Dashboard_Summary**: The computed aggregate values derived from the current set of outages, including the per-network lost-user figure for Spectrum.
- **Live_Drift**: The behavior in which a low-frequency timer mutates outage values and refreshes all components in sync.
- **Growth_Rate**: The `growthRatePerMin` field of an outage — lost users per minute — which drives bubble size.
- **Current_Lost_Users**: The `currentLostUsers` field of an outage — total lost users right now — which drives bubble color.
- **FCC_Report_Threshold**: The fixed count of Current_Lost_Users (900,000) at which an outage must be reported to the FCC and PSAP/911 operators. Defined by the shared constant `FCC_REPORT_THRESHOLD`.
- **Reportable_Outage**: An outage whose Current_Lost_Users is greater than or equal to the FCC_Report_Threshold (i.e., `isReportable(outage)` is true).
- **Reportable_Alert_Banner**: The top-of-dashboard banner, rendered directly below the Header, shown when one or more Reportable_Outages exist and hidden otherwise.
- **Report_Details_Modal**: A dialog, opened by clicking the Reportable_Alert_Banner, that shows the FCC/911 reporting obligation, a list of the currently reportable outages, and recommended actions.

## Requirements

### Requirement 1: Outage Map with Bubbles

**User Story:** As an operations viewer, I want each active outage shown as a bubble on a map, so that I can see where disruptions are occurring at a glance.

#### Acceptance Criteria

1. WHEN the Dashboard loads with a set of one or more active outages, THE Map_Renderer SHALL render exactly one bubble per active outage such that the count of rendered bubbles equals the count of active outages and each bubble maps to a distinct outage identifier.
2. WHEN the Map_Renderer renders a bubble for an active outage, THE Map_Renderer SHALL position that bubble at the latitude and longitude coordinates of that outage.
3. WHEN a user hovers over or selects a rendered bubble, THE Map_Renderer SHALL display a popup for that bubble's outage showing all of the following fields: outage name, region, network, Current_Lost_Users, Growth_Rate expressed in lost users per minute, severity, and start time.
4. WHEN a user moves the pointer off a hovered bubble or dismisses an open popup, THE Map_Renderer SHALL close that popup while leaving all rendered bubbles in place.
5. WHEN the Dashboard loads, THE Dashboard SHALL lay out the map row so that the map fills approximately the whole first screen alongside a narrower right-hand Detail_Panel of approximately 300 pixels wide, with the page scrolling normally rather than being locked to a fixed viewport.

### Requirement 2: Bubble Size Encodes Growth Rate

**User Story:** As an operations viewer, I want a bubble's size to reflect how fast an outage is growing, so that escalating outages stand out visually.

#### Acceptance Criteria

1. WHEN the Bubble_Encoding_Layer computes a bubble radius, THE Size_Scale SHALL derive a radius in pixels from the outage's Growth_Rate over a defined growth-rate domain of 0 to 500 users per minute.
2. FOR ALL pairs of growth rates a and b within the growth-rate domain where a is less than or equal to b, THE Size_Scale SHALL return a radius for a that is less than or equal to the radius for b.
3. THE Size_Scale SHALL clamp every returned radius to be within a minimum radius of 6 pixels and a maximum radius of 40 pixels inclusive.
4. IF an outage's Growth_Rate is less than 0 or greater than 500 users per minute, THEN THE Size_Scale SHALL clamp the Growth_Rate to the nearest growth-rate domain bound before deriving the radius.

### Requirement 3: Bubble Color Encodes Current Lost Users

**User Story:** As an operations viewer, I want a bubble's color to reflect the current total lost users, so that high-impact outages are immediately recognizable.

#### Acceptance Criteria

1. WHEN the Bubble_Encoding_Layer computes a bubble color, THE Color_Scale SHALL return a color determined solely by the outage's Current_Lost_Users, positioned on a continuous yellow → orange → red sequential heat ramp where yellow is the coldest endpoint and red is the hottest endpoint.
2. FOR ALL pairs of Current_Lost_Users counts a and b where a is less than or equal to b, THE Color_Scale SHALL return for b a color whose position on the yellow → orange → red heat ramp is the same as or nearer the red endpoint than the color returned for a, where a position nearer the red endpoint denotes a hotter color.
3. THE Color_Scale SHALL set the maximum lost-user bound of its domain equal to the FCC_Report_Threshold (900,000), so that Current_Lost_Users at or above the FCC_Report_Threshold maps to the red endpoint color and the bubble color encodes closeness to the FCC reporting threshold.
4. THE Color_Scale SHALL map every Current_Lost_Users value at or below the defined minimum lost-user bound to the yellow endpoint color and every Current_Lost_Users value at or above the FCC_Report_Threshold to the red endpoint color, clamping any value outside those bounds.
5. FOR ALL equal Current_Lost_Users values, THE Color_Scale SHALL return an identical color, so that the same input always yields the same color.

### Requirement 4: Legend Consistent with Encodings

**User Story:** As an operations viewer, I want a legend that explains both the size and color encodings, so that I can interpret the map correctly.

#### Acceptance Criteria

1. WHEN the Dashboard renders the Legend, THE Legend SHALL display exactly three bubble size samples labeled "slow", "medium", and "fast" growth.
2. WHEN the Dashboard renders the Legend, THE Legend SHALL display a color gradient with at least three labeled threshold values corresponding to the yellow, orange, and red stops of the Color_Scale.
3. FOR ALL size samples in the Legend, THE Bubble_Encoding_Layer SHALL set each sample's radius in pixels equal to the Size_Scale applied to that sample's growth rate.
4. FOR ALL color stops in the Legend, THE Bubble_Encoding_Layer SHALL set each stop's color equal to the Color_Scale applied to that stop's lost-user value.

### Requirement 5: US-Focused Map Framing

**User Story:** As an operations viewer, I want the map framed on the United States with outages across major US cities, so that the Spectrum domestic footprint is clear.

#### Acceptance Criteria

1. WHEN the Map_Renderer initializes the map, THE Map_Renderer SHALL set the initial map view so that the continental US bounding box, defined as latitude 24° N to 50° N and longitude 125° W to 66° W, is fully contained within the visible map viewport.
2. THE Mock_Data_Module SHALL provide at least 8 seed outages whose coordinates collectively span at least 4 distinct US Census regions (Northeast, Midwest, South, and West), with no two seed outages sharing identical latitude and longitude values.
3. FOR ALL seed outages, THE Mock_Data_Module SHALL assign a latitude between 24° N and 50° N inclusive and a longitude between 125° W and 66° W inclusive.

### Requirement 6: Network Attribution (Spectrum)

**User Story:** As an operations viewer, I want every outage attributed to the Spectrum network, so that the dashboard presents a consistent single-network attribution.

#### Acceptance Criteria

1. FOR ALL outages, THE Mock_Data_Module SHALL assign the network value exactly matching the string "Spectrum", and no other, empty, or null value.
2. WHEN the Mock_Data_Module computes a Dashboard_Summary, THE Dashboard_Summary SHALL include a per-network lost-user figure for Spectrum equal to the sum of Current_Lost_Users across all outages.
3. WHEN the Mock_Data_Module computes the per-network lost-user figure, THE Mock_Data_Module SHALL set the Spectrum figure equal to the total lost users across all outages.
4. IF the set of outages is empty, THEN THE Mock_Data_Module SHALL set the Spectrum lost-user figure to 0.

### Requirement 7: Dashboard Summary Aggregates

**User Story:** As an operations viewer, I want accurate summary figures, so that I can understand the overall state of outages.

#### Acceptance Criteria

1. WHEN the Mock_Data_Module computes a Dashboard_Summary, THE Mock_Data_Module SHALL set the active outage count equal to the number of outages in the current set of outages from which the summary is derived.
2. WHEN the Mock_Data_Module computes a Dashboard_Summary, THE Mock_Data_Module SHALL set the total lost users equal to the sum of Current_Lost_Users across the current set of outages from which the summary is derived.
3. WHEN the Mock_Data_Module computes a Dashboard_Summary over a non-empty set of outages, THE Mock_Data_Module SHALL set the peak growth rate equal to the maximum Growth_Rate across that set.
4. WHEN the Mock_Data_Module computes a Dashboard_Summary, THE Mock_Data_Module SHALL set the Dashboard_Summary reportableCount equal to the number of outages in the current set whose Current_Lost_Users is greater than or equal to the FCC_Report_Threshold, and set the reportableCount to 0 for an empty set.
5. IF the set of outages is empty, THEN THE Mock_Data_Module SHALL set the peak growth rate to 0.
6. IF the set of outages is empty, THEN THE Mock_Data_Module SHALL set the active outage count to 0.
7. IF the set of outages is empty, THEN THE Mock_Data_Module SHALL set the total lost users to 0.

### Requirement 8: Header with Branding, Timestamp, and Live Indicator

**User Story:** As an operations viewer, I want a header with branding and freshness indicators, so that I know the dashboard identity and that it is live.

#### Acceptance Criteria

1. THE Header SHALL display branding containing the exact text "Spectrum".
2. WHEN the Dashboard loads, THE Header SHALL display a last-updated timestamp showing the clock time, including hours, minutes, and seconds, of the most recent data update.
3. THE Header SHALL display a live indicator that is in a visually active state while Live_Drift updates continue to occur.
4. WHEN a Live_Drift tick occurs, THE Header SHALL update the last-updated timestamp to the clock time of that tick within 1 second of the tick.
5. THE Header SHALL provide a theme toggle control that switches the Dashboard between a light theme and a dark theme.
6. WHEN the user activates the theme toggle control, THE Header SHALL apply the selected theme and persist the selected theme so that it is restored on the next load.
7. THE Header SHALL provide a navigation link from the Dashboard to the PSAP_Status_Page.

### Requirement 9: Outage Detail Panel

**User Story:** As an operations viewer, I want a detail panel that shows the full details of a selected outage and its PSAP / 911 reporting status, so that I can assess a specific incident and its reporting obligation in one place.

#### Acceptance Criteria

1. WHEN the Dashboard loads and no outage is selected, THE Detail_Panel SHALL display a prompt inviting the user to select an outage.
2. WHEN the user clicks an outage's map bubble or its row in the Outage_Table, THE Dashboard SHALL select that outage and THE Detail_Panel SHALL display that outage's name, network (always "Spectrum"), region, severity, Current_Lost_Users, Growth_Rate, and start time.
3. WHERE the selected outage's Current_Lost_Users is greater than or equal to the FCC_Report_Threshold, THE Detail_Panel SHALL display an FCC-reportable badge.
4. THE Detail_Panel SHALL display a "Reported to PSAP / 911" value derived solely from the linked PSAP status, set to "Yes" when the PSAP status is "notified" or "acknowledged", "No" when the PSAP status is "pending", and "Not required" when the PSAP status is "not_required".
5. WHEN a Live_Drift tick occurs AND an outage is selected, THE Detail_Panel SHALL refresh its displayed values from the updated record for that outage, and IF that outage is no longer present in the updated outage list, THEN THE Detail_Panel SHALL revert to the select-an-outage prompt.

### Requirement 10: Outage Table

**User Story:** As an operations viewer, I want a table of outages with severity and network, so that I can scan the details of each incident and open any one in the detail panel.

#### Acceptance Criteria

1. WHEN the Dashboard renders the Outage_Table with a non-empty set of outages, THE Outage_Table SHALL display exactly one row per outage, each row showing that outage's name, region, network (always "Spectrum"), current lost users, growth rate, a severity chip, and start time.
2. FOR ALL rows in the Outage_Table, THE Outage_Table SHALL display a severity chip whose style corresponds to that outage's severity, such that any two outages with different severity levels are shown with visually distinct chips.
3. WHEN a Live_Drift tick occurs, THE Outage_Table SHALL refresh every row so that the displayed current lost users and growth rate values equal each outage's updated field values.
4. THE Dashboard SHALL render the Outage_Table as an optional full-width section positioned below the map row and below the fold, which the user reaches by scrolling the page and which scrolls internally when its rows exceed its visible height.
5. FOR ALL rows in the Outage_Table, THE Outage_Table SHALL carry that outage's identifier on the row so the row is selectable.
6. WHEN the user clicks a row in the Outage_Table, THE Dashboard SHALL select the outage identified by that row for display in the Detail_Panel.

### Requirement 11: PSAP Reporting and Status Page

**User Story:** As an operations viewer, I want each outage linked to a PSAP with a 911 reporting status and a dedicated page listing every PSAP, so that I can track which outages have been reported to 911 authorities.

#### Acceptance Criteria

1. FOR ALL outages, THE Mock_Data_Module SHALL link the outage to exactly one PSAP via a psapId, and each PSAP SHALL have a status equal to exactly one of "acknowledged", "notified", "pending", or "not_required".
2. THE PSAP_Status_Page SHALL display summary counts of PSAPs per status.
3. THE PSAP_Status_Page SHALL display a table of all PSAPs, each row showing the PSAP name, county and state, the linked outage name, that outage's current lost users, the PSAP status, the PSAP phone, and the last-updated time.
4. THE PSAP_Status_Page SHALL sort the PSAP rows so that PSAPs with the actionable statuses "pending" and "notified" appear before PSAPs with the "acknowledged" and "not_required" statuses.
5. THE Header SHALL provide a navigation link from the Dashboard to the PSAP_Status_Page and a navigation link from the PSAP_Status_Page back to the Dashboard.

### Requirement 12: Live Drift Synchronization and Bounds

**User Story:** As an operations viewer, I want values to gently update on a timer with all components staying in sync, so that the dashboard feels live and remains consistent.

#### Acceptance Criteria

1. WHILE the Dashboard is displayed, THE Mock_Data_Module SHALL invoke Live_Drift at a fixed repeating interval between 2 and 10 seconds inclusive.
2. WHEN a Live_Drift tick occurs, THE Mock_Data_Module SHALL return a list of the same length as the previous list in which every outage retains its previous outage identifier, network value, and latitude and longitude coordinates.
3. WHEN a Live_Drift tick occurs, THE Mock_Data_Module SHALL keep every Current_Lost_Users and Growth_Rate value greater than or equal to 0.
4. WHEN a Live_Drift tick occurs, THE Mock_Data_Module SHALL change each outage's Current_Lost_Users and Growth_Rate by no more than 20 percent of that value's previous value.
5. WHEN a Live_Drift tick occurs, THE Dashboard SHALL refresh the map bubbles, the Outage_Table, the selected outage's Detail_Panel, and the last-updated timestamp from the same single updated outage list produced by that tick.

### Requirement 13: Self-Contained Buildless Delivery

**User Story:** As a demo presenter, I want the mockup to open directly in a browser with no build step, so that I can show it anywhere.

#### Acceptance Criteria

1. THE Dashboard SHALL be delivered as HTML, CSS, and JavaScript files that open and execute directly via the browser's local file protocol (file://) with no build, compilation, bundling, transpilation, package installation, or local web server required.
2. WHEN the Dashboard is opened in the browser, THE Dashboard SHALL render all displayed content exclusively from mock data embedded within the delivered files, issuing zero network requests to a live backend or API.
3. THE Map_Renderer SHALL render the base map using the Leaflet library with OpenStreetMap tiles, with the Leaflet library and its stylesheet assets included in the delivered files rather than requiring installation.
4. IF OpenStreetMap tiles cannot be retrieved due to unavailable network connectivity, THEN THE Map_Renderer SHALL display all map markers and overlays over a blank base layer and SHALL present an indication that the base map imagery is unavailable, without preventing the remaining Dashboard content from rendering.

### Requirement 14: Error and Edge-Case Handling

**User Story:** As an operations viewer, I want the dashboard to stay stable when data or tiles are problematic, so that a single fault does not break the view.

#### Acceptance Criteria

1. IF the map tiles fail to load within 10 seconds, THEN THE Map_Renderer SHALL display a neutral background with a "map tiles unavailable" notice.
2. IF the map tiles fail to load, THEN THE Dashboard SHALL continue to render the bubbles, Detail_Panel, Outage_Table, Legend, and Header from mock data.
3. IF the set of outages is empty, THEN THE Detail_Panel SHALL display the select-an-outage prompt.
4. IF the set of outages is empty, THEN THE Outage_Table SHALL display an empty-state message with zero rows.
5. IF the set of outages is empty, THEN THE Map_Renderer SHALL render zero bubbles.
6. IF an outage record has a latitude outside the range -90 to 90 or a longitude outside the range -180 to 180, THEN THE Map_Renderer SHALL skip rendering a bubble for that record while rendering the remaining valid records.
7. IF an outage record has a Current_Lost_Users or Growth_Rate value below 0, THEN THE Bubble_Encoding_Layer SHALL clamp the radius to the defined minimum and maximum radius bounds and the color to the defined heat-ramp endpoint bounds.

### Requirement 15: FCC Reportable Flagging

**User Story:** As an operations viewer, I want outages that cross the 900k FCC/911 reporting threshold clearly flagged, so that I never miss a mandatory reporting obligation.

#### Acceptance Criteria

1. FOR ALL outages, THE Dashboard SHALL treat an outage as a Reportable_Outage when its Current_Lost_Users is greater than or equal to the FCC_Report_Threshold (900,000), and as not reportable otherwise.
2. WHEN one or more Reportable_Outages exist, THE Reportable_Alert_Banner SHALL be displayed showing the count of Reportable_Outages and the affected outage names; and WHEN no Reportable_Outages exist, THE Reportable_Alert_Banner SHALL be hidden.
3. FOR ALL Reportable_Outages, THE Outage_Table SHALL display an "FCC" badge on that outage's row.
4. FOR ALL Reportable_Outages, THE Map_Renderer SHALL render that outage's bubble with a distinct reportable indicator in the form of a pulsing ring, and THE Map_Renderer SHALL include an FCC-reportable flag in that outage's popup.
5. WHEN a Live_Drift tick causes an outage to cross or fall back below the FCC_Report_Threshold, THE Dashboard SHALL update the reportable indicators, comprising the Reportable_Alert_Banner, the Detail_Panel FCC-reportable badge for the selected outage, the Outage_Table "FCC" badge, and the Map_Renderer pulsing ring, on that tick.
6. WHEN the user clicks the Reportable_Alert_Banner, THE Dashboard SHALL open the Report_Details_Modal.
7. WHEN the Report_Details_Modal is open, THE Report_Details_Modal SHALL display the FCC/911 reporting obligation and a list of the current Reportable_Outages, each showing at least its name, network, region, Current_Lost_Users, and the amount by which Current_Lost_Users exceeds the FCC_Report_Threshold.
8. WHEN the user activates the modal close control, clicks outside the modal dialog, or presses the Escape key, THE Report_Details_Modal SHALL close.
9. WHILE the Report_Details_Modal is open and a Live_Drift tick occurs, THE Report_Details_Modal SHALL refresh its displayed Reportable_Outages from the updated outage list.
