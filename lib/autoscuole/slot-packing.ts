/**
 * Anchor-aware slot packing.
 *
 * The booking system used to offer entry points on a static :00/:30 grid.
 * When durations are not aligned to the grid (e.g. 45 min lessons), this
 * produces orphans: a 45 min lesson starting at 10:00 ends at 10:45, but the
 * next grid point is 11:00, leaving 15 min that nobody can book.
 *
 * This module computes entry points that are "anchored" to the existing
 * boundaries of busy intervals, so the lesson can always be packed flush with
 * the previous (or next) commitment, and filters intermediate grid ticks that
 * would create orphans smaller than the minimum bookable duration.
 *
 * The functions here are pure (no side effects, no DB) and work entirely in
 * "minutes from local-day midnight" — the caller is responsible for converting
 * between Date and the minute scale.
 */

export type FreeInterval = {
  /** Inclusive start of the free interval, in minutes from midnight (local day). */
  startMinutes: number;
  /** Exclusive end of the free interval, in minutes from midnight (local day). */
  endMinutes: number;
};

export type EntryPointOptions = {
  /**
   * Granularity of the intermediate grid, in minutes. Typically 30 (the
   * default booking grid). When the company is configured with
   * `roundedHoursOnly`, callers should pass 60.
   */
  slotGridMinutes: number;
  /**
   * Phase offset of the grid, in minutes from midnight. Default 0.
   * Intermediate ticks are placed at `phase + k * step` for integer k.
   *
   * Example: with `slotGridMinutes: 60` and `gridPhaseMinutes: 30`, the
   * intermediate ticks are 0:30, 1:30, 2:30, ... — this models the legacy
   * "rounded hours, cascading from the range start" behavior used when an
   * availability range starts at, say, 09:30.
   *
   * Anchors (leading/trailing) are always emitted regardless of phase — they
   * may land on non-grid times like 10:45.
   */
  gridPhaseMinutes?: number;
  /**
   * Packing-complete mode. When provided (non-empty), intermediate points are
   * no longer the static grid: a start `t` is admissible iff the residue it
   * leaves on AT LEAST one side of the free interval is exactly fillable with
   * a combination of these durations (so no minute of the window is wasted by
   * construction). Example: window 14:15–18:15 with durations [60] yields
   * 14:15, 15:15, 16:15, 17:15 — never 15:30, which would strand 15 minutes.
   *
   * With `slotGridMinutes: 60` (roundedHoursOnly) non-anchor points must also
   * sit on the hour cascade (`gridPhaseMinutes`), preserving the legacy
   * "rounded hours from range start" semantics.
   */
  allowedDurations?: number[];
};

/**
 * Subset-sum reachability over the allowed lesson durations: `result[m] === 1`
 * iff `m` minutes can be exactly filled by a sequence of allowed durations
 * (0 is always reachable). Used by the packing-complete entry-point rule.
 */
export function buildReachableMinutes(
  durations: number[],
  maxMinutes: number,
): Uint8Array {
  const max = Math.max(0, Math.floor(maxMinutes));
  const reach = new Uint8Array(max + 1);
  reach[0] = 1;
  const ds = [
    ...new Set(
      durations
        .filter((d) => Number.isFinite(d) && d > 0)
        .map((d) => Math.floor(d)),
    ),
  ];
  if (!ds.length) return reach;
  for (let m = 1; m <= max; m++) {
    for (const d of ds) {
      if (m >= d && reach[m - d]) {
        reach[m] = 1;
        break;
      }
    }
  }
  return reach;
}

/**
 * Computes the free sub-intervals within a single availability window, given a
 * list of busy intervals that may or may not overlap the window.
 *
 * The window is `[windowStart, windowEnd)` (start inclusive, end exclusive),
 * expressed in minutes from local-day midnight. Busy intervals are clipped to
 * the window before being subtracted.
 *
 * @returns ordered, non-empty free sub-intervals (windowEnd > windowStart for
 *   each result). May be empty.
 */
