// Instructor display colors — owner-picked hex stored on AutoscuolaInstructor.color.
// The picker offers this curated palette; the agenda derives soft tints (band,
// avatar, text) from the hex so any swatch stays readable on white.

export type InstructorColorChoice = { hex: string; name: string };

// Curated swatches (Tailwind 500-level hues). Keep visually distinct pairs
// apart; first 8 mirror the legacy positional palette hues.
export const INSTRUCTOR_COLOR_CHOICES: InstructorColorChoice[] = [
  { hex: "#EC4899", name: "Rosa" },
  { hex: "#0EA5E9", name: "Azzurro" },
  { hex: "#10B981", name: "Smeraldo" },
  { hex: "#F59E0B", name: "Ambra" },
  { hex: "#8B5CF6", name: "Viola" },
  { hex: "#F43F5E", name: "Corallo" },
  { hex: "#14B8A6", name: "Teal" },
  { hex: "#F97316", name: "Arancio" },
  { hex: "#3B82F6", name: "Blu" },
  { hex: "#6366F1", name: "Indaco" },
  { hex: "#84CC16", name: "Lime" },
  { hex: "#06B6D4", name: "Ciano" },
  { hex: "#D946EF", name: "Fucsia" },
  { hex: "#EF4444", name: "Rosso" },
  { hex: "#EAB308", name: "Giallo" },
  { hex: "#64748B", name: "Grigio" },
];

const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const instructorColorAlpha = (hex: string, alpha: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
};

// Darken toward black keeping the hue — used for initials/text on the soft
// avatar tint (mimics Tailwind's *-700 over *-100 pairing, ≥4.5:1 on white).
export const instructorColorText = (hex: string): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const k = 0.55;
  return `rgb(${Math.round(rgb[0] * k)}, ${Math.round(rgb[1] * k)}, ${Math.round(rgb[2] * k)})`;
};

/** Inline styles for the agenda derived from a stored hex. */
export const instructorTintStyles = (hex: string) => ({
  /** Availability band behind the column (very soft). */
  band: { backgroundColor: instructorColorAlpha(hex, 0.10) } as const,
  /** Avatar circle with initials. */
  avatar: {
    backgroundColor: instructorColorAlpha(hex, 0.16),
    color: instructorColorText(hex),
  } as const,
});
