/**
 * Link verso il sito marketing (reglo-landing) usati dalla pagina di login.
 *
 * Il bottone "Accedi" del sito marketing punta qui; questi sono i link di
 * ritorno. Override con NEXT_PUBLIC_MARKETING_URL per puntare a staging.
 */
const MARKETING_URL = (
  process.env.NEXT_PUBLIC_MARKETING_URL || 'https://reglo.it'
).replace(/\/+$/, '');

/** Home del sito marketing — link "Scopri Reglo". */
export const MARKETING_HOME_URL = MARKETING_URL;

/**
 * Pagina assistenza del sito marketing — destinazione temporanea di
 * "Recupera la password": la web app non ha ancora un flusso di recupero
 * (esiste solo lato mobile, /api/mobile/auth/password-reset).
 */
export const MARKETING_SUPPORT_URL = `${MARKETING_URL}/assistenza`;
