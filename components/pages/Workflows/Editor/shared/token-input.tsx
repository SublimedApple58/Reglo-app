"use client";

import { useEffect, useRef, useState } from "react";
import type { VariableOption } from "@/components/pages/Workflows/Editor/types";
import { cn } from "@/lib/utils";
import {
  insertTokenAtSelection,
  serializeTokenInput,
  toTokenHtml,
} from "@/components/pages/Workflows/Editor/shared/token-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TokenInputProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  variables: VariableOption[];
  multiline?: boolean;
};

export function TokenInput({
  value,
  onChange,
  placeholder,
  variables,
  multiline = false,
}: TokenInputProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [insertKey, setInsertKey] = useState(0);

  useEffect(() => {
    if (!ref.current || isFocused) return;
    ref.current.innerHTML = toTokenHtml(value, variables);
  }, [value, variables, isFocused]);

  const handleInput = () => {
    onChange(serializeTokenInput(ref.current));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const insertToken = (token: string) => {
    insertTokenAtSelection(ref.current, token, variables);
    onChange(serializeTokenInput(ref.current));
    setInsertKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-md border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
        <div
          ref={ref}
          role="textbox"
          aria-multiline={multiline}
          contentEditable
          className={cn(
            "min-h-[40px] whitespace-pre-wrap text-sm outline-none",
            multiline ? "min-h-[96px]" : "leading-6",
          )}
          onInput={handleInput}
          onPaste={handlePaste}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(event) => {
            if (!multiline && event.key === "Enter") {
              event.preventDefault();
            }
          }}
          suppressContentEditableWarning
        />
        {!value && placeholder ? (
          <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
            {placeholder}
          </div>
        ) : null}
      </div>
      {variables.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">Inserisci dato</p>
          <Select
            key={insertKey}
            onValueChange={(token) => {
              if (!token) return;
              insertToken(token);
            }}
          >
            <SelectTrigger className="h-8 w-[220px] text-xs">
              <SelectValue placeholder="Scegli un dato" />
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
      ) : null}
    </div>
  );
}
