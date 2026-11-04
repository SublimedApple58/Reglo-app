/**
 * REG-722 — celle OSM della «calamita» fatte a mano (per le prove, o una zona
 * nuova prima del job mensile `autoscuole-road-osm-cells`).
 *
 *   npx tsx scripts/road/build-osm-cells.ts --box 42.52,13.60,42.71,13.86 --out /tmp/celle           # scarica da Overpass e scrive i file
 *   npx tsx scripts/road/build-osm-cells.ts --overpass-file risposta.json --out /tmp/celle             # da una risposta Overpass salvata
 *   npx tsx scripts/road/build-osm-cells.ts --geojsonseq strade.geojsonseq --out /tmp/celle           # da `osmium export`
 *   DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *     npx tsx scripts/road/build-osm-cells.ts --box … --upload --yes                                  # e le carica su R2
 *
 * Il bucket R2 è uno solo per tutti gli ambienti: le celle sono dati pubblici
 * di OSM, uguali ovunque, sotto `road/osm/v<versione>/`.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { PutObjectCommand } from "@aws-sdk/client-s3";

import {
  cutCells,
  osmCellObjectKey,
  overpassQuery,
  wayFromGeojsonLine,
  waysFromOverpass,
} from "../../lib/autoscuole/road/osm-cells-build";
import type { OsmWay } from "../../lib/autoscuole/road/osm-cells";
import { osmR2 } from "../../lib/autoscuole/road/osm-store";

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const arg = (f: string) => (has(f) ? args[args.indexOf(f) + 1] : undefined);

async function readWays(): Promise<OsmWay[]> {
  const box = arg("--box");
  if (box) {
    const [s, w, n, e] = box.split(",").map(Number);
    const body = new URLSearchParams({ data: overpassQuery(s, w, n, e) });
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body,
      headers: { "User-Agent": "reglo-road-osm-cells/1.0" },
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    return waysFromOverpass(await res.json());
  }
  const saved = arg("--overpass-file");
  if (saved) return waysFromOverpass(JSON.parse(fs.readFileSync(saved, "utf8")));
  const file = arg("--geojsonseq");
  if (!file) throw new Error("Serve --box s,w,n,e oppure --geojsonseq <file>");
  const out: OsmWay[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const w = wayFromGeojsonLine(line);
    if (w) out.push(w);
  }
  return out;
}

async function main() {
  const ways = await readWays();
  const cells = cutCells(ways);
  const bytes = [...cells.values()].reduce((s, b) => s + b.length, 0);
  console.log(`${ways.length} strade · ${cells.size} celle · ${(bytes / 1e6).toFixed(2)} MB`);

  const outDir = arg("--out");
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const [key, b] of cells) fs.writeFileSync(path.join(outDir, `${key}.bin`), b);
    console.log(`scritte in ${outDir}`);
  }

  if (has("--upload")) {
    if (!has("--yes")) return console.log("--upload senza --yes: niente caricato.");
    const { client, bucket } = osmR2();
    for (const [key, b] of cells) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: osmCellObjectKey(key),
          Body: b,
          ContentType: "application/octet-stream",
        }),
      );
    }
    console.log(`caricate ${cells.size} celle su R2 (${bucket}/${osmCellObjectKey("…")})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
