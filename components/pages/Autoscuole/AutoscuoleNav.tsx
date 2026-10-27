"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useAtomValue } from "jotai";

import { companyAtom } from "@/atoms/company.store";
import { isConsortium, isRoadEnabled, isSecretaryOnly } from "@/lib/services";
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
  // Reglo Road (REG-638): solo se il modulo è acceso dal backoffice.
  { label: "Road", tab: "road", icon: "/images/nav/road-3d.png" },
  { label: "Segretaria", tab: "voice", icon: "/images/nav/segretaria-3d.png" },
  { label: "Rinnovi", tab: "rinnovi", icon: "/images/nav/rinnovi-3d.png" },
] as const;

// Modalità consorzio: stessa shell, tab dedicate (l'agenda è identica).
const consortiumNavItems = [
  { label: "Agenda", tab: "agenda", icon: "/images/nav/agenda-3d.png" },
  { label: "Autoscuole", tab: "scuole", icon: "/images/nav/autoscuole-3d.png" },
  { label: "Fatturazione", tab: "fatturazione", icon: "/images/nav/fatturazione-3d.png" },
] as const;

/**
 * `variant="top"`: tab centrali dell'header (da `md` in su).
 * `variant="bottom"`: barra fissa in basso sotto `md`, come una tab bar di
 * app (design-system §8b).
 */
export function AutoscuoleNav({ variant = "top" }: { variant?: "top" | "bottom" }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const locale = useLocale();
  const company = useAtomValue(companyAtom);

  const currentTab = searchParams.get("tab") ?? null;
  const basePath = `/${locale}/user/autoscuole`;
  const isOnAutoscuolePage = pathname === basePath;

  // Modalità "solo Segretaria": mostra unicamente la tab Segretaria.
  // Modalità consorzio: Agenda | Autoscuole | Fatturazione.
  const secretaryOnly = isSecretaryOnly(company?.services ?? null);
  const consortium = isConsortium(company?.services ?? null);
  const roadEnabled = isRoadEnabled(company?.services ?? null);
  const items = secretaryOnly
    ? navItems.filter((item) => item.tab === "voice")
    : consortium
      ? consortiumNavItems
      : navItems.filter((item) => item.tab !== "road" || roadEnabled);

  const resolve = (item: (typeof items)[number]) => {
    let isActive: boolean;
    // Segretaria e Road sono pagine vere (non tab di ?tab=).
    const ownPage = item.tab === "voice" || item.tab === "road";
    if (ownPage) {
      isActive = pathname.startsWith(`${basePath}/${item.tab}`);
    } else if (isOnAutoscuolePage) {
      // L'agenda è la landing: attiva anche senza ?tab.
      isActive = currentTab === item.tab || (item.tab === "agenda" && currentTab === null);
    } else {
      isActive = false;
    }
    const href = ownPage ? `${basePath}/${item.tab}` : `${basePath}?tab=${item.tab}`;
    return { isActive, href };
  };

  if (variant === "bottom") {
    if (items.length < 2) return null;
    return (
      <nav
        aria-label="Navigazione principale"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="mx-auto flex h-16 max-w-md items-stretch">
          {items.map((item) => {
            const { isActive, href } = resolve(item);
            return (
              <Link
                key={item.label}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className="relative flex min-w-0 flex-1 select-none flex-col items-center justify-center gap-0.5 active:bg-[#f5f5f5]"
              >
                <span
                  className={cn(
                    "absolute inset-x-6 top-0 h-[2px] rounded-full transition-colors",
                    isActive ? "bg-foreground" : "bg-transparent",
                  )}
                />
                <Image
                  src={item.icon}
                  alt=""
                  width={30}
                  height={30}
                  className={cn(
                    "block h-[30px] w-[30px] object-contain transition-opacity",
                    !isActive && "opacity-70",
                  )}
                />
                <span
                  className={cn(
                    "max-w-full truncate px-1 text-[11px] leading-tight",
                    isActive ? "font-semibold text-foreground" : "font-medium text-[#6a6a6a]",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav className="flex h-full items-stretch justify-center overflow-x-auto [scrollbar-width:none]">
      {items.map((item) => {
        const { isActive, href } = resolve(item);

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
