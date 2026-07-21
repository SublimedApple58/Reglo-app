"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useAtomValue } from "jotai";

import { companyAtom } from "@/atoms/company.store";
import { isSecretaryOnly, isLicenseRenewalEnabled } from "@/lib/services";
import { cn } from "@/lib/utils";

/**
 * Top nav del redesign Airbnb: tab centrali con icona 3D sopra la label e
 * underline navy sull'attiva (stile tri-tab category picker). Dashboard non
 * esiste più: la landing è l'Agenda. Configurazione/Pagamenti/Utenti vivono
 * nel menu hamburger della shell.
 */
const navItems = [
  { label: "Agenda", tab: "agenda", icon: "/images/nav/agenda-3d.png" },
  { label: "Allievi", tab: "students", icon: "/images/nav/allievi-3d.png" },
  { label: "Segretaria", tab: "voice", icon: "/images/nav/segretaria-3d.png" },
  { label: "Rinnovi", tab: "rinnovi", icon: "/images/nav/rinnovi-3d.png" },
] as const;

export function AutoscuoleNav() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const locale = useLocale();
  const company = useAtomValue(companyAtom);

  const currentTab = searchParams.get("tab") ?? null;
  const basePath = `/${locale}/user/autoscuole`;
  const isOnAutoscuolePage = pathname === basePath;

  // Modalità "solo Segretaria": mostra unicamente la tab Segretaria.
  const secretaryOnly = isSecretaryOnly(company?.services ?? null);
  // Rinnovo Patenti: se la company non ha il modulo, la tab non esiste proprio.
  const renewalEnabled = isLicenseRenewalEnabled(company?.services ?? null);
  const items = secretaryOnly
    ? navItems.filter((item) => item.tab === "voice")
    : navItems.filter((item) => item.tab !== "rinnovi" || renewalEnabled);

  return (
    <nav className="flex h-full items-stretch justify-center overflow-x-auto [scrollbar-width:none]">
      {items.map((item) => {
        let isActive: boolean;
        if (item.tab === "voice") {
          isActive = pathname.startsWith(`${basePath}/voice`);
        } else if (isOnAutoscuolePage) {
          // L'agenda è la landing: attiva anche senza ?tab.
          isActive = currentTab === item.tab || (item.tab === "agenda" && currentTab === null);
        } else {
          isActive = false;
        }

        const href =
          item.tab === "voice" ? `${basePath}/voice` : `${basePath}?tab=${item.tab}`;

        return (
          <Link
            key={item.label}
            href={href}
            className={cn(
              "flex shrink-0 select-none flex-col items-center justify-center border-b-2 px-4 transition-colors sm:px-[22px]",
              isActive ? "border-navy-900" : "border-transparent",
            )}
          >
            <div className="mb-1 flex h-[46px] w-[46px] shrink-0 items-center justify-center">
              <Image
                src={item.icon}
                alt=""
                width={42}
                height={42}
                className="block h-[42px] w-[42px] object-contain"
              />
            </div>
            <span
              className={cn(
                "whitespace-nowrap text-xs transition-colors",
                isActive ? "font-semibold text-foreground" : "font-medium text-[#6a6a6a]",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
