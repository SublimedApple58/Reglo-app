"use client";

/**
 * "Collega <autoscuola> a Reglo" (REG-454): due strade nello stesso dialogo.
 *
 * - **Crea nuova (non attiva)** — il caso delle 37 consorziate in produzione:
 *   nasce una Company col servizio spento e la scuola entra nella vista
 *   ridotta. Il nome è proposto in Title Case dall'anagrafica (che è tutta in
 *   MAIUSCOLO) ed è modificabile: è il nome che il titolare vedrà.
 * - **Collega una esistente** — la consorziata è già cliente Reglo: si cerca
 *   la sua Company e si aggancia, senza toccarne lo stato del servizio.
 *
 * L'avviso in fondo non è decorativo: dice che nessun account nasce qui e che
 * la password la sceglie il titolare, perché è la domanda che il consorzio fa
 * ogni volta.
 */

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { cn } from "@/lib/utils";
import type { AffiliateSchoolRow } from "@/lib/actions/consorzio-affiliate.actions";

type Candidate = { id: string; name: string; regloActive: boolean };

export function AffiliateLinkDialog({
  school,
  suggestedName,
  onClose,
  onCreate,
  onLink,
  onSearch,
}: {
  school: AffiliateSchoolRow;
  suggestedName: string;
  onClose: () => void;
  /** Ritorna un messaggio d'errore, oppure null se è andata. */
  onCreate: (name: string, invite: boolean) => Promise<string | null>;
  onLink: (companyId: string) => Promise<string | null>;
  onSearch: (term: string) => Promise<Candidate[]>;
}) {
  const [mode, setMode] = useState<"create" | "link">("create");
  const [name, setName] = useState(suggestedName);
  const [invite, setInvite] = useState(Boolean(school.email));
  const [term, setTerm] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "link") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const rows = await onSearch(term);
      if (!cancelled) setCandidates(rows);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, term, onSearch]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const message =
      mode === "create"
        ? await onCreate(name.trim(), invite)
        : selected
          ? await onLink(selected)
          : "Scegli un'autoscuola da collegare.";
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-[18px] bg-white shadow-[0_26px_70px_rgba(10,20,30,0.32)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 pt-6">
          <h2 className="text-[19px] font-bold tracking-[-0.2px] text-foreground">
            Collega “{school.schoolName}” a Reglo
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            La consorziata diventa una autoscuola registrata su Reglo. Con Reglo non attivo vedrà la
            vista ridotta: agenda del consorzio e invio richieste di guida.
          </p>
        </div>

        <div className="mx-6 mt-4 flex gap-1 rounded-full bg-[#f2f2f2] p-1">
          {(
            [
              ["create", "Crea nuova (non attiva)"],
              ["link", "Collega una esistente"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "flex-1 cursor-pointer rounded-full py-2 text-[13.5px] font-semibold transition-colors",
                mode === value
                  ? "bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3 px-6 py-5">
          {mode === "create" ? (
            <>
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.7px] text-[#929292]">
                  Nome della Company
                </p>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="rounded-[12px] bg-[#f7f7f7] px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
                Proposto dall&apos;anagrafica <b>{school.schoolName}</b> in Title Case. È il nome che
                il titolare vedrà nella sua shell: modificalo se serve.
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-[13px] leading-relaxed text-foreground">
                <Checkbox
                  checked={invite}
                  onCheckedChange={(value) => setInvite(value === true)}
                  disabled={!school.email}
                  className="mt-0.5"
                />
                <span>
                  Manda subito l&apos;invito al titolare
                  {school.email ? (
                    <>
                      {" "}
                      a <b>{school.email}</b>
                    </>
                  ) : (
                    <span className="text-[#929292]"> — nessuna email in anagrafica</span>
                  )}
                </span>
              </label>
            </>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Cerca per nome…"
                  className="pl-9"
                />
              </div>
              <div className="max-h-[240px] overflow-auto rounded-[12px] border border-[#ebebeb]">
                {candidates.length === 0 ? (
                  <p className="px-3.5 py-6 text-center text-[13px] text-muted-foreground">
                    {term.trim().length < 2
                      ? "Scrivi almeno due lettere."
                      : "Nessuna autoscuola collegabile."}
                  </p>
                ) : (
                  candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setSelected(candidate.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between border-b border-[#f3f3f3] px-3.5 py-2.5 text-left text-[13.5px] last:border-b-0",
                        selected === candidate.id ? "bg-[#f7f7f7]" : "hover:bg-[#fafafa]",
                      )}
                    >
                      <span className="font-medium text-foreground">{candidate.name}</span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-[2px] text-[11.5px] font-semibold",
                          candidate.regloActive
                            ? "border-[#c5e8d4] bg-[#f0faf4] text-[#1a7f50]"
                            : "border-[#e2e2e2] bg-[#f6f6f6] text-[#6a6a6a]",
                        )}
                      >
                        {candidate.regloActive ? "Reglo attivo" : "Non attivo"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          <div className="rounded-[12px] bg-[#fdf6e8] px-3.5 py-3 text-[12.5px] leading-relaxed text-[#96650f]">
            Nessun account viene creato ora: la password la imposta il titolare dal link
            dell&apos;invito. Il consorzio non la vede e non la può impostare.
          </div>

          {error && <p className="text-[13px] font-medium text-[#c13515]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 pb-6">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={busy || (mode === "create" && name.trim().length < 2)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Crea e collega" : "Collega"}
          </Button>
        </div>
      </div>
    </div>
  );
}
