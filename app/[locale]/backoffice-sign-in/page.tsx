"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { backofficeSignIn } from "@/lib/actions/backoffice.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { RegloMark } from "@/components/ui/reglo-mark";
import { Car, Shield } from "lucide-react";

export default function BackofficeSignInPage() {
  const router = useRouter();
  const toast = useFeedbackToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const res = await backofficeSignIn({ email, password });
      if (!res.success) {
        toast.error({ description: res.message ?? "Accesso non valido." });
        return;
      }
      router.push("/backoffice");
      router.refresh();
    });
  };

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-gray-50/50 px-6 py-10">
      {/* Brand gradient blurs */}
      <div className="pointer-events-none absolute -left-24 top-12 h-72 w-72 rounded-full bg-pink-500/15 blur-[100px]" />
      <div className="pointer-events-none absolute -right-24 bottom-12 h-72 w-72 rounded-full bg-yellow-400/20 blur-[100px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-48 w-48 -translate-x-1/2 rounded-full bg-pink-400/10 blur-[80px]" />

      <div className="w-full max-w-md space-y-8">
        {/* Brand header */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <RegloMark size={44} />
            <div>
              <p className="text-lg font-semibold text-foreground">Reglo Autoscuole</p>
              <p className="text-xs text-muted-foreground">Pannello di amministrazione</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-pink-200 bg-pink-50 px-3 py-1">
            <Shield className="h-3 w-3 text-pink-600" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-pink-700">
              Accesso riservato
            </span>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="rounded-2xl border border-border bg-white p-8 shadow-[var(--shadow-card-primary)]">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold text-foreground">Accedi</h1>
            <p className="text-sm text-muted-foreground">
              Inserisci le credenziali di amministrazione Reglo.
            </p>
          </div>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="bo-email">Email</Label>
              <Input
                id="bo-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@reglo.it"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bo-password">Password</Label>
              <Input
                id="bo-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button className="w-full" disabled={isPending} type="submit">
              {isPending ? "Accesso..." : "Accedi al pannello"}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          <Car className="mr-1 inline-block h-3 w-3" />
          Reglo Autoscuole &middot; Amministrazione
        </p>
      </div>
    </div>
  );
}
