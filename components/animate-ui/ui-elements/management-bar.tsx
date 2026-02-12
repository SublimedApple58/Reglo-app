"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SlidingNumber } from "@/components/animate-ui/text/sliding-number";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGE_DIMENSION = 20;

type ManagementAction = {
  id?: string;
  label: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  onClick?: () => void;
  variant?: React.ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
};

function ManagementBar({
  totalRows,
  pageSize = PAGE_DIMENSION,
  actions = [],
  className,
}: {
  totalRows: number;
  pageSize?: number;
  actions?: ManagementAction[];
  className?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pageParam = searchParams.get("page");

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalRows / pageSize)),
    [pageSize, totalRows],
  );

  const currentPage = useMemo(() => {
    const parsed = Number(pageParam);
    if (!pageParam || Number.isNaN(parsed) || parsed < 1) return 1;
    return Math.min(parsed, totalPages);
  }, [pageParam, totalPages]);

  useEffect(() => {
    if (!pageParam) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", "1");
      router.replace(`${pathname}?${params}`);
    }
  }, [pageParam, pathname, router, searchParams]);

  const updatePage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", nextPage.toString());
    router.replace(`${pathname}?${params}`);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) updatePage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) updatePage(currentPage + 1);
  };

  return (
    <div
      className={cn(
        "glass-panel glass-strong flex w-full max-w-full flex-wrap items-center gap-y-2 p-2 md:w-fit",
        className,
      )}
    >
      <div className="mx-auto flex shrink-0 items-center">
        <Button
          size="icon"
          variant="ghost"
          disabled={currentPage === 1}
          onClick={handlePrevPage}
        >
          <ChevronLeft size={20} />
        </Button>
        <div className="mx-2 flex items-center space-x-1 text-sm tabular-nums">
          <SlidingNumber
            className="text-foreground"
            padStart
            number={currentPage}
          />
          <span className="text-muted-foreground">/ {totalPages}</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          disabled={currentPage === totalPages}
          onClick={handleNextPage}
        >
          <ChevronRight size={20} />
        </Button>
      </div>

      {actions.length ? (
        <>
          <div className="mx-3 h-6 w-px rounded-full bg-border" />
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.id ?? `${action.label}-${index}`}
                  variant={action.variant ?? "outline"}
                  size="sm"
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                  {action.label}
                </Button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

export { ManagementBar };
