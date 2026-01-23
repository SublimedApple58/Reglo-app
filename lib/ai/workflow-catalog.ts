export type AiBlockField = {
  key: string;
  label: string;
  required?: boolean;
};

export type AiBlockDefinition = {
  id: string;
  label: string;
  integration?: "slack" | "fatture-in-cloud";
  fields: AiBlockField[];
};

export type AiTriggerDefinition = {
  id: "manual" | "document_completed";
  label: string;
};

const baseBlocks: AiBlockDefinition[] = [
  {
    id: "doc-compile-template",
    label: "Compila template",
    fields: [
      { key: "templateId", label: "Template", required: true },
      { key: "requestName", label: "Nome compilazione", required: true },
    ],
  },
  {
    id: "reglo-email",
    label: "Invia email",
    fields: [
      { key: "from", label: "Mittente", required: true },
      { key: "to", label: "Destinatario", required: true },
      { key: "subject", label: "Oggetto", required: true },
      { key: "body", label: "Corpo", required: true },
    ],
  },
];

const slackBlocks: AiBlockDefinition[] = [
  {
    id: "slack-channel-message",
    label: "Invia messaggio a canale",
    integration: "slack",
    fields: [
      { key: "channel", label: "Canale", required: true },
      { key: "message", label: "Messaggio", required: true },
    ],
  },
  {
    id: "slack-user-message",
    label: "Scrivi a utente",
    integration: "slack",
    fields: [
      { key: "user", label: "Utente", required: true },
      { key: "message", label: "Messaggio", required: true },
    ],
  },
];

const ficBlocks: AiBlockDefinition[] = [
  {
    id: "fic-create-invoice",
    label: "Crea fattura",
    integration: "fatture-in-cloud",
    fields: [
      { key: "clientId", label: "Cliente", required: true },
      { key: "amount", label: "Importo", required: true },
      { key: "vatTypeId", label: "Aliquota IVA", required: true },
      { key: "paymentMethodId", label: "Metodo di pagamento" },
      { key: "currency", label: "Valuta", required: true },
      { key: "description", label: "Descrizione" },
      { key: "dueDate", label: "Scadenza" },
    ],
  },
  {
    id: "fic-update-status",
    label: "Aggiorna stato fattura",
    integration: "fatture-in-cloud",
    fields: [
      { key: "invoiceId", label: "ID fattura", required: true },
      { key: "status", label: "Nuovo stato", required: true },
    ],
  },
];

export const aiTriggers: AiTriggerDefinition[] = [
  { id: "manual", label: "Manuale" },
  { id: "document_completed", label: "Template compilato" },
];

export const buildAiBlocks = (options: { slackConnected: boolean; ficConnected: boolean }) => {
  return [
    ...baseBlocks,
    ...(options.slackConnected ? slackBlocks : []),
    ...(options.ficConnected ? ficBlocks : []),
  ];
};
