"use client";

import { useAtomValue } from "jotai";

import { companyAtom } from "@/atoms/company.store";
import { SelectItem } from "@/components/ui/select";
import {
  LICENSE_CATEGORY_LABELS,
  licenseCategoriesForMode,
} from "@/lib/autoscuole/license";
import { isConsortium } from "@/lib/services";

/**
 * Opzioni <SelectItem> per i picker "Categoria patente", filtrate in base alla
 * modalità della company attiva: consorzio → superiori + qualificazioni
 * (C/CE/D/DE/C1/D1/CQC/ADR), autoscuola → lista storica (B/BE/C/CE/D/DE + moto).
 * Un solo punto di verità così le categorie consorzio non compaiono mai nei
 * picker delle autoscuole normali (e viceversa).
 */
export function LicenseCategorySelectItems({ className }: { className?: string }) {
  const company = useAtomValue(companyAtom);
  const consortium = isConsortium(company?.services ?? null);
  return (
    <>
      {licenseCategoriesForMode(consortium).map((cat) => (
        <SelectItem key={cat} value={cat} className={className}>
          {LICENSE_CATEGORY_LABELS[cat]}
        </SelectItem>
      ))}
    </>
  );
}
