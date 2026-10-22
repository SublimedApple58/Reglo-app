import {
  CASCADE_ORDER,
  OFFER_CHANNELS,
  deliverByCascade,
  pushReachedADevice,
} from "@/lib/autoscuole/channel-cascade";

/**
 * REG-500 — un messaggio, un canale.
 *
 * Il bug che questi test impediscono di rifare: la UI prometteva «ogni allievo
 * riceve il messaggio una volta sola», mentre promemoria e messaggi-evento
 * partivano su tutti i canali spuntati. Con WhatsApp acceso, chi ha l'app
 * avrebbe ricevuto push + WhatsApp + email dello stesso promemoria.
 */

const recorder = () => {
  const calls: string[] = [];
  const step = (name: string, delivered: boolean) => async () => {
    calls.push(name);
    return delivered;
  };
  return { calls, step };
};

describe("deliverByCascade", () => {
  it("si ferma al primo canale che consegna", async () => {
    const { calls, step } = recorder();
    const used = await deliverByCascade(["push", "whatsapp", "email"], {
      push: step("push", true),
      whatsapp: step("whatsapp", true),
      email: step("email", true),
    });
    expect(used).toBe("push");
    expect(calls).toEqual(["push"]);
  });

  it("chi non ha l'app riceve WhatsApp, e niente email", async () => {
    const { calls, step } = recorder();
    const used = await deliverByCascade(["push", "whatsapp", "email"], {
      push: step("push", false),
      whatsapp: step("whatsapp", true),
      email: step("email", true),
    });
    expect(used).toBe("whatsapp");
    expect(calls).toEqual(["push", "whatsapp"]);
  });

  it("l'ordine è sempre App → WhatsApp → Email, comunque arrivi la lista", async () => {
    const { calls, step } = recorder();
    await deliverByCascade(["email", "whatsapp", "push"], {
      push: step("push", false),
      whatsapp: step("whatsapp", false),
      email: step("email", false),
    });
    expect(calls).toEqual([...CASCADE_ORDER]);
  });

  it("un canale spento dall'autoscuola non si prova", async () => {
    const { calls, step } = recorder();
    const used = await deliverByCascade(["push", "email"], {
      push: step("push", false),
      whatsapp: step("whatsapp", true),
      email: step("email", true),
    });
    expect(used).toBe("email");
    expect(calls).toEqual(["push", "email"]);
  });

  it("senza gradini utili torna null", async () => {
    expect(await deliverByCascade(["push"], {})).toBeNull();
  });
});

describe("pushReachedADevice", () => {
  it("consegnata solo se almeno un dispositivo l'ha presa", () => {
    expect(pushReachedADevice({ sent: 1, failed: 0, skipped: 0 })).toBe(true);
    expect(pushReachedADevice({ sent: 0, failed: 0, skipped: 0 })).toBe(false);
    expect(pushReachedADevice({ sent: 0, failed: 2, skipped: 0 })).toBe(false);
    expect(pushReachedADevice(undefined)).toBe(false);
  });
});

describe("offerte", () => {
  it("escono solo come push (decisione del 16/10)", () => {
    expect([...OFFER_CHANNELS]).toEqual(["push"]);
  });
});
