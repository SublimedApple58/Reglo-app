"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useAtomValue } from "jotai";

import { companyAtom } from "@/atoms/company.store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { isServiceActive, SERVICE_LABELS, type ServiceKey } from "@/lib/services";

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
  const router = useRouter();
  const locale = useLocale();

  const active = useMemo(
    () => isServiceActive(company?.services ?? null, service, true),
    [company?.services, service],
  );

  if (active) return <>{children}</>;
  if (!showBlocked) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 flex items-center justify-center p-6 pointer-events-none",
        className,
      )}
    >
      <Card className="glass-panel glass-strong w-full max-w-xl p-8 pointer-events-auto">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Servizio non attivo
          </p>
          <h2 className="text-xl font-semibold text-foreground">
            {SERVICE_LABELS[service]} non e&apos; abilitato
          </h2>
          <p className="text-sm text-muted-foreground">
            Questo modulo non e&apos; attivo per la tua company. Contatta Reglo per abilitarlo.
          </p>
          <div className="pt-2">
            <Button
              variant="default"
              onClick={() => {
                router.push(
                  `/${locale}/user/support?topic=service-activation&service=${service}`,
                );
              }}
            >
              Richiedi attivazione
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
