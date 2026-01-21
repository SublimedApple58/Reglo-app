"use client";

import type { Dispatch, SetStateAction } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TokenInput } from "@/components/pages/Workflows/Editor/shared/token-input";
import type {
  BlockConfigDefinition,
  EmailSenderOption,
  FicPaymentMethodOption,
  FicClientOption,
  FicVatTypeOption,
  SlackChannelOption,
  VariableOption,
} from "@/components/pages/Workflows/Editor/types";

type TemplateOption = { label: string; value: string };

type BlockConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition?: BlockConfigDefinition;
  configDraft: Record<string, string>;
  setConfigDraft: Dispatch<SetStateAction<Record<string, string>>>;
  onClose: () => void;
  onSave: () => void;
  documentTemplateOptions: TemplateOption[];
  variableOptions: VariableOption[];
  slackChannelOptions?: SlackChannelOption[];
  slackChannelLoading?: boolean;
  slackChannelError?: string | null;
  emailSenderOptions?: EmailSenderOption[];
  emailSenderLoading?: boolean;
  emailSenderError?: string | null;
  ficClientOptions?: FicClientOption[];
  ficClientLoading?: boolean;
  ficClientError?: string | null;
  ficVatTypeOptions?: FicVatTypeOption[];
  ficVatTypeLoading?: boolean;
  ficVatTypeError?: string | null;
  ficPaymentMethodOptions?: FicPaymentMethodOption[];
  ficPaymentMethodLoading?: boolean;
  ficPaymentMethodError?: string | null;
  blockId?: string;
};

