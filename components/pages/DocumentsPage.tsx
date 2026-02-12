"use client";

import { Documents } from "@/atoms/TabelsStore";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import {
  InputButton,
  InputButtonAction,
  InputButtonInput,
  InputButtonProvider,
  InputButtonSubmit,
} from "@/components/animate-ui/buttons/input";
import { SlidingNumber } from "@/components/animate-ui/text/sliding-number";
import { ManagementBar } from "@/components/animate-ui/ui-elements/management-bar";
import { TableDocuments } from "@/components/ui/TableDocuments";
import Filters from "@/components/ui/filters";
import { useAtomValue, useSetAtom } from "jotai";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useState, useCallback } from "react";
import { ArrowUpFromLine, FilePlus2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function DocumentsPage(): React.ReactElement {
  const [showInput, setShowInput] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [value, setValue] = useState("");
  const totalSelected = useAtomValue(Documents.documentsRowsSelected);
  const totalRows = useAtomValue(Documents.rows);
  const triggerDelete = useSetAtom(Documents.documentsDeleteRequest);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!showInput) {
        setShowInput(true);
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }

      router.push(`${pathname}?${params}`);
    },
    [showInput, value, pathname, router, searchParams],
  );

  const filtersParamters = [
    {
      title: "Status",
      options: [
        "Bozza",
        "Configurato",
        "Bindato",
        "AI",
      ],
      param: "status",
    },
  ];

  return (
    <ClientPageWrapper title={"Documents"} subTitle="Archivio template e documenti pronti alla compilazione.">
      <div className="glass-panel glass-strong flex flex-col gap-4 p-4">
        <div className="flex w-full justify-end">
          <ManagementBar
            totalRows={totalRows ?? 0}
            actions={[
              {
                id: "delete",
                label: "Elimina",
                icon: Trash2,
                variant: "destructive",
                disabled: !totalSelected,
                onClick: () => triggerDelete((prev) => prev + 1),
              },
              {
                id: "create",
                label: "Crea documento",
                icon: FilePlus2,
                variant: "default",
              },
              {
                id: "upload",
                label: "Upload",
                icon: ArrowUpFromLine,
                variant: "outline",
              },
            ]}
          />
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <form onSubmit={handleSubmit} className="w-full md:max-w-sm">
            <InputButtonProvider
              showInput={showInput}
              setShowInput={setShowInput}
              className="w-full"
            >
              <InputButton className="w-full">
                <InputButtonAction className="hidden" />
                <InputButtonSubmit
                  onClick={() => {}}
                  type="submit"
                  className="bg-foreground text-background hover:bg-foreground/90"
                />
              </InputButton>
              <InputButtonInput
                type="text"
                placeholder="Cerca documenti"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="border-white/60 bg-white/80 pr-14 text-sm shadow-sm"
                autoFocus
              />
            </InputButtonProvider>
          </form>
          <div className="flex items-center justify-between gap-4">
            <Filters filtersParams={filtersParamters} />
            <div
              className={cn(
                "glass-chip flex items-center gap-1 text-[11px]",
                totalSelected && totalSelected > 0 ? "opacity-100" : "opacity-0",
              )}
              style={{ transition: "all .3s ease-out" }}
            >
              Selected{" "}
              {totalSelected && totalSelected > 0 ? (
                <SlidingNumber
                  style={{ display: "inline" }}
                  number={totalSelected}
                />
              ) : (
                "0"
              )}{" "}
              out of{" "}
              {totalSelected && totalRows ? (
                <SlidingNumber number={totalRows} />
              ) : (
                "0"
              )}{" "}
              rows.
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel glass-strong p-4">
        <TableDocuments />
      </div>
    </ClientPageWrapper>
  );
}
