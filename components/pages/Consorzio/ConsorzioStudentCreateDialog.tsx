"use client";

import * as React from "react";
import { ChevronDown, X } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LicenseCategorySelectItems } from "@/components/pages/Autoscuole/LicenseCategorySelectItems";
import { createCompanyUser } from "@/lib/actions/user.actions";
import { getAutoscuolaInstructors } from "@/lib/actions/autoscuole.actions";
import { companyAtom } from "@/atoms/company.store";
import { TRANSMISSIONS, TRANSMISSION_LABELS } from "@/lib/autoscuole/license";
import { cn } from "@/lib/utils";
import { useAtomValue } from "jotai";

/**
 * "Aggiungi allievo" del consorzio (dal dettaglio autoscuola consorziata).
 *
 * Dialog dedicato — non quello della Directory — perché l'allievo di un
 * consorzio nasce con SOLI nome, cognome e telefono (REG-464): l'app non è
 * obbligatoria per lui, quindi email e password vivono in una sezione
 * facoltativa chiusa. I codici contabili stanno in una sezione COLLASSATA con
 * il riepilogo della selezione (REG-460: prima erano tutti aperti a chip e con
 * molti codici il dialog diventava altissimo). Il corpo scorre da solo, così
 * l'altezza della modale non dipende da quanti codici ha il consorzio.
 *
 * Linguaggio visivo dal proto (LocationFormDialog): campi #f7f8fa bordo 1.5
 * #ededed radius 12 che al focus diventano bianchi con bordo near-black,
 * etichette 13px semibold, footer "Annulla" + CTA pill navy.
 */

const FIELD_CLASS =
  "w-full rounded-[12px] border-[1.5px] border-[#ededed] bg-[#f7f8fa] px-[15px] py-[13px] text-[15px] font-medium text-foreground outline-none transition-colors placeholder:text-[#c1c1c1] focus:border-[#222222] focus:bg-white";

const SELECT_TRIGGER_CLASS =
  "h-auto cursor-pointer rounded-[12px] border-[1.5px] border-[#ededed] bg-[#f7f8fa] px-[15px] py-[13px] text-[15px] font-medium data-[state=open]:border-[#222222] data-[state=open]:bg-white";

const LABEL_CLASS = "mb-2 block text-[13px] font-semibold text-foreground";

const HINT_CLASS = "mt-[7px] text-xs font-medium leading-[1.45] text-[#a3a3a3]";

const NO_INSTRUCTOR = "__none__";

type AccountingCode = { id: string; code: string };

/**
 * Sezione richiudibile con riepilogo a destra: tiene la modale bassa e dice a
 * colpo d'occhio cosa contiene senza doverla aprire.
 */
function CollapsibleSection({
  id,
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  summary: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[12px] border-[1.5px] border-[#ededed]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full cursor-pointer select-none items-center justify-between gap-3 px-[15px] py-[13px] text-left transition-colors hover:bg-[#fafafa]"
      >
        <span className="text-[13px] font-semibold text-foreground">{label}</span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12.5px] font-medium text-[#929292]">{summary}</span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-[#a8a8a8] transition-transform duration-200",
              open && "rotate-180",
            )}
            strokeWidth={1.8}
          />
        </span>
      </button>
      {open && (
        <div id={id} className="border-t-[1.5px] border-[#f2f2f2] px-[15px] py-4">
          {children}
        </div>
      )}
    </div>
  );
}

