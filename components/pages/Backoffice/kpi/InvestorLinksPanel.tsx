"use client";

import React from "react";
import { Check, Copy, Link2, Plus, X } from "lucide-react";

import {
  createInvestorLink,
  listInvestorLinks,
  revokeInvestorLink,
  type InvestorLinkDTO,
} from "@/lib/actions/investor-links.actions";
import { Input } from "@/components/ui/input";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { KpiSection } from "./KpiPrimitives";

// Pannello "Link investor": crea un link per destinatario, mostra quante volte
// è stato aperto e lo revoca. Un link per persona: se gira, si sa da chi è
// partito e si spegne quello soltanto.

const urlFor = (token: string) =>
  typeof window === "undefined" ? "" : `${window.location.origin}/it/investor/${token}`;

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "2-digit" })
    : "—";

export function InvestorLinksPanel() {
  const toast = useFeedbackToast();
  const [links, setLinks] = React.useState<InvestorLinkDTO[] | null>(null);
  const [label, setLabel] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    listInvestorLinks().then((res) => {
      if (!active) return;
      setLinks(res.success && res.data ? res.data : []);
    });
    return () => {
      active = false;
    };
  }, []);

  const create = async () => {
    const trimmed = label.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    const res = await createInvestorLink({ label: trimmed });
    setCreating(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile creare il link." });
      return;
    }
    setLabel("");
    setLinks((prev) => [res.data, ...(prev ?? [])]);
    // Il link nasce già negli appunti: è la cosa che si vuole fare subito dopo.
    void copy(res.data);
  };

  const copy = async (link: InvestorLinkDTO) => {
    try {
      await navigator.clipboard.writeText(urlFor(link.token));
      setCopiedId(link.id);
      setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 2000);
    } catch {
      toast.error({ description: "Copia non riuscita: copia il link a mano." });
    }
  };

  const revoke = async (link: InvestorLinkDTO) => {
    setConfirmRevokeId(null);
    const res = await revokeInvestorLink(link.id);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile revocare il link." });
      return;
    }
    setLinks((prev) => (prev ?? []).map((l) => (l.id === link.id ? res.data : l)));
  };

  return (
    <KpiSection
      className="mt-4"
      title="Link investor"
      subtitle="Una pagina pubblica con i soli numeri aggregati (niente nomi delle autoscuole, niente metriche operative), raggiungibile solo con il link. Un link per destinatario: il nome compare in fondo alla pagina e si revoca singolarmente."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
          maxLength={80}
          placeholder="Per chi è questo link (es. Studio Rossi)"
          className="h-10 w-full max-w-[320px]"
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={!label.trim() || creating}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#111111] px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
        >
          {creating ? <LoadingDots className="text-white" /> : <Plus className="size-4" strokeWidth={2.5} />}
          Crea link
        </button>
      </div>

      <div className="mt-5">
        {links === null ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : links.length === 0 ? (
          <p className="py-4 text-[13px] font-medium italic text-[#a8a8a8]">
            Nessun link creato.
          </p>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => {
              const revoked = Boolean(link.revokedAt);
              const expired =
                !revoked && link.expiresAt !== null && new Date(link.expiresAt) < new Date();
              const dead = revoked || expired;
              return (
                <li
                  key={link.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ededed] px-4 py-3",
                    dead && "bg-[#fafafa]",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link2 className={cn("size-4 shrink-0", dead ? "text-[#c2c2c2]" : "text-[#6a6a6a]")} strokeWidth={2} />
                      <span
                        className={cn(
                          "truncate text-[13.5px] font-semibold",
                          dead ? "text-[#9a9a9a] line-through" : "text-[#111111]",
                        )}
                      >
                        {link.label}
                      </span>
                      {dead && (
                        <span className="shrink-0 rounded-full bg-[#f2f2f5] px-2 py-0.5 text-[10.5px] font-semibold text-[#6a6a6a]">
                          {revoked ? "Revocato" : "Scaduto"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] font-medium text-[#9a9a9a]">
                      creato il {formatDate(link.createdAt)}
                      {" · "}
                      {link.viewCount === 0
                        ? "mai aperto"
                        : `aperto ${link.viewCount} ${link.viewCount === 1 ? "volta" : "volte"}, ultima ${formatDate(link.lastViewedAt)}`}
                    </p>
                  </div>

                  {!dead && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void copy(link)}
                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:border-[#929292]"
                      >
                        {copiedId === link.id ? (
                          <>
                            <Check className="size-3.5 text-[#137333]" strokeWidth={2.5} />
                            Copiato
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" strokeWidth={2} />
                            Copia
                          </>
                        )}
                      </button>
                      {/* Conferma inline a due passi: niente window.confirm. */}
                      {confirmRevokeId === link.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void revoke(link)}
                            className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-[#b42318] px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                          >
                            Conferma
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRevokeId(null)}
                            aria-label="Annulla"
                            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-[#9a9a9a] transition-colors hover:bg-[#f7f7f7]"
                          >
                            <X className="size-4" strokeWidth={2} />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRevokeId(link.id)}
                          className="inline-flex h-9 cursor-pointer items-center rounded-lg px-3 text-[12.5px] font-semibold text-[#9a9a9a] transition-colors hover:bg-[#f7f7f7] hover:text-[#b42318]"
                        >
                          Revoca
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </KpiSection>
  );
}
