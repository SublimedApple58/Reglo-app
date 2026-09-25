"use client";

/**
 * "Invita tutte le non invitate" (REG-454), sia dal backoffice sia
 * dall'account consorzio.
 *
 * Due cose che questo dialogo deve rendere ovvie prima di partire:
 * 1. le autoscuole sono più delle email — un titolare con cinque sedi riceve
 *    **una sola** mail, e con quella entra in tutte;
 * 2. sono mail vere verso clienti veri, quindi niente invio al buio: elenco
 *    completo davanti, e conferma esplicita col segno di spunta.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  previewBulkAffiliateInvites,
  sendBulkAffiliateInvites,
} from "@/lib/actions/consorzio-affiliate.actions";

type Group = { email: string; schools: string[]; schoolIds: string[] };

export function AffiliateBulkInviteDialog({
  consorzioCompanyId,
  onClose,
  onDone,
}: {
  /** Presente solo dal backoffice: dall'account consorzio lo ricava la guardia. */
  consorzioCompanyId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useFeedbackToast();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [schoolsCount, setSchoolsCount] = useState(0);
  const [missingEmail, setMissingEmail] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await previewBulkAffiliateInvites(consorzioCompanyId);
      if (cancelled) return;
      if (res.success) {
        setGroups(res.data.groups);
        setSchoolsCount(res.data.schoolsCount);
        setMissingEmail(res.data.missingEmail);
      } else {
        setGroups([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [consorzioCompanyId]);

  const send = async () => {
    if (!groups?.length) return;
    setBusy(true);
    const res = await sendBulkAffiliateInvites({
      consorzioCompanyId,
      emails: groups.map((group) => group.email),
    });
    setBusy(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Invii non riusciti." });
      return;
    }
    toast.success({
      description: res.data.failed.length
        ? `${res.data.sent} inviti partiti, ${res.data.failed.length} non riusciti.`
        : `${res.data.sent} inviti inviati.`,
    });
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_26px_70px_rgba(10,20,30,0.32)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[#f0f0f0] px-6 pb-4 pt-6">
          <h2 className="text-[19px] font-bold tracking-[-0.2px] text-foreground">
            {groups ? `Invita ${groups.length} titolari` : "Invita i titolari"}
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            {groups
              ? `${schoolsCount} autoscuole non sono ancora state invitate, ma condividono ${groups.length} email: chi ha più sedi riceve una sola mail e con quella entra in tutte.`
              : "Sto raggruppando le autoscuole per email…"}
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {!groups ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <p className="px-6 py-10 text-center text-[13.5px] text-muted-foreground">
              Nessuna autoscuola da invitare.
            </p>
          ) : (
            groups.map((group) => (
              <div
                key={group.email}
                className="flex items-center justify-between gap-4 border-b border-[#f4f4f4] px-6 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{group.email}</p>
                  <p className="truncate text-[12px] text-[#929292]">{group.schools.join(" · ")}</p>
                </div>
                <span className="shrink-0 rounded-full border border-[#e2e2e2] bg-[#f6f6f6] px-2.5 py-[3px] text-[12px] font-semibold text-[#6a6a6a]">
                  {group.schools.length} {group.schools.length === 1 ? "sede" : "sedi"}
                </span>
              </div>
            ))
          )}
          {missingEmail.length > 0 && (
            <p className="px-6 py-3 text-[12.5px] leading-relaxed text-[#96650f]">
              Restano fuori {missingEmail.length} autoscuole senza email in anagrafica:{" "}
              {missingEmail.join(", ")}.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f0f0f0] px-6 py-4">
          <label className="flex max-w-[330px] cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-foreground">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(value) => setConfirmed(value === true)}
              className="mt-0.5"
            />
            <span>
              Ho controllato l&apos;elenco: manda <b>{groups?.length ?? 0}</b>{" "}
              {groups?.length === 1 ? "email vera" : "email vere"} ai titolari.
            </span>
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={send} disabled={!confirmed || busy || !groups?.length}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Invia {groups?.length ?? 0} inviti
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
