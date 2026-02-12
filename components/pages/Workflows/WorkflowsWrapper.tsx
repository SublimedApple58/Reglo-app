"use client";

import React, { useCallback, useState } from "react";
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
import Filters from "@/components/ui/filters";
import { useAtomValue, useSetAtom } from "jotai";
import { Workflows } from "@/atoms/TabelsStore";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkflowsTable } from "./WorkflowsTable";
import { Ban, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { createWorkflow } from "@/lib/actions/workflow.actions";
import { cn } from "@/lib/utils";

export function WorkflowsWrapper(): React.ReactElement {
  const [showInput, setShowInput] = useState(true);
  const [value, setValue] = useState("");
  const totalSelected = useAtomValue(Workflows.workflowsRowsSelected);
  const totalRows = useAtomValue(Workflows.rows);
  const triggerDelete = useSetAtom(Workflows.workflowsDeleteRequest);
  const triggerDisable = useSetAtom(Workflows.workflowsDisableRequest);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const toast = useFeedbackToast();

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
      title: "Owner",
      options: ["Amministrazione", "Produzione", "Team tech", "Team sales"],
      param: "owner",
    },
    {
      title: "Status",
      options: ["Active", "Draft", "Paused", "Review", "Disattivato"],
      param: "status",
    },
  ];

  return (
    <ClientPageWrapper
      title="Workflows"
      subTitle="Crea, organizza e monitora le automazioni della tua company."
    >
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
                id: "disable",
                label: "Disattiva",
                icon: Ban,
                variant: "outline",
                disabled: !totalSelected,
                onClick: () => triggerDisable((prev) => prev + 1),
              },
              {
                id: "create",
                label: "Crea workflow",
                icon: Plus,
                variant: "default",
                onClick: () => setCreateOpen(true),
              },
            ]}
          />
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <form onSubmit={handleSubmit} className="w-full md:max-w-sm">
            <InputButtonProvider showInput={showInput} setShowInput={setShowInput} className="w-full">
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
                placeholder="Cerca workflow"
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
                <SlidingNumber style={{ display: "inline" }} number={totalSelected} />
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
        <WorkflowsTable selectable />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md glass-panel glass-strong">
          <DialogHeader>
            <DialogTitle>Nuovo workflow</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = workflowName.trim();
              if (!trimmed) return;
              (async () => {
                const res = await createWorkflow({ name: trimmed });
                if (!res.success || !res.data) {
                  toast.error({
                    description: res.message ?? "Impossibile creare il workflow.",
                  });
                  return;
                }
                router.push(`${pathname}/${res.data.id}`);
                setWorkflowName("");
                setCreateOpen(false);
              })();
            }}
          >
            <Input
              value={workflowName}
              onChange={(event) => setWorkflowName(event.target.value)}
              placeholder="Nome workflow"
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={!workflowName.trim()}>
                Crea
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ClientPageWrapper>
  );
}
