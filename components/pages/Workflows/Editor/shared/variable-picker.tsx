"use client";

import { useState } from "react";

import type { VariableOption } from "@/components/pages/Workflows/Editor/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type VariablePickerProps = {
  variables: VariableOption[];
  onSelect: (token: string) => void;
  placeholder?: string;
};

export function VariablePicker({
  variables,
  onSelect,
  placeholder = "Scegli un dato",
}: VariablePickerProps) {
  const [insertKey, setInsertKey] = useState(0);

  if (variables.length === 0) return null;

  return (
    <div className="space-y-2 pt-2">
      <p className="text-xs text-muted-foreground">Inserisci dato</p>
      <Select
        key={insertKey}
        onValueChange={(token) => {
          if (!token) return;
          onSelect(token);
          setInsertKey((prev) => prev + 1);
        }}
      >
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {variables.map((option) => (
            <SelectItem key={option.token} value={option.token}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
