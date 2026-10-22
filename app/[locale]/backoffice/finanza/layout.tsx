import type { ReactNode } from "react";

import { FinanceTabs } from "@/components/pages/Backoffice/finance/FinanceTabs";

/**
 * Sezione Finanza del backoffice (REG-413): i conti di Reglo. L'accesso è
 * già protetto dal layout del backoffice (`requireGlobalAdmin`).
 */
export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 lg:px-6">
      <div className="mb-5">
        <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-[#111111]">Finanza</h1>
        <p className="mt-1 text-sm text-[#71717a]">
          Entrate, uscite e previsioni di Reglo · importi IVA inclusa
        </p>
      </div>
      <FinanceTabs />
      {children}
    </div>
  );
}