export function computeFreeIntervalsInRange(
  windowStart: number,
  windowEnd: number,
  busyIntervals: Array<{ startMinutes: number; endMinutes: number }>,
): FreeInterval[] {
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) return [];
  if (windowEnd <= windowStart) return [];

  // Clip busy intervals to the window and discard non-overlapping / degenerate ones.
  const clipped: Array<{ startMinutes: number; endMinutes: number }> = [];
  for (const b of busyIntervals) {
    if (!Number.isFinite(b.startMinutes) || !Number.isFinite(b.endMinutes)) continue;
    if (b.endMinutes <= windowStart) continue;
    if (b.startMinutes >= windowEnd) continue;
    const s = Math.max(b.startMinutes, windowStart);
    const e = Math.min(b.endMinutes, windowEnd);
    if (e > s) clipped.push({ startMinutes: s, endMinutes: e });
  }

  if (clipped.length === 0) {
    return [{ startMinutes: windowStart, endMinutes: windowEnd }];
  }

  // Sort by start, merge overlapping/adjacent busy intervals.
  clipped.sort((a, b) => a.startMinutes - b.startMinutes);
  const merged: Array<{ startMinutes: number; endMinutes: number }> = [];
  for (const b of clipped) {
    const last = merged[merged.length - 1];
    if (last && b.startMinutes <= last.endMinutes) {
      last.endMinutes = Math.max(last.endMinutes, b.endMinutes);
    } else {
      merged.push({ startMinutes: b.startMinutes, endMinutes: b.endMinutes });
    }
  }

  // Walk the window, emitting the gaps between merged busy blocks.
  const free: FreeInterval[] = [];
  let cursor = windowStart;
  for (const b of merged) {
    if (b.startMinutes > cursor) {
      free.push({ startMinutes: cursor, endMinutes: b.startMinutes });
    }
    cursor = Math.max(cursor, b.endMinutes);
  }
  if (cursor < windowEnd) {
    free.push({ startMinutes: cursor, endMinutes: windowEnd });
  }
  return free;
}

/**
 * For a single free interval and a requested lesson duration, returns the set
 * of admissible entry-points (minutes from midnight) according to the
 * anchor-aware policy:
 *
 *   1. Leading anchor: `interval.startMinutes` (start tightly flush against
 *      the previous busy block / window start). Always included if it fits.
 *   2. Trailing anchor: `interval.endMinutes - durationMinutes` (end tightly
 *      flush against the next busy block / window end). Included if distinct
 *      from the leading anchor.
 *   3. Intermediate grid ticks (on :00/:30 — or :00 only when
 *      `roundedHoursOnly`), strictly between the two anchors, but only when
 *      the residue they leave on either side is either zero or at least
 *      `minDurationMinutes`. This is the rule that prevents orphans.
 *
 * `minDurationMinutes` should be the minimum lesson duration the company
 * accepts (typically the min of `bookingSlotDurations`). Pass 0 to disable
 * the orphan filter (intermediate ticks are then accepted whenever they fit).
 *
 * @returns sorted, deduplicated entry points (minutes from midnight). May be
 *   empty if the duration does not fit the interval at all.
 */
