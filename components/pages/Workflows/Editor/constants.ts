import {
  FileText,
  Mail,
  MessageSquare,
  PlayCircle,
  Receipt,
} from "lucide-react";

import type {
  BlockConfigDefinition,
  BlockDefinition,
  ServiceKey,
  TriggerOption,
} from "@/components/pages/Workflows/Editor/types";

export const primaryNodeStyle = {
  borderRadius: 14,
  padding: "12px 16px",
  border: "1px solid rgba(50, 78, 122, 0.2)",
  background: "#e9f2f2",
  color: "#324e7a",
  fontWeight: 600,
  boxShadow: "0 10px 18px -16px rgba(50, 78, 122, 0.4)",
};

export const secondaryNodeStyle = {
  ...primaryNodeStyle,
  background: "#e5e4f0",
  border: "1px solid rgba(96, 87, 158, 0.25)",
};

export const serviceBlocks: Record<
  ServiceKey,
  { label: string; blocks: BlockDefinition[]; group: "integrations" | "docs" | "logic" }
> = {
  "fatture-in-cloud": {
    label: "Fatture in Cloud",
    group: "integrations",
    blocks: [
      { id: "fic-create-invoice", label: "Crea fattura" },
      { id: "fic-update-status", label: "Aggiorna stato fattura" },
    ],
  },
  slack: {
    label: "Slack",
    group: "integrations",
    blocks: [
      { id: "slack-channel-message", label: "Invia messaggio a canale" },
      { id: "slack-user-message", label: "Scrivi a utente" },
    ],
  },
  "doc-manager": {
    label: "Doc manager",
    group: "docs",
    blocks: [
      { id: "doc-compile-template", label: "Compila template" },
      { id: "doc-upload", label: "Carica documento" },
      { id: "doc-validate", label: "Valida documento" },
      { id: "doc-route", label: "Instrada per approvazione" },
      { id: "doc-archive", label: "Archivia in repository" },
      { id: "doc-tag", label: "Applica tag e classificazione" },
    ],
  },
  "reglo-actions": {
    label: "Reglo actions",
    group: "docs",
    blocks: [
      { id: "reglo-sync", label: "Sincronizza metadati" },
      { id: "reglo-route", label: "Instrada al reparto corretto" },
      { id: "reglo-validate", label: "Valida policy interne" },
      { id: "reglo-notify", label: "Notifica stakeholder" },
      { id: "reglo-log", label: "Logga evento in audit trail" },
    ],
  },
  logic: {
    label: "Blocchi logici",
    group: "logic",
    blocks: [
      {
        id: "logic-if",
        label: "Condizione (if)",
        kind: "if",
        hint: "Esegui solo se la condizione e' vera.",
      },
      {
        id: "logic-for",
        label: "Ripeti (for)",
        kind: "for",
        hint: "Esegui per un numero di volte definito.",
      },
      {
        id: "logic-while",
        label: "Ripeti finche'",
        kind: "while",
        hint: "Continua finche' la condizione resta vera.",
      },
    ],
  },
  "flow-control": {
    label: "Flow control",
    group: "logic",
    blocks: [
      {
        id: "wait",
        label: "Metti in pausa",
        hint: "Attende un evento esterno prima di proseguire.",
      },
    ],
  },
};

export const triggerOptions: TriggerOption[] = [
  {
    id: "manual",
    label: "Manuale",
    description: "Avvio manuale quando vuoi testare o lanciare subito.",
    icon: PlayCircle,
    available: true,
  },
  {
    id: "document_completed",
    label: "Template compilato",
    description: "Parte quando un template specifico viene compilato.",
    icon: FileText,
    available: true,
  },
  {
    id: "email_inbound",
    label: "Email in ingresso",
    description: "Si attiva quando arriva una mail.",
    icon: Mail,
    available: false,
  },
  {
    id: "slack_message",
    label: "Messaggio Slack",
    description: "Avvio su evento o messaggio Slack.",
    icon: MessageSquare,
    available: false,
  },
  {
    id: "fic_event",
    label: "Fatture in Cloud",
    description: "Avvio su evento fattura o pagamento.",
    icon: Receipt,
    available: false,
  },
];

export const blockConfigDefinitions: Record<string, BlockConfigDefinition> = {
  "slack-channel-message": {
    title: "Messaggio in canale",
    description: "Invia un messaggio al canale scelto.",
    fields: [
      {
        key: "channel",
        label: "Canale",
        placeholder: "#general o ID canale",
        required: true,
      },
      {
        key: "message",
        label: "Messaggio",
        placeholder: "Scrivi il testo da inviare",
        required: true,
        hint: "Puoi inserire dati dinamici dal trigger o dagli step precedenti.",
        multiline: true,
      },
    ],
  },
  "slack-user-message": {
    title: "Messaggio a utente",
    description: "Invia un DM a un utente del workspace.",
    fields: [
      {
        key: "user",
        label: "Utente",
        placeholder: "Email o ID utente Slack",
        required: true,
      },
      {
        key: "message",
        label: "Messaggio",
        placeholder: "Scrivi il testo da inviare",
        required: true,
        hint: "Puoi inserire dati dinamici dal trigger o dagli step precedenti.",
        multiline: true,
      },
    ],
  },
  "doc-compile-template": {
    title: "Compila template",
    description: "Genera una compilazione pubblica a partire da un template.",
    fields: [
      {
        key: "templateId",
        label: "Template",
        type: "select",
        required: true,
        optionsSource: "templates",
      },
      {
        key: "requestName",
        label: "Nome compilazione",
        placeholder: "Es. Contratto Mario Rossi",
        required: true,
        hint: "Puoi inserire dati dinamici dal trigger o dagli step precedenti.",
      },
    ],
  },
  "fic-create-invoice": {
    title: "Crea fattura",
    description: "Crea una nuova fattura di vendita.",
    fields: [
      {
        key: "customer",
        label: "Cliente",
        placeholder: "Nome cliente o ID",
        required: true,
      },
      {
        key: "amount",
        label: "Importo",
        placeholder: "Es. 1200.00",
        required: true,
      },
      {
        key: "currency",
        label: "Valuta",
        placeholder: "EUR",
        required: true,
      },
      {
        key: "description",
        label: "Descrizione",
        placeholder: "Descrizione breve della fattura",
        multiline: true,
      },
      {
        key: "dueDate",
        label: "Scadenza",
        placeholder: "YYYY-MM-DD",
      },
    ],
  },
  "fic-update-status": {
    title: "Aggiorna stato fattura",
    description: "Aggiorna lo stato di una fattura esistente.",
    fields: [
      {
        key: "invoiceId",
        label: "ID fattura",
        placeholder: "ID o riferimento",
        required: true,
      },
      {
        key: "status",
        label: "Nuovo stato",
        type: "select",
        required: true,
        options: ["Pagata", "In sospeso", "Annullata"],
      },
    ],
  },
};
