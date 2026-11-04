import { execFile } from "node:child_process";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import readline from "node:readline";
import { Readable } from "node:stream";
import { promisify } from "node:util";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { schedules } from "@trigger.dev/sdk/v3";

import { CELL_LAT, CELL_LNG } from "@/lib/autoscuole/road/osm-cells";
import { DRIVABLE_HIGHWAYS, cutCells, osmCellObjectKey, wayFromGeojsonLine } from "@/lib/autoscuole/road/osm-cells-build";
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

/**
 * REG-722 Reglo Road — rifà le celle OSM della calamita per tutta l'Italia,
 * una volta al mese (le strade cambiano poco). Scarica l'estratto Geofabrik
 * (~2 GB), tiene solo le strade in auto (osmium, installato nell'immagine da
 * `trigger.config.ts`), lo taglia a blocchi e carica le celle su R2
 * (`road/osm/v1/<cella>.bin`). Disco delle macchine Trigger: 10 GB.
 *
 * NON deployato finché Tiziano non lo approva (Trigger non ha staging).
 */
export const autoscuoleRoadOsmCells = schedules.task({
  id: "autoscuole-road-osm-cells",
  cron: "0 3 2 * *",
  machine: "medium-2x",
  maxDuration: 3 * 3600,
  retry: { maxAttempts: 1 },
  run: async () => {
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
    const iy0 = Math.floor(BOX.south / CELL_LAT), iy1 = Math.floor(BOX.north / CELL_LAT);
    const ix0 = Math.floor(BOX.west / CELL_LNG), ix1 = Math.floor(BOX.east / CELL_LNG);
    let cells = 0;
    let bytes = 0;
    for (let by = iy0; by <= iy1; by += BLOCK_ROWS) {
      for (let bx = ix0; bx <= ix1; bx += BLOCK_COLS) {
        const keep = (ix: number, iy: number) => iy >= by && iy < by + BLOCK_ROWS && ix >= bx && ix < bx + BLOCK_COLS;
        const bbox = [bx * CELL_LNG, by * CELL_LAT, (bx + BLOCK_COLS) * CELL_LNG, (by + BLOCK_ROWS) * CELL_LAT].map((v) => v.toFixed(5)).join(",");
        const block = `${DIR}/block.osm.pbf`;
        const lines = `${DIR}/block.geojsonseq`;
        // smart: le strade che escono dal blocco restano intere
        await run("osmium", ["extract", "-b", bbox, "-s", "smart", roads, "-o", block, "--overwrite"]);
        await run("osmium", ["export", block, "-f", "geojsonseq", "--add-unique-id=type_id", "--geometry-types=linestring", "-o", lines, "--overwrite"]);
        const ways: OsmWay[] = [];
        const rl = readline.createInterface({ input: fs.createReadStream(lines), crlfDelay: Infinity });
        for await (const line of rl) {
          const w = wayFromGeojsonLine(line);
          if (w) ways.push(w);
        }
        for (const [key, b] of cutCells(ways, keep)) {
          await client.send(new PutObjectCommand({ Bucket: bucket, Key: osmCellObjectKey(key), Body: b, ContentType: "application/octet-stream" }));
          cells++;
          bytes += b.length;
        }
      }
    }
    fs.rmSync(DIR, { recursive: true, force: true });
    return { ok: true, cells, megabytes: Math.round(bytes / 1e5) / 10 };
  },
});