export function computeAnchorAwareEntryPoints(
  interval: FreeInterval,
  durationMinutes: number,
  minDurationMinutes: number,
  options: EntryPointOptions,
): number[] {
  const { startMinutes: s, endMinutes: e } = interval;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return [];
  if (e - s < durationMinutes) return [];

  const gridStep = Math.max(1, Math.floor(options.slotGridMinutes));
  const gridPhase = options.gridPhaseMinutes ?? 0;

  // ── Packing-complete mode ──
  // A start is admissible iff at least one of the residues it leaves (before
  // or after the lesson) can be EXACTLY filled by a combination of the
  // allowed durations. This is stricter than the legacy "residue ≥ min
  // duration" rule, which admitted unfillable leftovers (e.g. a 75-minute
  // residue with 60-minute-only lessons strands 15 minutes forever).
  const packDurations =
    options.allowedDurations?.filter((d) => Number.isFinite(d) && d > 0) ?? [];
  if (packDurations.length) {
    const reach = buildReachableMinutes(packDurations, e - s);
    const last = e - durationMinutes;
    const hourCascadeOnly = gridStep >= 60;
    const onHourCascade = (t: number) =>
      (((t - gridPhase) % 60) + 60) % 60 === 0;

    // Two tiers:
    //   perfect — BOTH residues exactly fillable: booking t wastes nothing.
    //   half    — ONE residue fillable: waste confined to the other side.
    // If any perfect start exists we emit only those (note: R is closed under
    // addition, so whenever a perfect start exists both anchors are perfect
    // too — the list is never empty).
    //
    // When NO perfect start exists, two sub-cases:
    //   - interval length ∈ R: the interval IS perfectly fillable, just not
    //     with this duration in front/back position (e.g. 75 free minutes,
    //     durations [30,45,60], request 60 — only 45+30 fills it). Emitting
    //     half starts here would burn a recoverable interval → emit NOTHING
    //     for this duration and leave the interval to the durations that fit.
    //     Liveness: length ∈ R ⇒ some duration d1 of a decomposition has the
    //     perfect start `s` (front 0, back length−d1 ∈ R), so the interval is
    //     always consumable by at least one duration.
    //   - interval length ∉ R: waste is inevitable whatever happens (e.g.
    //     250 min with 60-min-only lessons) → fall back to the half tier,
    //     which always contains both anchors, so the request stays bookable
    //     and the waste is confined to one side.
    const perfect: number[] = [];
    const half: number[] = [];
    for (let t = s; t <= last; t++) {
      // Booking-confirm granularity guard: the confirm flow rejects starts
      // not on a 15-minute boundary, so never PROPOSE one (possible when a
      // free-interval edge is spurious, e.g. an exam ending at 15:05).
      if (t % 15 !== 0) continue;
      const front = t - s;
      const back = e - (t + durationMinutes);
      const frontOk = reach[front] === 1;
      const backOk = reach[back] === 1;
      if (!frontOk && !backOk) continue;
      // roundedHoursOnly: non-anchor points must sit on the hour cascade.
      // Anchors (flush to either edge) are always admitted, like in legacy.
      if (hourCascadeOnly && front !== 0 && back !== 0 && !onHourCascade(t)) {
        continue;
      }
      if (frontOk && backOk) perfect.push(t);
      else half.push(t);
    }
    if (perfect.length) return perfect;
    const intervalFillable = reach[e - s] === 1;
    return intervalFillable ? [] : half;
  }

  const orphanFloor = Math.max(0, Math.floor(minDurationMinutes));
  const points = new Set<number>();

  // 1) Leading anchor.
  points.add(s);

  // 2) Trailing anchor (only if distinct).
  const trailing = e - durationMinutes;
  if (trailing > s) points.add(trailing);

  // 3) Intermediate grid ticks strictly between leading and trailing anchors.
  if (trailing > s) {
    // Smallest tick t > s such that (t - phase) is a non-negative multiple of step.
    const remainder = ((s + 1 - gridPhase) % gridStep + gridStep) % gridStep;
    const firstTick = (s + 1) + (remainder === 0 ? 0 : gridStep - remainder);
    for (let tick = firstTick; tick < trailing; tick += gridStep) {
      const residueLeading = tick - s;
      const residueTrailing = e - (tick + durationMinutes);
      if (residueLeading !== 0 && residueLeading < orphanFloor) continue;
      if (residueTrailing !== 0 && residueTrailing < orphanFloor) continue;

      points.add(tick);
    }
  }

  return [...points].sort((a, b) => a - b);
}
