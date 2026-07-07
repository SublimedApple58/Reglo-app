"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import {
  LogOut,
  Settings,
  CreditCard,
  Users,
  CircleUserRound,
  Plus,
  Check,
  Menu,
} from "lucide-react";

import { companyAtom, companyListAtom, companyRefreshAtom } from "@/atoms/company.store";
import { userSessionAtom } from "@/atoms/user.store";
import { signOutUser } from "@/lib/actions/user.actions";
import { setActiveCompany } from "@/lib/actions/company.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/radix/dropdown-menu";
import { AutoscuoleNav } from "@/components/pages/Autoscuole/AutoscuoleNav";
import { isServiceActive } from "@/lib/services";

function companyInitials(name: string | null | undefined) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "R";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function AutoscuoleShell({ children }: { children: React.ReactNode }) {
  const company = useAtomValue(companyAtom);
  const companyList = useAtomValue(companyListAtom);
  const setCompanyRefresh = useSetAtom(companyRefreshAtom);
  const session = useAtomValue(userSessionAtom);
  const router = useRouter();
  const pathname = usePathname();
  const toast = useFeedbackToast();
  const searchParams = useSearchParams();
  // L'agenda è la landing (nessun ?tab) oltre che ?tab=agenda.
  const tabParam = searchParams.get("tab");
  const isAgenda = tabParam === "agenda" || (tabParam === null && /\/user\/autoscuole\/?$/.test(pathname ?? ""));
  const [agendaStoredMode, setAgendaStoredMode] = React.useState("instructor");
  React.useEffect(() => {
    if (!isAgenda) return;
    const stored = localStorage.getItem("reglo-agenda-mode") || "instructor";
    setAgendaStoredMode(stored);
    const handler = () => setAgendaStoredMode(localStorage.getItem("reglo-agenda-mode") || "instructor");
    window.addEventListener("storage", handler);
    // Also poll briefly to catch same-tab changes
    const interval = setInterval(handler, 300);
    return () => { window.removeEventListener("storage", handler); clearInterval(interval); };
  }, [isAgenda]);
  const isWideLayout = isAgenda && agendaStoredMode !== "classic";

  const handleCompanySwitch = React.useCallback(
    async (companyId: string) => {
      if (!company || companyId === company.id) return;
      const res = await setActiveCompany({ companyId });
      if (!res.success) {
        toast.error({
          description: res.message ?? "Impossibile cambiare autoscuola.",
        });
        return;
      }
      setCompanyRefresh(true);
      window.location.reload();
    },
    [company, toast, setCompanyRefresh],
  );

  const serviceActive = React.useMemo(
    () => isServiceActive(company?.services ?? null, "AUTOSCUOLE", true),
    [company?.services],
  );

  const initials = companyInitials(company?.name);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Top nav 84px — logo sx, tri-tab centrale, avatar + hamburger dx */}
      <header className="sticky top-0 z-30 h-[84px] w-full border-b border-border bg-[#f7f7f7]">
        <div className="mx-auto grid h-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-stretch px-4 lg:px-10">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/user/autoscuole" className="flex items-center">
              <Image
                src="/images/nav/logo-reglo-tight.png"
                alt="Reglo"
                width={30}
                height={30}
                className="block h-[30px] w-[30px] object-contain"
              />
            </Link>
          </div>

          {/* Tab centrali */}
          <div className="flex items-stretch justify-center overflow-x-auto [scrollbar-width:none]">
            {serviceActive && <AutoscuoleNav />}
          </div>

          {/* Avatar sede + hamburger */}
          <div className="flex items-center justify-end gap-2.5">
            {/* Avatar → switcher autoscuola */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-navy-900 transition-opacity hover:opacity-90"
                >
                  {company?.logoUrl ? (
                    <Image
                      src={company.logoUrl}
                      alt={company.name ?? "Autoscuola"}
                      width={38}
                      height={38}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold tracking-[-0.5px] text-white">{initials}</span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={10}
                className="w-72 rounded-2xl border-border p-4 text-center shadow-dropdown"
              >
                <div className="mx-auto mb-2.5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-navy-900">
                  {company?.logoUrl ? (
                    <Image
                      src={company.logoUrl}
                      alt={company.name ?? "Autoscuola"}
                      width={64}
                      height={64}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-bold tracking-[-0.5px] text-white">{initials}</span>
                  )}
                </div>
                <div className="mb-3 text-[17px] font-semibold text-foreground">
                  {company?.name ?? "Reglo"}
                </div>
                <div className="-mx-2 mb-3 border-t border-[#ededed]" />
                <div className="mb-2 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-[#929292]">
                  Le tue autoscuole
                </div>
                <div className="flex flex-col gap-1">
                  {companyList.map((entry) => (
                    <DropdownMenuItem
                      key={entry.id}
                      onClick={() => handleCompanySwitch(entry.id)}
                      className="cursor-pointer gap-3 rounded-xl p-2"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-900">
                        {entry.logoUrl ? (
                          <Image
                            src={entry.logoUrl}
                            alt={entry.name}
                            width={36}
                            height={36}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-bold text-white">
                            {companyInitials(entry.name)}
                          </span>
                        )}
                      </div>
                      <span className="flex-1 truncate text-left text-sm font-medium">
                        {entry.name}
                      </span>
                      {entry.id === company?.id && <Check className="h-4 w-4 text-foreground" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    className="cursor-pointer gap-3 rounded-xl p-2"
                    onClick={() => router.push("/select-company")}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-[#c1c1c1] bg-white">
                      <Plus className="h-4 w-4 text-foreground" />
                    </div>
                    <span className="flex-1 truncate text-left text-sm font-medium text-muted-foreground">
                      Nuova autoscuola
                    </span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Hamburger → menu sezioni secondarie */}
            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#f0f0f0] transition-colors hover:bg-[#e6e6e6]"
                    aria-label="Menu"
                  >
                    <Menu className="h-[17px] w-[17px] text-foreground" strokeWidth={1.9} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={10}
                  className="w-72 rounded-2xl border-border p-2 shadow-dropdown"
                >
                  <DropdownMenuItem
                    onClick={() => router.push("/user/autoscuole?tab=settings")}
                    className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                  >
                    <Settings className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    <span className="text-[15px] font-medium">Impostazioni dell&apos;account</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/user/autoscuole?tab=payments")}
                    className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                  >
                    <CreditCard className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    <span className="text-[15px] font-medium">Pagamenti</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/admin/users")}
                    className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                  >
                    <Users className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    <span className="text-[15px] font-medium">Utenti</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/user/settings")}
                    className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                  >
                    <CircleUserRound className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    <span className="text-[15px] font-medium">Profilo</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-2 bg-[#ededed]" />
                  <DropdownMenuItem
                    onClick={() => signOutUser()}
                    className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                  >
                    <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    <span className="text-[15px] font-medium">Esci</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className={`mx-auto flex w-full flex-1 flex-col gap-6 px-4 pt-6 pb-10 lg:gap-8 lg:px-10 lg:pt-8 lg:pb-12 ${isWideLayout ? "max-w-[1920px]" : "max-w-[1440px]"}`}>
        {children}
      </main>
    </div>
  );
}
