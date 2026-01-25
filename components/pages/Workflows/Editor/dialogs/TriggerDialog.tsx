"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { cn } from "@/lib/utils";
import { INBOUND_EMAIL_DOMAIN } from "@/lib/constants";
import type {
  ManualFieldDefinition,
  TriggerOption,
  TriggerType,
} from "@/components/pages/Workflows/Editor/types";

type TemplateOption = { label: string; value: string };

type TriggerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerOptions: TriggerOption[];
  triggerType: TriggerType;
  setTriggerType: Dispatch<SetStateAction<TriggerType>>;
  triggerConfig: Record<string, string>;
  setTriggerConfig: Dispatch<SetStateAction<Record<string, string>>>;
  manualFieldDefinitions: ManualFieldDefinition[];
  setManualFieldDefinitions: Dispatch<SetStateAction<ManualFieldDefinition[]>>;
  manualFieldIdRef: MutableRefObject<number>;
  emailFieldDefinitions: ManualFieldDefinition[];
  setEmailFieldDefinitions: Dispatch<SetStateAction<ManualFieldDefinition[]>>;
  emailFieldIdRef: MutableRefObject<number>;
  documentTemplateOptions: TemplateOption[];
  triggerTemplateMissing: boolean;
  onUnavailableTrigger?: () => void;
};

