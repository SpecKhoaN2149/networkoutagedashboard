// @vitest-environment jsdom
/*
 * tickSync.test.js — Integration tests for live-drift tick synchronization
 * (task 16.2).
 *
 * **Validates: Requirements 12.5, 10.3, 11.2, 11.3**
 *
 * These tests exercise the data-refresh EFFECTS of a tick (not setInterval
 * timing). They prove that on a tick:
 *   - the trend sparkline buffer appends exactly one point per push and caps at
 *     MAX_POINTS (30), dropping the oldest (Req 11.2, 11.3),
 *   - the summary, KPI cards, and outage table all derive from the SAME single
 *     updated list produced by tickOutages (Req 12.5, 10.3).
 *
 * trendSparkline / outageTable / kpiCards are browser/DOM-only modules that
 * self-attach to `window` (the global under jsdom) with no Node dual-mode
 * footer, so we run in jsdom, expose shared globals, then read the apis off
 * `window`. drift/summary are pure and export via CommonJS.
 */

const Constants = require("../constants");
const { tickOutages } = require("../drift");
const { computeSummary } = require("../summary");
const { getMockOutages } = require("../mockData");

// Shared globals the DOM modules read off the window global.
window.DashboardConstants = Constants;

// Load the DOM-only modules; they self-attach to window.
require("../trendSparkline");
require("../outageTable");
require("../kpiCards");

const TrendSparkline = window.TrendSparkline;
const OutageTable = window.OutageTable;
const KpiCards = window.KpiCards;

describe("Trend sparkline buffer (tasks 16.2 / Req 11.2, 11.3)", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="trend-sparkline"></div>';
  });

  it("init seeds exactly one point and each push appends exactly one", () => {
    const list = getMockOutages();
    const summary = computeSummary(list);

    TrendSparkline.init(summary.totalLostUsers);
    expect(TrendSparkline.getHistory().length).toBe(1);

    // Each push should append exactly one point.
    for (let i = 1; i <= 5; i++) {
      const before = TrendSparkline.getHistory().length;
      TrendSparkline.push(summary.totalLostUsers + i);
      const after = TrendSparkline.getHistory().length;
      expect(after).toBe(before + 1);
    }
    expect(TrendSparkline.getHistory().length).toBe(6);
  });

  it("caps at MAX_POINTS (30), dropping the oldest and keeping the newest window", () => {
    expect(TrendSparkline.MAX_POINTS).toBe(30);

    TrendSparkline.init(0);
    // Push well past the cap with strictly increasing, identifiable values.
    const totalPushes = 40;
    for (let i = 1; i <= totalPushes; i++) {
      TrendSparkline.push(i);
    }

    const history = TrendSparkline.getHistory();
    // Length is capped at MAX_POINTS regardless of how many were pushed.
    expect(history.length).toBe(30);

    // The retained window is the NEWEST 30 values (oldest dropped). The last
    // value pushed was `totalPushes`, and the buffer holds the final 30, so the
    // first retained element is (totalPushes - 30 + 1) = 11.
    expect(history[0].totalLostUsers).toBe(totalPushes - 30 + 1);
    expect(history[history.length - 1].totalLostUsers).toBe(totalPushes);
  });
});

describe("Summary/table/KPI sync from the same updated list (Req 12.5, 10.3)", () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="outage-table"></div><div id="kpi-row"></div>';
  });

  it("summary is computed from the exact list produced by tickOutages", () => {
    const list = getMockOutages();
    const next = tickOutages(list);
    const summary = computeSummary(next);

    const expectedTotal = next.reduce((acc, o) => acc + o.currentLostUsers, 0);
    expect(summary.totalLostUsers).toBe(expectedTotal);
    expect(summary.activeOutageCount).toBe(next.length);
  });

  it("outage table renders one <tbody> <tr> per outage in the same list", () => {
    const next = tickOutages(getMockOutages());

    OutageTable.renderOutageTable(next);

    const rows = document.querySelectorAll("#outage-table tbody tr");
    expect(rows.length).toBe(next.length);
  });

  it("KPI cards render from the same summary without throwing and show the total", () => {
    const next = tickOutages(getMockOutages());
    const summary = computeSummary(next);

    expect(() => KpiCards.renderKpiCards(summary, next)).not.toThrow();

    const container = document.getElementById("kpi-row");
    // Five KPI cards are rendered (incl. the FCC reportable-count card).
    expect(container.querySelectorAll(".kpi-card").length).toBe(5);

    // The "Users affected" total is shown, formatted with locale separators.
    const expectedTotalText = summary.totalLostUsers.toLocaleString();
    expect(container.textContent).toContain(expectedTotalText);
  });

  it("all three views derive from ONE updated list (single source of truth)", () => {
    // Simulate a single tick: produce next ONCE, then feed the SAME reference
    // to summary, table, and KPI cards (Req 12.5).
    const next = tickOutages(getMockOutages());
    const summary = computeSummary(next);

    OutageTable.renderOutageTable(next);
    KpiCards.renderKpiCards(summary, next);
    TrendSparkline.init(summary.totalLostUsers);

    // Table row count matches the list length (Req 10.3).
    const rows = document.querySelectorAll("#outage-table tbody tr");
    expect(rows.length).toBe(next.length);

    // Summary count matches the same list.
    expect(summary.activeOutageCount).toBe(next.length);

    // Sparkline seeded from the same total.
    const history = TrendSparkline.getHistory();
    expect(history[history.length - 1].totalLostUsers).toBe(
      summary.totalLostUsers
    );
  });
});
