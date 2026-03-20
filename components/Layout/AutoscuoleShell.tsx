"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useAtomValue } from "jotai";
import { LogOut, Settings } from "lucide-react";

import { companyAtom } from "@/atoms/company.store";
import { userSessionAtom, userAvatarUrlAtom } from "@/atoms/user.store";
import { signOutUser } from "@/lib/actions/user.actions";
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

export function AutoscuoleShell({ children }: { children: React.ReactNode }) {
  const company = useAtomValue(companyAtom);
  const session = useAtomValue(userSessionAtom);
  const avatarUrl = useAtomValue(userAvatarUrlAtom);

  const initials = React.useMemo(() => {
    const name = session?.user?.name?.trim();
    if (!name) return "R";
    return name.charAt(0).toUpperCase();
  }, [session?.user?.name]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      {/* Unified header: company + nav + avatar */}
      <header className="sticky top-6 z-30 mx-auto mt-8 mb-4 w-full max-w-6xl px-4 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          {/* Nav tabs — floating pill */}
          <AutoscuoleNav />

          {/* Company + Avatar — floating pill */}
          <div className="flex shrink-0 items-center gap-3 rounded-full border border-border/60 bg-white/85 px-4 py-2 shadow-card backdrop-blur-md">
            {/* Company */}
            <div className="hidden items-center gap-2 sm:flex">
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
            </div>

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
