/*
 * legend.js — Legend MODEL for the Spectrum + Cox outage dashboard mockup.
 *
 * Builds the LegendModel that explains the map's dual encoding:
 *   - size samples (slow / medium / fast growth) for the Size_Scale, and
 *   - color stops (low / elevated / severe) for the Color_Scale.
 *
 * The legend is generated from the SAME scale functions the map uses, so it can
 * never drift out of sync with what is drawn (Requirements 4.2, 4.3). Every
 * sample's `radiusPx` is derived by CALLING radiusForGrowthRate on its growth
 * rate, and every stop's `color` by CALLING colorForLostUsers on its lost-user
 * value. The source inputs come from DashboardConstants.SIZE_LEGEND_SAMPLES and
 * DashboardConstants.COLOR_LEGEND_THRESHOLDS.
 *
 * This module produces the DATA model only; DOM rendering lives in legendView.js
 * (a separate task).
 *
 * Buildless: loaded in the browser via a plain <script> tag and attaches its
 * exports to `window.Legend`. It also conditionally exports for Node/Vitest via
 * the dual-mode footer, resolving DashboardConstants / SizeScale / ColorScale
 * from the browser globals with Node `require` fallbacks, so the same source
 * imports cleanly into the test runner with no build step.
 */
(function (global) {
  "use strict";

  // Resolve shared dependencies: browser globals first, Node require fallbacks.
  var Constants =
    (global && global.DashboardConstants) ||
    (typeof require !== "undefined" ? require("./constants") : undefined);
  var SizeScale =
    (global && global.SizeScale) ||
    (typeof require !== "undefined" ? require("./sizeScale") : undefined);
  var ColorScale =
    (global && global.ColorScale) ||
    (typeof require !== "undefined" ? require("./colorScale") : undefined);

  var LOST_USERS_LEGEND_SAMPLES = Constants.LOST_USERS_LEGEND_SAMPLES;
  var COLOR_LEGEND_THRESHOLDS = Constants.COLOR_LEGEND_THRESHOLDS;
  var radiusForLostUsers = SizeScale.radiusForLostUsers;
  var colorForLostUsers = ColorScale.colorForLostUsers;

  /**
   * Produces the LegendModel used by the legend view to explain both encodings.
   *
   * Both the bubble SIZE and COLOR now encode CURRENT lost users (impact /
   * closeness to the 900k FCC threshold); velocity is shown as a pulse and is
   * described by a note in the view.
   *
   * Shape:
   *   {
   *     sizeSamples: [{ label, lostUsers, radiusPx }],
   *     colorStops:  [{ label, lostUsers, color }]
   *   }
   *
   * Guarantees:
   *   - Size samples (low / elevated / FCC 900k), each with
   *     radiusPx === radiusForLostUsers(lostUsers).
   *   - At least three color stops (low / elevated / FCC report) mapping to the
   *     yellow / orange / red ramp, each with
   *     color === colorForLostUsers(lostUsers).
   *
   * The legend is derived strictly by calling the same scale functions the map
   * uses, so consistency is guaranteed by construction rather than by copying
   * values.
   *
   * @returns {{sizeSamples: Array, colorStops: Array}} the LegendModel.
   */
  function getLegendModel() {
    var sizeSamples = LOST_USERS_LEGEND_SAMPLES.map(function (sample) {
      return {
        label: sample.label,
        lostUsers: sample.lostUsers,
        // Derived from the SAME lost-users size scale the map uses.
        radiusPx: radiusForLostUsers(sample.lostUsers),
      };
    });

    var colorStops = COLOR_LEGEND_THRESHOLDS.map(function (threshold) {
      return {
        label: threshold.label,
        lostUsers: threshold.lostUsers,
        // Derived from the SAME color scale the map uses (Req 4.4).
        color: colorForLostUsers(threshold.lostUsers),
      };
    });

    return {
      sizeSamples: sizeSamples,
      colorStops: colorStops,
    };
  }

  var api = {
    getLegendModel: getLegendModel,
  };

  // Attach to the browser global so <script>-loaded modules can read it.
  global.Legend = api;

  // Dual-mode export footer for Node/Vitest.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