export function TriggerDialog({
  open,
  onOpenChange,
  triggerOptions,
  triggerType,
  setTriggerType,
  triggerConfig,
  setTriggerConfig,
  manualFieldDefinitions,
  setManualFieldDefinitions,
  manualFieldIdRef,
  emailFieldDefinitions,
  setEmailFieldDefinitions,
  emailFieldIdRef,
  documentTemplateOptions,
  triggerTemplateMissing,
  onUnavailableTrigger,
}: TriggerDialogProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(100vw,900px)] data-[vaul-drawer-direction=right]:sm:max-w-2xl h-full">
        <div className="flex h-full flex-col">
          <DrawerHeader className="border-b">
            <DrawerTitle>Configura trigger</DrawerTitle>
            <DrawerDescription>
              Se non configuri un trigger automatico, il workflow resta Manuale.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {triggerOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = option.id === triggerType;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      if (!option.available) {
                        onUnavailableTrigger?.();
                        return;
                      }
                      setTriggerType(option.id);
                      setTriggerConfig({});
                    }}
                    className={cn(
                      "flex w-full flex-col gap-3 rounded-xl border px-4 py-4 text-left transition",
                      isSelected
                        ? "border-primary/40 bg-primary/5 shadow-sm"
                        : "border-border/70 bg-background hover:-translate-y-[1px] hover:shadow-md",
                      option.available ? "" : "cursor-not-allowed opacity-60",
                    )}
                    disabled={!option.available}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      {option.available ? null : (
                        <span className="rounded-full border border-border/70 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Soon
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-4">
              {triggerType === "manual" ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Trigger manuale</p>
                  <p className="text-xs text-muted-foreground">
                    Definisci i dati che l&apos;utente dovra&apos; inserire quando avvia il workflow.
                  </p>
                  <div className="space-y-2">
                    {manualFieldDefinitions.map((field, index) => (
                      <div key={field.id} className="flex flex-wrap items-center gap-2">
                        <Input
                          value={field.key}
                          onChange={(event) =>
                            setManualFieldDefinitions((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, key: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Nome dato"
                          className="min-w-[200px] flex-1"
                        />
                        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            checked={field.required}
                            onCheckedChange={(value) =>
                              setManualFieldDefinitions((prev) =>
                                prev.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, required: Boolean(value) }
                                    : item,
                                ),
                              )
                            }
                          />
                          Obbligatorio
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setManualFieldDefinitions((prev) =>
                              prev.length > 1
                                ? prev.filter((_, itemIndex) => itemIndex !== index)
                                : prev,
                            )
                          }
                        >
                          Rimuovi
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setManualFieldDefinitions((prev) => [
                          ...prev,
                          { id: `field-${manualFieldIdRef.current++}`, key: "", required: true },
                        ])
                      }
                    >
                      Aggiungi dato
                    </Button>
                  </div>
                </div>
              ) : null}
              {triggerType === "document_completed" ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">
                    Quando viene compilato un template
                  </p>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Template *
                    </p>
                    <Select
                      value={triggerConfig.templateId ?? ""}
                      onValueChange={(value) =>
                        setTriggerConfig((prev) => ({
                          ...prev,
                          templateId: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona template" />
                      </SelectTrigger>
                      <SelectContent>
                        {documentTemplateOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {triggerTemplateMissing ? (
                    <p className="text-xs text-amber-700">
                      Seleziona un template o il trigger restera&apos; Manuale.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Potrai usare i dati del trigger negli step successivi.
                    </p>
                  )}
                </div>
              ) : null}
              {triggerType === "email_inbound" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">
                      Quando arriva una mail
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Imposta l&apos;indirizzo di ascolto. Puoi inoltrare le mail
                      dal tuo provider verso questo indirizzo dedicato.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Indirizzo email *
                    </p>
                    <Input
                      value={triggerConfig.address ?? ""}
                      onChange={(event) =>
                        setTriggerConfig((prev) => ({
                          ...prev,
                          address: event.target.value,
                        }))
                      }
                      placeholder={`ordini@${INBOUND_EMAIL_DOMAIN}`}
                    />
                    <p className="text-xs text-muted-foreground">
                      Usa un alias del dominio <strong>{INBOUND_EMAIL_DOMAIN}</strong> per
                      collegare il workflow.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Filtra mittente
                      </p>
                      <Input
                        value={triggerConfig.fromFilter ?? ""}
                        onChange={(event) =>
                          setTriggerConfig((prev) => ({
                            ...prev,
                            fromFilter: event.target.value,
                          }))
                        }
                        placeholder="es. ordini@cliente.it"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Filtra oggetto
                      </p>
                      <Input
                        value={triggerConfig.subjectFilter ?? ""}
                        onChange={(event) =>
                          setTriggerConfig((prev) => ({
                            ...prev,
                            subjectFilter: event.target.value,
                          }))
                        }
                        placeholder="es. Nuovo ordine"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Parole chiave
                    </p>
                    <Input
                      value={triggerConfig.keywords ?? ""}
                      onChange={(event) =>
                        setTriggerConfig((prev) => ({
                          ...prev,
                          keywords: event.target.value,
                        }))
                      }
                      placeholder="es. ordine, preventivo"
                    />
                    <p className="text-xs text-muted-foreground">
                      Se presenti, tutte le parole devono apparire nella mail.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground">
                      Dati da estrarre con AI
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Definisci i campi che vuoi ottenere dal testo della mail.
                      Se lasci vuoto, avrai solo i metadati della mail.
                    </p>
                    <div className="space-y-2">
                      {emailFieldDefinitions.map((field, index) => (
                        <div key={field.id} className="flex flex-wrap items-center gap-2">
                          <Input
                            value={field.key}
                            onChange={(event) =>
                              setEmailFieldDefinitions((prev) =>
                                prev.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, key: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Nome dato"
                            className="min-w-[200px] flex-1"
                          />
                          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <Checkbox
                              checked={field.required}
                              onCheckedChange={(value) =>
                                setEmailFieldDefinitions((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, required: Boolean(value) }
                                      : item,
                                  ),
                                )
                              }
                            />
                            Obbligatorio
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setEmailFieldDefinitions((prev) =>
                                prev.filter((_, itemIndex) => itemIndex !== index),
                              )
                            }
                          >
                            Rimuovi
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setEmailFieldDefinitions((prev) => [
                            ...prev,
                            { id: `email-field-${emailFieldIdRef.current++}`, key: "", required: true },
                          ])
                        }
                      >
                        Aggiungi dato
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <DrawerFooter className="border-t">
            <DrawerClose asChild>
              <Button variant="outline">Chiudi</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
