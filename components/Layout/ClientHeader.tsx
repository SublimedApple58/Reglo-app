"use client";

import type { ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
} from "../ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/animate-ui/radix/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

export function ClientHeader({
  title,
  parentTitle,
}: {
  title: ReactNode;
  parentTitle?: ReactNode;
}) {
  const isMobile = useIsMobile();

  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center border-b border-white/70 bg-background/86 backdrop-blur-xl transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-2 px-3 lg:gap-3 lg:px-6">
        {isMobile && (
          <>
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mx-2 data-[orientation=vertical]:h-4"
            />
          </>
        )}
        <div className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
          <Breadcrumb>
            <BreadcrumbList className="flex items-center gap-2">
              <BreadcrumbItem className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Reglo
              </BreadcrumbItem>
              {parentTitle ? (
                <>
                  <span className="text-[10px] text-muted-foreground/60">/</span>
                  <BreadcrumbItem className="text-sm text-foreground/80">
                    {parentTitle}
                  </BreadcrumbItem>
                </>
              ) : null}
              {title ? (
                <>
                  <span className="text-[10px] text-muted-foreground/60">/</span>
                  <BreadcrumbItem className="text-sm font-semibold text-foreground">
                    {title}
                  </BreadcrumbItem>
                </>
              ) : null}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="ml-auto flex items-center gap-2" />
      </div>
    </header>
  );
}
