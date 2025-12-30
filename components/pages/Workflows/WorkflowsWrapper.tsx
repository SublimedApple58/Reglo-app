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
import slugify from "slugify";

export function WorkflowsWrapper(): React.ReactElement {
  const [showInput, setShowInput] = useState(false);
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
    <ClientPageWrapper title="Workflows">
      <div
        style={{
          position: "fixed",
          display: "flex",
          justifyContent: "center",
          zIndex: 1000,
          right: 24,
        }}
      >
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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          marginBlock: 16,
        }}
      >
        <form onSubmit={handleSubmit} style={{ width: "200px" }}>
          <InputButtonProvider showInput={showInput} setShowInput={setShowInput}>
            <InputButton>
              <InputButtonAction onClick={() => {}}>
                <p style={{ color: "white" }}></p>
              </InputButtonAction>
              <InputButtonSubmit onClick={() => {}} type="submit"></InputButtonSubmit>
            </InputButton>
            <InputButtonInput
              type="text"
              placeholder="Search..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </InputButtonProvider>
        </form>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignContent: "start",
          }}
        >
          <Filters filtersParams={filtersParamters} />

          <div
            className="text-sm text-gray-600 flex items-center gap-1"
            style={
              totalSelected && totalSelected > 0
                ? { opacity: 1, transition: "all .3s ease-out" }
                : { opacity: 0, transition: "all .3s ease-out" }
            }
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

      <div className="table_wrapper">
        <WorkflowsTable selectable />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo workflow</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = workflowName.trim();
              if (!trimmed) return;
              const slug =
                slugify(trimmed, { lower: true, strict: true }) ||
                `workflow-${Date.now()}`;
              const params = new URLSearchParams();
              params.set("mode", "new");
              params.set("name", trimmed);
              router.push(`${pathname}/${slug}?${params.toString()}`);
              setWorkflowName("");
              setCreateOpen(false);
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
