"use client";

/**
 * Blocco "Accesso a Reglo" del dettaglio di un'autoscuola consorziata
 * (REG-454), lato account consorzio.
 *
 * Risponde a una domanda sola: **il titolare può entrare?** — e offre le tre
 * azioni che servono quando la risposta è no: invita, reinvia, copia il link
 * (per mandarlo su WhatsApp quando la mail non arriva, che è il caso vero).
 *
 * L'email arriva dall'anagrafica ed è correggibile qui: nei dati di produzione
 * otto indirizzi coprono più sedi, e in quel caso un invito solo vale per
 * tutte — la riga "Sedi coperte" lo dice esplicitamente, altrimenti sembra un
 * invito mancante.
 */

import * as React from "react";
import { Check, Copy, Loader2 } from "lucide-react";

import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  inviteAffiliateOwnerFromConsorzio,
  type AffiliateSchoolRow,
} from "@/lib/actions/consorzio-affiliate.actions";
import { AccessBadge } from "./school-access";

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

export function SchoolAccessCard({
  row,
  onChanged,
}: {
  row: AffiliateSchoolRow;
  onChanged: () => void;
}) {
  const toast = useFeedbackToast();
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [editingEmail, setEditingEmail] = React.useState(false);
  const [email, setEmail] = React.useState(row.email ?? "");

  const invite = async () => {
    setBusy(true);
    const res = await inviteAffiliateOwnerFromConsorzio({
      schoolId: row.schoolId,
      ...(editingEmail && email.trim() ? { email: email.trim() } : {}),
    });
    setBusy(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    setEditingEmail(false);
    const sedi = res.data.schools.length;
    toast.success({
      description: res.data.emailSent
        ? `Invito inviato a ${res.data.email}${sedi > 1 ? ` · vale per ${sedi} sedi` : ""}.`
        : "Invito creato, ma la mail non è partita: usa Copia link.",
    });
    onChanged();
  };

  const copyLink = async () => {
    if (!row.invite) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}/it/invite/${row.invite.token}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const invited = row.access === "invited" || row.access === "expired";

  return (
    <div className="rounded-[16px] border border-[#ebebeb] bg-white px-6 py-[22px]">
      <div className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#929292]">
        Accesso a Reglo
      </div>

      <div
        className={`mt-4 flex flex-wrap items-center gap-3 rounded-[12px] px-[15px] py-[13px] ${
          row.access === "active"
            ? "bg-[#f0faf4]"
            : invited
              ? "bg-[#f7f7f7]"
              : "border border-dashed border-[#e0e0e0] bg-[#fbfbfb]"
        }`}
      >
        <AccessBadge status={row.access} />
        <div className="text-[13.5px] text-[#444444]">
          {row.access === "active" ? (
            <>
              Accede <b>{row.owners.map((owner) => owner.name).join(", ")}</b>
            </>
          ) : row.access === "invited" && row.invite ? (
            <>
              Invito inviato a <b>{row.invite.email}</b> · scade il{" "}
              {formatDay(row.invite.expiresAt)}
            </>
          ) : row.access === "expired" && row.invite ? (
            <>
              L&apos;invito a <b>{row.invite.email}</b> è scaduto: va rimandato.
            </>
          ) : row.access === "not_linked" ? (
            <>Questa autoscuola non è ancora collegata a Reglo. Se ne occupa Reglo.</>
          ) : (
            <>Il titolare non può ancora entrare in Reglo.</>
          )}
        </div>
      </div>

      {row.access !== "not_linked" && (
        <>
          <dl className="mt-4">
            <Row label="Autoscuola su Reglo" value={row.companyName ?? "—"} />
            <Row
              label="Reglo"
              value={
                <span
                  className={`inline-flex rounded-full border px-2.5 py-[3px] text-[11.5px] font-bold ${
                    row.regloActive
                      ? "border-[#c5e8d4] bg-[#f0faf4] text-[#1a7f50]"
                      : "border-[#e2e2e2] bg-[#f6f6f6] text-[#6a6a6a]"
                  }`}
                >
                  {row.regloActive ? "Attivo" : "Non attivo"}
                </span>
              }
            />
            <Row
              label="Email del titolare"
              value={
                editingEmail ? (
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoFocus
                    className="w-[260px] rounded-[8px] border border-[#dddddd] px-2.5 py-1.5 text-right text-[14px] font-semibold text-[#222222] outline-none focus:border-[#222222]"
                  />
                ) : (
                  <span>
                    {row.email ?? "—"}{" "}
                    <span className="font-medium text-[#929292]">(dall&apos;anagrafica)</span>
                  </span>
                )
              }
            />
            {row.invite && row.invite.email !== (row.email ?? "") && (
              <Row label="Invito mandato a" value={row.invite.email} />
            )}
            {row.sharedWith.length > 0 && (
              <Row
                label="Sedi coperte da questo invito"
                value={
                  <span>
                    {row.sharedWith.length + 1}{" "}
                    <span className="font-medium text-[#929292]">
                      · {[row.schoolName, ...row.sharedWith].join(", ")}
                    </span>
                  </span>
                }
              />
            )}
          </dl>

          <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={invite}
              disabled={busy || row.access === "active"}
              className="flex cursor-pointer items-center gap-2 rounded-[10px] bg-[#222222] px-4 py-[10px] text-[14px] font-semibold text-white shadow-cta transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {invited ? "Reinvia invito" : "Invita titolare"}
            </button>
            {invited && (
              <button
                type="button"
                onClick={copyLink}
                className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#dddddd] bg-white px-[14px] py-[9px] text-[13.5px] font-semibold text-[#222222] transition-colors hover:bg-[#f7f7f7]"
              >
                {copied ? <Check className="h-4 w-4 text-[#1a7f50]" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiato" : "Copia link"}
              </button>
            )}
            {row.access !== "active" && !editingEmail && (
              <button
                type="button"
                onClick={() => setEditingEmail(true)}
                className="cursor-pointer text-[13px] font-semibold text-[#222222] hover:opacity-70"
              >
                Cambia email
              </button>
            )}
          </div>

          <p className="mt-3.5 text-[12.5px] leading-[1.55] text-[#6a6a6a]">
            Il link porta a una pagina dove il titolare <b>sceglie la sua password</b> ed entra
            nella sua autoscuola. Tu non vedi e non imposti la password.
          </p>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#f0f0f0] py-[10px] last:border-b-0 last:pb-0">
      <dt className="text-[13px] font-medium text-[#929292]">{label}</dt>
      <dd className="text-[14px] font-semibold text-[#222222]">{value}</dd>
    </div>
  );
}
