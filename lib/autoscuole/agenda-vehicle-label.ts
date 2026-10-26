// Veicolo nei blocchi dell'agenda (REG-633). Modulo client-safe.
//
// Solo il NOME del mezzo, mai la targa. Una guida moto con mezzi in più
// diventa «Moto + moto extra + Auto al seguito», come l'etichetta già usata
// nella home istruttore del mobile.

type NamedVehicle = { name?: string | null } | null | undefined;

export function agendaVehicleLabel(item: {
  vehicle?: NamedVehicle;
  extraMotoVehicles?: NamedVehicle[] | null;
  followVehicle?: NamedVehicle;
}): string | null {
  const names = [item.vehicle, ...(item.extraMotoVehicles ?? []), item.followVehicle]
    .map((v) => v?.name?.trim())
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(" + ") : null;
}
