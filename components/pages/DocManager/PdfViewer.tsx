"use client";

import React from "react";
import { Document, Page, pdfjs } from "react-pdf";
import useMeasure from "react-use-measure";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type PdfViewerProps = {
  file?: string;
  pageNumber?: number;
  maxPages?: number;
  onPageCountChange?: (count: number) => void;
  onPageChange?: (page: number) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  renderOverlay?: (
    pageNumber: number,
    pageRef: React.RefObject<HTMLDivElement>,
  ) => React.ReactNode;
};

export function PdfViewer({
  file,
  pageNumber,
  maxPages,
  onPageCountChange,
  onPageChange,
  scrollContainerRef,
  renderOverlay,
}: PdfViewerProps): React.ReactElement {
  const [numPages, setNumPages] = React.useState(0);
  const [isReady, setIsReady] = React.useState(false);
  const [containerRef, bounds] = useMeasure();
  const pageWidth = Math.max(1, Math.floor(bounds.width || 0));
  const pdfOptions = React.useMemo(
    () => ({ disableRange: true, disableStream: true }),
    [],
  );
  const renderPageCount = React.useMemo(() => {
    if (!numPages) return 0;
    return maxPages ? Math.min(numPages, maxPages) : numPages;
  }, [maxPages, numPages]);
  const pages = React.useMemo(() => {
    if (!renderPageCount) return [];
    return Array.from({ length: renderPageCount }, (_, index) => index + 1);
  }, [renderPageCount]);
  const pageRefs = React.useMemo(() => {
    const refs: Record<number, React.RefObject<HTMLDivElement>> = {};
    for (let page = 1; page <= renderPageCount; page += 1) {
      refs[page] = React.createRef<HTMLDivElement>();
    }
    return refs;
  }, [renderPageCount]);
  const lastReportedPage = React.useRef<number | null>(null);

  React.useEffect(() => {
    setNumPages(0);
    lastReportedPage.current = null;
    setIsReady(false);
  }, [file]);

  const onDocumentLoaded = ({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    onPageCountChange?.(total);
    if (onPageChange) {
      onPageChange(1);
    }
  };

  const updateActivePage = React.useCallback(() => {
    if (!isReady) return;
    const container = scrollContainerRef?.current;
    if (!container || renderPageCount === 0) return;
    const containerRect = container.getBoundingClientRect();
    const focusY = containerRect.top + containerRect.height / 2;
    let nextPage = 1;

    for (let page = 1; page <= renderPageCount; page += 1) {
      const pageEl = pageRefs[page]?.current;
      if (!pageEl) continue;
      const rect = pageEl.getBoundingClientRect();
      if (rect.top <= focusY && rect.bottom >= focusY) {
        nextPage = page;
        break;
      }
      if (rect.top < focusY) {
        nextPage = page;
      }
    }

    if (lastReportedPage.current !== nextPage) {
      lastReportedPage.current = nextPage;
      onPageChange?.(nextPage);
    }
  }, [isReady, onPageChange, pageRefs, renderPageCount, scrollContainerRef]);

  React.useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container || !isReady) return;
    let raf = 0;
    const handleScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateActivePage);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    updateActivePage();
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isReady, scrollContainerRef, updateActivePage]);

  React.useEffect(() => {
    if (!isReady) return;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(updateActivePage);
    });
    return () => cancelAnimationFrame(raf);
  }, [isReady, updateActivePage]);

  React.useEffect(() => {
    if (!pageNumber || !scrollContainerRef?.current) return;
    const container = scrollContainerRef.current;
    const target = pageRefs[pageNumber]?.current;
    if (!target) return;
    const targetTop = target.offsetTop;
    if (Math.abs(container.scrollTop - targetTop) < 4) return;
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [pageNumber, pageRefs, scrollContainerRef, renderPageCount]);

  if (!file) {
    return <div className="h-full w-full" />;
  }

  return (
    <div ref={containerRef} className="h-full w-full">
      <Document file={file} onLoadSuccess={onDocumentLoaded} options={pdfOptions}>
        <div className="flex flex-col gap-6 py-2">
          {pages.map((page) => (
            <div
              key={page}
              ref={pageRefs[page]}
              className="relative mx-auto w-full"
              style={{ width: pageWidth }}
            >
              <Page
                pageNumber={page}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onRenderSuccess={() => {
                  if (!isReady && page === 1) {
                    setIsReady(true);
                  }
                }}
              />
              {renderOverlay ? renderOverlay(page, pageRefs[page]) : null}
            </div>
          ))}
        </div>
      </Document>
    </div>
  );
}
