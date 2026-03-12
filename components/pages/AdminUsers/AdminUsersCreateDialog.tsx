"use client";

import React from "react";
import { UserPlus } from "lucide-react";
import { useAtomValue } from "jotai";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCompanyUser } from "@/lib/actions/user.actions";
import { companyAtom } from "@/atoms/company.store";

type AutoscuolaRole = "OWNER" | "INSTRUCTOR" | "STUDENT";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const defaultForm = {
  name: "",
  email: "",
  password: "",
  role: "member" as "member" | "admin",
  autoscuolaRole: "STUDENT" as AutoscuolaRole,
};

export function AdminUsersCreateDialog({ open, onOpenChange }: Props): React.ReactElement {
  const company = useAtomValue(companyAtom);
  const toast = useFeedbackToast();
  const [form, setForm] = React.useState(defaultForm);
  const [loading, setLoading] = React.useState(false);

  const isAutoscuola =
    company?.services?.some((s) => s.key === "AUTOSCUOLE" && s.status === "active") ?? false;

  const companyId = company?.id ?? null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!companyId) return;

    setLoading(true);
    try {
      const res = await createCompanyUser({
        companyId,
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        autoscuolaRole: form.autoscuolaRole,
      });

      if (!res.success) throw new Error(res.message ?? "Errore.");

      toast.success({ title: "Utente creato", description: res.message });
      setForm(defaultForm);
      onOpenChange(false);
    } catch (error) {
      toast.error({
        description: error instanceof Error ? error.message : "Errore nella creazione.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crea utente</DialogTitle>
          <DialogDescription>
            Crea direttamente un account e aggiungilo alla tua company.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-name">Nome</Label>
            <Input
              id="create-name"
              placeholder="Mario Rossi"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              placeholder="mario@example.com"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-password">Password</Label>
            <Input
              id="create-password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              required
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label>Ruolo</Label>
            <Select
              value={form.role}
              onValueChange={(v) =>
                setForm((p) => ({
                  ...p,
                  role: v as "member" | "admin",
                  autoscuolaRole: v === "admin" ? "OWNER" : p.autoscuolaRole,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAutoscuola && (
            <div className="space-y-2">
              <Label>Ruolo autoscuola</Label>
              <Select
                value={form.autoscuolaRole}
                onValueChange={(v) => setForm((p) => ({ ...p, autoscuolaRole: v as AutoscuolaRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STUDENT">Allievo</SelectItem>
                  <SelectItem value="INSTRUCTOR">Istruttore</SelectItem>
                  <SelectItem value="OWNER">Titolare</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              <UserPlus className="h-4 w-4" />
              {loading ? "Creazione..." : "Crea utente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
