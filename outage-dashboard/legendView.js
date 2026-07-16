/*
 * legendView.js — Legend VIEW (DOM rendering) for the Spectrum + Cox outage
 * dashboard mockup.
 *
 * Renders the legend overlay that explains the map's dual encoding into the
 * `#legend` container, driven entirely by the LegendModel produced by
 * `window.Legend.getLegendModel()` (legend.js). Because the model is derived
 * from the SAME scale functions the map uses, the rendered legend can never
 * drift out of sync with what is drawn on the map.
 *
 * What it renders (Requirements 4.1, 4.2):
 *   - A "Growth rate (bubble size)" section with EXACTLY three labeled size
 *     samples ("slow" / "medium" / "fast"), each drawn as a circle whose
 *     diameter equals `radiusPx * 2` so the sample visually matches the map's
 *     bubble scale.
 *   - A "Lost users (color)" section with the yellow -> orange -> red gradient
 *     bar and at least three labeled threshold values (one per color stop),
 *     each showing the stop's label and its lost-user count.
 *
 * Buildless / browser-only: loaded via a plain <script> tag AFTER legend.js so
 * `window.Legend` is available. It attaches its exports to `window.LegendView`.
 *
 * NOTE: intentionally NO dual-mode `module.exports` footer here. legendView.js
 * is a DOM-only module (it touches `document`); it is not imported by the
 * Node/Vitest suite, so exporting it would risk pulling DOM APIs into a Node
 * context that has none. This mirrors map.js.
 */
