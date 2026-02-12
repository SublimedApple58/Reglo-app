"use client";

import type { ReactElement, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SidebarInset } from "../ui/sidebar";
import { ClientHeader } from "./ClientHeader";
import { cn } from "@/lib/utils";

export default function ClientPageWrapper({
  children = "",
  title = "",
  subTitle,
  parentTitle,
  enableBackNavigation = false,
  backHref,
  hideHero = false,
  contentWidthClassName,
}: {
  children?: ReactNode;
  title?: string;
  subTitle?: string;
  parentTitle?: string;
  enableBackNavigation?: boolean;
  backHref?: string;
  hideHero?: boolean;
  contentWidthClassName?: string;
}): ReactElement {
  const router = useRouter();
  const label = parentTitle;
  const heading = title || parentTitle || "Workspace overview";

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
      return;
    }
    router.back();
  };

  return (
    <SidebarInset>
      <ClientHeader
        title={<span className="text-sm font-medium">{heading}</span>}
        parentTitle={parentTitle}
      />
      <div className="relative flex flex-1">
        <main className="relative flex-1 px-3 pb-10 pt-4 lg:px-5 lg:pt-5">
          <div
            className={cn(
              "flex h-full w-full flex-col gap-4 lg:gap-5",
              contentWidthClassName ?? "max-w-7xl",
            )}
          >
            {!hideHero && (
              <header className="space-y-1.5">
                {enableBackNavigation && label ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="reglo-focus-ring inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary transition hover:text-primary/70"
                  >
                    <span className="text-[13px] leading-none">←</span>
                    {label}
                  </button>
                ) : (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                    {label || "Reglo"}
                  </p>
                )}
                <h1 className="text-lg font-semibold text-foreground lg:text-xl">
                  {heading}
                </h1>
                {subTitle ? (
                  <p className="text-sm text-muted-foreground">
                    {subTitle}
                  </p>
                ) : null}
              </header>
            )}

            {!hideHero && <div className="glass-divider" />}

            <section className="flex flex-1 flex-col">{children}</section>
          </div>
        </main>
      </div>
    </SidebarInset>
  );
}
