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
                {field.type === "select" ? (
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
