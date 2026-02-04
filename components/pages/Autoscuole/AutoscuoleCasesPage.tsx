"use client";

import React from "react";
import { Plus } from "lucide-react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  createAutoscuolaCase,
  getAutoscuolaCases,
  getAutoscuolaStudents,
  updateAutoscuolaCaseStatus,
} from "@/lib/actions/autoscuole.actions";
import { Skeleton } from "@/components/ui/skeleton";

type StudentOption = { id: string; firstName: string; lastName: string };
type CaseRow = {
  id: string;
  status: string;
  category: string | null;
  student: StudentOption;
  createdAt: string | Date;
};

const STATUS_OPTIONS = [
  "iscritto",
  "foglio_rosa",
  "teoria_prenotata",
  "teoria_superata",
  "guida",
  "esame_prenotato",
  "esame_superato",
];

export function AutoscuoleCasesPage() {
  const toast = useFeedbackToast();
  const [cases, setCases] = React.useState<CaseRow[]>([]);
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    studentId: "",
    category: "",
    status: "",
    pinkSheetExpiresAt: "",
    medicalExpiresAt: "",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    const [caseRes, studentRes] = await Promise.all([
      getAutoscuolaCases(),
      getAutoscuolaStudents(),
    ]);
    if (!caseRes.success || !caseRes.data) {
      toast.error({
        description: caseRes.message ?? "Impossibile caricare le pratiche.",
      });
    } else {
      setCases(caseRes.data);
    }
    if (studentRes.success && studentRes.data) {
      setStudents(
        studentRes.data.map((student) => ({
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
        })),
      );
    }
    setLoading(false);
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = cases.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      item.student.firstName.toLowerCase().includes(term) ||
      item.student.lastName.toLowerCase().includes(term) ||
      (item.category ?? "").toLowerCase().includes(term)
    );
  });

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.studentId) return;
    const res = await createAutoscuolaCase({
      studentId: form.studentId,
      category: form.category || undefined,
      status: form.status || undefined,
      pinkSheetExpiresAt: form.pinkSheetExpiresAt || undefined,
      medicalExpiresAt: form.medicalExpiresAt || undefined,
    });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile creare la pratica.",
      });
      return;
    }
    setCreateOpen(false);
    setForm({
      studentId: "",
      category: "",
      status: "",
      pinkSheetExpiresAt: "",
      medicalExpiresAt: "",
    });
    load();
  };

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Gestisci le pratiche e gli stati degli allievi."
      hideHero
    >
      <div className="space-y-5">
        <AutoscuoleNav />

        <div className="glass-panel glass-strong flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-[220px]">
            <Input
              placeholder="Cerca pratiche"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="border-white/60 bg-white/80"
            />
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuova pratica
          </Button>
        </div>

        <div className="glass-panel glass-strong p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Allievo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Creata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(4)].map((_, index) => (
                  <TableRow key={`case-sk-${index}`}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length ? (
                filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.student.firstName} {item.student.lastName}
                    </TableCell>
                    <TableCell>{item.category || "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={item.status}
                        onValueChange={async (value) => {
                          const res = await updateAutoscuolaCaseStatus({
                            caseId: item.id,
                            status: value,
                          });
                          if (!res.success) {
                            toast.error({
                              description:
                                res.message ??
                                "Impossibile aggiornare lo stato pratica.",
                            });
                            return;
                          }
                          setCases((prev) =>
                            prev.map((row) =>
                              row.id === item.id ? { ...row, status: value } : row,
                            ),
                          );
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {new Date(item.createdAt).toLocaleDateString("it-IT")}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Nessuna pratica trovata.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova pratica</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleCreate}>
            <Select
              value={form.studentId}
              onValueChange={(value) => setForm((prev) => ({ ...prev, studentId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona allievo" />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.firstName} {student.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Categoria (es. B)"
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            />
            <Input
              placeholder="Status (es. iscritto)"
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Scadenza foglio rosa
                </p>
                <DatePicker
                  value={form.pinkSheetExpiresAt}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, pinkSheetExpiresAt: value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Scadenza visita medica
                </p>
                <DatePicker
                  value={form.medicalExpiresAt}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, medicalExpiresAt: value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={!form.studentId}>
                Salva
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ClientPageWrapper>
  );
}
