"use client";

import React from "react";
import pdfFile from "../../../assets/pdfs/pdf_example.pdf";
import { Document, Page, pdfjs } from "react-pdf";
import useMeasure from "react-use-measure";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type PdfViewerProps = {
  file?: string;
  pageNumber?: number;
};

export function PdfViewer({
  file = pdfFile,
  pageNumber,
}: PdfViewerProps): React.ReactElement {
  const [numPages, setNumPages] = React.useState(1);
  const [containerRef, bounds] = useMeasure();
  const pageWidth = Math.max(1, Math.floor(bounds.width || 0));
  const activePage = pageNumber ?? numPages;

  const onDocumentLoaded = ({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
  };

  return (
    <div ref={containerRef} className="h-full w-full">
      <Document file={file} onLoadSuccess={onDocumentLoaded}>
        <Page
          pageNumber={activePage}
          width={pageWidth}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
    </div>
  );
}
