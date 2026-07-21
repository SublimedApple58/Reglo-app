"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import { Plus, Check, Menu } from "lucide-react";

// Icone del menu hamburger 1:1 dal proto (user-menu-dropdown)
import {
  BellProtoIcon,
  ClockProtoIcon,
  GearProtoIcon,
  HelpCircleProtoIcon,
  LogoutProtoIcon,
  StarProtoIcon,
  UserProtoIcon,
  UsersProtoIcon,
} from "@/components/ui/proto-icons";

import { companyAtom, companyListAtom, companyRefreshAtom } from "@/atoms/company.store";
import { userSessionAtom } from "@/atoms/user.store";
import { signOutUser } from "@/lib/actions/user.actions";
import { setActiveCompany } from "@/lib/actions/company.actions";
import { getSupportUnreadCount } from "@/lib/actions/support.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/radix/dropdown-menu";
import { AutoscuoleNav } from "@/components/pages/Autoscuole/AutoscuoleNav";
import {
  NOVITA_ENTRIES,
  NovitaDialog,
  type NovitaEntryKey,
} from "@/components/Layout/NovitaDialog";
import { ComunicatoDialog } from "@/components/Layout/ComunicatoDialog";
import { OwnerNotificationsBell } from "@/components/Layout/OwnerNotificationsBell";
import { FeedbackDialog } from "@/components/Layout/FeedbackDialog";
import { isSecretaryOnly, isServiceActive } from "@/lib/services";
import { cn } from "@/lib/utils";

// Sezione "Novità" del menu utente nascosta temporaneamente (2026-07-12).
const SHOW_NOVITA = false;

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
  const [novitaEntry, setNovitaEntry] = React.useState<NovitaEntryKey | null>(null);
  const [comunicatoOpen, setComunicatoOpen] = React.useState(false);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  // Risposte del team Reglo non ancora lette: pallino sull'hamburger + conteggio
  // sulla voce "Centro assistenza". Si azzera aprendo la chat (mark-read server).
  const [supportUnread, setSupportUnread] = React.useState(0);
  React.useEffect(() => {
    if (!session) return;
    let active = true;
    const load = async () => {
      const res = await getSupportUnreadCount();
      if (active && res.success && res.data) setSupportUnread(res.data.unread);
    };
    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
    // pathname: rientrando dalla chat il badge si aggiorna subito.
  }, [session, pathname]);

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
  // Modalità "solo Segretaria": nasconde le voci operative "guida" del menu.
  const secretaryOnly = React.useMemo(
    () => isSecretaryOnly(company?.services ?? null),
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
            {/* Campanella notifiche titolare (annullamenti allievi) */}
            {serviceActive && <OwnerNotificationsBell />}
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
                    className="relative flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#f0f0f0] transition-colors hover:bg-[#e6e6e6]"
                    aria-label="Menu"
                  >
                    <Menu className="h-[17px] w-[17px] text-foreground" strokeWidth={1.9} />
                    {supportUnread > 0 && (
                      <span className="absolute -right-px -top-px h-2.5 w-2.5 rounded-full border-2 border-white bg-[#c13515]" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={10}
                  className="w-72 rounded-2xl border-border p-2 shadow-dropdown"
                >
                  <DropdownMenuItem
                    onClick={() => router.push("/user/autoscuole/area-personale")}
                    className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                  >
                    <UserProtoIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    <span className="text-[15px] font-medium">Area personale</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/user/autoscuole?tab=settings")}
                    className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                  >
                    <GearProtoIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    <span className="text-[15px] font-medium">Impostazioni dell&apos;account</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/admin/users")}
                    className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                  >
                    <UsersProtoIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    <span className="text-[15px] font-medium">Utenti</span>
                  </DropdownMenuItem>
                  {!secretaryOnly && (
                    <DropdownMenuItem
                      onClick={() => router.push("/user/autoscuole/ore-guida")}
                      className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                    >
                      <ClockProtoIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      <span className="text-[15px] font-medium">Ore guida</span>
                    </DropdownMenuItem>
                  )}
                  {!secretaryOnly && (
                    <DropdownMenuItem
                      onClick={() => setComunicatoOpen(true)}
                      className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                    >
                      <BellProtoIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      <span className="text-[15px] font-medium">Invia comunicato</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => router.push("/user/autoscuole/assistenza")}
                    className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                  >
                    <HelpCircleProtoIcon className="h-[18px] w-[18px]" />
                    <span className="text-[15px] font-medium">Centro assistenza</span>
                    {supportUnread > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#c13515] px-1.5 text-[11px] font-bold text-white">
                        {supportUnread > 9 ? "9+" : supportUnread}
                      </span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setFeedbackOpen(true)}
                    className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                  >
                    <StarProtoIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    <span className="text-[15px] font-medium">Lascia un feedback</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-2 bg-[#ededed]" />
                  {/* Teaser referral (statico, come il proto) */}
                  <div className="flex cursor-default items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left">
                    <div className="min-w-0 flex-1 text-left">
                      <div className="mb-0.5 text-[15px] font-bold text-foreground">
                        Inizia a guadagnare
                      </div>
                      <div className="text-[12.5px] font-medium leading-snug text-[#6a6a6a]">
                        Fai conoscere Reglo ad un&apos;altra autoscuola e ricevi il 10%.
                      </div>
                    </div>
                    <Image
                      src="/images/menu/inizia-guadagnare.png"
                      alt=""
                      width={64}
                      height={64}
                      className="h-16 w-16 shrink-0 object-contain"
                    />
                  </div>
                  {/* Novità: timeline changelog — nascosta temporaneamente (2026-07-12,
                      richiesta utente); per riattivarla rimetti SHOW_NOVITA a true. */}
                  {SHOW_NOVITA && (
                  <>
                  <DropdownMenuSeparator className="my-2 bg-[#ededed]" />
                  <div className="px-3 pb-1 pt-1.5">
                    <div className="mb-2.5 text-left text-[13px] font-semibold tracking-[0.2px] text-[#929292]">
                      Novità
                    </div>
                    <div className="relative flex flex-col">
                      <div className="absolute bottom-[15px] left-[6px] top-[15px] w-0 border-l-[1.5px] border-dotted border-[#d4d4d4]" />
                      {NOVITA_ENTRIES.map((item) => (
                        <DropdownMenuItem
                          key={item.key}
                          onClick={() => setNovitaEntry(item.key)}
                          className="-mx-1.5 flex cursor-pointer items-start gap-3 rounded-[9px] px-1.5 py-[7px]"
                        >
                          <span
                            className={cn(
                              "relative z-[1] mt-0.5 h-[13px] w-[13px] shrink-0 rounded-full border-2",
                              item.latest
                                ? "border-navy-900 bg-[#eef0f6]"
                                : "border-[#c4c4c4] bg-white",
                            )}
                          />
                          <span className="text-left text-[14px] font-semibold leading-tight text-foreground">
                            {item.title}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </div>
                  </>
                  )}
                  <DropdownMenuSeparator className="my-2 bg-[#ededed]" />
                  <DropdownMenuItem
                    onClick={() => signOutUser()}
                    className="cursor-pointer gap-3 rounded-xl px-3 py-2.5"
                  >
                    <LogoutProtoIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
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

      {/* Dialog dal menu hamburger */}
      <NovitaDialog entry={novitaEntry} onClose={() => setNovitaEntry(null)} />
      <ComunicatoDialog open={comunicatoOpen} onOpenChange={setComunicatoOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  );
}