export function ConsorzioStudentCreateDialog({
  open,
  onOpenChange,
  schoolId,
  schoolName,
  accountingCodes,
  defaultLicenseCategory = "C",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  schoolName: string;
  accountingCodes: AccountingCode[];
  defaultLicenseCategory?: string;
  onCreated?: () => void;
}) {
  const company = useAtomValue(companyAtom);
  const toast = useFeedbackToast();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [licenseCategory, setLicenseCategory] = React.useState(defaultLicenseCategory);
  const [transmission, setTransmission] = React.useState("manual");
  const [instructorId, setInstructorId] = React.useState(NO_INSTRUCTOR);
  const [selectedCodeIds, setSelectedCodeIds] = React.useState<string[]>([]);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [codesOpen, setCodesOpen] = React.useState(false);
  const [appOpen, setAppOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [instructors, setInstructors] = React.useState<Array<{ id: string; name: string }>>([]);

  // Reset a ogni apertura: la modale non deve mai riproporre i dati
  // dell'allievo precedente.
  React.useEffect(() => {
    if (!open) return;
    setFirstName("");
    setLastName("");
    setPhone("");
    setLicenseCategory(defaultLicenseCategory);
    setTransmission("manual");
    setInstructorId(NO_INSTRUCTOR);
    setSelectedCodeIds([]);
    setEmail("");
    setPassword("");
    setCodesOpen(false);
    setAppOpen(false);
  }, [open, defaultLicenseCategory]);

  React.useEffect(() => {
    if (!open) return;
    void getAutoscuolaInstructors().then((res) => {
      if (!res.success || !res.data) return;
      setInstructors(
        res.data
          .filter((i: { autonomousMode?: boolean }) => i.autonomousMode)
          .map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })),
      );
    });
  }, [open]);

  const codesById = React.useMemo(
    () => new Map(accountingCodes.map((code) => [code.id, code])),
    [accountingCodes],
  );

  const codesSummary = (() => {
    if (selectedCodeIds.length === 0) return "Nessuno";
    const labels = selectedCodeIds.map((id) => codesById.get(id)?.code ?? "").filter(Boolean);
    if (labels.length <= 2) return labels.join(" · ");
    return `${labels.slice(0, 2).join(" · ")} +${labels.length - 2}`;
  })();

  const canSubmit =
    Boolean(firstName.trim()) &&
    Boolean(lastName.trim()) &&
    Boolean(phone.trim()) &&
    (!email.trim() || password.length >= 6) &&
    !saving;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !company?.id) return;
    setSaving(true);
    try {
      const res = await createCompanyUser({
        companyId: company.id,
        name: `${firstName.trim()} ${lastName.trim()}`,
        ...(email.trim() ? { email: email.trim(), password } : {}),
        phone: phone.trim(),
        autoscuolaRole: "STUDENT",
        licenseCategory,
        transmission,
        assignedInstructorId: instructorId === NO_INSTRUCTOR ? null : instructorId,
        consorzioSchoolId: schoolId,
        accountingCodeIds: selectedCodeIds,
      });
      if (!res.success) throw new Error(res.message ?? "Errore nella creazione.");
      toast.success({
        title: "Allievo aggiunto",
        description: `${firstName.trim()} ${lastName.trim()} è ora fra gli allievi di ${schoolName}.`,
      });
      onOpenChange(false);
      onCreated?.();
    } catch (error) {
      toast.error({
        description: error instanceof Error ? error.message : "Errore nella creazione.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="consorzio-student-create"
        className="max-w-[520px] gap-0 overflow-hidden rounded-[20px] p-0 [&>button:last-child]:hidden"
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-7 pb-5 pt-7">
            <DialogTitle className="text-[19px] font-bold tracking-[-0.2px] text-foreground">
              Aggiungi allievo
            </DialogTitle>
            <DialogDescription className="mt-[3px] text-[12.5px] font-medium leading-[1.4] text-[#929292]">
              Nuovo allievo di {schoolName}. Bastano nome, cognome e telefono.
            </DialogDescription>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Chiudi"
              className="absolute right-5 top-5 flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#e9e9e9]"
            >
              <X className="size-3 text-foreground" strokeWidth={2} />
            </button>
          </div>

          {/* Corpo scorrevole: l'altezza della modale non dipende dai codici */}
          <div className="max-h-[min(58vh,460px)] overflow-y-auto px-7 pb-6">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="consorzio-student-first" className={LABEL_CLASS}>
                  Nome
                </label>
                <input
                  id="consorzio-student-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Mario"
                  autoComplete="off"
                  autoFocus
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label htmlFor="consorzio-student-last" className={LABEL_CLASS}>
                  Cognome
                </label>
                <input
                  id="consorzio-student-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Rossi"
                  autoComplete="off"
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="consorzio-student-phone" className={LABEL_CLASS}>
                Telefono
              </label>
              <input
                id="consorzio-student-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+39 333 123 4567"
                autoComplete="off"
                className={FIELD_CLASS}
              />
              <p className={HINT_CLASS}>
                È il recapito dell&apos;allievo: senza accesso all&apos;app resta l&apos;unico modo
                per avvisarlo.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <span className={LABEL_CLASS}>Categoria patente</span>
                <Select value={licenseCategory} onValueChange={setLicenseCategory}>
                  <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Categoria patente">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <LicenseCategorySelectItems className="cursor-pointer" />
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span className={LABEL_CLASS}>Cambio</span>
                <Select value={transmission} onValueChange={setTransmission}>
                  <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Cambio">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSMISSIONS.map((t) => (
                      <SelectItem key={t} value={t} className="cursor-pointer">
                        {TRANSMISSION_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {instructors.length > 0 && (
              <div className="mt-4">
                <span className={LABEL_CLASS}>Istruttore assegnato</span>
                <Select value={instructorId} onValueChange={setInstructorId}>
                  <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Istruttore assegnato">
                    <SelectValue placeholder="Nessun istruttore" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_INSTRUCTOR} className="cursor-pointer">
                      Nessuno (pool generale)
                    </SelectItem>
                    {instructors.map((instructor) => (
                      <SelectItem
                        key={instructor.id}
                        value={instructor.id}
                        className="cursor-pointer"
                      >
                        {instructor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Codici contabili — collassati, con riepilogo (REG-460) */}
            {accountingCodes.length > 0 && (
              <div className="mt-5">
                <CollapsibleSection
                  id="consorzio-student-codes"
                  label="Codici contabili"
                  summary={codesSummary}
                  open={codesOpen}
                  onToggle={() => setCodesOpen((prev) => !prev)}
                >
                  <div
                    className="flex max-h-[128px] flex-wrap gap-1.5 overflow-y-auto"
                    data-testid="consorzio-student-codes-list"
                  >
                    {accountingCodes.map((code) => {
                      const active = selectedCodeIds.includes(code.id);
                      return (
                        <button
                          key={code.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setSelectedCodeIds((prev) =>
                              active ? prev.filter((id) => id !== code.id) : [...prev, code.id],
                            )
                          }
                          className={cn(
                            "cursor-pointer select-none rounded-full px-[11px] py-1.5 text-[12.5px] font-semibold transition-colors",
                            active
                              ? "bg-[#111111] text-white hover:bg-[#2b2b2b]"
                              : "bg-[#f2f2f2] text-[#444444] hover:bg-[#e9e9e9]",
                          )}
                        >
                          {code.code}
                        </button>
                      );
                    })}
                  </div>
                  <p className={HINT_CLASS}>
                    Il codice dell&apos;autoscuola viene assegnato da solo: qui aggiungi solo quelli
                    specifici di questo allievo.
                  </p>
                </CollapsibleSection>
              </div>
            )}

            {/* Accesso all'app — facoltativo (REG-464) */}
            <div className="mt-3">
              <CollapsibleSection
                id="consorzio-student-app"
                label="Accesso all'app"
                summary={email.trim() ? email.trim() : "Facoltativo"}
                open={appOpen}
                onToggle={() => setAppOpen((prev) => !prev)}
              >
                <label htmlFor="consorzio-student-email" className={LABEL_CLASS}>
                  Email
                </label>
                <input
                  id="consorzio-student-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mario@example.com"
                  autoComplete="off"
                  className={FIELD_CLASS}
                />
                <label htmlFor="consorzio-student-password" className={cn(LABEL_CLASS, "mt-4")}>
                  Password
                </label>
                <input
                  id="consorzio-student-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Almeno 6 caratteri"
                  autoComplete="new-password"
                  className={FIELD_CLASS}
                />
                <p className={HINT_CLASS}>
                  {email.trim() && password.length < 6
                    ? "Con un'email serve anche una password di almeno 6 caratteri."
                    : "Lascia vuoto se l'allievo non userà l'app: potrai aggiungere le credenziali più avanti."}
                </p>
              </CollapsibleSection>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3.5 border-t border-[#f0f0f0] px-7 py-[18px]">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="cursor-pointer select-none px-2 py-[11px] text-sm font-semibold text-foreground transition-colors hover:text-[#555555]"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                "flex min-w-[148px] select-none items-center justify-center gap-[7px] rounded-[50px] px-[26px] py-3 text-sm font-semibold text-white transition-colors",
                canSubmit
                  ? "cursor-pointer bg-[#111111] hover:bg-[#2b2b2b]"
                  : "cursor-not-allowed bg-[#c4c4d4]",
              )}
            >
              {saving ? <LoadingDots /> : "Aggiungi allievo"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
