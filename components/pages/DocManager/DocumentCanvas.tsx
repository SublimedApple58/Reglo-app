"use client";

import React from "react";
import { PdfViewer } from "@/components/pages/DocManager/PdfViewer";
import { cn } from "@/lib/utils";

type DocumentCanvasProps = {
  children?: React.ReactNode;
  containerRef?: React.Ref<HTMLDivElement>;
  className?: string;
  pdfFile?: string;
};

export function DocumentCanvas({
  children,
  containerRef,
  className,
  pdfFile,
}: DocumentCanvasProps): React.ReactElement {
  return (
    <div className={cn("flex-1 rounded-2xl bg-muted/40 p-6", className)}>
      <div className="mx-auto w-full max-w-4xl">
        <div
          ref={containerRef}
          className="relative mx-auto w-full overflow-hidden rounded-lg bg-white shadow-sm"
          style={{ aspectRatio: "8.5 / 11" }}
        >
          <PdfViewer file={pdfFile} />
          {children}
        </div>
      </div>
    </div>
  );
}
