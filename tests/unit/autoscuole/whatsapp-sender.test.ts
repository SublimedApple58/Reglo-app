import {
  buildTemplateParameters,
  PUSH_ONLY_KINDS,
  WHATSAPP_TEMPLATES,
} from "@/lib/autoscuole/whatsapp-templates";
import {
  isWhatsAppChannelAvailable,
  resolveWhatsAppSender,
  sendWhatsAppTemplate,
} from "@/lib/autoscuole/whatsapp-sender";

jest.mock("@/lib/app-env", () => ({ externalSendsDisabled: () => false }));

const CLOUD_ENV = {
  WHATSAPP_PROVIDER: "cloud",
  WHATSAPP_PHONE_NUMBER_ID: "123456",
  WHATSAPP_ACCESS_TOKEN: "token-finto",
} as unknown as NodeJS.ProcessEnv;

const TWILIO_ENV = {
  WHATSAPP_PROVIDER: "twilio",
  TWILIO_ACCOUNT_SID: "AC0000",
  TWILIO_AUTH_TOKEN: "token-finto",
  TWILIO_WHATSAPP_FROM: "+390000000000",
  TWILIO_WHATSAPP_CONTENT_SIDS: JSON.stringify({
    morning_reminder_student: "HX123",
  }),
} as unknown as NodeJS.ProcessEnv;

