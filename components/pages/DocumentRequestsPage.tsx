"use client";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { TableDocumentRequests } from "@/components/ui/TableDocumentRequests";
import {
  InputButton,
  InputButtonAction,
  InputButtonInput,
  InputButtonProvider,
  InputButtonSubmit,
} from "@/components/animate-ui/buttons/input";
import { ManagementBar } from "@/components/animate-ui/ui-elements/management-bar";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";

export function DocumentRequestsPage(): React.ReactElement {
  const [showInput, setShowInput] = React.useState(true);
  const [value, setValue] = React.useState("");
  const [totalRows, setTotalRows] = React.useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSubmit = React.useCallback(
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
      params.set("page", "1");
      router.push(`${pathname}?${params}`);
    },
    [showInput, value, pathname, router, searchParams],
  );

  return (
    <ClientPageWrapper
      title="Compilazioni"
      subTitle="Documenti in fase di compilazione o completati."
    >
      <div
        style={{
          position: "fixed",
          display: "flex",
          justifyContent: "center",
          zIndex: 1000,
          right: 24,
        }}
      >
        <ManagementBar totalRows={totalRows} />
      </div>
      <div className="glass-panel glass-strong flex flex-col gap-4 p-4">
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
              placeholder="Cerca compilazioni"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="border-white/60 bg-white/80 pr-14 text-sm shadow-sm"
              autoFocus
            />
          </InputButtonProvider>
        </form>
      </div>
      <div className="glass-panel glass-strong p-4">
        <TableDocumentRequests onRowsChange={setTotalRows} />
      </div>
    </ClientPageWrapper>
  );
}
