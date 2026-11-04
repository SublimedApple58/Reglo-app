import type { RoadPoint } from "@/lib/autoscuole/road/geo";
import { saveRoadCleanTrack } from "@/lib/autoscuole/road/maintenance";

const T0 = Date.UTC(2026, 10, 4, 10, 0, 0);
const M_LAT = 1 / 111_320;

/** In marcia verso nord a 10 m/s, un fix al secondo. */
const drive = (seconds: number): RoadPoint[] =>
  Array.from({ length: seconds }, (_, i) => [T0 + i * 1000, 42.6 + i * 10 * M_LAT, 13.7, 10, 0, 5] as RoadPoint);

function fakeDb(points: RoadPoint[]) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const db = {
    roadPointBatch: { findMany: jest.fn(async () => [{ points }]) },
    roadSession: { update: jest.fn(async (args: { where: unknown; data: Record<string, unknown> }) => updates.push(args)) },
  };
  return { db: db as never, updates };
}

describe("REG-713 saveRoadCleanTrack", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as never;
  });

  it("snap:false: niente Google, km puliti salvati e aggancio lasciato al job", async () => {
    const { db, updates } = fakeDb(drive(60));
    const t = await saveRoadCleanTrack(db, "s1", { snap: false, now: T0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(t.snapped).toBe(false);
    expect(t.retryAfter).toBe(T0);
    expect(updates).toHaveLength(1);
    expect(updates[0].data.distanceMeters).toBe(t.distanceMeters);
    expect(t.distanceMeters).toBeGreaterThan(500);
  });

  it("Google giù: salva la traccia pulita da riprovare fra 24 h, con gli stessi km", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const { db, updates } = fakeDb(drive(60));
    const t = await saveRoadCleanTrack(db, "s1", { now: T0 });
    expect(fetchMock).toHaveBeenCalled();
    expect(t.retryAfter).toBe(T0 + 24 * 3600_000);
    expect(updates[0].data.distanceMeters).toBe(t.distanceMeters);
  });
});
