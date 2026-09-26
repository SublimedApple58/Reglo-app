"use client";

/**
 * Sezione **Allievi** della vista ridotta (REG-429).
 *
 * È l'unica parte che una consorziata senza Reglo usa davvero, e fa una cosa
 * sola: tenere le anagrafiche dei propri allievi. Non è la pagina Allievi
 * completa con progressi, pagellini, crediti e quiz — quella è a pagamento, e
 * montarla qui significherebbe aprire mezza app a un servizio spento.
 *
 * Gli allievi vivono nella company del CONSORZIO, taggati con questa scuola:
 * sono gli stessi che il consorzio vede e quelli per cui si chiederà una
 * guida. Vedi `lib/actions/affiliate.actions.ts`.
 */

import * as React from "react";
import { Loader2, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createAffiliateStudent,
  listAffiliateStudents,
  type AffiliateStudent,
} from "@/lib/actions/affiliate.actions";

const emptyForm = { firstName: "", lastName: "", phone: "" };

export function AffiliateStudentsPage() {
  const toast = useFeedbackToast();
  const [loading, setLoading] = React.useState(true);
  const [students, setStudents] = React.useState<AffiliateStudent[]>([]);
  const [search, setSearch] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await listAffiliateStudents();
    if (res.success) setStudents(res.data.students);
    else toast.error({ description: res.message });
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      [student.name, student.phone, student.licenseCategory]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(query)),
    );
  }, [students, search]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const res = await createAffiliateStudent(form);
    setSaving(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    toast.success({ description: "Allievo aggiunto." });
    setAddOpen(false);
    setForm(emptyForm);
    void load();
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-7 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.4px] text-foreground">Allievi</h1>
          <p className="mt-1 text-[14px] text-[#929292]">
            {students.length === 1 ? "1 allievo in anagrafica" : `${students.length} allievi in anagrafica`}
            {" · "}
            per chiedere una guida al consorzio l&apos;allievo deve essere qui
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca allievo…"
              className="w-[240px] pl-9"
            />
          </div>
          <Button onClick={() => setAddOpen(true)} className="rounded-full">
            <Plus className="mr-1.5 h-4 w-4" />
            Aggiungi allievo
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-white/60 p-12 text-center text-sm font-medium text-neutral-500">
            {students.length === 0
              ? "Nessun allievo in anagrafica. Aggiungi il primo."
              : "Nessun allievo corrisponde alla ricerca."}
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[1.6fr_1fr_110px_120px] gap-x-5 border-b border-[#ebebeb] px-4 pb-2.5">
              {["Allievo", "Telefono", "Patente", "Guide col consorzio"].map((header, index) => (
                <div
                  key={header}
                  className={`text-[11px] font-bold uppercase tracking-[0.7px] text-[#929292] ${
                    index === 3 ? "text-right" : ""
                  }`}
                >
                  {header}
                </div>
              ))}
            </div>
            {filtered.map((student) => (
              <div
                key={student.userId}
                className="grid grid-cols-[1.6fr_1fr_110px_120px] items-center gap-x-5 border-b border-[#f2f2f2] px-4 py-3.5"
              >
                <div className="truncate text-[14px] font-semibold text-foreground">
                  {student.name}
                </div>
                <div className="text-[13.5px] font-medium text-[#444444]">
                  {student.phone ?? "—"}
                </div>
                <div className="text-[13px] font-medium text-[#6a6a6a]">
                  {student.licenseCategory ?? "—"}
                  {student.transmission === "automatic" ? " · autom." : ""}
                </div>
                <div className="text-right text-[14px] font-semibold text-foreground">
                  {student.lessonsCount}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-5 text-[12.5px] leading-relaxed text-[#929292]">
        Questi allievi sono registrati presso il consorzio e taggati con la tua autoscuola: li vedi
        tu e li vede il consorzio. Progressi, pagellini, crediti e quiz arrivano con Reglo attivo.
      </p>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Aggiungi allievo</DialogTitle>
              <DialogDescription>
                Nome, cognome e telefono. L&apos;allievo non riceve accesso all&apos;app: serve al
                consorzio per sapere di chi è la guida.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  autoFocus
                  placeholder="Nome"
                  value={form.firstName}
                  onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
                />
                <Input
                  placeholder="Cognome"
                  value={form.lastName}
                  onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
                />
              </div>
              <Input
                placeholder="Telefono"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={
                  saving ||
                  !form.firstName.trim() ||
                  !form.lastName.trim() ||
                  form.phone.trim().length < 5
                }
                className="w-full sm:w-auto"
              >
                {saving ? <LoadingDots /> : "Aggiungi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
