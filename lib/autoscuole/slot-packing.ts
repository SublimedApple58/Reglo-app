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
};

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