export function BlockConfigDialog({
  open,
  onOpenChange,
  definition,
  configDraft,
  setConfigDraft,
  onClose,
  onSave,
  documentTemplateOptions,
  variableOptions,
  slackChannelOptions,
  slackChannelLoading,
  slackChannelError,
  emailSenderOptions,
  emailSenderLoading,
  emailSenderError,
  ficClientOptions,
  ficClientLoading,
  ficClientError,
  ficVatTypeOptions,
  ficVatTypeLoading,
  ficVatTypeError,
  ficPaymentMethodOptions,
  ficPaymentMethodLoading,
  ficPaymentMethodError,
  blockId,
}: BlockConfigDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{definition?.title ?? "Configura blocco"}</DialogTitle>
          {definition?.description ? (
            <DialogDescription>{definition.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-4">
          {definition?.fields.map((field) => {
            const selectOptions =
              field.optionsSource === "templates"
                ? documentTemplateOptions
                : (field.options ?? []).map((option) => ({
                    label: option,
                    value: option,
                  }));
            return (
              <div key={field.key} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {field.label}
                  {field.required ? " *" : ""}
                </p>
                {field.optionsSource === "slackChannels" ? (
                  <div className="space-y-1">
                    <Select
                      value={
                        slackChannelOptions?.some((option) => option.value === configDraft[field.key])
                          ? configDraft[field.key]
                          : ""
                      }
                      onValueChange={(value) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          [field.key]: value,
                        }))
                      }
                      disabled={slackChannelLoading || !slackChannelOptions?.length}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            slackChannelLoading
                              ? "Caricamento canali Slack…"
                              : slackChannelOptions?.length
                                ? "Scegli un canale Slack"
                                : slackChannelError
                                  ? "Selezione non disponibile"
                                  : "Nessun canale disponibile"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {slackChannelOptions?.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {slackChannelError ? (
                      <p className="text-xs text-rose-500">{slackChannelError}</p>
                    ) : slackChannelOptions?.length === 0 && !slackChannelLoading ? (
                      <p className="text-xs text-muted-foreground">
                        Puoi comunque usare un valore dinamico o incollare un ID canale.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {field.optionsSource === "emailSenders" ? (
                  <div className="space-y-1">
                    <Select
                      value={
                        emailSenderOptions?.some((option) => option.value === configDraft[field.key])
                          ? configDraft[field.key]
                          : ""
                      }
                      onValueChange={(value) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          [field.key]: value,
                        }))
                      }
                      disabled={emailSenderLoading || !emailSenderOptions?.length}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            emailSenderLoading
                              ? "Caricamento mittenti…"
                              : emailSenderOptions?.length
                                ? "Scegli un mittente"
                                : emailSenderError
                                  ? "Mittenti non disponibili"
                                  : "Nessun mittente verificato"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {emailSenderOptions?.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {emailSenderError ? (
                      <p className="text-xs text-rose-500">{emailSenderError}</p>
                    ) : null}
                  </div>
                ) : field.type === "select" ? (
                  <Select
                    value={configDraft[field.key] ?? ""}
                    onValueChange={(value) =>
                      setConfigDraft((prev) => ({ ...prev, [field.key]: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona valore" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.optionsSource === "ficClients" ? (
                  <div className="space-y-1">
                    <Select
                      value={
                        ficClientOptions?.some((option) => option.value === configDraft[field.key])
                          ? configDraft[field.key]
                          : ""
                      }
                      onValueChange={(value) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          [field.key]: value,
                        }))
                      }
                      disabled={ficClientLoading || !ficClientOptions?.length}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            ficClientLoading
                              ? "Caricamento clienti…"
                              : ficClientOptions?.length
                                ? "Scegli un cliente"
                                : ficClientError
                                  ? "Clienti non disponibili"
                                  : "Nessun cliente disponibile"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {ficClientOptions?.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {ficClientError ? (
                      <p className="text-xs text-rose-500">{ficClientError}</p>
                    ) : null}
                  </div>
                ) : field.optionsSource === "ficVatTypes" ? (
                  <div className="space-y-1">
                    <Select
                      value={
                        ficVatTypeOptions?.some((option) => option.value === configDraft[field.key])
                          ? configDraft[field.key]
                          : ""
                      }
                      onValueChange={(value) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          [field.key]: value,
                        }))
                      }
                      disabled={ficVatTypeLoading || !ficVatTypeOptions?.length}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            ficVatTypeLoading
                              ? "Caricamento aliquote…"
                              : ficVatTypeOptions?.length
                                ? "Scegli aliquota"
                                : ficVatTypeError
                                  ? "Aliquote non disponibili"
                                  : "Nessuna aliquota disponibile"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {ficVatTypeOptions?.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {ficVatTypeError ? (
                      <p className="text-xs text-rose-500">{ficVatTypeError}</p>
                    ) : null}
                  </div>
                ) : field.optionsSource === "ficPaymentMethods" ? (
                  <div className="space-y-1">
                    <Select
                      value={
                        ficPaymentMethodOptions?.some(
                          (option) => option.value === configDraft[field.key],
                        )
                          ? configDraft[field.key]
                          : ""
                      }
                      onValueChange={(value) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          [field.key]: value,
                        }))
                      }
                      disabled={ficPaymentMethodLoading || !ficPaymentMethodOptions?.length}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            ficPaymentMethodLoading
                              ? "Caricamento metodi…"
                              : ficPaymentMethodOptions?.length
                                ? "Scegli metodo"
                                : ficPaymentMethodError
                                  ? "Metodi non disponibili"
                                  : "Nessun metodo disponibile"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {ficPaymentMethodOptions?.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {ficPaymentMethodError ? (
                      <p className="text-xs text-rose-500">{ficPaymentMethodError}</p>
                    ) : null}
                  </div>
                ) : (
                  <TokenInput
                    value={configDraft[field.key] ?? ""}
                    onChange={(value) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        [field.key]: value,
                      }))
                    }
                    placeholder={field.placeholder}
                    variables={variableOptions}
                    multiline={field.multiline}
                  />
                )}
                {field.hint ? (
                  <p className="text-xs text-muted-foreground">{field.hint}</p>
                ) : null}
              </div>
            );
          })}
          {blockId === "reglo-email" ? (
            <div className="rounded-2xl border border-border/60 bg-slate-50/70 p-4 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Preview email
              </p>
              <p className="mt-3 text-base font-semibold text-foreground">
                {configDraft.subject?.trim() || "Oggetto dinamico con token"}
              </p>
              <div className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {configDraft.body?.trim() ||
                  "Qui apparirà il corpo dinamico della mail, incluso il footer di Reglo."}
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p>
                  {configDraft.from?.trim() || "mittente@reglo.it"} ·{' '}
                  {configDraft.to?.trim() || "destinatario@esempio.com"}
                </p>
                <p>Footer personalizzato con logo Reglo incluso.</p>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Chiudi
          </Button>
          <Button onClick={onSave}>Salva configurazione</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
