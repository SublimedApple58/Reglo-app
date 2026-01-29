"use client";

import type { ReactElement, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SidebarInset } from "../ui/sidebar";
import { ClientHeader } from "./ClientHeader";

export default function ClientPageWrapper({
  children = "",
  title = "",
  subTitle,
  parentTitle,
  enableBackNavigation = false,
  backHref,
  hideHero = false,
}: {
  children?: ReactNode;
  title?: string;
  subTitle?: string;
  parentTitle?: string;
  enableBackNavigation?: boolean;
  backHref?: string;
  hideHero?: boolean;
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
        {/* <div className="pointer-events-none absolute inset-0 opacity-80 [background-image:linear-gradient(120deg,rgba(59,130,246,0.06),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.05),transparent_30%),linear-gradient(to_bottom,transparent_70%,rgba(0,0,0,0.02))]" /> */}
        <main className="relative flex-1 px-3 pb-10 pt-4 lg:px-6 lg:pt-6">
          <div className="flex h-full w-full max-w-7xl flex-col gap-5 lg:gap-6">
            {!hideHero && (
              <header className="space-y-2">
                {enableBackNavigation && label ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary transition hover:text-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
                  >
                    <span className="text-[13px] leading-none">←</span>
                    {label}
                  </button>
                ) : (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                    {label || "Reglo"}
                  </p>
                )}
                <h1 className="text-xl font-semibold text-foreground lg:text-2xl">
                  {heading}
                </h1>
                {subTitle ? (
                  <p className="text-sm text-muted-foreground">
                    {subTitle}
                  </p>
                ) : null}
              </header>
            )}

            {!hideHero && <div className="h-px w-full bg-border" />}

            <section className="flex flex-1 flex-col rounded-2xl bg-background/90 backdrop-blur">
              <div className="flex-1 rounded-xl bg-card ">
                {children}
              </div>
            </section>
          </div>
        </main>
      </div>
    </SidebarInset>
  );
}
