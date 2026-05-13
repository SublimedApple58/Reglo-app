import {
  computeAnchorAwareEntryPoints,
  computeFreeIntervalsInRange,
  type FreeInterval,
} from "@/lib/autoscuole/slot-packing";

// Helpers to make the test cases more readable.
const HOUR = 60;
const m = (h: number, mm = 0) => h * HOUR + mm;
const fmt = (minutes: number) => {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mm = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${mm}`;
};

const DEFAULT_OPTIONS = { slotGridMinutes: 30 };

describe("computeFreeIntervalsInRange", () => {
  it("returns the full window when there are no busy intervals", () => {
    const free = computeFreeIntervalsInRange(m(9), m(18), []);
    expect(free).toEqual([{ startMinutes: m(9), endMinutes: m(18) }]);
  });

  it("subtracts a single busy interval cleanly", () => {
    const free = computeFreeIntervalsInRange(m(9), m(18), [
      { startMinutes: m(10), endMinutes: m(10, 45) },
    ]);
    expect(free).toEqual([
      { startMinutes: m(9), endMinutes: m(10) },
      { startMinutes: m(10, 45), endMinutes: m(18) },
    ]);
  });

  it("clips busy intervals that extend past the window", () => {
    const free = computeFreeIntervalsInRange(m(9), m(18), [
      { startMinutes: m(8), endMinutes: m(10) },
      { startMinutes: m(17, 30), endMinutes: m(20) },
    ]);
    expect(free).toEqual([{ startMinutes: m(10), endMinutes: m(17, 30) }]);
  });

  it("merges adjacent and overlapping busy intervals", () => {
    const free = computeFreeIntervalsInRange(m(9), m(18), [
      { startMinutes: m(10), endMinutes: m(11) },
      { startMinutes: m(11), endMinutes: m(12) }, // adjacent
      { startMinutes: m(11, 30), endMinutes: m(12, 30) }, // overlapping
    ]);
    expect(free).toEqual([
      { startMinutes: m(9), endMinutes: m(10) },
      { startMinutes: m(12, 30), endMinutes: m(18) },
    ]);
  });

  it("returns an empty list when busy fully covers the window", () => {
    const free = computeFreeIntervalsInRange(m(9), m(18), [
      { startMinutes: m(8), endMinutes: m(19) },
    ]);
    expect(free).toEqual([]);
  });

  it("ignores out-of-window busy intervals", () => {
    const free = computeFreeIntervalsInRange(m(9), m(18), [
      { startMinutes: m(6), endMinutes: m(8) },
      { startMinutes: m(20), endMinutes: m(22) },
    ]);
    expect(free).toEqual([{ startMinutes: m(9), endMinutes: m(18) }]);
  });

  it("returns empty for a degenerate or inverted window", () => {
    expect(computeFreeIntervalsInRange(m(10), m(10), [])).toEqual([]);
    expect(computeFreeIntervalsInRange(m(12), m(9), [])).toEqual([]);
  });
});

describe("computeAnchorAwareEntryPoints", () => {
  // The "empty day" case: with no busy intervals, the free interval IS the
  // whole availability window. We expect the static grid we used to ship,
  // anchors collapse onto the grid.
  it("empty day: emits the full :00/:30 grid for the duration", () => {
    const interval: FreeInterval = { startMinutes: m(9), endMinutes: m(18) };
    const points = computeAnchorAwareEntryPoints(interval, 60, 30, DEFAULT_OPTIONS);

    expect(points.map(fmt)).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "12:30",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
      "16:30",
      "17:00",
    ]);
  });

  // The motivating bug.
  // Free interval is whatever sits *after* an existing 10:00-10:45 lesson:
  // free = [10:45, 18:00). For duration=60 and minDuration=30:
  //   - leading anchor: 10:45 ✓
  //   - 11:00 would leave a 15 min orphan (11:00 - 10:45) → REJECTED
  //   - 11:30 leaves 45 min before → admitted
  //   - all subsequent :00/:30 admitted
  //   - trailing anchor: 17:00 (already on grid → dedup)
  it("packed scenario: 10:00-10:45 occupied, 60 min request, min duration 30", () => {
    const interval: FreeInterval = { startMinutes: m(10, 45), endMinutes: m(18) };
    const points = computeAnchorAwareEntryPoints(interval, 60, 30, DEFAULT_OPTIONS);

    expect(points.map(fmt)).toEqual([
      "10:45",
      "11:30",
      "12:00",
      "12:30",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
      "16:30",
      "17:00",
    ]);
    expect(points.map(fmt)).not.toContain("11:00");
  });

  // Two busy lessons leaving exactly one duration in between.
  it("exact-fit gap: only the leading anchor is emitted", () => {
    // Free interval [11:00, 12:00) — exactly 60 min wide.
    const interval: FreeInterval = { startMinutes: m(11), endMinutes: m(12) };
    const points = computeAnchorAwareEntryPoints(interval, 60, 30, DEFAULT_OPTIONS);
    expect(points.map(fmt)).toEqual(["11:00"]);
  });

  // Two busy lessons leaving a residue smaller than the duration.
  it("too-small gap: no entry points emitted", () => {
    const interval: FreeInterval = { startMinutes: m(11), endMinutes: m(11, 45) };
    const points = computeAnchorAwareEntryPoints(interval, 60, 30, DEFAULT_OPTIONS);
    expect(points).toEqual([]);
  });

  // Two busy lessons leaving exactly minDuration on top of the requested duration.
  // For request 60 and minDuration 30, a 90-min gap fits a leading slot
  // (residue trailing 30 = min ok) and a trailing slot (residue leading 30 = min ok).
  // Both anchors should be emitted; the :30 tick in the middle should also be admitted.
  it("90-min gap, 60 request, min 30: emits leading + 30-min grid + trailing", () => {
    const interval: FreeInterval = { startMinutes: m(11), endMinutes: m(12, 30) };
    const points = computeAnchorAwareEntryPoints(interval, 60, 30, DEFAULT_OPTIONS);
    expect(points.map(fmt)).toEqual(["11:00", "11:30"]);
    // 11:30 lands as the trailing anchor (12:30 - 60 = 11:30) AND as the
    // sole intermediate tick, deduplicated.
  });

  // Multi-range scheduling (morning + afternoon) is handled by the caller
  // running this function once per free interval — verify each interval is
  // treated independently.
  it("two free intervals are treated as independent ranges (caller responsibility)", () => {
    const morning: FreeInterval = { startMinutes: m(9), endMinutes: m(13) };
    const afternoon: FreeInterval = { startMinutes: m(14), endMinutes: m(18) };
    const morningPoints = computeAnchorAwareEntryPoints(morning, 60, 30, DEFAULT_OPTIONS);
    const afternoonPoints = computeAnchorAwareEntryPoints(afternoon, 60, 30, DEFAULT_OPTIONS);
    expect(morningPoints.map(fmt)).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
    ]);
    expect(afternoonPoints.map(fmt)).toEqual([
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
      "16:30",
      "17:00",
    ]);
  });

  // roundedHoursOnly is modeled as gridStep=60 cascading from the *range
  // start* (gridPhase = rangeStart % 60). The anchors are emitted regardless
  // — otherwise the algorithm would re-create the orphans it is meant to
  // prevent.
  it("rounded hours (step 60, phase 0) with previous lesson: anchor + hour grid", () => {
    // Free [10:45, 18:00), request 60, min 30. Range started at 09:00 → phase 0.
    const interval: FreeInterval = { startMinutes: m(10, 45), endMinutes: m(18) };
    const points = computeAnchorAwareEntryPoints(interval, 60, 30, {
      slotGridMinutes: 60,
      gridPhaseMinutes: 0,
    });
    expect(points.map(fmt)).toEqual([
      "10:45",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
    ]);
    // 11:00 is on the grid but would leave a 15-min orphan after 10:45 → rejected.
  });

  it("rounded hours with phase 30 (range starts at 09:30): cascade is 09:30, 10:30, ...", () => {
    // Range [09:30, 18:00), empty day, request 60.
    const interval: FreeInterval = { startMinutes: m(9, 30), endMinutes: m(18) };
    const points = computeAnchorAwareEntryPoints(interval, 60, 30, {
      slotGridMinutes: 60,
      gridPhaseMinutes: 30,
    });
    expect(points.map(fmt)).toEqual([
      "09:30",
      "10:30",
      "11:30",
      "12:30",
      "13:30",
      "14:30",
      "15:30",
      "16:30",
      "17:00",
    ]);
    // 17:00 is the trailing anchor (18:00 - 60). Not on the :30 cascade,
    // but anchors are always preserved.
  });

  // Duration > interval width.
  it("duration exceeds interval: no entry points", () => {
    const interval: FreeInterval = { startMinutes: m(11), endMinutes: m(11, 30) };
    const points = computeAnchorAwareEntryPoints(interval, 60, 30, DEFAULT_OPTIONS);
    expect(points).toEqual([]);
  });

  // Disabling the orphan filter — min duration 0 — should restore the legacy
  // "every grid tick that fits" behavior.
  it("minDuration=0 disables the orphan filter (legacy grid)", () => {
    const interval: FreeInterval = { startMinutes: m(10, 45), endMinutes: m(18) };
    const points = computeAnchorAwareEntryPoints(interval, 60, 0, DEFAULT_OPTIONS);
    // Now 11:00 should be back, because the 15-min orphan is tolerated.
    expect(points.map(fmt)).toContain("11:00");
  });

  // Sanity: an unusual minDuration (60) raises the orphan floor — only gaps
  // ≥60 are tolerated on either side.
  it("higher minDuration tightens the filter", () => {
    const interval: FreeInterval = { startMinutes: m(10, 45), endMinutes: m(13) };
    // duration 60, min 60. Leading 10:45 ok (residue trailing 75 ≥ 60).
    // 11:00 residue leading 15 < 60 → rejected.
    // 11:30 residue leading 45 < 60 → rejected.
    // 12:00 residue leading 75 ≥ 60, residue trailing 0 ok → admitted (also = trailing anchor).
    const points = computeAnchorAwareEntryPoints(interval, 60, 60, DEFAULT_OPTIONS);
    expect(points.map(fmt)).toEqual(["10:45", "12:00"]);
  });
});
