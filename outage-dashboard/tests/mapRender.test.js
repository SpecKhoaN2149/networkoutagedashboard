// @vitest-environment jsdom
/*
 * mapRender.test.js — Property 5: rendered bubble count matches active outages
 * (task 10.2).
 *
 * **Property 5: Rendered bubble count matches active outages**
 * **Validates: Requirements 1.1, 14.3**
 *
 * map.js is a browser/DOM-only module that reads the Leaflet global `L` and has
 * NO Node dual-mode export footer — it self-attaches its api to the global
 * (which is `window` under jsdom). So we run it in a jsdom environment, expose
 * the scale/constant modules on `window` (they self-attach too, but we assign
 * explicitly to be robust), install a lightweight FAKE Leaflet (`L`) that
 * captures only the surface map.js uses, then read `window.MapRenderer`.
 *
 * The fake Leaflet lets us exercise the real render LOGIC (which outages become
 * bubbles, keyed by id) without loading real tiles — the goal is to validate
 * module logic, not Leaflet.
 */

// The scale/constant modules self-attach to their global (window under jsdom)
// AND export via CommonJS. Assign explicitly so map.js can read them off the
// window global regardless of load order.
const Constants = require("../constants");
const SizeScale = require("../sizeScale");
const ColorScale = require("../colorScale");
const { getMockOutages } = require("../mockData");

window.DashboardConstants = Constants;
window.SizeScale = SizeScale;
window.ColorScale = ColorScale;

/**
 * Builds a lightweight fake Leaflet (`L`) exposing exactly the surface map.js
 * touches. Stubs record layers so we can assert render logic without tiles.
 */
function makeFakeLeaflet() {
  function makeMap() {
    return {
      options: {},
      fitBounds() {},
      setView() {},
      getZoom() {
        return 4;
      },
      setMaxBounds() {},
      setMinZoom() {},
      addLayer() {},
      removeLayer() {},
    };
  }

  function makeTileLayer() {
    return {
      addTo() {
        return this;
      },
      on() {
        return this;
      },
    };
  }

  function makeLayerGroup() {
    return {
      _layers: [],
      addLayer(m) {
        this._layers.push(m);
        return this;
      },
      removeLayer(m) {
        const i = this._layers.indexOf(m);
        if (i !== -1) this._layers.splice(i, 1);
        return this;
      },
      clearLayers() {
        this._layers = [];
        return this;
      },
      addTo() {
        return this;
      },
    };
  }

  function makeMarker() {
    return {
      bindPopup() {
        return this;
      },
      on() {
        return this;
      },
      setRadius() {
        return this;
      },
      setStyle() {
        return this;
      },
      setPopupContent() {
        return this;
      },
      openPopup() {
        return this;
      },
      closePopup() {
        return this;
      },
      isPopupOpen() {
        return false;
      },
    };
  }

  return {
    map() {
      return makeMap();
    },
    tileLayer() {
      return makeTileLayer();
    },
    layerGroup() {
      return makeLayerGroup();
    },
    circleMarker() {
      return makeMarker();
    },
    latLngBounds() {
      return {};
    },
  };
}

// Install the fake Leaflet on both the window and the Node global BEFORE
// loading map.js, since map.js reads `L` from its enclosing global scope.
const fakeL = makeFakeLeaflet();
window.L = fakeL;
global.L = fakeL;

// Now load map.js — it runs its IIFE against `window` and attaches MapRenderer.
require("../map");
const MapRenderer = window.MapRenderer;

describe("Property 5: rendered bubble count matches active outages (task 10.2)", () => {
  let handle;

  beforeEach(() => {
    // Fresh #map container + fresh map handle for every test.
    document.body.innerHTML = '<div id="map"></div>';
    handle = MapRenderer.initMap("map");
  });

  it("MapRenderer is available and initMap returns a handle", () => {
    expect(typeof MapRenderer.renderOutages).toBe("function");
    expect(handle).toBeTruthy();
    expect(handle.map).toBeTruthy();
  });

  it("renders exactly one bubble per valid outage (hand-built list)", () => {
    // Two valid outages + one with an out-of-range latitude (999) that must be
    // skipped (Req 14.6), so the rendered count equals the VALID count.
    const outages = [
      {
        id: "a",
        name: "A",
        network: "Spectrum",
        region: "NY",
        lat: 40.7128,
        lng: -74.006,
        currentLostUsers: 1000,
        growthRatePerMin: 100,
        severity: "major",
        startedAt: new Date().toISOString(),
      },
      {
        id: "b",
        name: "B",
        network: "Cox",
        region: "TX",
        lat: 32.7767,
        lng: -96.797,
        currentLostUsers: 2000,
        growthRatePerMin: 200,
        severity: "critical",
        startedAt: new Date().toISOString(),
      },
      {
        // Out-of-range latitude — must be skipped.
        id: "bad",
        name: "Bad",
        network: "Cox",
        region: "??",
        lat: 999,
        lng: -100,
        currentLostUsers: 500,
        growthRatePerMin: 50,
        severity: "minor",
        startedAt: new Date().toISOString(),
      },
    ];

    const validCount = outages.filter((o) =>
      Constants.isValidCoordinate(o.lat, o.lng)
    ).length;

    MapRenderer.renderOutages(handle, outages);

    expect(validCount).toBe(2);
    expect(Object.keys(handle.bubbleLayers).length).toBe(validCount);
  });

  it("renders one bubble per outage for the full mock dataset (all valid)", () => {
    const outages = getMockOutages();
    const validCount = outages.filter((o) =>
      Constants.isValidCoordinate(o.lat, o.lng)
    ).length;

    MapRenderer.renderOutages(handle, outages);

    // Every seed outage sits within valid coordinates, so all render.
    expect(validCount).toBe(outages.length);
    expect(Object.keys(handle.bubbleLayers).length).toBe(outages.length);
  });

  it("mixes mock data with an invalid record and skips only the invalid one", () => {
    const outages = getMockOutages();
    outages.push({
      id: "otg-bad",
      name: "Off-grid",
      network: "Spectrum",
      region: "Nowhere",
      lat: 999, // out of range
      lng: 999, // out of range
      currentLostUsers: 4242,
      growthRatePerMin: 300,
      severity: "critical",
      startedAt: new Date().toISOString(),
    });

    const validCount = outages.filter((o) =>
      Constants.isValidCoordinate(o.lat, o.lng)
    ).length;

    MapRenderer.renderOutages(handle, outages);

    expect(validCount).toBe(outages.length - 1);
    expect(Object.keys(handle.bubbleLayers).length).toBe(validCount);
  });

  it("renders zero bubbles for an empty list (Req 14.3/14.5)", () => {
    MapRenderer.renderOutages(handle, []);
    expect(Object.keys(handle.bubbleLayers).length).toBe(0);
  });
});
