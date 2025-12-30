"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type DocumentHeaderProps = {
  title: string;
  subtitle: string;
  meta?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
};

export function DocumentHeader({
  title,
  subtitle,
  meta,
  backHref,
  backLabel = "BACK",
  actions,
}: DocumentHeaderProps): React.ReactElement {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-sm">
      <div className="flex items-center gap-4">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
        ) : null}
        <div>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </header>
  );
}
