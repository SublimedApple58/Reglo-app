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
            <Select
              value={form.type}
              onValueChange={(value) => setForm((prev) => ({ ...prev, type: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guida">Guida</SelectItem>
                <SelectItem value="esame">Esame</SelectItem>
              </SelectContent>
            </Select>
            <DateTimePicker
              value={form.startsAt}
              onChange={(value) => setForm((prev) => ({ ...prev, startsAt: value }))}
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

const WEEK_DAYS = ["L", "M", "M", "G", "V", "S", "D"];

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDateTimeLocal = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;

const generateTimeOptions = () => {
  const times: string[] = [];
  for (let hour = 7; hour <= 21; hour += 1) {
    times.push(`${pad(hour)}:00`);
    times.push(`${pad(hour)}:30`);
  }
  return times;
};

function DateTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const initialDate = value ? new Date(value) : null;
  const [month, setMonth] = React.useState<Date>(initialDate ?? new Date());
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(initialDate);
  const [time, setTime] = React.useState<string>(
    initialDate ? `${pad(initialDate.getHours())}:${pad(initialDate.getMinutes())}` : "09:00",
  );

  React.useEffect(() => {
    if (!value) return;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return;
    setSelectedDate(parsed);
    setMonth(parsed);
    setTime(`${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`);
  }, [value]);

  const buildCalendar = () => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const totalDays = lastDay.getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let day = 1; day <= totalDays; day += 1) {
      cells.push(new Date(year, monthIndex, day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const applySelection = (date: Date | null, nextTime = time) => {
    if (!date) return;
    const [hours, minutes] = nextTime.split(":").map(Number);
    const next = new Date(date);
    next.setHours(hours, minutes, 0, 0);
    setSelectedDate(next);
    onChange(formatDateTimeLocal(next));
  };

  const days = buildCalendar();
  const timeOptions = generateTimeOptions();

  return (
    <div className="rounded-2xl border border-white/60 bg-white/80 p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-white/80"
          onClick={() =>
            setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
          }
        >
          ←
        </button>
        <div className="text-sm font-medium text-foreground">
          {month.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
        </div>
        <button
          type="button"
          className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-white/80"
          onClick={() =>
            setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
          }
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEK_DAYS.map((day) => (
          <div key={day} className="py-1 font-semibold">
            {day}
          </div>
        ))}
        {days.map((day, index) => {
          const isSelected =
            day && selectedDate && day.toDateString() === selectedDate.toDateString();
          return (
            <button
              key={`${day?.toISOString() ?? "empty"}-${index}`}
              type="button"
              disabled={!day}
              onClick={() => applySelection(day)}
              className={[
                "h-9 rounded-lg text-sm",
                day ? "hover:bg-[#dfeff0] text-foreground" : "opacity-0",
                isSelected ? "bg-[#aee2d4] text-[#1f2a44] font-semibold" : "",
              ].join(" ")}
            >
              {day?.getDate() ?? ""}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <Select
          value={time}
          onValueChange={(value) => {
            setTime(value);
            if (selectedDate) {
              applySelection(selectedDate, value);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleziona orario" />
          </SelectTrigger>
          <SelectContent>
            {timeOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
