"use client";

import React from "react";
import useMeasure from "react-use-measure";
import { PdfViewer } from "@/components/pages/DocManager/PdfViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

type DocumentCanvasProps = {
  children?: React.ReactNode;
  containerRef?:
    | React.MutableRefObject<HTMLDivElement | null>
    | ((node: HTMLDivElement | null) => void);
  className?: string;
  scrollClassName?: string;
  pdfFile?: string;
  renderOverlay?: (
    pageNumber: number,
    pageRef: React.RefObject<HTMLDivElement>,
  ) => React.ReactNode;
  onPageCountChange?: (count: number) => void;
};

export function DocumentCanvas({
  children,
  containerRef,
  className,
  scrollClassName,
  pdfFile,
  renderOverlay,
  onPageCountChange,
}: DocumentCanvasProps): React.ReactElement {
  const [measureRef, bounds] = useMeasure();
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null) as React.MutableRefObject<
    HTMLDivElement | null
  >;
  const [viewportHeight, setViewportHeight] = React.useState<number | null>(null);
  const [pageCount, setPageCount] = React.useState(0);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageDraft, setPageDraft] = React.useState("1");
  const [editingPage, setEditingPage] = React.useState(false);
  const targetPageHeight =
    bounds.width > 0 ? Math.round(bounds.width * (11 / 8.5)) : null;
  const maxHeight = viewportHeight ? Math.max(420, viewportHeight - 180) : null;
  const minHeight =
    targetPageHeight && maxHeight
      ? Math.min(targetPageHeight, maxHeight)
      : targetPageHeight ?? undefined;

  React.useEffect(() => {
    const update = () => setViewportHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  React.useEffect(() => {
    if (!editingPage) {
      setPageDraft(String(currentPage));
    }
  }, [currentPage, editingPage]);

  React.useEffect(() => {
    if (!pdfFile) return;
    setCurrentPage(1);
    setPageDraft("1");
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0 });
    }
  }, [pdfFile]);

  React.useEffect(() => {
    if (pageCount > 0 && currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, pageCount]);

  const handlePageCommit = () => {
    const parsed = Number.parseInt(pageDraft, 10);
    const nextPage = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), Math.max(pageCount, 1))
      : 1;
    setCurrentPage(nextPage);
    setPageDraft(String(nextPage));
  };

  const handlePrevious = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNext = () => {
    if (!pageCount) return;
    setCurrentPage((prev) => Math.min(pageCount, prev + 1));
  };

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      scrollContainerRef.current = node;
      measureRef(node);
      if (!containerRef) return;
      if (typeof containerRef === "function") {
        containerRef(node);
        return;
      }
      containerRef.current = node;
    },
    [containerRef, measureRef],
  );

  return (
    <div className={cn("glass-panel flex-1 p-6", className)}>
      <div className="mx-auto w-full max-w-4xl">
        <div
          ref={setRefs}
          className={cn(
            "relative mx-auto w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-2xl border border-white/70 bg-white/80 shadow-[0_20px_55px_-45px_rgba(50,78,122,0.45)]",
            scrollClassName,
          )}
          style={{
            minHeight: minHeight ? `${minHeight}px` : undefined,
            maxHeight: maxHeight ? `${maxHeight}px` : undefined,
          }}
        >
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/70 bg-white/85 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handlePrevious}
                disabled={currentPage <= 1}
                className="h-7 w-7 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleNext}
                disabled={pageCount > 0 ? currentPage >= pageCount : true}
                className="h-7 w-7 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Pagina
              </span>
              <Input
                value={pageDraft}
                onChange={(event) =>
                  setPageDraft(event.target.value.replace(/[^\d]/g, ""))
                }
                onFocus={() => setEditingPage(true)}
                onBlur={() => {
                  setEditingPage(false);
                  handlePageCommit();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handlePageCommit();
                    (event.currentTarget as HTMLInputElement).blur();
                  }
                }}
                inputMode="numeric"
                className="h-7 w-14 rounded-md border border-white/70 bg-white/90 px-2 text-center text-xs shadow-inner"
              />
              <span className="text-xs text-muted-foreground">
                / {pageCount || 1}
              </span>
            </div>
          </div>
          <PdfViewer
            file={pdfFile}
            renderOverlay={renderOverlay}
            pageNumber={currentPage}
            onPageChange={setCurrentPage}
            onPageCountChange={(count) => {
              setPageCount(count);
              onPageCountChange?.(count);
            }}
            scrollContainerRef={scrollContainerRef}
          />
          {children}
        </div>
      </div>
    </div>
  );
}
