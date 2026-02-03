"use client";

import React from "react";
import { Plus, UploadCloud } from "lucide-react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  createAutoscuolaStudent,
  getAutoscuolaStudents,
  importAutoscuolaStudents,
} from "@/lib/actions/autoscuole.actions";
import { Skeleton } from "@/components/ui/skeleton";

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string | Date;
};

export function AutoscuoleStudentsPage() {
  const toast = useFeedbackToast();
  const [search, setSearch] = React.useState("");
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [filePreview, setFilePreview] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await getAutoscuolaStudents(search);
    if (!res.success || !res.data) {
      toast.error({
        description: res.message ?? "Impossibile caricare gli allievi.",
      });
      setLoading(false);
      return;
    }
    setStudents(res.data);
    setLoading(false);
  }, [search, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const res = await createAutoscuolaStudent({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
    });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile creare l'allievo.",
      });
      return;
    }
    setCreateOpen(false);
    setForm({ firstName: "", lastName: "", email: "", phone: "" });
    load();
  };

  const parseCsv = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return [];
    const lines = trimmed.split(/\r?\n/);
    if (!lines.length) return [];
    const delimiter = lines[0].includes(";") ? ";" : ",";
    const headers = lines[0]
      .split(delimiter)
      .map((header) => header.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const values = line.split(delimiter).map((value) => value.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return row;
    });
  };

  const handleCsvUpload = async (file: File) => {
    const text = await file.text();
    setFilePreview(text.slice(0, 600));
    const rows = parseCsv(text)
      .map((row) => ({
        firstName: row.first_name || row.firstname || row.nome || "",
        lastName: row.last_name || row.lastname || row.cognome || "",
        email: row.email || "",
        phone: row.phone || row.telefono || "",
        status: row.status || row.stato || undefined,
        notes: row.notes || row.note || undefined,
      }))
      .filter((row) => row.firstName && row.lastName);

    if (!rows.length) {
      toast.error({
        description: "CSV non valido: inserisci almeno nome e cognome.",
      });
      return;
    }

    const res = await importAutoscuolaStudents({ rows });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Importazione CSV non riuscita.",
      });
      return;
    }
    toast.success({
      description: `Importati ${res.data?.count ?? 0} allievi.`,
    });
    setImportOpen(false);
    setFilePreview(null);
    load();
  };

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Gestisci gli allievi e importa i dati base."
      hideHero
    >
      <div className="space-y-5">
        <AutoscuoleNav />

        <div className="glass-panel glass-strong flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-[220px]">
            <Input
              placeholder="Cerca allievi"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="border-white/60 bg-white/80"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <UploadCloud className="mr-2 h-4 w-4" />
              Importa CSV
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuovo allievo
            </Button>
          </div>
        </div>

        <div className="glass-panel glass-strong p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Allievo</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Creato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(4)].map((_, index) => (
                  <TableRow key={`sk-${index}`}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : students.length ? (
                students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">
                      {student.firstName} {student.lastName}
                    </TableCell>
                    <TableCell>{student.email || "—"}</TableCell>
                    <TableCell>{student.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {student.status ?? "active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(student.createdAt).toLocaleDateString("it-IT")}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Nessun allievo trovato.
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
            <DialogTitle>Nuovo allievo</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleCreate}>
            <Input
              placeholder="Nome"
              value={form.firstName}
              onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
            />
            <Input
              placeholder="Cognome"
              value={form.lastName}
              onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
            />
            <Input
              placeholder="Email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <Input
              placeholder="Telefono"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={!form.firstName.trim() || !form.lastName.trim()}>
                Salva
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importa CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Carica un CSV con queste colonne: <br />
              <span className="font-medium text-foreground">first_name, last_name, email, phone</span>
            </p>
            <Input
              type="file"
              accept=".csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleCsvUpload(file);
              }}
            />
            {filePreview && (
              <div className="rounded-lg border border-white/60 bg-white/70 p-3 text-xs text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">Anteprima file</p>
                <pre className="whitespace-pre-wrap">{filePreview}</pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ClientPageWrapper>
  );
}
