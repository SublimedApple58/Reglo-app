"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { backofficeSignIn } from "@/lib/actions/backoffice.actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFeedbackToast } from "@/components/ui/feedback-toast";

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
    <div className="min-h-svh bg-background flex items-center justify-center px-6 py-10">
      <Card className="glass-panel glass-strong w-full max-w-md p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Reglo Backoffice
          </p>
          <h1 className="text-2xl font-semibold text-foreground">Accedi</h1>
          <p className="text-sm text-muted-foreground">
            Inserisci le credenziali globali di Reglo.
          </p>
        </div>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="bo-email">Email</Label>
            <Input
              id="bo-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tiziano.difelice@reglo.it"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bo-password">Password</Label>
            <Input
              id="bo-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••"
            />
          </div>
          <Button className="w-full" disabled={isPending} type="submit">
            {isPending ? "Accesso..." : "Entra nel backoffice"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