(function (global) {
  "use strict";

  var DEFAULT_CONTAINER_ID = "legend";

  /**
   * Resolves the container argument to an actual DOM element.
   *
   * Accepts an element, an element id string, or nothing (falls back to the
   * default "legend" id), so callers can use whichever is convenient.
   *
   * @param {(HTMLElement|string|undefined)} container - element, id, or nothing.
   * @returns {HTMLElement|null} the resolved container element, or null.
   */
  function resolveContainer(container) {
    if (container && container.nodeType === 1) {
      // Already a DOM element.
      return container;
    }
    var id =
      typeof container === "string" && container.length > 0
        ? container
        : DEFAULT_CONTAINER_ID;
    return document.getElementById(id);
  }

  /**
   * Formats a lost-user count for the gradient threshold labels.
   * Uses locale grouping so large numbers stay readable (e.g. "50,000").
   *
   * @param {number} value - lost-user count from a color stop.
   * @returns {string} the formatted number, or "" when not numeric.
   */
  function formatLostUsers(value) {
    if (typeof value !== "number" || !isFinite(value)) {
      return "";
    }
    try {
      return value.toLocaleString("en-US");
    } catch (e) {
      return String(value);
    }
  }

  /**
   * Builds the "Growth rate (bubble size)" section: exactly three labeled size
   * samples whose circle diameter equals `radiusPx * 2` (Requirements 4.1, 4.3).
   *
   * @param {Array} sizeSamples - LegendModel.sizeSamples.
   * @returns {HTMLElement} the section element.
   */
  function buildSizeSection(sizeSamples) {
    var section = document.createElement("div");
    section.className = "legend__section";

    var heading = document.createElement("div");
    heading.className = "legend__heading";
    heading.textContent = "Growth velocity (bubble size)";
    section.appendChild(heading);

    var sizes = document.createElement("div");
    sizes.className = "legend__sizes";

    (sizeSamples || []).forEach(function (sample) {
      var sampleEl = document.createElement("div");
      sampleEl.className = "legend__size-sample";

      var bubble = document.createElement("div");
      bubble.className = "legend__size-bubble";
      // Diameter = radius * 2 so the sample matches the map bubble scale.
      var diameter = Math.max(0, Number(sample.radiusPx) * 2);
      bubble.style.width = diameter + "px";
      bubble.style.height = diameter + "px";

      var label = document.createElement("div");
      label.className = "legend__size-label";
      label.textContent = sample.label;

      sampleEl.appendChild(bubble);
      sampleEl.appendChild(label);
      sizes.appendChild(sampleEl);
    });

    section.appendChild(sizes);
    return section;
  }

  /**
   * Builds the "Lost users (color)" section: the yellow -> orange -> red
   * gradient bar (styled via CSS) plus one labeled threshold value per color
   * stop, giving at least three labeled thresholds (Requirements 4.2, 4.4).
   *
   * @param {Array} colorStops - LegendModel.colorStops.
   * @returns {HTMLElement} the section element.
   */
  function buildColorSection(colorStops) {
    var section = document.createElement("div");
    section.className = "legend__section";

    var heading = document.createElement("div");
    heading.className = "legend__heading";
    heading.textContent = "Closeness to 900k user-min (color)";
    section.appendChild(heading);

    // The gradient bar's yellow->orange->red background is defined in CSS.
    var gradient = document.createElement("div");
    gradient.className = "legend__gradient";
    section.appendChild(gradient);

    var labels = document.createElement("div");
    labels.className = "legend__gradient-labels";

    (colorStops || []).forEach(function (stop) {
      var span = document.createElement("span");
      var count = formatLostUsers(stop.lostUsers);
      // Show both the human label and the threshold value, e.g. "low (0)".
      span.textContent = count ? stop.label + " (" + count + ")" : stop.label;
      labels.appendChild(span);
    });

    section.appendChild(labels);
    return section;
  }

  /**
   * Builds a short note explaining the velocity pulse encoding (growth rate is
   * no longer mapped to size/color; it drives a pulsing ring instead).
   *
   * @returns {HTMLElement} the note element.
   */
  function buildPulseNote() {
    var note = document.createElement("div");
    note.className = "legend__note";
    note.textContent =
      "Pulse = growth velocity (faster pulse = growing faster); " +
      "red pulse = FCC reportable.";
    return note;
  }

  /**
   * Updates the toggle button glyph/label to reflect the container's current
   * collapsed state (− when expanded, + when collapsed).
   */
  function syncToggle(el) {
    var btn = el.querySelector(".legend__toggle");
    if (!btn) {
      return;
    }
    var collapsed = el.classList.contains("legend--collapsed");
    btn.textContent = collapsed ? "+" : "\u2013"; // plus / en-dash
    btn.setAttribute(
      "aria-label",
      collapsed ? "Expand legend" : "Minimize legend"
    );
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  /**
   * Builds the legend header bar: a "Legend" title and a minimize/expand
   * toggle button. Clicking the button (or the bar) collapses the legend to
   * just this bar, hiding the size/color sections so the map underneath stays
   * visible; clicking again restores it.
   *
   * @param {HTMLElement} container - the legend container, toggled on click.
   * @returns {HTMLElement} the header bar element.
   */
  function buildHeaderBar(container) {
    var bar = document.createElement("div");
    bar.className = "legend__bar";

    var title = document.createElement("span");
    title.className = "legend__title";
    title.textContent = "Legend";

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "legend__toggle";

    toggle.addEventListener("click", function (evt) {
      evt.stopPropagation();
      container.classList.toggle("legend--collapsed");
      syncToggle(container);
    });

    bar.appendChild(title);
    bar.appendChild(toggle);
    return bar;
  }

  /**
   * Renders the legend overlay into the given container from a LegendModel.
   *
   * Signature matches the design's `renderLegend(legend: LegendModel)` while
   * staying robust for browser wiring:
   *   - `legendModel` (optional): the LegendModel to render. When omitted (or
   *     falsy), it is pulled from `window.Legend.getLegendModel()` so the legend
   *     always reflects the same scales the map uses.
   *   - `container` (optional): a DOM element, an element id string, or nothing
   *     (defaults to the "legend" element).
   *
   * @param {Object} [legendModel] - { sizeSamples, colorStops }.
   * @param {(HTMLElement|string)} [container] - target element or its id.
   * @returns {HTMLElement|null} the container that was rendered into, or null.
   */
  function renderLegend(legendModel, container) {
    var el = resolveContainer(container);
    if (!el) {
      return null;
    }

    var model = legendModel;
    if (!model && global.Legend && global.Legend.getLegendModel) {
      model = global.Legend.getLegendModel();
    }
    model = model || { sizeSamples: [], colorStops: [] };

    // Preserve the collapsed state across re-renders.
    var wasCollapsed = el.classList.contains("legend--collapsed");

    // Rebuild from scratch so repeated calls stay idempotent.
    el.innerHTML = "";
    el.appendChild(buildHeaderBar(el));
    el.appendChild(buildSizeSection(model.sizeSamples));
    el.appendChild(buildColorSection(model.colorStops));

    if (wasCollapsed) {
      el.classList.add("legend--collapsed");
    }
    syncToggle(el);

    return el;
  }

  var api = {
    renderLegend: renderLegend,
  };

  // Attach to the browser global so app.js (task 16) can render the legend.
  global.LegendView = api;
})(typeof window !== "undefined" ? window : this);
