import type { Metadata } from "next";

import { InvestorKpiPage } from "@/components/pages/Investor/InvestorKpiPage";
import {
  asInvestorPeriod,
  buildInvestorKpis,
  resolveInvestorLink,
} from "@/lib/investor/investor-kpi";

// Mai indicizzata: il link è condivisibile, non scopribile.
export const metadata: Metadata = {
  title: "Reglo in numeri",
  robots: { index: false, follow: false, nocache: true },
};

// Niente cache di pagina: il contatore delle visite deve vedere ogni apertura e
// i numeri devono essere quelli di adesso. Il calcolo costa ~200ms su volumi
// come i nostri e la pagina la aprono cinque persone, non cinquemila.
export const dynamic = "force-dynamic";

function LinkNotValid({ reason }: { reason: "unknown" | "revoked" | "expired" }) {
  const text =
    reason === "revoked"
      ? "Questo link è stato revocato."
      : reason === "expired"
        ? "Questo link è scaduto."
        : "Questo link non è valido.";
  return (
    <main className="flex min-h-svh items-center justify-center bg-white px-6">
      <div className="max-w-[34ch] text-center">
        <p className="text-[17px] font-semibold text-[#12121c]">{text}</p>
        <p className="mt-2 text-[14.5px] font-medium leading-relaxed text-[#8a8a98]">
          Chiedi un nuovo collegamento a chi te l&apos;ha mandato.
        </p>
      </div>
    </main>
  );
}

export default async function InvestorKpiRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, token } = await params;
  const query = await searchParams;

  const link = await resolveInvestorLink(token);
  if (!link.ok) return <LinkNotValid reason={link.reason} />;

  const period = asInvestorPeriod(query.p);
  const kpis = await buildInvestorKpis(period);
  if (!kpis) return <LinkNotValid reason="unknown" />;

  return (
    <InvestorKpiPage
      kpis={kpis}
      label={link.label}
      basePath={`/${locale}/investor/${token}`}
    />
  );
}
