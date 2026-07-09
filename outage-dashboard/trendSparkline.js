/*
 * trendSparkline.js — Trend Sparkline for the Spectrum + Cox outage dashboard.
 *
 * Renders "total lost users over recent time" as a compact inline SVG
 * line + area chart with a dot at the latest point and a caption showing the
 * current total. The module owns an internal history buffer capped at 30
 * points (oldest dropped when exceeding the cap — Requirement 11.3) so that
 * app.js (task 16.1) can simply seed it on load and push one new point per
 * live-drift tick. On load it always shows at least one point, including a
 * value of 0 for an empty outage set (Requirement 11.4).
 *
 * Data model (design TrendPoint): { t: ISO 8601 string, totalLostUsers: number }.
 *
 * Buildless / browser-only: loaded via a plain <script> tag and renders into
 * the DOM. It is DOM-only, is intentionally NOT imported by the Node/Vitest
 * suite, and therefore has NO dual-mode `module.exports` footer. It attaches
 * its api to `window.TrendSparkline`.
 *
 * Public api (window.TrendSparkline):
 *   init(initialTotal, containerId)   — reset the buffer to a single seed point
 *   reset(initialTotal, containerId)  — alias of init
 *   push(totalLostUsers, containerId) — append a point (capped at 30) + re-render
 *   addPoint(totalLostUsers, ...)     — alias of push
 *   render(containerId)               — draw the current buffer
 *   renderTrendSparkline(history, id) — draw an explicit history (design interface)
 *   getHistory()                      — copy of the current buffer
 *   MAX_POINTS                        — the retention cap (30)
 */
