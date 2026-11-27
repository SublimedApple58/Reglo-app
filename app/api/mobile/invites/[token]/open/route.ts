import { NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { SERVER_URL } from "@/lib/constants";

/**
 * Vecchio link «Entra in autoscuola» delle mail di invito: provava ad aprire
 * l'app sulla schermata dell'invito. Quel flusso in app non esiste più
 * (REG-812): gli inviti si accettano dal web. La rotta resta solo per le mail
 * già spedite e porta alla pagina web dell'invito.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return NextResponse.redirect(
    `${SERVER_URL}/${routing.defaultLocale}/invite/${encodeURIComponent(token)}`,
    302,
  );
}
