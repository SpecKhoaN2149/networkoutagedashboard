/*
 * map.js — Map Renderer for the Spectrum + Cox outage dashboard mockup.
 *
 * Initializes the Leaflet map, frames the continental United States with
 * OpenStreetMap tiles, and (in later tasks) renders/updates outage bubbles and
 * popups. This file currently implements ONLY `initMap` (task 9.1); bubble
 * rendering (`renderOutages` / `updateOutages`) is added by task 10.1 and will
 * extend the same `window.MapRenderer` api object.
 *
 * Buildless / browser-only: loaded via a plain <script> tag AFTER
 * `lib/leaflet.js`, so Leaflet is available as the browser global `L`. This
 * module reads `L` from the global scope and MUST NOT `require("leaflet")` —
 * it is DOM/browser-only and is intentionally not imported by the Node/Vitest
 * suite. It attaches its exports to `window.MapRenderer`. Shared US bounds come
 * from `window.DashboardConstants`.
 */
(function (global) {
  "use strict";

  // Shared constants (continental US bounding box). Browser global is expected;
  // a Node require fallback is provided only for constants (never Leaflet).
  var C = global.DashboardConstants;
  if (!C && typeof require !== "undefined") {
    C = require("./constants");
  }

  // Bubble encoding scales (browser globals). These are DOM-adjacent siblings
  // loaded via <script> before map.js; no Node fallback is needed because
  // map.js is never imported by the Node/Vitest suite.
  var SizeScale = global.SizeScale;
  var ColorScale = global.ColorScale;

  var US_BOUNDS = C.US_BOUNDS; // { latMin:24, latMax:50, lngMin:-125, lngMax:-66 }

  // Optional selection callback invoked with an outage when its bubble is
  // clicked. Wired by app.js via setSelectHandler so clicking a bubble can
  // drive the right-hand detail panel.
  var selectHandler = null;

  /**
   * Registers a callback invoked with the outage record when its bubble is
   * clicked. Passing null clears the handler.
   * @param {Function|null} fn
   */
  function setSelectHandler(fn) {
    selectHandler = typeof fn === "function" ? fn : null;
  }

  // Bubble styling constants. Fill color/radius come from the encoding scales;
  // the stroke is a subtle darker border so overlapping bubbles stay legible.
  var BUBBLE_FILL_OPACITY = 0.72;
  var BUBBLE_STROKE_COLOR = "#7a2b0b";
  var BUBBLE_STROKE_WEIGHT = 1;
  var BUBBLE_STROKE_OPACITY = 0.9;

  // Standard OpenStreetMap raster tile endpoint + required attribution.
  var OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  var OSM_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  // Fallback center/zoom framing the lower 48 states (Requirement 5.1). Used if
  // fitBounds cannot be applied (e.g. container has no measurable size yet).
  var US_CENTER = [39.5, -98.35];
  var US_ZOOM = 4;

  // Tile-failure handling (Requirements 13.4, 14.1). The notice element lives
  // in index.html; showing it adds `is-visible` (CSS flips display:none->flex).
  // If the base tiles have not finished loading within this window — or any
  // tile errors (e.g. no network) — we treat the imagery as unavailable and
  // reveal the notice while bubbles/overlays keep rendering over the neutral
  // (CSS dark) base layer.
  var TILES_NOTICE_ID = "tiles-unavailable";
  var TILE_LOAD_TIMEOUT_MS = 10000;

  /**
   * Toggles the "map tiles unavailable" notice. Robust to a missing element or
   * a missing document (headless) so it never throws and never blocks the rest
   * of the dashboard from rendering (Requirement 14.2).
   *
   * @param {boolean} visible - true to reveal the notice, false to hide it.
   */
  function toggleTilesNotice(visible) {
    if (typeof document === "undefined" || !document.getElementById) {
      return;
    }
    var notice = document.getElementById(TILES_NOTICE_ID);
    if (!notice || !notice.classList) {
      return;
    }
    if (visible) {
      notice.classList.add("is-visible");
    } else {
      notice.classList.remove("is-visible");
    }
  }

  /**
   * Wires tile-failure detection for a freshly-initialized map (Req 13.4,
   * 14.1). Two independent signals reveal the notice:
   *   - a `tileerror` event on the tile layer (a tile could not be fetched,
   *     e.g. offline), and
   *   - a 10-second timeout that fires if the layer never reports `load`
   *     (all visible tiles loaded) — covering silent stalls.
   * A successful `load` clears the timeout and hides the notice, so if tiles
   * do eventually arrive the dashboard recovers cleanly. Bubbles and overlays
   * are never removed here — only the notice is toggled.
   *
   * @param {Object} mapHandle - handle whose `tileLayer` to observe.
   */
  function setupTileFailureDetection(mapHandle) {
    if (!mapHandle || !mapHandle.tileLayer) {
      return;
    }
    var tileLayer = mapHandle.tileLayer;
    var settled = false; // ensures we only clear the timeout / hide once

    // Start hidden; only the failure signals below reveal the notice.
    toggleTilesNotice(false);

    var timeoutId = null;
    if (typeof setTimeout === "function") {
      timeoutId = setTimeout(function () {
        if (settled) {
          return;
        }
        // Tiles never reported a successful load in time -> unavailable.
        toggleTilesNotice(true);
      }, TILE_LOAD_TIMEOUT_MS);
    }
    mapHandle.tilesTimeoutId = timeoutId;

    // Any tile that fails to fetch marks the base imagery unavailable.
    tileLayer.on("tileerror", function () {
      toggleTilesNotice(true);
    });

    // All visible tiles loaded -> imagery is available; stand down the timer
    // and hide the notice (recovery path if tiles arrive after an error).
    tileLayer.on("load", function () {
      settled = true;
      if (timeoutId !== null && typeof clearTimeout === "function") {
        clearTimeout(timeoutId);
        timeoutId = null;
        mapHandle.tilesTimeoutId = null;
      }
      toggleTilesNotice(false);
    });
  }

  /**
   * Initializes the Leaflet map on the given container and frames the
   * continental United States (Requirements 5.1, 13.3).
   *
   * Behavior:
   *   - Creates an `L.map` on `containerId`.
   *   - Adds an OpenStreetMap raster tile layer with proper attribution.
   *   - Sets the initial view so the continental US bounding box
   *     (lat 24–50 N, lng 125–66 W) is fully contained in the viewport via
   *     `fitBounds`, with a center ~39.5 N / -98.35 W, zoom ~4 fallback.
   *
   * @param {string} containerId - id of the map container element.
   * @returns {Object} MapHandle wrapping the Leaflet map + tile layer, which
   *   later tasks (10.1) use to render and update outage bubbles.
   */
  function initMap(containerId) {
    if (typeof L === "undefined") {
      throw new Error(
        "Leaflet (L) is not available — ensure lib/leaflet.js is loaded before map.js"
      );
    }

    // Create the map. worldCopyJump keeps markers sane when panning across the
    // antimeridian; not critical for a US-framed view but harmless.
    var map = L.map(containerId, {
      worldCopyJump: true,
    });

    // Add the OpenStreetMap base tile layer with required attribution.
    var tileLayer = L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    });
    tileLayer.addTo(map);

    // Frame the continental US so the whole bounding box is visible.
    // L.latLngBounds takes [[southWest], [northEast]] = [[latMin,lngMin],[latMax,lngMax]].
    var usBounds = L.latLngBounds([
      [US_BOUNDS.latMin, US_BOUNDS.lngMin],
      [US_BOUNDS.latMax, US_BOUNDS.lngMax],
    ]);

    // fitBounds guarantees the box is fully contained in the viewport. If it
    // cannot be applied (e.g. zero-size container during headless init), fall
    // back to an explicit center/zoom that frames the lower 48 (Req 5.1).
    try {
      map.fitBounds(usBounds);
      // Ensure a view is always set even if fitBounds no-ops on a 0-size box.
      if (map.getZoom() === undefined || map.getZoom() === null) {
        map.setView(US_CENTER, US_ZOOM);
      }
    } catch (e) {
      map.setView(US_CENTER, US_ZOOM);
    }

    // Keep the map US-only: clamp panning to a bounding box around the
    // continental US and prevent zooming out past the US-framing zoom, so the
    // user cannot drift off to the rest of the world.
    var usMaxBounds = L.latLngBounds([
      [21, -128], // SW: below southern CA / TX
      [51, -63],  // NE: above the northern border / Maine
    ]);
    map.setMaxBounds(usMaxBounds);
    map.options.maxBoundsViscosity = 1.0; // hard stop at the bounds
    var framedZoom = map.getZoom();
    if (typeof framedZoom === "number") {
      map.setMinZoom(framedZoom); // can't zoom out beyond the US framing
    }

    // MapHandle: wraps the Leaflet map plus the tile layer and framing bounds
    // so later tasks (10.1 render/update, 17.1 tile-failure handling) have the
    // references they need. `map` is the raw L.map instance.
    var mapHandle = {
      map: map,
      tileLayer: tileLayer,
      usBounds: usBounds,
      // Bubble layer group placeholder for task 10.1 to populate.
      bubbleLayers: {},
    };

    // Tile-failure detection: reveal the "tiles unavailable" notice on a
    // tileerror or after a 10s load timeout, keeping bubbles/overlays visible
    // over the neutral base layer (Requirements 13.4, 14.1, 14.2).
    setupTileFailureDetection(mapHandle);

    // The map flexes to fill available height, which can change without a
    // window resize (e.g. the FCC alert banner appearing/disappearing grows or
    // shrinks the map panel). Observe the container and ask Leaflet to
    // recompute its size so tiles always fill the panel. Debounced via
    // requestAnimationFrame to avoid resize-loop churn.
    if (typeof ResizeObserver !== "undefined" && typeof document !== "undefined") {
      var containerEl = document.getElementById(containerId);
      if (containerEl) {
        var pending = false;
        var ro = new ResizeObserver(function () {
          if (pending) {
            return;
          }
          pending = true;
          var raf =
            typeof requestAnimationFrame !== "undefined"
              ? requestAnimationFrame
              : function (cb) {
                  return setTimeout(cb, 16);
                };
          raf(function () {
            pending = false;
            if (mapHandle.map && mapHandle.map.invalidateSize) {
              mapHandle.map.invalidateSize({ animate: false });
            }
          });
        });
        ro.observe(containerEl);
        mapHandle.resizeObserver = ro;
      }
    }

    return mapHandle;
  }

  // --- Bubble rendering helpers (task 10.1) -------------------------------

  /**
   * Resolves the bubble radius for an outage from the shared Size Scale
   * (CURRENT lost users -> radius). Size now reinforces color: both encode the
   * number of users affected (impact / closeness to the 900k FCC threshold).
   * Falls back to the min radius bound if the scale global is somehow
   * unavailable so rendering never throws.
   */
  /**
   * Bubble SIZE now encodes VELOCITY (growth rate, users lost per minute): a
   * faster-growing outage is drawn larger. Color separately encodes closeness
   * to the 900k user-minute reporting threshold.
   */
  // A bubble that shows an aggregate-count label must be at least this radius
  // so the number always fits comfortably inside it (the count pill is ~26px
  // wide, so a ~40px+ diameter clears it).
  var MIN_RADIUS_WITH_LABEL = 20;

  function radiusFor(outage) {
    var r =
      SizeScale && typeof SizeScale.radiusForGrowthRate === "function"
        ? SizeScale.radiusForGrowthRate(outage.growthRatePerMin)
        : C.RADIUS_BOUNDS.min;
    // If this bubble carries a count label, keep it larger than the number.
    var count = countForOutage(outage);
    if (count && count > 1 && r < MIN_RADIUS_WITH_LABEL) {
      r = MIN_RADIUS_WITH_LABEL;
    }
    return r;
  }

  /**
   * Resolves an outage's accumulated user-minutes: prefers the live-annotated
   * `userMinutes` field, else computes it from the start time, else 0.
   */
  function userMinutesFor(outage) {
    if (outage && typeof outage.userMinutes === "number" && isFinite(outage.userMinutes)) {
      return outage.userMinutes;
    }
    if (C && typeof C.computeUserMinutes === "function") {
      return C.computeUserMinutes(outage, Date.now());
    }
    return 0;
  }

  /**
   * Resolves the bubble fill color for an outage from the shared Color Scale.
   * Color now encodes CLOSENESS TO THE 900k USER-MINUTE FCC threshold (so a
   * bubble reddens as it approaches the point where it must be reported), while
   * size still encodes current lost users. Falls back to the coldest heat-ramp
   * stop if the scale global is unavailable.
   */
  function colorFor(outage) {
    var um = userMinutesFor(outage);
    if (ColorScale && typeof ColorScale.colorForUserMinutes === "function") {
      return ColorScale.colorForUserMinutes(um);
    }
    if (ColorScale && typeof ColorScale.colorForLostUsers === "function") {
      return ColorScale.colorForLostUsers(um);
    }
    return C.HEAT_RAMP_STOPS[0].color;
  }

  /**
   * Formats an integer-ish number with thousands separators for display in the
   * popup (e.g. 48200 -> "48,200"). Non-finite values render as "—".
   */
  function formatNumber(value) {
    if (typeof value !== "number" || !isFinite(value)) {
      return "\u2014";
    }
    return Math.round(value).toLocaleString("en-US");
  }

  /**
   * Formats an ISO 8601 timestamp as a readable local date/time for the popup.
   * Invalid/missing values render as "—".
   */
  function formatStartTime(startedAt) {
    if (!startedAt) {
      return "\u2014";
    }
    var d = new Date(startedAt);
    if (isNaN(d.getTime())) {
      return "\u2014";
    }
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * Escapes a string for safe insertion into popup HTML. Mock data is trusted,
   * but escaping keeps the renderer robust if a name/region contains markup.
   */
  function escapeHtml(str) {
    if (str === undefined || str === null) {
      return "";
    }
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Builds the popup HTML for an outage, using the .outage-popup* CSS classes
   * defined in styles.css. Shows name, region, network, current lost users,
   * growth rate (users/min), severity, and start time (Requirement 1.3).
   */
  function popupHtml(outage) {
    function row(key, val) {
      return (
        '<div class="outage-popup__row">' +
        '<span class="outage-popup__key">' +
        escapeHtml(key) +
        "</span>" +
        '<span class="outage-popup__val">' +
        escapeHtml(val) +
        "</span>" +
        "</div>"
      );
    }

    var reportable = C.isReportable
      ? C.isReportable(outage)
      : outage && outage.currentLostUsers >= 900000;
    var reportableBanner = reportable
      ? '<div class="outage-popup__flag">\u26A0 FCC REPORTABLE (\u2265 900k)</div>'
      : "";

    return (
      '<div class="outage-popup">' +
      '<div class="outage-popup__title">' +
      escapeHtml(outage.name) +
      "</div>" +
      reportableBanner +
      row("Region", outage.region) +
      row("Lost users", formatNumber(outage.currentLostUsers)) +
      row("User-minutes", formatNumber(userMinutesFor(outage))) +
      row("Growth", formatNumber(outage.growthRatePerMin) + " users/min") +
      row("Severity", outage.severity) +
      row("Started", formatStartTime(outage.startedAt)) +
      "</div>"
    );
  }

  /**
   * Ensures the MapHandle has a Leaflet layer group to hold bubbles and a map
   * to track markers by outage id. Returns the layer group. Idempotent.
   */
  function ensureBubbleGroup(mapHandle) {
    if (!mapHandle.bubbleGroup) {
      mapHandle.bubbleGroup = L.layerGroup().addTo(mapHandle.map);
    }
    if (!mapHandle.bubbleLayers) {
      mapHandle.bubbleLayers = {};
    }
    return mapHandle.bubbleGroup;
  }

  /**
   * Creates a single circle-marker bubble for an outage, wires its popup and
   * the hover-open / pointer-off-close interactions, and registers it on the
   * MapHandle by outage id. Assumes the outage's coordinates are already valid.
   */
  /**
   * Returns true when the outage has crossed the FCC/911 reporting threshold.
   */
  function reportableFor(outage) {
    return C.isReportable
      ? C.isReportable(outage)
      : !!outage && outage.currentLostUsers >= 900000;
  }

  // --- Velocity pulse encoding -------------------------------------------
  // Growth rate (velocity) is no longer mapped to bubble SIZE (which now
  // encodes lost users). Instead every bubble gets a pulsing ring whose SPEED
  // tracks the growth rate: a faster-growing outage pulses faster (shorter
  // animation-duration). The pulse COLOR indicates reportability — reportable
  // outages pulse in a prominent red; the rest pulse in a subtle neutral ring.
  var PULSE_DURATION_MAX_S = 3.0; // slowest pulse (growth at/below domain min)
  var PULSE_DURATION_MIN_S = 0.6; // fastest pulse (growth at/above domain max)
  var PULSE_BASE_CLASS = "bubble-pulse";
  var PULSE_REPORTABLE_CLASS = "bubble-pulse--reportable";
  var PULSE_NEUTRAL_CLASS = "bubble-pulse--neutral";

  /**
   * Maps an outage's growth rate (users/min) to a CSS animation-duration in
   * seconds. Faster growth -> shorter duration -> faster pulse. The growth rate
   * is clamped to the shared GROWTH_RATE_DOMAIN before mapping, and the result
   * interpolates linearly between PULSE_DURATION_MAX_S (slow) and
   * PULSE_DURATION_MIN_S (fast). Non-finite inputs fall back to the slowest.
   *
   * @param {number} growthRatePerMin
   * @returns {number} animation-duration in seconds.
   */
  function pulseDurationSeconds(growthRatePerMin) {
    var domain = C.GROWTH_RATE_DOMAIN || { min: 0, max: 500 };
    var rate = growthRatePerMin;
    if (typeof rate !== "number" || !isFinite(rate)) {
      rate = domain.min;
    }
    var clamped = C.clamp ? C.clamp(rate, domain.min, domain.max) : rate;
    var span = domain.max - domain.min;
    var t = span > 0 ? (clamped - domain.min) / span : 0;
    // t = 0 -> slowest (MAX_S), t = 1 -> fastest (MIN_S).
    return PULSE_DURATION_MAX_S + (PULSE_DURATION_MIN_S - PULSE_DURATION_MAX_S) * t;
  }

  /**
   * Applies/updates the velocity pulse on a marker's SVG path element:
   *   - Ensures the base pulse class is present.
   *   - Toggles the reportable (red) vs neutral (subtle) variant based on
   *     whether the outage has crossed the 900k FCC threshold.
   *   - Sets the CSS animation-duration inline from the growth rate so the
   *     pulse speed tracks the drifting velocity.
   * Guarded so it is a no-op when the path element is not present (e.g. under a
   * stubbed Leaflet in tests, or before the marker is added to the DOM).
   */
  function applyPulseState(marker, outage) {
    // The velocity pulse has been retired: velocity is now encoded by bubble
    // SIZE, and reportability by the bubble COLOR (deep red at the 900k
    // user-minute threshold). Clear any pulse classes a marker might carry so
    // no ring animation renders.
    var path = marker && marker._path;
    if (!path || !path.classList) {
      return;
    }
    path.classList.remove(
      PULSE_BASE_CLASS,
      PULSE_REPORTABLE_CLASS,
      PULSE_NEUTRAL_CLASS,
      "bubble--reportable"
    );
    if (path.style) {
      path.style.animationDuration = "";
    }
  }

  /**
   * Shows/updates a centered count label inside a bubble when the outage
   * carries an `aggregateCount` > 1 (used by the live demo: the number of
   * sub-outages this bubble represents). Implemented as a permanent, centered
   * Leaflet tooltip. Guarded so it is a no-op under the test's fake Leaflet
   * (which has no tooltip methods) and for outages without a count.
   */
  /**
   * Resolves the number of outages a bubble represents. The live demo sets an
   * explicit `aggregateCount` (which takes precedence); otherwise the count is
   * derived from `relatedOutageIds` — a primary ticket that groups N related
   * outages represents N + 1 outages (itself plus its related tickets). Returns
   * null when the bubble represents a single outage (no label shown).
   */
  function countForOutage(outage) {
    if (!outage) {
      return null;
    }
    if (typeof outage.aggregateCount === "number") {
      return outage.aggregateCount;
    }
    if (
      Array.isArray(outage.relatedOutageIds) &&
      outage.relatedOutageIds.length > 0
    ) {
      return outage.relatedOutageIds.length + 1;
    }
    return null;
  }

  function updateCountLabel(marker, outage) {
    if (!marker || typeof marker.bindTooltip !== "function") {
      return;
    }
    var count = countForOutage(outage);
    var hasTip =
      typeof marker.getTooltip === "function" ? !!marker.getTooltip() : false;

    if (count && count > 1) {
      if (hasTip && typeof marker.setTooltipContent === "function") {
        marker.setTooltipContent(String(count));
      } else {
        marker.bindTooltip(String(count), {
          permanent: true,
          direction: "center",
          className: "bubble-count-label",
          opacity: 1,
        });
      }
    } else if (hasTip && typeof marker.unbindTooltip === "function") {
      marker.unbindTooltip();
    }
  }

  function createBubble(mapHandle, group, outage) {
    var marker = L.circleMarker([outage.lat, outage.lng], {
      radius: radiusFor(outage),
      fillColor: colorFor(outage),
      fillOpacity: BUBBLE_FILL_OPACITY,
      color: BUBBLE_STROKE_COLOR,
      weight: BUBBLE_STROKE_WEIGHT,
      opacity: BUBBLE_STROKE_OPACITY,
    });

    marker.bindPopup(popupHtml(outage), {
      className: "outage-popup-wrapper",
      closeButton: true,
    });

    // Hover opens the popup; moving the pointer off closes it, leaving the
    // bubble in place (Requirement 1.4). Click toggles for touch/keyboard use.
    marker.on("mouseover", function () {
      marker.openPopup();
    });
    marker.on("mouseout", function () {
      marker.closePopup();
    });
    marker.on("click", function () {
      // Primary action: select this outage so the detail panel updates.
      if (selectHandler) {
        try {
          selectHandler(outage);
        } catch (e) {
          /* never let a handler error break map interaction */
        }
      }
      // Secondary: keep the popup toggle for a quick on-map summary.
      if (marker.isPopupOpen && marker.isPopupOpen()) {
        marker.closePopup();
      } else {
        marker.openPopup();
      }
    });

    // Stash the outage on the marker so filter/visibility logic can read it
    // without another lookup, and so a hidden-then-shown marker keeps its data.
    marker.__outage = outage;

    group.addLayer(marker);
    mapHandle.bubbleLayers[outage.id] = marker;
    // Now that the marker is added, its SVG _path exists in the DOM: apply the
    // velocity pulse (speed from growth rate, color from reportable state).
    applyPulseState(marker, outage);
    // Optional aggregate-count label (live demo).
    updateCountLabel(marker, outage);
    return marker;
  }

  /**
   * Renders one bubble per VALID outage on the map (Requirements 1.1, 1.2,
   * 1.3, 1.4, 14.5, 14.6).
   *
   * Behavior:
   *   - Clears any previously rendered bubbles so a re-render is a clean redraw.
   *   - For each outage whose coordinates pass `isValidCoordinate`, draws an
   *     `L.circleMarker` at its lat/lng with radius from the Size Scale and
   *     fill color from the Color Scale, and binds a details popup.
   *   - Records with out-of-range coordinates are skipped (no bubble) while the
   *     remaining valid records still render (Requirement 14.6).
   *   - An empty list renders zero bubbles (Requirement 14.5).
   *   - Markers are tracked by outage id on `mapHandle.bubbleLayers` so
   *     `updateOutages` can mutate them in place.
   *
   * @param {Object} mapHandle - handle returned by `initMap`.
   * @param {Array} outages - list of outage records.
   */
  function renderOutages(mapHandle, outages) {
    if (!mapHandle || !mapHandle.map) {
      return;
    }
    var group = ensureBubbleGroup(mapHandle);

    // Clean redraw: remove existing bubbles and reset the id -> marker index.
    group.clearLayers();
    mapHandle.bubbleLayers = {};

    var list = Array.isArray(outages) ? outages : [];
    for (var i = 0; i < list.length; i++) {
      var outage = list[i];
      if (!outage || !C.isValidCoordinate(outage.lat, outage.lng)) {
        // Skip out-of-range/invalid coordinates (Requirement 14.6).
        continue;
      }
      createBubble(mapHandle, group, outage);
    }
  }

  /**
   * Updates existing bubbles in place from a new outage list, used by live
   * drift so the map animates without a full teardown/rebuild (design:
   * "update existing bubbles' radius/fillColor in place").
   *
   * For each outage:
   *   - If a marker already exists for its id, mutates the radius via
   *     `setRadius`, the fill color via `setStyle`, and refreshes popup content.
   *   - If no marker exists yet (and coordinates are valid), creates one.
   * Markers whose id is no longer present in the new list are removed.
   *
   * @param {Object} mapHandle - handle returned by `initMap`.
   * @param {Array} outages - updated list of outage records.
   */
  function updateOutages(mapHandle, outages) {
    if (!mapHandle || !mapHandle.map) {
      return;
    }
    var group = ensureBubbleGroup(mapHandle);
    var list = Array.isArray(outages) ? outages : [];

    // Track which ids are present in the incoming list so stale markers can be
    // pruned afterwards.
    var seen = {};

    for (var i = 0; i < list.length; i++) {
      var outage = list[i];
      if (!outage || !C.isValidCoordinate(outage.lat, outage.lng)) {
        continue;
      }
      seen[outage.id] = true;
      var marker = mapHandle.bubbleLayers[outage.id];
      if (marker) {
        // Keep the stashed outage current so visibility filtering (which reads
        // marker.__outage) reflects the drifted values.
        marker.__outage = outage;
        // Mutate the existing bubble in place (radius + fill color).
        marker.setRadius(radiusFor(outage));
        marker.setStyle({ fillColor: colorFor(outage) });
        // Refresh the velocity pulse: speed tracks the drifting growth rate and
        // color tracks crossing the 900k FCC threshold.
        applyPulseState(marker, outage);
        // Refresh the aggregate-count label (live demo) in place.
        updateCountLabel(marker, outage);
        // Refresh popup content so details reflect the drifted values.
        marker.setPopupContent(popupHtml(outage));
      } else {
        // New id not previously rendered — create it (robustness).
        createBubble(mapHandle, group, outage);
      }
    }

    // Remove markers for ids no longer present (robustness).
    var ids = Object.keys(mapHandle.bubbleLayers);
    for (var j = 0; j < ids.length; j++) {
      var id = ids[j];
      if (!seen[id]) {
        group.removeLayer(mapHandle.bubbleLayers[id]);
        delete mapHandle.bubbleLayers[id];
      }
    }
  }

  /**
   * Shows only the bubbles whose outage id is in `allowedIds`, hiding the rest,
   * WITHOUT destroying any markers. Markers are added to / removed from the
   * bubble layer group but always kept in `mapHandle.bubbleLayers`, so live
   * drift (`updateOutages`) can keep mutating them in place while hidden and
   * they reappear with fresh values when they re-enter the filter.
   *
   * `allowedIds` may be a Set, an object used as a lookup map ({ id: true }),
   * or an array of ids. A null/undefined value shows everything.
   *
   * @param {Object} mapHandle - handle returned by `initMap`.
   * @param {Set<string>|Object|Array<string>|null} allowedIds
   */
  function applyVisibility(mapHandle, allowedIds) {
    if (!mapHandle || !mapHandle.map) {
      return;
    }
    var group = ensureBubbleGroup(mapHandle);

    // Normalize the various accepted shapes into a predicate.
    var isAllowed;
    if (allowedIds == null) {
      isAllowed = function () {
        return true;
      };
    } else if (typeof allowedIds.has === "function") {
      // Set
      isAllowed = function (id) {
        return allowedIds.has(id);
      };
    } else if (Array.isArray(allowedIds)) {
      var lookup = {};
      for (var k = 0; k < allowedIds.length; k++) {
        lookup[allowedIds[k]] = true;
      }
      isAllowed = function (id) {
        return !!lookup[id];
      };
    } else {
      isAllowed = function (id) {
        return !!allowedIds[id];
      };
    }

    var ids = Object.keys(mapHandle.bubbleLayers);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var marker = mapHandle.bubbleLayers[id];
      if (!marker) {
        continue;
      }
      var onMap = group.hasLayer ? group.hasLayer(marker) : true;
      if (isAllowed(id)) {
        if (!onMap) {
          group.addLayer(marker);
          // Re-apply the velocity pulse now that it is back in the DOM.
          applyPulseState(marker, marker.__outage);
        }
      } else if (onMap) {
        group.removeLayer(marker);
      }
    }
  }

  // --- Heatmap layer (Leaflet.heat plugin) --------------------------------

  // Heat gradient matching the yellow -> orange -> red dashboard theme.
  var HEAT_GRADIENT = { 0.0: "#ffe14d", 0.5: "#ff9d2e", 1.0: "#d7191c" };
  var HEAT_OPTIONS = { radius: 34, blur: 22, maxZoom: 8, minOpacity: 0.35 };

  var FCC_THRESHOLD =
    (C && C.FCC_REPORT_THRESHOLD) ||
    (C && C.LOST_USERS_DOMAIN && C.LOST_USERS_DOMAIN.max) ||
    900000;

  /**
   * Builds the [lat, lng, intensity] point array the heat layer consumes from
   * the (already filtered) outage list. Intensity is the outage's lost users
   * normalized against the 900k FCC threshold, clamped to [0, 1]. Records with
   * invalid coordinates are skipped (mirrors bubble rendering).
   *
   * @param {Array} outages
   * @returns {Array<Array<number>>}
   */
  function buildHeatPoints(outages) {
    var list = Array.isArray(outages) ? outages : [];
    var points = [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || !C.isValidCoordinate(o.lat, o.lng)) {
        continue;
      }
      var raw = typeof o.currentLostUsers === "number" ? o.currentLostUsers : 0;
      var intensity = C.clamp ? C.clamp(raw / FCC_THRESHOLD, 0, 1) : raw / FCC_THRESHOLD;
      points.push([o.lat, o.lng, intensity]);
    }
    return points;
  }

  /**
   * Hides the bubble layer group by detaching it from the map WITHOUT
   * destroying markers, so bubbles reappear (with current values) when re-shown.
   */
  function hideBubbles(mapHandle) {
    var group = mapHandle && mapHandle.bubbleGroup;
    if (group && mapHandle.map && mapHandle.map.hasLayer && mapHandle.map.hasLayer(group)) {
      mapHandle.map.removeLayer(group);
    } else if (group && mapHandle.map && mapHandle.map.removeLayer) {
      // Best-effort even if hasLayer is unavailable on a stub.
      mapHandle.map.removeLayer(group);
    }
  }

  /**
   * Re-attaches the bubble layer group to the map.
   */
  function showBubbles(mapHandle) {
    var group = ensureBubbleGroup(mapHandle);
    if (group && mapHandle.map && mapHandle.map.addLayer) {
      var onMap = mapHandle.map.hasLayer ? mapHandle.map.hasLayer(group) : false;
      if (!onMap) {
        mapHandle.map.addLayer(group);
      }
    }
  }

  /**
   * Shows the heatmap built from the (filtered) outage list and hides the
   * bubble layer group. Builds the L.heatLayer on first use and reuses it
   * afterward. No-op (beyond hiding bubbles) if the Leaflet.heat plugin is not
   * loaded.
   *
   * @param {Object} mapHandle
   * @param {Array} outages - the currently-visible (filtered) outages.
   */
  function showHeatmap(mapHandle, outages) {
    if (!mapHandle || !mapHandle.map) {
      return;
    }
    hideBubbles(mapHandle);

    if (typeof L === "undefined" || typeof L.heatLayer !== "function") {
      // Plugin unavailable — bubbles are hidden; nothing else to draw.
      return;
    }

    var points = buildHeatPoints(outages);
    // Rebuild the heat layer fresh on every show. Reusing a heat layer that was
    // previously removed from the map leaves the Leaflet.heat plugin in a stale
    // state where it no longer redraws (bug: heatmap stops working after
    // toggling bubbles -> heatmap a second time). Recreating avoids that.
    if (mapHandle.heatLayer && mapHandle.map.removeLayer) {
      mapHandle.map.removeLayer(mapHandle.heatLayer);
      mapHandle.heatLayer = null;
    }
    mapHandle.heatLayer = L.heatLayer(
      points,
      Object.assign({ gradient: HEAT_GRADIENT }, HEAT_OPTIONS)
    );
    mapHandle.heatLayer.addTo(mapHandle.map);
  }

  /**
   * Removes the heat layer from the map and restores the bubble layer group.
   *
   * @param {Object} mapHandle
   */
  function hideHeatmap(mapHandle) {
    if (!mapHandle || !mapHandle.map) {
      return;
    }
    if (mapHandle.heatLayer && mapHandle.map.removeLayer) {
      mapHandle.map.removeLayer(mapHandle.heatLayer);
    }
    showBubbles(mapHandle);
  }

  /**
   * Rebuilds the heat points from the current (filtered) outage list if the
   * heat layer is currently on the map. Used on filter change and each live
   * drift tick while in Heatmap mode. No-op when the heat layer is not active.
   *
   * @param {Object} mapHandle
   * @param {Array} outages
   */
  function updateHeatmap(mapHandle, outages) {
    if (!mapHandle || !mapHandle.map || !mapHandle.heatLayer) {
      return;
    }
    var onMap = mapHandle.map.hasLayer
      ? mapHandle.map.hasLayer(mapHandle.heatLayer)
      : true;
    if (!onMap) {
      return;
    }
    if (mapHandle.heatLayer.setLatLngs) {
      mapHandle.heatLayer.setLatLngs(buildHeatPoints(outages));
    }
  }

  /**
   * Adds an on-map "Bubbles | Heatmap" toggle control to the top-right corner
   * (styled to avoid the bottom-left legend). Invokes `onSelect(mode)` with
   * "bubbles" or "heatmap" whenever the mode changes. Returns the control (or
   * null if Leaflet controls are unavailable, e.g. under a test stub).
   *
   * @param {Object} mapHandle
   * @param {Function} onSelect - called with the newly-selected mode.
   * @returns {Object|null}
   */
  function addMapModeToggle(mapHandle, onSelect) {
    if (
      !mapHandle ||
      !mapHandle.map ||
      typeof L === "undefined" ||
      !L.control ||
      !L.DomUtil ||
      typeof document === "undefined"
    ) {
      return null;
    }

    var control = L.control({ position: "topright" });
    control.onAdd = function () {
      var container = L.DomUtil.create("div", "map-mode-toggle");
      container.setAttribute("role", "group");
      container.setAttribute("aria-label", "Map display mode");

      var modes = [
        { key: "bubbles", label: "Bubbles" },
        { key: "heatmap", label: "Heatmap" },
      ];

      var buttons = {};
      modes.forEach(function (m) {
        var btn = L.DomUtil.create("button", "map-mode-toggle__btn", container);
        btn.type = "button";
        btn.textContent = m.label;
        btn.setAttribute("data-mode", m.key);
        if (m.key === "bubbles") {
          btn.classList.add("is-active");
        }
        buttons[m.key] = btn;
        btn.addEventListener("click", function (evt) {
          evt.preventDefault();
          evt.stopPropagation();
          Object.keys(buttons).forEach(function (k) {
            buttons[k].classList.toggle("is-active", k === m.key);
          });
          if (typeof onSelect === "function") {
            onSelect(m.key);
          }
        });
      });

      // Prevent map drag/zoom when interacting with the control.
      if (L.DomEvent) {
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
      }
      return container;
    };
    control.addTo(mapHandle.map);
    mapHandle.modeToggle = control;
    return control;
  }

  var api = {
    initMap: initMap,
    renderOutages: renderOutages,
    updateOutages: updateOutages,
    // Heatmap mode (Leaflet.heat): build heat points from the filtered list.
    showHeatmap: showHeatmap,
    hideHeatmap: hideHeatmap,
    updateHeatmap: updateHeatmap,
    // On-map "Bubbles | Heatmap" toggle control.
    addMapModeToggle: addMapModeToggle,
    // Toggle bubble visibility by allowed outage-id set WITHOUT destroying
    // markers (shared filter drives this from app.js).
    applyVisibility: applyVisibility,
    // Register a callback invoked with the outage when its bubble is clicked
    // (drives the detail panel in app.js).
    setSelectHandler: setSelectHandler,
    // Exposed so callers can force the tile-failure notice (e.g. when they
    // detect connectivity issues out-of-band) or hide it after recovery.
    setTilesUnavailable: toggleTilesNotice,
  };

  // Attach to the browser global so app.js (and later tasks) can use it.
  global.MapRenderer = api;

  // NOTE: intentionally NO dual-mode `module.exports` footer here. map.js is a
  // browser/DOM-only module that depends on the Leaflet global `L`; it is not
  // imported by the Node/Vitest suite, so exporting it would risk pulling
  // Leaflet into a Node context that has no DOM.
})(typeof window !== "undefined" ? window : this);