(function (global) {
  "use strict";

  // Requirement 11.1 / 11.3: retain at most 30 data points, oldest → newest.
  var MAX_POINTS = 30;

  // Default container id (matches <div id="trend-sparkline"> in index.html).
  var DEFAULT_CONTAINER_ID = "trend-sparkline";

  // SVG viewBox geometry. preserveAspectRatio="none" lets the fixed viewBox
  // stretch to the container's responsive width/height (CSS: 100% × 72px);
  // strokes use vector-effect="non-scaling-stroke" so they stay crisp.
  var VB_W = 300;
  var VB_H = 72;
  var PAD_X = 4;
  var PAD_Y = 8;

  // Internal, module-owned history buffer of TrendPoint objects.
  var history = [];

  // -----------------------------------------------------------------------
  // Buffer helpers
  // -----------------------------------------------------------------------

  /**
   * Returns a new TrendPoint for the given total (non-negative), timestamped now.
   * @param {number} totalLostUsers
   * @returns {{t: string, totalLostUsers: number}}
   */
  function makePoint(totalLostUsers) {
    var v = Number(totalLostUsers);
    if (!isFinite(v) || v < 0) v = 0;
    return { t: new Date().toISOString(), totalLostUsers: v };
  }

  /**
   * Caps a list of points to the newest MAX_POINTS, dropping the oldest from
   * the front so at most 30 remain in oldest → newest display order (Req 11.3).
   * @param {Array} points
   * @returns {Array}
   */
  function capHistory(points) {
    if (!Array.isArray(points)) return [];
    if (points.length > MAX_POINTS) {
      return points.slice(points.length - MAX_POINTS);
    }
    return points.slice();
  }

  /**
   * Seeds the buffer with exactly one point representing the current total,
   * defaulting to 0 for an empty outage set, then renders (Requirement 11.4).
   * @param {number} [initialTotal=0]
   * @param {string} [containerId]
   */
  function init(initialTotal, containerId) {
    var seed = initialTotal == null ? 0 : initialTotal;
    history = [makePoint(seed)];
    render(containerId);
    return getHistory();
  }

  /**
   * Appends one new total as the latest point, dropping the oldest if the cap
   * is exceeded (Requirements 11.2, 11.3), then re-renders.
   * @param {number} totalLostUsers
   * @param {string} [containerId]
   */
  function push(totalLostUsers, containerId) {
    history.push(makePoint(totalLostUsers));
    history = capHistory(history);
    render(containerId);
    return getHistory();
  }

  /**
   * Returns a shallow copy of the current history buffer (oldest → newest).
   * @returns {Array}
   */
  function getHistory() {
    return history.slice();
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  /**
   * Formats an integer count with thousands separators for the caption.
   * @param {number} n
   * @returns {string}
   */
  function formatCount(n) {
    var v = Math.round(Number(n) || 0);
    return v.toLocaleString("en-US");
  }

  /**
   * Builds the geometry for a series of numeric values within the viewBox.
   * Scales the y-axis to the data's min/max and gracefully handles the
   * all-equal / single-point / all-zero cases (no divide-by-zero: a flat
   * series is centered vertically).
   *
   * @param {number[]} values - ordered totals, length >= 1.
   * @returns {{linePoints:string, areaPath:string, dot:{x:number,y:number}}}
   */
  function buildGeometry(values) {
    var n = values.length;
    var innerW = VB_W - PAD_X * 2;
    var innerH = VB_H - PAD_Y * 2;
    var baseline = VB_H - PAD_Y; // bottom of the drawable area (for the fill)

    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var range = max - min;

    // x: spread indices across the inner width; a single point sits at the
    // right edge so the newest value is always anchored consistently.
    function xAt(i) {
      if (n === 1) return PAD_X + innerW;
      return PAD_X + (i / (n - 1)) * innerW;
    }

    // y: higher value → smaller y (nearer the top). When every value is equal
    // (range === 0, which also covers the single-point and all-zero cases) the
    // series is drawn as a flat line at the vertical center.
    function yAt(v) {
      var norm = range === 0 ? 0.5 : (v - min) / range;
      return PAD_Y + (1 - norm) * innerH;
    }

    var coords = values.map(function (v, i) {
      return { x: xAt(i), y: yAt(v) };
    });

    var linePoints = coords
      .map(function (c) {
        return c.x.toFixed(2) + "," + c.y.toFixed(2);
      })
      .join(" ");

    // Area path: trace the line then close down to the baseline and back.
    var first = coords[0];
    var last = coords[coords.length - 1];
    var areaPath =
      "M " +
      first.x.toFixed(2) +
      " " +
      baseline.toFixed(2) +
      " L " +
      coords
        .map(function (c) {
          return c.x.toFixed(2) + " " + c.y.toFixed(2);
        })
        .join(" L ") +
      " L " +
      last.x.toFixed(2) +
      " " +
      baseline.toFixed(2) +
      " Z";

    return { linePoints: linePoints, areaPath: areaPath, dot: last };
  }

  /**
   * Renders the given history (or the internal buffer) into the container as an
   * SVG sparkline plus a caption. Always shows at least one point — if the
   * history is empty it synthesizes a single 0-valued point (Requirement 11.4).
   *
   * This is the design's `renderTrendSparkline(history, containerId)` entry
   * point; `render` below is a thin wrapper that draws the internal buffer.
   *
   * @param {Array} historyArg - array of TrendPoint; may be empty/omitted.
   * @param {string} [containerId]
   */
  function renderTrendSparkline(historyArg, containerId) {
    var id = containerId || DEFAULT_CONTAINER_ID;
    var el =
      typeof document !== "undefined" ? document.getElementById(id) : null;
    if (!el) return;

    // Normalize + cap the incoming series; ensure at least one point (Req 11.4).
    var points = capHistory(Array.isArray(historyArg) ? historyArg : []);
    if (points.length === 0) {
      points = [makePoint(0)];
    }

    var values = points.map(function (p) {
      var v = p && Number(p.totalLostUsers);
      return isFinite(v) && v >= 0 ? v : 0;
    });

    var geo = buildGeometry(values);
    var current = values[values.length - 1];

    // Inline SVG. preserveAspectRatio="none" stretches the fixed viewBox to the
    // responsive container; non-scaling-stroke keeps the line/dot crisp.
    var svg =
      '<svg class="sparkline" viewBox="0 0 ' +
      VB_W +
      " " +
      VB_H +
      '" preserveAspectRatio="none" role="img" aria-label="Total lost users trend">' +
      '<path class="sparkline__area" d="' +
      geo.areaPath +
      '" />' +
      '<polyline class="sparkline__line" points="' +
      geo.linePoints +
      '" vector-effect="non-scaling-stroke" />' +
      '<circle class="sparkline__dot" cx="' +
      geo.dot.x.toFixed(2) +
      '" cy="' +
      geo.dot.y.toFixed(2) +
      '" r="3" vector-effect="non-scaling-stroke" />' +
      "</svg>";

    var caption =
      '<div class="sparkline__caption">' +
      '<span class="sparkline__current">' +
      formatCount(current) +
      "</span>" +
      '<span class="sparkline__label">total lost users &middot; last ' +
      MAX_POINTS +
      " ticks</span>" +
      "</div>";

    el.innerHTML = svg + caption;
  }

  /**
   * Draws the module's internal history buffer.
   * @param {string} [containerId]
   */
  function render(containerId) {
    renderTrendSparkline(history, containerId);
  }

  var api = {
    MAX_POINTS: MAX_POINTS,
    init: init,
    reset: init, // alias
    push: push,
    addPoint: push, // alias
    render: render,
    renderTrendSparkline: renderTrendSparkline,
    getHistory: getHistory,
    capHistory: capHistory,
  };

  // Attach to the browser global so app.js (task 16.1) can seed on load and
  // push one point per live-drift tick.
  global.TrendSparkline = api;

  // NOTE: intentionally NO dual-mode `module.exports` footer — this is a
  // browser/DOM-only module and is not imported by the Node/Vitest suite.
})(typeof window !== "undefined" ? window : this);
