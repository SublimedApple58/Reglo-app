import { agendaVehicleLabel } from "@/lib/autoscuole/agenda-vehicle-label";

describe("agendaVehicleLabel (REG-633)", () => {
  it("guida senza veicolo: niente etichetta", () => {
    expect(agendaVehicleLabel({})).toBeNull();
    expect(agendaVehicleLabel({ vehicle: null, extraMotoVehicles: [], followVehicle: null })).toBeNull();
  });

  it("guida auto: solo il nome del mezzo", () => {
    expect(agendaVehicleLabel({ vehicle: { name: "Fiat Panda" } })).toBe("Fiat Panda");
  });

  it("guida moto: moto + moto extra + auto al seguito, in quest'ordine", () => {
    expect(
      agendaVehicleLabel({
        vehicle: { name: "Honda CB500" },
        extraMotoVehicles: [{ name: "Yamaha MT-07" }],
        followVehicle: { name: "Fiat Panda" },
      }),
    ).toBe("Honda CB500 + Yamaha MT-07 + Fiat Panda");
  });

  it("solo auto al seguito: la mostra lo stesso", () => {
    expect(agendaVehicleLabel({ vehicle: null, followVehicle: { name: "Panda" } })).toBe("Panda");
  });

  it("nomi vuoti o di soli spazi vengono scartati", () => {
    expect(agendaVehicleLabel({ vehicle: { name: "  " }, followVehicle: { name: " Panda " } })).toBe("Panda");
  });
});
