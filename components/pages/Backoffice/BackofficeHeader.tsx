"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { RegloMark } from "@/components/ui/reglo-mark";
import { backofficeSignOut } from "@/lib/actions/backoffice.actions";

export function BackofficeHeader() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      await backofficeSignOut();
      router.push("/backoffice-sign-in");
      router.refresh();
    });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <RegloMark size={32} />
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold text-foreground">
              Reglo Autoscuole
            </span>
            <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-pink-700">
              Admin
            </span>
          </div>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Esci</span>
        </button>
      </div>
    </header>
  );
}
