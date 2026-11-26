import { NextResponse } from "next/server";
import { getInstructorAvailabilityForAgenda } from "@/lib/actions/autoscuole.actions";
import { isOwner } from "@/lib/autoscuole/roles";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
// Una settimana è il caso normale; sei settimane bastano a qualunque vista.
const MAX_RANGE_DAYS = 42;

/**
 * REG-795: le fasce di disponibilità di TUTTI gli istruttori per l'agenda
 * «Tutti» dell'app titolare, identiche a quelle dell'agenda web (settimane
 * pubblicate, eccezioni e luoghi) in una sola chiamata.
 *
 * `from` e `to` sono giorni `YYYY-MM-DD`, `to` escluso, come li passa il web.
 * Solo titolare o istruttore titolare: la company è quella della sessione.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to || !YMD.test(from) || !YMD.test(to)) {
      return NextResponse.json(
        { success: false, message: "Parametri from/to obbligatori (YYYY-MM-DD)." },
        { status: 400 },
      );
    }
    const days = (Date.parse(to) - Date.parse(from)) / DAY_MS;
    if (!Number.isFinite(days) || days < 1 || days > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { success: false, message: `Intervallo non valido (da 1 a ${MAX_RANGE_DAYS} giorni).` },
        { status: 400 },
      );
    }

    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!isOwner(membership.autoscuolaRole) && membership.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Operazione non consentita." },
        { status: 403 },
      );
    }

    const res = await getInstructorAvailabilityForAgenda({ from, to });
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
