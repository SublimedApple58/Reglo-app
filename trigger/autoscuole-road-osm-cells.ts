import { execFile } from "node:child_process";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import readline from "node:readline";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import v8 from "node:v8";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { logger, schedules, task } from "@trigger.dev/sdk/v3";

import { DRIVABLE_HIGHWAYS, cutCells, osmCellBlocks, osmCellObjectKey, wayFromGeojsonLine } from "@/lib/autoscuole/road/osm-cells-build";
import type { OsmWay } from "@/lib/autoscuole/road/osm-cells";
import { osmR2 } from "@/lib/autoscuole/road/osm-store";

const run = promisify(execFile);

const ITALY_PBF = "https://download.geofabrik.de/europe/italy-latest.osm.pbf";
const DIR = "/tmp/road-osm";
/** Italia (con margine): righe e colonne di celle. */
const BOX = { south: 35.2, west: 6.5, north: 47.2, east: 18.7 };
/** Blocco lavorato in memoria: 20 × 14 celle (1° × 0,98°). */
const BLOCK_ROWS = 20;
const BLOCK_COLS = 14;
/** 24/11: su medium-2x (4 GB) il processo moriva sempre sul blocco di Roma; large-1x = 4 vCPU, 8 GB. */
const MACHINE = "large-1x" as const;
const MAX_DURATION = 3 * 3600;

/** Disco libero e memoria del processo, nel log di ogni blocco (il 24/11 il primo giro è stato ucciso senza dire perché). */
function resources() {
  const st = fs.statfsSync(DIR);
  const mem = process.memoryUsage();
  return { freeDiskMB: Math.round((st.bavail * st.bsize) / 1e6), rssMB: Math.round(mem.rss / 1e6), heapUsedMB: Math.round(mem.heapUsed / 1e6) };
}

/**
 * REG-722 Reglo Road — rifà le celle OSM della calamita per tutta l'Italia
 * (o da `fromLat` in su). Scarica l'estratto Geofabrik (~2 GB), tiene solo le
 * strade in auto (osmium, installato nell'immagine da `trigger.config.ts`), lo
 * taglia a blocchi e carica le celle su R2 (`road/osm/v1/<cella>.bin`). Disco
 * delle macchine Trigger: 10 GB. I file di ogni blocco si cancellano appena
 * caricato.
 */
async function buildOsmCells(fromLat?: number, fromLng?: number) {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  const pbf = `${DIR}/italy.osm.pbf`;
  const res = await fetch(ITALY_PBF);
  if (!res.ok || !res.body) throw new Error(`Geofabrik ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(pbf));

  const roads = `${DIR}/roads.osm.pbf`;
  await run("osmium", ["tags-filter", pbf, `w/highway=${DRIVABLE_HIGHWAYS.join(",")}`, "-o", roads, "--overwrite"]);
  fs.rmSync(pbf);

  const { client, bucket } = osmR2();
  const blocks = osmCellBlocks(BOX, BLOCK_ROWS, BLOCK_COLS, fromLat, fromLng);
  // Limite heap che Node ha davvero (Trigger non lo fa impostare per task).
  const heapLimitMB = Math.round(v8.getHeapStatistics().heap_size_limit / 1e6);
  logger.info("celle OSM: inizio", { fromLat: fromLat ?? null, fromLng: fromLng ?? null, blocks: blocks.length, heapLimitMB, ...resources() });
  let cells = 0;
  let bytes = 0;
  for (const [i, { by, bx, bbox }] of blocks.entries()) {
    const keep = (ix: number, iy: number) => iy >= by && iy < by + BLOCK_ROWS && ix >= bx && ix < bx + BLOCK_COLS;
    const block = `${DIR}/block.osm.pbf`;
    const lines = `${DIR}/block.geojsonseq`;
    // smart: le strade che escono dal blocco restano intere
    await run("osmium", ["extract", "-b", bbox, "-s", "smart", roads, "-o", block, "--overwrite"]);
    await run("osmium", ["export", block, "-f", "geojsonseq", "--add-unique-id=type_id", "--geometry-types=linestring", "-o", lines, "--overwrite"]);
    logger.info(`blocco ${i + 1}: estratto`, { bbox, linesMB: Math.round(fs.statSync(lines).size / 1e6), ...resources() });
    const ways: OsmWay[] = [];
    const rl = readline.createInterface({ input: fs.createReadStream(lines), crlfDelay: Infinity });
    for await (const line of rl) {
      const w = wayFromGeojsonLine(line);
      if (w) ways.push(w);
    }
    logger.info(`blocco ${i + 1}: lette le strade`, { ways: ways.length, ...resources() });
    let blockCells = 0;
    for (const [key, b] of cutCells(ways, keep)) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: osmCellObjectKey(key), Body: b, ContentType: "application/octet-stream" }));
      cells++;
      blockCells++;
      bytes += b.length;
    }
    fs.rmSync(block, { force: true });
    fs.rmSync(lines, { force: true });
    logger.info(`blocco ${i + 1}/${blocks.length}`, { by, bx, bbox, ways: ways.length, cells: blockCells, ...resources() });
  }
  fs.rmSync(DIR, { recursive: true, force: true });
  return { ok: true, fromLat: fromLat ?? null, fromLng: fromLng ?? null, cells, megabytes: Math.round(bytes / 1e5) / 10 };
}

/** Giro mensile: tutta l'Italia. */
export const autoscuoleRoadOsmCells = schedules.task({
  id: "autoscuole-road-osm-cells",
  cron: "0 3 2 * *",
  machine: MACHINE,
  maxDuration: MAX_DURATION,
  retry: { maxAttempts: 1 },
  run: async () => buildOsmCells(),
});

/**
 * A mano dalla dashboard o dall'API: riparte dalla fascia che contiene
 * `fromLat` (es. 41.2 dopo il giro del 24/11 interrotto lì), senza rifare il sud;
 * con `fromLng` anche dal blocco giusto dentro quella fascia (es. 12.5 = Roma).
 */
export const autoscuoleRoadOsmCellsFrom = task({
  id: "autoscuole-road-osm-cells-from",
  machine: MACHINE,
  maxDuration: MAX_DURATION,
  retry: { maxAttempts: 1 },
  run: async (payload: { fromLat?: number; fromLng?: number }) => {
    const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? undefined : Number(v));
    return buildOsmCells(num(payload?.fromLat), num(payload?.fromLng));
  },
});
