"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { ShieldAlert, Mail, CalendarCheck } from "lucide-react";

import { companyAtom, companyListAtom } from "@/atoms/company.store";
import { isServiceActive, type ServiceKey } from "@/lib/services";
import { cn } from "@/lib/utils";

export function ServiceGate({
  service,
  children,
  className,
  showBlocked = true,
}: {
  service: ServiceKey;
  children: ReactNode;
  className?: string;
  showBlocked?: boolean;
}) {
  const company = useAtomValue(companyAtom);
  const companyList = useAtomValue(companyListAtom);

  const active = useMemo(
    () => isServiceActive(company?.services ?? null, service, true),
    [company?.services, service],
  );

  // Check if user has at least one OTHER company with the service active
  const hasOtherActiveAutoscuola = useMemo(() => {
    if (!company) return false;
    return companyList.some(
      (c) =>
        c.id !== company.id &&
        isServiceActive(c.services ?? null, service, true),
    );
  }, [company, companyList, service]);

  if (active) return <>{children}</>;
  if (!showBlocked) return null;

  const mailtoHref = `mailto:support@reglo.it?subject=${encodeURIComponent("Attivazione nuova sede autoscuola")}`;
  const calHref = "https://cal.com/reglo/analisi-strategica?duration=45";

  return (
    <div
      className={cn(
        "flex min-h-[60vh] items-center justify-center p-6",
        className,
      )}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-10 shadow-[var(--shadow-card-primary)] text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
          <ShieldAlert className="h-7 w-7 text-red-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Servizio non attivo
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Il servizio Reglo Autoscuole non è attualmente attivo per{" "}
            <span className="font-medium text-foreground">
              {company?.name ?? "la tua autoscuola"}
            </span>
            .
            {hasOtherActiveAutoscuola
              ? " Contatta il supporto per attivare questa sede."
              : " Prenota una call con il team Reglo per iniziare."}
          </p>
        </div>
        {hasOtherActiveAutoscuola ? (
          <a
            href={mailtoHref}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Mail className="h-4 w-4" />
            Contatta il supporto
          </a>
        ) : (
          <a
            href={calHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <CalendarCheck className="h-4 w-4" />
            Prenota una call
          </a>
        )}
      </div>
    </div>
  );
}
