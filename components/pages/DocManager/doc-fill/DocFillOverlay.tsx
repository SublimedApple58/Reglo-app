"use client";

import React from "react";
import { PenLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FillField } from "../doc-manager.types";

type DocFillOverlayProps = {
  fields: FillField[];
  values: Record<string, string>;
  onChangeValue: (fieldId: string, value: string) => void;
  onSign: (fieldId: string) => void;
};

export function DocFillOverlay({
  fields,
  values,
  onChangeValue,
  onSign,
}: DocFillOverlayProps): React.ReactElement {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {fields.map((field) => {
        const value = values[field.id] ?? "";
        const isSigned = field.type === "sign" && value.trim().length > 0;
        return (
          <div
            key={field.id}
            className={cn(
              "pointer-events-auto absolute rounded-md border border-primary/40 bg-white/90 text-[11px] text-foreground shadow-sm",
              field.type === "sign" && "bg-primary/10",
            )}
            style={{
              left: field.x,
              top: field.y,
              width: field.width,
              height: field.height,
            }}
          >
            {field.type === "input" ? (
              <Input
                value={value}
                onChange={(event) => onChangeValue(field.id, event.target.value)}
                placeholder={field.label}
                className="h-full w-full border-0 bg-transparent px-2 py-0 text-[11px] font-medium shadow-none focus-visible:ring-0"
              />
            ) : null}
            {field.type === "textarea" ? (
              <Textarea
                value={value}
                onChange={(event) => onChangeValue(field.id, event.target.value)}
                placeholder={field.label}
                className="h-full w-full resize-none border-0 bg-transparent px-2 py-1 text-[11px] font-medium shadow-none focus-visible:ring-0"
              />
            ) : null}
            {field.type === "sign" ? (
              <button
                type="button"
                onClick={() => onSign(field.id)}
                className="flex h-full w-full items-center justify-center gap-2 rounded-md px-2 text-[11px] font-semibold text-muted-foreground"
              >
                <PenLine className="h-3.5 w-3.5" />
                {isSigned ? (
                  <span
                    className="text-lg"
                    style={{
                      fontFamily: '"Times New Roman", Times, serif',
                      fontStyle: "italic",
                      color: "#2e3359",
                    }}
                  >
                    {value}
                  </span>
                ) : (
                  field.label
                )}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
