import 'server-only';

import sharp from 'sharp';
import {
  PORTAL_PHOTO_SPEC,
  PORTAL_SIGNATURE_SPEC,
  specPixelSize,
  type PortalImageSpec,
} from '@/lib/portal-image-specs';

/**
 * Cerca la qualità JPEG più alta che sta sotto targetMaxKb.
 * Se già sotto targetMinKb alla qualità massima, si ferma subito.
 */
const toJpegWithinTarget = async (
  pipeline: sharp.Sharp,
  spec: PortalImageSpec
) => {
  const maxBytes = spec.targetMaxKb * 1024;
  const qualities = [92, 85, 78, 70, 60, 50, 40, 30];

  let best: Buffer | null = null;
  for (const quality of qualities) {
    const buffer = await pipeline
      .clone()
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    best = buffer;
    if (buffer.byteLength <= maxBytes) {
      return buffer;
    }
  }
  // Anche a qualità minima siamo sopra il target: restituiamo comunque
  // il risultato più compresso (il target è indicativo, non un hard limit).
  return best as Buffer;
};

/** Foto profilo → variante portale: crop 33:40 centrato + resize + JPEG. */
export const photoToPortalVariant = async (original: Buffer) => {
  const { width, height } = specPixelSize(PORTAL_PHOTO_SPEC);
  const pipeline = sharp(original).rotate().resize(width, height, {
    fit: 'cover',
    position: 'centre',
  });
  const buffer = await toJpegWithinTarget(pipeline, PORTAL_PHOTO_SPEC);
  return { buffer, contentType: 'image/jpeg', extension: 'jpg' };
};

/** Firma → variante portale: appiattita su bianco, contain 30x6mm, JPEG. */
export const signatureToPortalVariant = async (original: Buffer) => {
  const { width, height } = specPixelSize(PORTAL_SIGNATURE_SPEC);
  // trim() toglie i margini vuoti del pad prima di adattare alla striscia
  // (fallisce su immagini a tinta unita: in quel caso teniamo l'originale).
  const trimmed = await sharp(original)
    .trim()
    .toBuffer()
    .catch(() => original);
  const pipeline = sharp(trimmed)
    .flatten({ background: '#ffffff' })
    .resize(width, height, {
      fit: 'contain',
      background: '#ffffff',
    });
  const buffer = await toJpegWithinTarget(pipeline, PORTAL_SIGNATURE_SPEC);
  return { buffer, contentType: 'image/jpeg', extension: 'jpg' };
};

export type SignatureStroke = { points: Array<{ x: number; y: number }> };

/**
 * Ricostruisce l'SVG della firma esattamente come disegnata sul telefono
 * (stesse coordinate, stesso spessore) e la rasterizza in PNG trasparente.
 * `scale` moltiplica la risoluzione di output per nitidezza.
 */
export const rasterizeSignature = async (input: {
  strokes: SignatureStroke[];
  width: number;
  height: number;
  strokeWidth: number;
  scale: number;
}) => {
  const { strokes, width, height, strokeWidth, scale } = input;

  const paths = strokes
    .filter((stroke) => stroke.points.length > 0)
    .map((stroke) => {
      const [first, ...rest] = stroke.points;
      // Un tap singolo deve comunque lasciare un punto (round cap).
      const tail = rest.length
        ? rest.map((p) => `L ${round(p.x)} ${round(p.y)}`).join(' ')
        : `L ${round(first.x + 0.01)} ${round(first.y)}`;
      const d = `M ${round(first.x)} ${round(first.y)} ${tail}`;
      return `<path d="${d}" />`;
    })
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<g fill="none" stroke="#1a1a2e" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;

  const buffer = await sharp(Buffer.from(svg), {
    density: 72 * scale,
  })
    .png()
    .toBuffer();

  return { buffer, contentType: 'image/png', extension: 'png' };
};

const round = (value: number) => Math.round(value * 100) / 100;
