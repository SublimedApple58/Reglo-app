import { interpolateTemplate } from "@/lib/workflows/engine";
import { ficFetch, getFicConnection } from "@/trigger/workflow-runner/fic";

const normalizeSetting = (value: unknown) =>
  typeof value === "string" ? value : value == null ? "" : String(value);

export const executeFicCreateInvoice = async ({
  prisma,
  run,
  nodeId,
  settings,
  context,
  stepOutputs,
}: {
  prisma: any;
  run: { id: string; companyId: string };
  nodeId: string;
  settings: Record<string, string>;
  context: { triggerPayload?: unknown; stepOutputs: Record<string, unknown> };
  stepOutputs: Record<string, unknown>;
}) => {
  const rawClientId = normalizeSetting(settings.clientId).trim();
  const rawAmount = normalizeSetting(settings.amount).trim();
  const rawCurrency = normalizeSetting(settings.currency).trim() || "EUR";
  const rawDescription = normalizeSetting(settings.description);
  const rawVatTypeId = normalizeSetting(settings.vatTypeId).trim();
  const rawPaymentMethodId = normalizeSetting(settings.paymentMethodId).trim();
  const rawDueDate = normalizeSetting(settings.dueDate).trim();

  if (!rawClientId) {
    throw new Error("Cliente FIC obbligatorio");
  }
  if (!rawAmount) {
    throw new Error("Importo obbligatorio");
  }
  if (!rawVatTypeId) {
    throw new Error("Aliquota IVA obbligatoria");
  }

  const clientId = interpolateTemplate(rawClientId, context);
  const amountValue = Number(interpolateTemplate(rawAmount, context));
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    throw new Error("Importo non valido");
  }
  const currency = interpolateTemplate(rawCurrency, context) || "EUR";
  const description =
    interpolateTemplate(rawDescription || "Servizio", context) || "Servizio";
  const vatTypeId = interpolateTemplate(rawVatTypeId, context);
  const paymentMethodId = rawPaymentMethodId
    ? interpolateTemplate(rawPaymentMethodId, context)
    : "";
  const dueDateRaw = rawDueDate ? interpolateTemplate(rawDueDate, context) : "";
  const dueDate = (() => {
    const value = dueDateRaw.trim();
    if (!value) return "";
    if (value.includes("/")) {
      const [day, month, year] = value.split("/");
      if (day && month && year) {
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    throw new Error("Formato scadenza non valido (usa GG/MM/AAAA).");
  })();

  const { token, entityId, entityName } = await getFicConnection(prisma, run.companyId);
  const vatTypes = await ficFetch(`/c/${entityId}/info/vat_types`, token, { method: "GET" });
  const vatList = Array.isArray(vatTypes)
    ? vatTypes
    : ((vatTypes as { data?: unknown }).data as Array<{ id?: string; value?: number | string }>) ?? [];
  const vatMatch = vatList.find((vat) => String(vat.id) === vatTypeId);
  const vatRateRaw = vatMatch?.value != null ? Number(vatMatch.value) : null;
  const vatRate = Number.isFinite(vatRateRaw) ? vatRateRaw : null;
  const grossAmount = vatRate != null
    ? Number((amountValue * (1 + vatRate / 100)).toFixed(2))
    : amountValue;
  const paymentMethodList = dueDate
    ? await (async () => {
        const paymentMethodsPayload = await (async () => {
          try {
            return await ficFetch(`/c/${entityId}/settings/payment_methods`, token, {
              method: "GET",
            });
          } catch {
            return await ficFetch(`/c/${entityId}/info/payment_methods`, token, {
              method: "GET",
            });
          }
        })();
        const paymentMethodList = Array.isArray(paymentMethodsPayload)
          ? paymentMethodsPayload
          : ((paymentMethodsPayload as { data?: unknown }).data as Array<{
              id?: string | number;
              name?: string;
              type?: string;
            }>) ?? [];
        return paymentMethodList;
      })()
    : [];
  const resolvedPaymentMethod =
    dueDate
      ? paymentMethodList.find((method) => String(method.id) === paymentMethodId) ??
        (paymentMethodId ? null : paymentMethodList[0] ?? null)
      : null;
  if (dueDate && paymentMethodId && !resolvedPaymentMethod?.id) {
    throw new Error("Metodo di pagamento FIC non valido.");
  }
  if (dueDate && !resolvedPaymentMethod?.id) {
    throw new Error("Nessun metodo di pagamento FIC disponibile.");
  }
  const clientDetails = await ficFetch(`/c/${entityId}/entities/clients/${clientId}`, token, {
    method: "GET",
  });
  const clientData =
    clientDetails && typeof clientDetails === "object" && "data" in clientDetails
      ? (clientDetails as { data?: Record<string, unknown> }).data ?? {}
      : (clientDetails as Record<string, unknown>) ?? {};
  const resolvedName =
    (clientData.name as string | undefined) ||
    (clientData.company_name as string | undefined) ||
    [clientData.firstname as string | undefined, clientData.lastname as string | undefined]
      .filter(Boolean)
      .join(" ") ||
    "Cliente";

  const buildPayload = (paymentAmount: number | null) => ({
    data: {
      type: "invoice",
      entity: { id: clientId, name: resolvedName },
      currency: { code: currency },
      language: { code: "it", name: "Italiano" },
      items_list: [
        {
          name: description,
          qty: 1,
          net_price: amountValue,
          vat: { id: vatTypeId },
        },
      ],
      ...(dueDate && paymentAmount != null && resolvedPaymentMethod?.id
        ? {
            payment_method: {
              id: Number(resolvedPaymentMethod.id),
              name: resolvedPaymentMethod.name,
              type: resolvedPaymentMethod.type,
            },
            payments_list: [
              {
                amount: paymentAmount,
                due_date: dueDate,
              },
            ],
          }
        : {}),
    },
  });

  const createInvoice = async (paymentAmount: number | null) => {
    const response = await fetch(`https://api-v2.fattureincloud.it/c/${entityId}/issued_documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(buildPayload(paymentAmount)),
    });
    const rawText = await response.text();
    let json: unknown = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      return {
        ok: false,
        message:
          (json as { error?: { message?: string } } | null)?.error?.message ||
          rawText ||
          "Errore Fatture in Cloud",
        amountDue: (json as { extra?: { totals?: { amount_due?: number } } } | null)?.extra?.totals
          ?.amount_due ?? null,
        raw: json,
      } as const;
    }
    return { ok: true, data: json } as const;
  };

  let createResult = await createInvoice(dueDate ? grossAmount : null);
  if (
    !createResult.ok &&
    createResult.amountDue != null &&
    typeof createResult.amountDue === "number" &&
    createResult.message.includes("pagamenti")
  ) {
    createResult = await createInvoice(createResult.amountDue);
  }
  if (!createResult.ok) {
    throw new Error(createResult.message);
  }

  const result = createResult.data as
    | { data?: { id?: string | number }; id?: string | number }
    | null;

  const output = {
    entityId,
    entityName,
    invoiceId: result?.data?.id ?? result?.id ?? null,
    dueDate: dueDate || null,
    raw: result,
  };
  stepOutputs[nodeId] = output;
  await prisma.workflowRunStep.updateMany({
    where: { runId: run.id, nodeId },
    data: {
      status: "completed",
      output,
      finishedAt: new Date(),
    },
  });
  return { branch: null };
};

export const executeFicUpdateStatus = async ({
  prisma,
  run,
  nodeId,
  settings,
  context,
  stepOutputs,
}: {
  prisma: any;
  run: { id: string; companyId: string };
  nodeId: string;
  settings: Record<string, string>;
  context: { triggerPayload?: unknown; stepOutputs: Record<string, unknown> };
  stepOutputs: Record<string, unknown>;
}) => {
  const rawInvoiceId = normalizeSetting(settings.invoiceId).trim();
  const rawStatus = normalizeSetting(settings.status).trim();
  if (!rawInvoiceId) {
    throw new Error("ID fattura obbligatorio");
  }
  if (!rawStatus) {
    throw new Error("Stato fattura obbligatorio");
  }
  const invoiceId = interpolateTemplate(rawInvoiceId, context);
  const statusInput = interpolateTemplate(rawStatus, context);
  const statusMap: Record<string, string> = {
    Pagata: "paid",
    "In sospeso": "not_paid",
    Annullata: "cancelled",
  };
  const status = statusMap[statusInput] ?? statusInput;

  const { token, entityId, entityName } = await getFicConnection(prisma, run.companyId);
  const result = await ficFetch(`/c/${entityId}/issued_documents/${invoiceId}/status`, token, {
    method: "POST",
    body: JSON.stringify({ status }),
  });

  const output = { entityId, entityName, invoiceId, status, raw: result };
  stepOutputs[nodeId] = output;
  await prisma.workflowRunStep.updateMany({
    where: { runId: run.id, nodeId },
    data: {
      status: "completed",
      output,
      finishedAt: new Date(),
    },
  });
  return { branch: null };
};
