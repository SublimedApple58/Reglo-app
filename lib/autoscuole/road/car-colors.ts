/**
 * REG-638 Reglo Road — colori delle auto 3D.
 *
 * Il colore sta sul veicolo (`AutoscuolaVehicle.color`, chiave di questa
 * palette). Le immagini sono varianti pre-generate per colore
 * (`public/images/road/cars/auto-{su,34}-<chiave>.png`, stesse nella mobile):
 * le chiavi sono contratto con l'app. Se il veicolo non ha colore si usa la
 * variante più vicina alla tinta dell'istruttore; senza nessuno dei due, bianco.
 */

export const CAR_COLORS = [
  { key: "bianco", label: "Bianco", hex: "#F4F4F2" },
  { key: "argento", label: "Argento", hex: "#C3C7CC" },
  { key: "grigio", label: "Grigio", hex: "#8A9097" },
  { key: "nero", label: "Nero", hex: "#26282B" },
  { key: "rosso", label: "Rosso", hex: "#C8282E" },
  { key: "arancio", label: "Arancio", hex: "#E8742A" },
  { key: "giallo", label: "Giallo", hex: "#F2C230" },
  { key: "verde", label: "Verde", hex: "#2F7D4F" },
  { key: "azzurro", label: "Azzurro", hex: "#5AA9E0" },
  { key: "blu", label: "Blu", hex: "#24489C" },
] as const;

export type CarColorKey = (typeof CAR_COLORS)[number]["key"];
export const CAR_COLOR_KEYS = CAR_COLORS.map((c) => c.key) as [CarColorKey, ...CarColorKey[]];
export const DEFAULT_CAR_COLOR: CarColorKey = "bianco";

const KEYS = new Set<string>(CAR_COLOR_KEYS);
export const isCarColorKey = (v: unknown): v is CarColorKey => typeof v === "string" && KEYS.has(v);

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Tinta istruttore → variante più vicina. Le tinte dell'agenda sono sature:
 * le varianti neutre (bianco/argento/grigio/nero) restano fuori, altrimenti un
 * colore pastello finirebbe «argento» invece del suo tono.
 */
export function nearestCarColor(hex: string | null | undefined): CarColorKey | null {
  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) return null;
  let best: CarColorKey | null = null;
  let bestD = Infinity;
  for (const c of CAR_COLORS) {
    if (c.key === "bianco" || c.key === "argento" || c.key === "grigio" || c.key === "nero") continue;
    const [r, g, b] = hexToRgb(c.hex)!;
    // distanza "redmean": più fedele alla percezione della semplice euclidea
    const rm = (rgb[0] + r) / 2;
    const d = (2 + rm / 256) * (rgb[0] - r) ** 2 + 4 * (rgb[1] - g) ** 2 + (2 + (255 - rm) / 256) * (rgb[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c.key;
    }
  }
  return best;
}

/** Colore effettivo dell'auto di una guida: veicolo → tinta istruttore → bianco. */
export function resolveCarColor(
  vehicleColor: string | null | undefined,
  instructorColor?: string | null,
): CarColorKey {
  if (isCarColorKey(vehicleColor)) return vehicleColor;
  return nearestCarColor(instructorColor) ?? DEFAULT_CAR_COLOR;
}
