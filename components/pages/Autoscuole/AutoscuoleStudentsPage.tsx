"use client";

import Link from "next/link";
import React from "react";
import { ExternalLink } from "lucide-react";
import { useLocale } from "next-intl";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { getAutoscuolaStudents } from "@/lib/actions/autoscuole.actions";
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

export function AutoscuoleStudentsPage({
  hideNav = false,
}: {
  hideNav?: boolean;
} = {}) {
  const locale = useLocale();
  const toast = useFeedbackToast();
  const [search, setSearch] = React.useState("");
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loading, setLoading] = React.useState(true);

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

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Allievi sincronizzati dalla Directory utenti."
      hideHero
    >
      <div className="space-y-5">
        {!hideNav ? <AutoscuoleNav /> : null}

        <div className="glass-panel glass-strong space-y-4 p-4">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Fonte unica: Directory utenti (ruolo Allievo).
            </p>
            <p>
              Per aggiungere, rimuovere o aggiornare un allievo usa la Directory. Questa lista si sincronizza automaticamente.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Cerca allievi"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="max-w-sm border-white/60 bg-white/80"
            />
            <Button asChild variant="outline">
              <Link href={`/${locale}/admin/users`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Apri Directory utenti
              </Link>
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
    </ClientPageWrapper>
  );
}
