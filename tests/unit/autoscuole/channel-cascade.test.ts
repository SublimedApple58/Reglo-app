import {
  CASCADE_ORDER,
  OFFER_CHANNELS,
  deliverToEach,
  pushReachedADevice,
} from "@/lib/autoscuole/channel-cascade";

/**
 * REG-767 — una comunicazione parte su tutti e soli i canali accesi sulla sua
 * riga (era la cascata di REG-500, che si fermava al primo che consegnava).
 */

const recorder = () => {
  const calls: string[] = [];
  const step = (name: string, delivered: boolean) => async () => {
    calls.push(name);
    return delivered;
  };
  return { calls, step };
};

describe("deliverToEach", () => {
  it("prova tutti i canali accesi e riporta quelli che hanno consegnato", async () => {
    const { calls, step } = recorder();
    const used = await deliverToEach(["push", "whatsapp", "email"], {
      push: step("push", true),
      whatsapp: step("whatsapp", false),
      email: step("email", true),
    });
    expect(calls).toEqual(["push", "whatsapp", "email"]);
    expect(used).toEqual(["push", "email"]);
  });

  it("solo WhatsApp acceso → solo WhatsApp, niente riserva", async () => {
    const { calls, step } = recorder();
    const used = await deliverToEach(["whatsapp"], {
      push: step("push", true),
      whatsapp: step("whatsapp", false),
      email: step("email", true),
    });
    expect(calls).toEqual(["whatsapp"]);
    expect(used).toEqual([]);
  });

  it("l'ordine è sempre App → WhatsApp → Email, comunque arrivi la lista", async () => {
    const { calls, step } = recorder();
    await deliverToEach(["email", "whatsapp", "push"], {
      push: step("push", false),
      whatsapp: step("whatsapp", false),
      email: step("email", false),
    });
    expect(calls).toEqual([...CASCADE_ORDER]);
  });

  it("un canale che lancia non ferma gli altri", async () => {
    const used = await deliverToEach(["push", "email"], {
      push: async () => {
        throw new Error("giù");
      },
      email: async () => true,
    });
    expect(used).toEqual(["email"]);
  });

  it("nessun canale acceso → non parte niente", async () => {
    const { calls, step } = recorder();
    expect(await deliverToEach([], { push: step("push", true) })).toEqual([]);
    expect(calls).toEqual([]);
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
