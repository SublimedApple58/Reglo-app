import type { ComponentType } from "react";

export type ServiceKey =
  | "fatture-in-cloud"
  | "slack"
  | "doc-manager"
  | "reglo-actions"
  | "logic"
  | "flow-control";

export type BlockKind = "standard" | "if" | "for" | "while";

export type BlockDefinition = {
  id: string;
  label: string;
  kind?: BlockKind;
  hint?: string;
};

export type BlockConfigField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "select";
  options?: string[];
  optionsSource?: "templates" | "slackChannels" | "emailSenders" | "ficClients" | "ficVatTypes";
  hint?: string;
  multiline?: boolean;
};

export type BlockConfigDefinition = {
  title: string;
  description?: string;
  fields: BlockConfigField[];
};

export type Condition = {
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";
  left: string;
  right: string;
};

export type LogicNodeData = {
  label: string;
  meta?: string;
  condition?: Condition;
  loopKind?: "for" | "while";
  iterations?: number;
};

export type TriggerType =
  | "manual"
  | "document_completed"
  | "email_inbound"
  | "slack_message"
  | "fic_event";

export type TriggerOption = {
  id: TriggerType;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  available: boolean;
};

export type VariableOption = {
  label: string;
  token: string;
  description?: string;
};

export type ManualFieldDefinition = {
  id: string;
  key: string;
  required: boolean;
};

export type RunPayloadField = {
  id: string;
  key: string;
  value: string;
  required: boolean;
};

export type SlackChannelOption = {
  value: string;
  label: string;
  isPrivate?: boolean;
};

export type EmailSenderOption = {
  value: string;
  label: string;
};

export type FicClientOption = {
  value: string;
  label: string;
};

export type FicVatTypeOption = {
  value: string;
  label: string;
  rate?: number;
};
