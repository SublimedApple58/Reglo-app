"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Il controllo "Filtri" della toolbar: bottone con il pallino quando qualcosa è
 * attivo, menu con l'elenco dei filtri, e un dialog con le caselle a
 * multi-selezione.
 *
 * Nato nell'agenda (redesign 2026-07) ed estratto qui quando i filtri sono
 * serviti anche in Allievi (REG-469), con la richiesta esplicita di avere lo
 * **stesso identico design**. Estratto invece di copiato: due copie si
 * somigliano finché qualcuno non tocca una delle due.
 *
 * Il componente possiede solo lo stato dell'interfaccia (menu aperto, bozza in
 * corso di modifica). I valori dei filtri restano della pagina, che li applica
 * come crede — l'agenda ricalcola gli appuntamenti, Allievi ricalcola la lista.
 */

export type FilterOption = {
  value: string;
  label: string;
};

export type FilterGroup = {
  /** Identificatore del filtro, usato per l'`onApply`. */
  kind: string;
  /** Voce nel menu, es. "Istruttore". */
  label: string;
  /** Titolo del dialog, es. "Filtra per istruttore". */
  title: string;
  options: FilterOption[];
  /** Valori selezionati; array vuoto = filtro spento. */
  value: string[];
};

export function ToolbarFilters({
  groups,
  onApply,
  onClearAll,
  buttonLabel = "Filtri",
}: {
  groups: FilterGroup[];
  onApply: (kind: string, value: string[]) => void;
  onClearAll: () => void;
  buttonLabel?: string;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editor, setEditor] = React.useState<{ kind: string; value: string[] } | null>(null);

  const hasActiveFilters = groups.some((group) => group.value.length > 0);
  const editing = editor ? groups.find((group) => group.kind === editor.kind) ?? null : null;

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="relative flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 transition-colors hover:bg-[#f0f0f0]"
          >
            <SlidersHorizontal className="size-4 text-[#888888]" strokeWidth={1.6} />
            <span className="text-[13px] font-medium text-[#555555]">{buttonLabel}</span>
            {hasActiveFilters && (
              <span className="absolute right-1 top-1 size-[7px] rounded-full bg-[#111111]" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[190px] rounded-xl p-1.5 shadow-dropdown">
          {groups.map((group) => (
            <button
              key={group.kind}
              type="button"
              className="flex w-full cursor-pointer items-center rounded-lg px-3 py-[9px] text-[13px] font-medium text-foreground transition-colors hover:bg-[#f7f7f7]"
              onClick={() => {
                setMenuOpen(false);
                setEditor({ kind: group.kind, value: group.value });
              }}
            >
              {group.label}
              {group.value.length > 0 && (
                <span className="ml-auto size-[7px] rounded-full bg-[#111111]" />
              )}
            </button>
          ))}
          {hasActiveFilters && (
            <>
              <div className="my-1 border-t border-[#f0f0f0]" />
              <button
                type="button"
                className="flex w-full cursor-pointer items-center rounded-lg px-3 py-[9px] text-[13px] font-medium text-[#111111] transition-colors hover:bg-[#f0f0f0]"
                onClick={() => {
                  setMenuOpen(false);
                  onClearAll();
                }}
              >
                Rimuovi filtri
              </button>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{editing?.title ?? "Filtra"}</DialogTitle>
          </DialogHeader>
          {editor && editing ? (
            <div className="space-y-4">
              <div className="-mx-1 max-h-72 space-y-0.5 overflow-y-auto px-1">
                {editing.options.length === 0 ? (
                  <p className="px-2.5 py-2 text-sm font-medium text-[#929292]">
                    Niente da filtrare qui.
                  </p>
                ) : (
                  editing.options.map((item) => {
                    const checked = editor.value.includes(item.value);
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() =>
                          setEditor((current) =>
                            current
                              ? {
                                  ...current,
                                  value: checked
                                    ? current.value.filter((v) => v !== item.value)
                                    : [...current.value, item.value],
                                }
                              : current,
                          )
                        }
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-[#f7f7f7]"
                      >
                        <span
                          className={cn(
                            "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                            checked ? "border-navy-900 bg-navy-900" : "border-[#c1c1c1] bg-white",
                          )}
                        >
                          {checked ? (
                            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                              <path
                                d="M3 7.4l2.6 2.6L11 4.5"
                                stroke="#fff"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : null}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <DialogFooter className="items-center gap-2">
                <button
                  type="button"
                  className="mr-auto cursor-pointer text-sm font-semibold text-foreground underline underline-offset-2 hover:opacity-70"
                  onClick={() =>
                    setEditor((current) => (current ? { ...current, value: [] } : current))
                  }
                >
                  Azzera
                </button>
                <Button type="button" variant="outline" onClick={() => setEditor(null)}>
                  Chiudi
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    onApply(editor.kind, editor.value);
                    setEditor(null);
                  }}
                >
                  Applica
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
