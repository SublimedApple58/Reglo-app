/**
 * Specifiche "Portale dell'automobilista" per foto profilo e firma allievo.
 *
 * Valori forniti a voce dal cliente (2026-08-04) e quindi potenzialmente
 * imprecisi: tenerli QUI e solo qui, così un ritocco non tocca il resto
 * del codice. I pixel sono derivati da mm + dpi (px = mm / 25.4 * dpi).
 */

export type PortalImageSpec = {
  /** Dimensioni fisiche richieste dal portale */
  widthMm: number;
  heightMm: number;
  dpi: number;
  /** Formato di output della variante "portale" */
  format: 'jpeg';
  /** Peso file target in KB: si cerca la qualità più alta sotto maxKb */
  targetMaxKb: number;
  /** Sotto questa soglia si smette di comprimere (qualità già alta) */
  targetMinKb: number;
};

export const PORTAL_PHOTO_SPEC: PortalImageSpec = {
  widthMm: 33,
  heightMm: 40,
  dpi: 200,
  format: 'jpeg',
  targetMaxKb: 27,
  targetMinKb: 20,
};

export const PORTAL_SIGNATURE_SPEC: PortalImageSpec = {
  widthMm: 30,
  heightMm: 6,
  dpi: 200,
  format: 'jpeg',
  targetMaxKb: 35,
  targetMinKb: 20,
};

export const specPixelSize = (spec: PortalImageSpec) => ({
  width: Math.round((spec.widthMm / 25.4) * spec.dpi),
  height: Math.round((spec.heightMm / 25.4) * spec.dpi),
});

/**
 * L'originale della firma viene rasterizzato dal tratto vettoriale a questa
 * scala rispetto al canvas disegnato sul telefono (per nitidezza).
 */
export const SIGNATURE_ORIGINAL_SCALE = 3;
