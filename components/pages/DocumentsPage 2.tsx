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
import { useAtomValue } from "jotai";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useState, useCallback } from "react";

export function DocumentsPage(): React.ReactElement {
  const [showInput, setShowInput] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [value, setValue] = useState("");
  const totalSelected = useAtomValue(Documents.documentsRowsSelected);
  const totalRows = useAtomValue(Documents.rows);

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
      title: "Type",
      options: ["PDF", "CSV", "WORD"],
      param: "type",
    },
    {
      title: "Status",
      options: ["Approved", "Pending", "Declined"],
      param: "status",
    },
    {
      title: "Workflow",
      options: ["Validation", "New custumer", "New request"],
      param: "workflow",
    },
  ];

  return (
    <ClientPageWrapper title={"Documents"}>
      <div
        style={{
          width: "auto%",
          position: "fixed",
          display: "flex",
          justifyContent: "center",
          zIndex: 1000,
          right: 24,
        }}
      >
        <ManagementBar totalRows={totalRows ?? 0}/>
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
          <InputButtonProvider
            showInput={showInput}
            setShowInput={setShowInput}
          >
            <InputButton>
              <InputButtonAction onClick={() => {}}>
                <p style={{ color: "white" }}></p>
              </InputButtonAction>
              <InputButtonSubmit
                onClick={() => {}}
                type="submit"
              ></InputButtonSubmit>
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
              {
                ...(totalSelected && totalSelected > 0
                  ? { opacity: 1, transition: "all .3s ease-out" }
                  : { opacity: 0, transition: "all .3s ease-out" }),
              }
            }
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

      <div className="table_wrapper">
        <TableDocuments />
      </div>

      <div>

      </div>
    </ClientPageWrapper>
  );
}
