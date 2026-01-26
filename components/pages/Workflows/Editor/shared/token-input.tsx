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
  const selectionRef = useRef<Range | null>(null);
  const selectionOffsetRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isFocused) return;
    const handleSelectionChange = () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!ref.current || !ref.current.contains(range.commonAncestorContainer)) return;
      selectionRef.current = range.cloneRange();
      const preRange = range.cloneRange();
      preRange.selectNodeContents(ref.current);
      preRange.setEnd(range.endContainer, range.endOffset);
      selectionOffsetRef.current = preRange.toString().length;
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [isFocused]);

  useEffect(() => {
    if (!ref.current || isFocused) return;
    ref.current.innerHTML = toTokenHtml(value, variables);
  }, [value, variables, isFocused]);

  const handleInput = () => {
    onChange(serializeTokenInput(ref.current));
  };

  const captureSelection = () => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!ref.current || !ref.current.contains(range.commonAncestorContainer)) return;
    selectionRef.current = range.cloneRange();
    const preRange = range.cloneRange();
    preRange.selectNodeContents(ref.current);
    preRange.setEnd(range.endContainer, range.endOffset);
    selectionOffsetRef.current = preRange.toString().length;
  };

  const createRangeFromOffset = (root: HTMLDivElement, offset: number) => {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(true);
    let remaining = offset;

    const walk = (node: ChildNode): boolean => {
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent?.length ?? 0;
        if (remaining <= length) {
          range.setStart(node, Math.max(0, remaining));
          range.collapse(true);
          return true;
        }
        remaining -= length;
        return false;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const element = node as HTMLElement;
      if (element.dataset.token) {
        const length = element.textContent?.length ?? 0;
        if (remaining === 0) {
          range.setStartBefore(element);
          range.collapse(true);
          return true;
        }
        if (remaining <= length) {
          range.setStartAfter(element);
          range.collapse(true);
          return true;
        }
        remaining -= length;
        return false;
      }
      if (element.tagName === "BR") {
        if (remaining <= 1) {
          range.setStartAfter(element);
          range.collapse(true);
          return true;
        }
        remaining -= 1;
        return false;
      }
      for (const child of Array.from(element.childNodes)) {
        if (walk(child)) return true;
      }
      if (element.tagName === "DIV" || element.tagName === "P") {
        if (remaining <= 1) {
          range.setStartAfter(element);
          range.collapse(true);
          return true;
        }
        remaining -= 1;
      }
      return false;
    };

    for (const child of Array.from(root.childNodes)) {
      if (walk(child)) return range;
    }
    range.selectNodeContents(root);
    range.collapse(false);
    return range;
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const insertToken = (token: string) => {
    const baseRange =
      ref.current && selectionOffsetRef.current != null
        ? createRangeFromOffset(ref.current, selectionOffsetRef.current)
        : selectionRef.current?.cloneRange() ?? null;
    const nextRange = insertTokenAtSelection(ref.current, token, variables, baseRange);
    selectionRef.current = nextRange ?? null;
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
          onKeyUp={captureSelection}
          onMouseUp={captureSelection}
          onInput={captureSelection}
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
