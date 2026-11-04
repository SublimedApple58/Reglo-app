import { GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";

import { cellsForTrack, decodeCell } from "@/lib/autoscuole/road/osm-cells";
import { osmCellObjectKey } from "@/lib/autoscuole/road/osm-cells-build";
import { RoadGraph } from "@/lib/autoscuole/road/osm-match";

/**
 * REG-722 — le celle OSM lette da R2 (`road/osm/v1/<cella>.bin`), con una
 * piccola cache in memoria. Niente `server-only`: lo usa anche il job Trigger
 * (fine guida rifatta dal job di manutenzione), che gira in Node.
 */

const CACHE_MAX = 400;
const cache = new Map<string, Uint8Array | null>();
let client: S3Client | null = null;

/** Client R2 (stesse variabili di `lib/storage/r2.ts`, che però è `server-only`). */
export function osmR2(): { client: S3Client; bucket: string } {
  const bucket = process.env.R2_BUCKET_NAME ?? process.env.R2_BUCKET;
  if (!bucket || !process.env.R2_ENDPOINT) throw new Error("R2 non configurato");
  // come normalizeEndpoint di r2.ts: l'endpoint può finire con /<bucket>
  const endpoint = process.env.R2_ENDPOINT.replace(/\/+$/, "").replace(new RegExp(`/${bucket}$`), "");
  client ??= new S3Client({
    region: process.env.R2_REGION ?? "auto",
    endpoint,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "" },
  });
  return { client, bucket };
}

/** Il file di una cella, o null se la cella non esiste (fuori dalle zone coperte). */
export async function loadOsmCell(key: string): Promise<Uint8Array | null> {
  if (!/^-?\d+_-?\d+$/.test(key)) return null;
  if (cache.has(key)) return cache.get(key)!;
  const { client, bucket } = osmR2();
  let bytes: Uint8Array | null = null;
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: osmCellObjectKey(key) }));
    bytes = res.Body ? await res.Body.transformToByteArray() : null;
  } catch (e) {
    if (!(e instanceof NoSuchKey) && (e as { name?: string })?.name !== "NoSuchKey") throw e;
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, bytes);
  return bytes;
}

/** Il grafo delle strade sotto una traccia (con 300 m di margine), o null se non c'è nessuna cella. */
export async function osmGraphForTrack(path: Array<[number, number, number]>): Promise<RoadGraph | null> {
  if (!path.length) return null;
  const keys = cellsForTrack(path);
  const files = await Promise.all(keys.map(async (k) => [k, await loadOsmCell(k)] as const));
  const found = files.filter(([, b]) => b);
  if (!found.length) return null;
  const graph = new RoadGraph(path[0][0], path[0][1]);
  for (const [k, b] of found) graph.addWays(decodeCell(k, b!));
  return graph;
}