describe("registro dei template", () => {
  it("ogni template dichiara le variabili che usa nel corpo", () => {
    for (const [kind, template] of Object.entries(WHATSAPP_TEMPLATES)) {
      const used = [...template.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      const max = used.length ? Math.max(...used) : 0;
      expect(`${kind}: ${max}`).toBe(`${kind}: ${template.variables.length}`);
      // Niente buchi: {{1}}…{{n}} devono esserci tutti.
      for (let i = 1; i <= max; i += 1) expect(used).toContain(i);
    }
  });

  it("i promemoria sono utility, non marketing (fascia economica, nessun opt-in pubblicitario)", () => {
    for (const template of Object.values(WHATSAPP_TEMPLATES)) {
      expect(template.category).toBe("utility");
    }
  });

  it("il promemoria esame non contiene l'orario", () => {
    const body = WHATSAPP_TEMPLATES.exam_reminder_student.body.toLowerCase();
    expect(body).toContain("orario e luogo di presentazione");
    expect(WHATSAPP_TEMPLATES.exam_reminder_student.variables).not.toContain("ora");
  });

  it("i broadcast NON hanno un template: restano su push", () => {
    for (const kind of PUSH_ONLY_KINDS) {
      expect(Object.keys(WHATSAPP_TEMPLATES)).not.toContain(kind);
    }
  });
});

describe("buildTemplateParameters", () => {
  it("mette le variabili nell'ordine dichiarato, non in quello dell'oggetto", () => {
    const params = buildTemplateParameters("appointment_reminder_instructor", {
      durata: "60",
      quando: "giovedì alle 10",
      nome_allievo: "Sofia",
      nome_istruttore: "Chiara",
    });
    expect(params).toEqual(["Chiara", "Sofia", "giovedì alle 10", "60"]);
  });

  it("schiaccia gli a capo, che Meta rifiuta", () => {
    const params = buildTemplateParameters("morning_reminder_student", {
      nome: "Marco\nRossi",
      ora: "10:00",
      autoscuola: "  Autoscuola  Reglo ",
    });
    expect(params).toEqual(["Marco Rossi", "10:00", "Autoscuola Reglo"]);
  });

  it("si ferma se manca una variabile invece di mandare un buco", () => {
    expect(() =>
      buildTemplateParameters("morning_reminder_student", { nome: "Marco", ora: "10:00" }),
    ).toThrow(/autoscuola/);
  });
});

describe("resolveWhatsAppSender", () => {
  it("senza WHATSAPP_PROVIDER il canale NON è disponibile", () => {
    const res = resolveWhatsAppSender({} as NodeJS.ProcessEnv);
    expect(res.configured).toBe(false);
    expect(isWhatsAppChannelAvailable({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("con le credenziali a metà NON è disponibile (niente caselle che promettono invii impossibili)", () => {
    const res = resolveWhatsAppSender({
      WHATSAPP_PROVIDER: "cloud",
      WHATSAPP_PHONE_NUMBER_ID: "123",
    } as unknown as NodeJS.ProcessEnv);
    expect(res.configured).toBe(false);
  });

  it("riconosce cloud, 360dialog e twilio", () => {
    expect(resolveWhatsAppSender(CLOUD_ENV)).toMatchObject({ configured: true });
    expect(resolveWhatsAppSender(TWILIO_ENV)).toMatchObject({ configured: true });
    const d360 = resolveWhatsAppSender({
      ...CLOUD_ENV,
      WHATSAPP_PROVIDER: "360dialog",
    } as NodeJS.ProcessEnv);
    expect(d360).toMatchObject({ configured: true });
    if (d360.configured) expect(d360.sender.providerName).toBe("360dialog");
  });

  it("rifiuta un provider che non conosce, invece di provarci", () => {
    const res = resolveWhatsAppSender({
      WHATSAPP_PROVIDER: "piccione",
    } as unknown as NodeJS.ProcessEnv);
    expect(res.configured).toBe(false);
  });
});

describe("sendWhatsAppTemplate", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("normalizza il numero prima di spedire (il caso dei 795 senza prefisso)", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.1" }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await sendWhatsAppTemplate(
      {
        to: "333 1234567",
        kind: "morning_reminder_student",
        values: { nome: "Marco", ora: "10:00", autoscuola: "Reglo" },
      },
      CLOUD_ENV,
    );

    expect(res).toEqual({ ok: true, providerMessageId: "wamid.1" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe("393331234567"); // E.164 senza il +, come vuole la Cloud API
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("promemoria_guida_mattutino");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text))
      .toEqual(["Marco", "10:00", "Reglo"]);
  });

  it("non prova nemmeno a mandare a un fisso", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await sendWhatsAppTemplate(
      {
        to: "0445060017",
        kind: "morning_reminder_student",
        values: { nome: "Marco", ora: "10:00", autoscuola: "Reglo" },
      },
      CLOUD_ENV,
    );
    expect(res).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un 4xx non è ritentabile, un 5xx sì", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "template non approvato" } }),
    }) as unknown as typeof fetch;
    const bad = await sendWhatsAppTemplate(
      { to: "+393331234567", kind: "morning_reminder_student", values: { nome: "M", ora: "1", autoscuola: "R" } },
      CLOUD_ENV,
    );
    expect(bad).toMatchObject({ ok: false, retriable: false });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "riprova" } }),
    }) as unknown as typeof fetch;
    const flaky = await sendWhatsAppTemplate(
      { to: "+393331234567", kind: "morning_reminder_student", values: { nome: "M", ora: "1", autoscuola: "R" } },
      CLOUD_ENV,
    );
    expect(flaky).toMatchObject({ ok: false, retriable: true });
  });

  it("su Twilio manda il ContentSid e le variabili numerate", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sid: "SM123" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await sendWhatsAppTemplate(
      {
        to: "3331234567",
        kind: "morning_reminder_student",
        values: { nome: "Marco", ora: "10:00", autoscuola: "Reglo" },
      },
      TWILIO_ENV,
    );
    expect(res).toEqual({ ok: true, providerMessageId: "SM123" });
    const form = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(form.get("To")).toBe("whatsapp:+393331234567");
    expect(form.get("ContentSid")).toBe("HX123");
    expect(JSON.parse(form.get("ContentVariables") as string)).toEqual({
      "1": "Marco",
      "2": "10:00",
      "3": "Reglo",
    });
  });

  it("su Twilio dice chiaramente se manca il ContentSid di quel template", async () => {
    const res = await sendWhatsAppTemplate(
      {
        to: "+393331234567",
        kind: "exam_reminder_student",
        values: { nome: "M", data: "12/10", autoscuola: "R" },
      },
      TWILIO_ENV,
    );
    expect(res).toMatchObject({ ok: false, retriable: false });
    if (!res.ok) expect(res.reason).toContain("ContentSid");
  });

  it("senza provider configurato non lancia: torna un motivo da scrivere a log", async () => {
    const res = await sendWhatsAppTemplate(
      { to: "+393331234567", kind: "morning_reminder_student", values: { nome: "M", ora: "1", autoscuola: "R" } },
      {} as NodeJS.ProcessEnv,
    );
    expect(res).toMatchObject({ ok: false, retriable: false });
  });
});
