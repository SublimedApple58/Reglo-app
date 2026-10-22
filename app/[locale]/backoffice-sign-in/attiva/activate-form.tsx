"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { completeBackofficeLink } from "@/lib/actions/backoffice-access.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ActivateForm({
  token,
  email,
  minLength,
}: {
  token: string;
  email: string;
  minLength: number;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const longEnough = password.length >= minLength;
  const matches = confirm.length > 0 && confirm === password;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!longEnough) return setError(`Servono almeno ${minLength} caratteri.`);
    if (!matches) return setError("Le due password non coincidono.");
    startTransition(async () => {
      const res = await completeBackofficeLink({ token, password });
      if (!res.success) {
        setError(res.message ?? "Non è stato possibile salvare la password.");
        return;
      }
      router.push("/backoffice");
      router.refresh();
    });
  };

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      {/* Per i password manager: associano la password all'account giusto. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="rounded-xl bg-[#f6f6f6] px-3.5 py-2.5 text-sm text-[#444444]">{email}</div>
      <div className="space-y-2">
        <Label htmlFor="bo-new-password">Nuova password</Label>
        <Input
          id="bo-new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className={cn("text-xs", longEnough ? "text-[#111111]" : "text-[#8a8a8a]")}>
          {longEnough ? "✓ " : ""}Almeno {minLength} caratteri, senza il tuo nome né «reglo».
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="bo-confirm-password">Ripeti la password</Label>
        <Input
          id="bo-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-[#c13515]">{error}</p> : null}
      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? "Salvo…" : "Salva ed entra"}
      </Button>
    </form>
  );
}
