"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MailCheck } from "lucide-react";

import { backofficeSignIn, requestBackofficeLink } from "@/lib/actions/backoffice-access.actions";
import { BackofficeAuthShell } from "@/components/pages/Backoffice/BackofficeAuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFeedbackToast } from "@/components/ui/feedback-toast";

/**
 * Accesso al backoffice (REG-413): ognuno con la propria email Reglo e la
 * propria password. Chi entra per la prima volta, o non ricorda la password,
 * si fa mandare un link alla propria mail.
 */
export default function BackofficeSignInPage() {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const toast = useFeedbackToast();
  const [mode, setMode] = useState<"password" | "link" | "linkSent">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSignIn = (event: React.FormEvent) => {
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

  const handleRequestLink = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      await requestBackofficeLink({ email, locale: params?.locale ?? "it" });
      setMode("linkSent");
    });
  };

  if (mode === "linkSent") {
    return (
      <BackofficeAuthShell>
        <div className="flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f2f2]">
            <MailCheck className="h-5 w-5 text-[#111111]" />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-[#111111]">Controlla la posta</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6a6a6a]">
            Se <span className="font-medium text-[#222222]">{email}</span> ha accesso al pannello,
            ti è arrivato un link per scegliere la password. Vale 30 minuti.
          </p>
          <button
            type="button"
            onClick={() => setMode("password")}
            className="mt-6 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-[#222222] underline decoration-1 underline-offset-4 hover:opacity-70"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Torna all&apos;accesso
          </button>
        </div>
      </BackofficeAuthShell>
    );
  }

  if (mode === "link") {
    return (
      <BackofficeAuthShell>
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-[#111111]">Primo accesso o password dimenticata</h1>
          <p className="text-sm text-[#6a6a6a]">
            Scrivi la tua email Reglo: ti mandiamo un link per scegliere la password.
          </p>
        </div>
        <form className="mt-6 space-y-4" onSubmit={handleRequestLink}>
          <div className="space-y-2">
            <Label htmlFor="bo-link-email">Email</Label>
            <Input
              id="bo-link-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome.cognome@reglo.it"
            />
          </div>
          <Button className="w-full" disabled={isPending} type="submit">
            {isPending ? "Invio…" : "Mandami il link"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode("password")}
          className="mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 text-sm font-medium text-[#6a6a6a] hover:text-[#111111]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Ho già la password
        </button>
      </BackofficeAuthShell>
    );
  }

  return (
    <BackofficeAuthShell>
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold text-[#111111]">Accedi</h1>
        <p className="text-sm text-[#6a6a6a]">Entra con la tua email Reglo e la tua password.</p>
      </div>
      <form className="mt-6 space-y-4" onSubmit={handleSignIn}>
        <div className="space-y-2">
          <Label htmlFor="bo-email">Email</Label>
          <Input
            id="bo-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nome.cognome@reglo.it"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bo-password">Password</Label>
          <Input
            id="bo-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••••"
          />
        </div>
        <Button className="w-full" disabled={isPending} type="submit">
          {isPending ? "Accesso…" : "Accedi al pannello"}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => setMode("link")}
        className="mt-5 w-full cursor-pointer text-center text-sm font-medium text-[#6a6a6a] underline decoration-[#d0d0d0] decoration-1 underline-offset-4 hover:text-[#111111]"
      >
        Primo accesso o password dimenticata?
      </button>
    </BackofficeAuthShell>
  );
}
