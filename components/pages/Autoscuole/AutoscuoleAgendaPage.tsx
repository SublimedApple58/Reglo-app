"use client";

import React from "react";
import { Plus } from "lucide-react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  createAutoscuolaAppointment,
  getAutoscuolaAppointments,
  getAutoscuolaStudents,
} from "@/lib/actions/autoscuole.actions";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type StudentOption = { id: string; firstName: string; lastName: string };
type AppointmentRow = {
  id: string;
  type: string;
  status: string;
  startsAt: string | Date;
  student: StudentOption;
};

export function AutoscuoleAgendaPage() {
  const toast = useFeedbackToast();
  const [appointments, setAppointments] = React.useState<AppointmentRow[]>([]);
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    studentId: "",
    type: "guida",
    startsAt: "",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    const [appRes, studentRes] = await Promise.all([
      getAutoscuolaAppointments(),
      getAutoscuolaStudents(),
    ]);
    if (!appRes.success || !appRes.data) {
      toast.error({
        description: appRes.message ?? "Impossibile caricare l'agenda.",
      });
    } else {
      setAppointments(appRes.data);
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

  const filtered = appointments.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      item.student.firstName.toLowerCase().includes(term) ||
      item.student.lastName.toLowerCase().includes(term) ||
      item.type.toLowerCase().includes(term)
    );
  });

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.studentId || !form.startsAt) return;
    const res = await createAutoscuolaAppointment({
      studentId: form.studentId,
      type: form.type,
      startsAt: form.startsAt,
    });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile creare l'appuntamento.",
      });
      return;
    }
    setCreateOpen(false);
    setForm({ studentId: "", type: "guida", startsAt: "" });
    load();
  };

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Agenda guide ed esami."
      hideHero
    >
      <div className="space-y-5">
        <AutoscuoleNav />

        <div className="glass-panel glass-strong flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-[220px]">
            <Input
              placeholder="Cerca appuntamenti"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="border-white/60 bg-white/80"
            />
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuovo appuntamento
          </Button>
        </div>

        <div className="glass-panel glass-strong p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Allievo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(4)].map((_, index) => (
                  <TableRow key={`agenda-sk-${index}`}>
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
                    <TableCell>{item.type}</TableCell>
                    <TableCell>
                      {new Date(item.startsAt).toLocaleString("it-IT")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Nessun appuntamento in agenda.
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
            <DialogTitle>Nuovo appuntamento</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleCreate}>
            <select
              className="h-10 w-full rounded-md border border-white/60 bg-white/80 px-3 text-sm"
              value={form.studentId}
              onChange={(event) => setForm((prev) => ({ ...prev, studentId: event.target.value }))}
            >
              <option value="">Seleziona allievo</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName}
                </option>
              ))}
            </select>
            <select
              className="h-10 w-full rounded-md border border-white/60 bg-white/80 px-3 text-sm"
              value={form.type}
              onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
            >
              <option value="guida">Guida</option>
              <option value="esame">Esame</option>
            </select>
            <Input
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={!form.studentId || !form.startsAt}>
                Salva
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ClientPageWrapper>
  );
}
