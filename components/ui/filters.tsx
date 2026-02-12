"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export default function Filters({
  filtersParams,
}: {
  filtersParams: {
    title: string;
    options: string[];
    param: string;
  }[];
}): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [activeFilter, setActiveFilter] = React.useState<{
    title: string;
    options: string[];
    param: string;
  } | null>(null);
  const [draftSelections, setDraftSelections] = React.useState<string[]>([]);

  const getSelections = React.useCallback(
    (param: string) => {
      const raw = searchParams.get(param);
      if (!raw) return [];
      return raw.split(",").filter(Boolean);
    },
    [searchParams],
  );

  const activeFilterCount = React.useMemo(
    () =>
      filtersParams.reduce((count, filter) => {
        const selections = getSelections(filter.param);
        return selections.length ? count + 1 : count;
      }, 0),
    [filtersParams, getSelections],
  );

  const handleOpen = (filter: { title: string; options: string[]; param: string }) => {
    setActiveFilter(filter);
    setDraftSelections(getSelections(filter.param));
  };

  const handleToggle = (option: string) => {
    setDraftSelections((prev) =>
      prev.includes(option) ? prev.filter((item) => item !== option) : prev.concat(option),
    );
  };

  const handleSave = () => {
    if (!activeFilter) return;
    const params = new URLSearchParams(searchParams.toString());
    if (draftSelections.length) {
      params.set(activeFilter.param, draftSelections.join(","));
    } else {
      params.delete(activeFilter.param);
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
    setActiveFilter(null);
  };

  const handleClear = (param: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(param);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
    setActiveFilter(null);
  };

  const handleResetAll = () => {
    const params = new URLSearchParams(searchParams.toString());
    filtersParams.forEach((filter) => {
      params.delete(filter.param);
    });
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
    setActiveFilter(null);
  };

  return (
    <>
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
        className="items-center"
      >
        <div style={{ display: "flex", justifyContent: "start", gap: 8 }}>
          {filtersParams.map((f) => {
            const selections = getSelections(f.param);
            const isActive = selections.length > 0;
            return (
              <div style={{ marginBlock: "0" }} key={f.title}>
                <Badge
                  variant="outline"
                  className={cn(
                    "reglo-focus-ring cursor-pointer border-2 border-dashed border-primary/35 bg-white/72 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
                    isActive &&
                      "border-solid border-primary/50 bg-primary/12 text-primary",
                  )}
                  role="button"
                  onClick={() => handleOpen(f)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleOpen(f);
                    }
                  }}
                  tabIndex={0}
                >
                  <span>{f.title}</span>
                  {isActive ? (
                    <>
                      <span className="text-[10px] opacity-70">
                        ({selections.length})
                      </span>
                      <button
                        type="button"
                        className="ml-1 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleClear(f.param);
                        }}
                        aria-label={`Rimuovi filtro ${f.title}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : null}
                </Badge>
              </div>
            );
          })}
        </div>
        {activeFilterCount > 1 ? (
          <button
            type="button"
            className="text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            onClick={handleResetAll}
          >
            Resetta filtri
          </button>
        ) : null}
      </div>
      <Dialog
        open={!!activeFilter}
        onOpenChange={(open) => {
          if (!open) {
            setActiveFilter(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{activeFilter?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {activeFilter?.options.map((option) => {
              const checked = draftSelections.includes(option);
              return (
                <label
                  key={option}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <Checkbox checked={checked} onCheckedChange={() => handleToggle(option)} />
                  {option}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveFilter(null)}>
              Annulla
            </Button>
            <Button onClick={handleSave}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
