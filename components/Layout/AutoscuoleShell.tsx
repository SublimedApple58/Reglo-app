"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import { LogOut, Settings, ChevronsUpDown, Plus, Check } from "lucide-react";

import { companyAtom, companyListAtom, companyRefreshAtom } from "@/atoms/company.store";
import { userSessionAtom, userAvatarUrlAtom } from "@/atoms/user.store";
import { signOutUser } from "@/lib/actions/user.actions";
import { setActiveCompany } from "@/lib/actions/company.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { UserAvatarFallback } from "@/components/ui/user-avatar-fallback";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/radix/dropdown-menu";
import { AutoscuoleNav } from "@/components/pages/Autoscuole/AutoscuoleNav";
import { isServiceActive } from "@/lib/services";

export function AutoscuoleShell({ children }: { children: React.ReactNode }) {
  const company = useAtomValue(companyAtom);
  const companyList = useAtomValue(companyListAtom);
  const setCompanyRefresh = useSetAtom(companyRefreshAtom);
  const session = useAtomValue(userSessionAtom);
  const avatarUrl = useAtomValue(userAvatarUrlAtom);
  const router = useRouter();
  const toast = useFeedbackToast();

  const initials = React.useMemo(() => {
    const name = session?.user?.name?.trim();
    if (!name) return "R";
    return name.charAt(0).toUpperCase();
  }, [session?.user?.name]);

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

  const hasMultipleCompanies = companyList.length > 1;

  const serviceActive = React.useMemo(
    () => isServiceActive(company?.services ?? null, "AUTOSCUOLE", true),
    [company?.services],
  );

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      {/* Unified header: company + nav + avatar */}
      <header className="sticky top-6 z-30 mx-auto mt-8 mb-4 w-full max-w-6xl px-4 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          {/* Nav tabs — floating pill (hidden when service inactive) */}
          {serviceActive && <AutoscuoleNav />}

          {/* Company + Avatar — floating pill */}
          <div className="flex shrink-0 items-center gap-3 rounded-full border border-border/60 bg-white/85 px-4 py-2 shadow-card backdrop-blur-md">
            {/* Company switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="hidden cursor-pointer items-center gap-2 transition-opacity hover:opacity-80 sm:flex"
                >
                  {company?.logoUrl ? (
                    <Image
                      src={company.logoUrl}
                      alt={company.name ?? "Company"}
                      width={22}
                      height={22}
                      className="h-6 w-6 rounded object-contain"
                    />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-yellow-100 text-[10px] font-bold text-yellow-700">
                      {(company?.name ?? "R").charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="hidden text-sm font-medium text-muted-foreground lg:block">
                    {company?.name ?? "Reglo"}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-lg">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Autoscuole
                </DropdownMenuLabel>
                {companyList.map((entry) => (
                  <DropdownMenuItem
                    key={entry.id}
                    onClick={() => handleCompanySwitch(entry.id)}
                    className="gap-2 p-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-sm border bg-background">
                      {entry.logoUrl ? (
                        <Image
                          src={entry.logoUrl}
                          alt={entry.name}
                          width={20}
                          height={20}
                          className="h-4 w-4 rounded-sm object-contain"
                        />
                      ) : (
                        <span className="text-xs font-semibold">
                          {entry.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="flex-1 truncate text-sm">{entry.name}</span>
                    {entry.id === company?.id && (
                      <Check className="h-4 w-4 text-muted-foreground" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 p-2"
                  onClick={() => router.push("/select-company")}
                >
                  <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                    <Plus className="size-4" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    Nuova autoscuola
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Divider */}
            <div className="hidden h-5 w-px bg-border/60 sm:block" />

            {/* Avatar */}
            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex shrink-0 cursor-pointer items-center rounded-full transition-opacity hover:opacity-80"
                  >
                    <Avatar className="h-8 w-8 rounded-full">
                      <AvatarImage src={avatarUrl ?? undefined} alt="User avatar" />
                      <UserAvatarFallback initials={initials} />
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-56 rounded-lg">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{session.user.name}</span>
                      <span className="text-xs text-muted-foreground">{session.user.email}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/user/settings" className="flex w-full items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Impostazioni
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOutUser()} className="text-destructive">
                    <LogOut className="h-4 w-4" />
                    Esci
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 pt-8 pb-10 lg:gap-8 lg:px-6 lg:pt-10 lg:pb-12">
        {children}
      </main>
    </div>
  );
}
