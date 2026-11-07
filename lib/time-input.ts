/**
 * Orario scritto a mano nel TimePickerInput (orari liberi, es. 14:50).
 * Accetta «14:50», «14.50», «1450», «950», «9:5» → sempre "HH:MM".
 */

export type TypedTime = { hour: number; minute: number };

/** Mentre si scrive: solo cifre e un separatore, «:» inserito da solo dopo l'ora. */
export function formatTypedTime(raw: string): string {
  const cleaned = raw.replace(/[.,]/g, ":").replace(/[^\d:]/g, "");
  const [h = "", ...rest] = cleaned.split(":");
  if (rest.length) return `${h.slice(0, 2)}:${rest.join("").slice(0, 2)}`;
  const digits = h.slice(0, 4);
  // «145» resta così finché non è chiaro se è 1:45 o 14:5x; con 4 cifre è HH:MM.
  return digits.length === 4 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

const toMinutes = (t: TypedTime) => t.hour * 60 + t.minute;

/**
 * L'orario scritto, oppure null se incompleto o fuori dai limiti inclusivi
 * `min`/`max` ("HH:MM"; "24:00" ammesso solo se `max` è "24:00").
 */
export function parseTypedTime(
  raw: string,
  bounds: { min?: TypedTime; max?: TypedTime } = {},
): TypedTime | null {
  const value = raw.trim().replace(/[.,]/g, ":");
  let hour: number;
  let minute: number;
  const withSep = /^(\d{1,2}):(\d{1,2})$/.exec(value);
  const digitsOnly = /^(\d{3,4})$/.exec(value);
  if (withSep) {
    hour = Number(withSep[1]);
    // «9:5» = 9:05: un minuto a una cifra vale come unità.
    minute = Number(withSep[2]);
  } else if (digitsOnly) {
    const d = digitsOnly[1];
    hour = Number(d.slice(0, d.length - 2));
    minute = Number(d.slice(-2));
  } else if (/^\d{1,2}$/.test(value)) {
    hour = Number(value);
    minute = 0;
  } else {
    return null;
  }
  if (minute > 59 || hour > 24 || (hour === 24 && minute !== 0)) return null;
  const t = { hour, minute };
  const max = bounds.max ?? { hour: 23, minute: 59 };
  const min = bounds.min ?? { hour: 0, minute: 0 };
  if (toMinutes(t) < toMinutes(min) || toMinutes(t) > toMinutes(max)) return null;
  return t;
}
