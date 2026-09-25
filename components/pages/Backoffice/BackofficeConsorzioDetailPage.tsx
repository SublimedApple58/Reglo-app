"use client";

/**
 * Backoffice → dettaglio di un CONSORZIO: l'elenco delle sue autoscuole
 * consorziate con, per ognuna, tre cose che vanno tenute separate perché sono
 * davvero diverse (REG-454):
 *
 * 1. **Company Reglo** — la consorziata è diventata una autoscuola registrata?
 * 2. **Reglo** — quella autoscuola ha comprato il servizio (ACTIVE) o no?
 * 3. **Accesso titolare** — c'è qualcuno che può entrarci?
 *
 * Una scuola può essere collegata e con Reglo spento e senza titolare: sono
 * tre assi indipendenti, e il primo giro di design che li aveva fusi in una
 * colonna sola era illeggibile.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Link2, LogIn, Mail, MoreHorizontal, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  createAffiliateCompanyForSchool,
  inviteAffiliateOwnerFromBackoffice,
  linkConsorzioSchoolToCompany,
  searchLinkableCompanies,
  unlinkConsorzioSchool,
  type AffiliateAccessStatus,
  type AffiliateSchoolRow,
} from "@/lib/actions/consorzio-affiliate.actions";
import { updateCompanyService } from "@/lib/actions/backoffice.actions";
import { impersonateCompany } from "@/lib/actions/backoffice.actions";
import { affiliateCompanyName } from "@/lib/consorzio/affiliate-name";
import { AffiliateLinkDialog } from "./AffiliateLinkDialog";
import { AffiliateBulkInviteDialog } from "./AffiliateBulkInviteDialog";

export type ConsorzioDetail = {
  consorzio: { id: string; name: string; createdAt: string };
  schools: AffiliateSchoolRow[];
  totals: {
    schools: number;
    linked: number;
    regloActive: number;
    accessActive: number;
    notInvited: number;
  };
};

const ACCESS_LABEL: Record<AffiliateAccessStatus, string> = {
  not_linked: "Non collegata",
  not_invited: "Non invitata",
  invited: "Invitata",
  expired: "Invito scaduto",
  active: "Accede",
};

const ACCESS_TONE: Record<AffiliateAccessStatus, string> = {
  not_linked: "border-[#e2e2e2] bg-[#f6f6f6] text-[#6a6a6a]",
  not_invited: "border-[#e2e2e2] bg-[#f6f6f6] text-[#6a6a6a]",
  invited: "border-[#f3dcb0] bg-[#fdf6e8] text-[#96650f]",
  expired: "border-[#fad4cc] bg-[#fff4f2] text-[#c13515]",
  active: "border-[#c5e8d4] bg-[#f0faf4] text-[#1a7f50]",
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[12px] font-semibold",
        tone,
      )}
    >
      {children}
    </span>
  );
}

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

const daysLeft = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
};

export default function BackofficeConsorzioDetailPage({ detail }: { detail: ConsorzioDetail }) {
  const router = useRouter();
  const toast = useFeedbackToast();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<AffiliateSchoolRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return detail.schools;
    return detail.schools.filter((school) =>
      [school.schoolName, school.city, school.companyName, school.email]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(term)),
    );
  }, [detail.schools, query]);

  const pendingInvites = detail.schools.filter(
    (school) => school.companyId && (school.access === "not_invited" || school.access === "expired"),
  ).length;

  const run = async (schoolId: string, fn: () => Promise<{ success: boolean; message?: string }>) => {
    setBusyId(schoolId);
    const res = await fn();
    setBusyId(null);
    if (!res.success) {
      toast.error({ description: res.message ?? "Operazione non riuscita." });
      return false;
    }
    refresh();
    return true;
  };

  const handleInvite = async (school: AffiliateSchoolRow) => {
    setBusyId(school.schoolId);
    const res = await inviteAffiliateOwnerFromBackoffice({ schoolId: school.schoolId });
    setBusyId(null);
    if (!res.success) {
      toast.error({ description: res.message ?? "Invito non inviato." });
      return;
    }
    const sedi = res.data.schools.length;
    toast.success({
      description: res.data.emailSent
        ? `Invito inviato a ${res.data.email}${sedi > 1 ? ` · vale per ${sedi} sedi` : ""}.`
        : `Invito creato ma la mail non è partita: usa "Copia link".`,
    });
    refresh();
  };

  const handleToggleService = async (school: AffiliateSchoolRow) => {
    if (!school.companyId) return;
    await run(school.schoolId, () =>
      updateCompanyService({
        companyId: school.companyId as string,
        serviceKey: "AUTOSCUOLE",
        status: school.regloActive ? "disabled" : "active",
      }),
    );
  };

  const handleCopyLink = async (school: AffiliateSchoolRow) => {
    if (!school.invite) return;
    const url = `${window.location.origin}/it/invite/${school.invite.token}`;
    await navigator.clipboard.writeText(url);
    toast.success({ description: "Link d'invito copiato." });
  };

  const handleUnlink = async (school: AffiliateSchoolRow) => {
    if (
      !window.confirm(
        `Scollegare "${school.schoolName}" dal consorzio?\n\nNiente viene cancellato: restano l'anagrafica, la Company e i suoi dati. L'autoscuola perde la vista ridotta e, se il servizio è spento, torna a vedere il cartello "Servizio non attivo".`,
      )
    )
      return;
    await run(school.schoolId, () => unlinkConsorzioSchool({ schoolId: school.schoolId }));
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5 p-6 lg:p-8">
      {/* ── Intestazione ── */}
      <div>
        <button
          type="button"
          onClick={() => router.push("/it/backoffice")}
          className="mb-2 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Backoffice · Autoscuole
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-bold tracking-[-0.4px] text-foreground">
            {detail.consorzio.name}
          </h1>
          <Badge tone="border-[#ded5f5] bg-[#f5f1ff] text-[#6d28d9]">Consorzio</Badge>
        </div>
      </div>

      {/* ── Contatori ── */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { n: detail.totals.schools, l: "autoscuole consorziate" },
          { n: detail.totals.linked, l: "collegate a una Company" },
          { n: detail.totals.regloActive, l: "con Reglo attivo" },
          { n: detail.totals.accessActive, l: "titolari che accedono" },
        ].map((stat) => (
          <div
            key={stat.l}
            className="rounded-2xl border border-border bg-white px-[18px] py-4 shadow-[var(--shadow-card)]"
          >
            <p className="text-2xl font-semibold leading-tight text-foreground">{stat.n}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.l}</p>
          </div>
        ))}
      </div>

      {/* ── Barra azioni ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca autoscuola…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {pendingInvites > 0 && (
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              Invita tutte le non invitate · {pendingInvites}
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabella ── */}
      <div className="rounded-2xl border border-border bg-white shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Autoscuola</TableHead>
              <TableHead>Company Reglo</TableHead>
              <TableHead>Reglo</TableHead>
              <TableHead>Accesso titolare</TableHead>
              <TableHead className="text-right">Allievi</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((school) => {
              const busy = busyId === school.schoolId;
              return (
                <TableRow key={school.schoolId}>
                  <TableCell>
                    <p className="text-sm font-semibold text-foreground">{school.schoolName}</p>
                    <p className="text-xs text-[#929292]">
                      {[school.city, school.accountingCode].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </TableCell>
                  <TableCell>
                    {school.companyName ? (
                      <p className="text-sm font-medium text-foreground">{school.companyName}</p>
                    ) : (
                      <p className="text-[13px] text-[#929292]">— nessuna Company</p>
                    )}
                  </TableCell>
                  <TableCell>
                    {school.companyId ? (
                      <Badge
                        tone={
                          school.regloActive
                            ? "border-[#c5e8d4] bg-[#f0faf4] text-[#1a7f50]"
                            : "border-[#e2e2e2] bg-[#f6f6f6] text-[#6a6a6a]"
                        }
                      >
                        {school.regloActive ? "Attivo" : "Non attivo"}
                      </Badge>
                    ) : (
                      <Badge tone="border-[#e2e2e2] bg-[#f6f6f6] text-[#6a6a6a]">—</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge tone={ACCESS_TONE[school.access]}>{ACCESS_LABEL[school.access]}</Badge>
                    <p className="mt-1 text-xs text-[#929292]">
                      {school.access === "active"
                        ? school.owners.map((owner) => owner.name).join(", ")
                        : school.access === "invited" && school.invite
                          ? `scade fra ${daysLeft(school.invite.expiresAt)} giorni`
                          : school.access === "expired" && school.invite
                            ? `inviato a ${school.invite.email}`
                            : `${school.email || "nessuna email in anagrafica"}${
                                school.sharedWith.length
                                  ? ` · ${school.sharedWith.length + 1} sedi`
                                  : ""
                              }`}
                    </p>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{school.studentsCount}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {busy ? (
                        <LoadingDots />
                      ) : !school.companyId ? (
                        <button
                          type="button"
                          onClick={() => setLinkTarget(school)}
                          className="cursor-pointer text-[13px] font-semibold text-foreground hover:opacity-70"
                        >
                          Collega
                        </button>
                      ) : school.access === "active" ? (
                        <button
                          type="button"
                          onClick={() => impersonateCompany(school.companyId as string)}
                          className="cursor-pointer text-[13px] font-semibold text-foreground hover:opacity-70"
                        >
                          Impersona
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleInvite(school)}
                          className="cursor-pointer text-[13px] font-semibold text-foreground hover:opacity-70"
                        >
                          {school.access === "not_invited" ? "Invita titolare" : "Reinvia"}
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {school.companyId ? (
                            <>
                              <DropdownMenuItem onClick={() => handleToggleService(school)}>
                                {school.regloActive ? "Disattiva Reglo" : "Attiva Reglo"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleInvite(school)}
                                disabled={school.access === "active"}
                              >
                                <Mail className="mr-2 h-4 w-4" />
                                {school.access === "not_invited" ? "Invita titolare" : "Reinvia invito"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCopyLink(school)}
                                disabled={!school.invite}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Copia link d&apos;invito
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => impersonateCompany(school.companyId as string)}
                                disabled={school.access !== "active"}
                              >
                                <LogIn className="mr-2 h-4 w-4" />
                                Apri in impersonificazione
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleUnlink(school)}
                                className="text-[#c13515] focus:text-[#c13515]"
                              >
                                Scollega dal consorzio
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem onClick={() => setLinkTarget(school)}>
                              <Link2 className="mr-2 h-4 w-4" />
                              Collega a Reglo
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Nessuna autoscuola trovata.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-[#929292]">
        Collegare non crea nessun account: la password la imposta il titolare dal link dell&apos;invito.
        Un titolare con più sedi riceve una sola mail e con quella entra in tutte.
      </p>

      {linkTarget && (
        <AffiliateLinkDialog
          school={linkTarget}
          suggestedName={affiliateCompanyName(linkTarget.schoolName)}
          onClose={() => setLinkTarget(null)}
          onCreate={async (name, invite) => {
            const res = await createAffiliateCompanyForSchool({
              schoolId: linkTarget.schoolId,
              name,
            });
            if (!res.success) return res.message ?? "Creazione non riuscita.";
            if (invite) {
              await inviteAffiliateOwnerFromBackoffice({ schoolId: linkTarget.schoolId });
            }
            setLinkTarget(null);
            refresh();
            return null;
          }}
          onLink={async (companyId) => {
            const res = await linkConsorzioSchoolToCompany({
              schoolId: linkTarget.schoolId,
              companyId,
            });
            if (!res.success) return res.message ?? "Collegamento non riuscito.";
            setLinkTarget(null);
            refresh();
            return null;
          }}
          onSearch={async (term) => {
            const res = await searchLinkableCompanies(term);
            return res.success ? res.data : [];
          }}
        />
      )}

      {bulkOpen && (
        <AffiliateBulkInviteDialog
          consorzioCompanyId={detail.consorzio.id}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
