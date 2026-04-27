"use client";

import React from "react";
import { useAtomValue } from "jotai";
import { MailPlus } from "lucide-react";
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
import { createCompanyInvite } from "@/lib/actions/invite.actions";
import { companyAtom } from "@/atoms/company.store";

type AutoscuolaRole = "OWNER" | "INSTRUCTOR_OWNER" | "INSTRUCTOR" | "STUDENT";

type AdminUsersInviteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the autoscuola role and lock it (used from shortcuts like "Nuovo istruttore") */
  initialAutoscuolaRole?: AutoscuolaRole;
};

export function AdminUsersInviteDialog({
  open,
  onOpenChange,
  initialAutoscuolaRole,
}: AdminUsersInviteDialogProps): React.ReactElement {
  const company = useAtomValue(companyAtom);
  const toast = useFeedbackToast();

  const isAutoscuola = company?.services?.some(
    (s) => s.key === "AUTOSCUOLE" && s.status === "active"
  ) ?? false;

  const [inviteForm, setInviteForm] = React.useState({
    email: "",
    autoscuolaRole: (initialAutoscuolaRole ?? "STUDENT") as AutoscuolaRole,
  });
  const [isInviteSending, setIsInviteSending] = React.useState(false);

  // Sync autoscuolaRole if initialAutoscuolaRole prop changes (e.g. dialog reused)
  React.useEffect(() => {
    if (initialAutoscuolaRole) {
      setInviteForm((prev) => ({ ...prev, autoscuolaRole: initialAutoscuolaRole }));
    }
  }, [initialAutoscuolaRole]);

  const companyId = company?.id ?? null;
  const isAdmin = company?.role === "admin";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!companyId) {
      toast.error({ description: "Company non trovata." });
      return;
    }

    if (!isAdmin) {
      toast.error({ description: "Solo gli admin possono invitare utenti." });
      return;
    }

    const email = inviteForm.email.trim();
    if (!email) {
      toast.error({ description: "Inserisci un indirizzo email." });
      return;
    }

    setIsInviteSending(true);
    try {
      const res = await createCompanyInvite({
        companyId,
        email,
        ...(isAutoscuola && { autoscuolaRole: inviteForm.autoscuolaRole }),
      });

      if (!res.success) {
        throw new Error(res.message ?? "Invito non riuscito.");
      }

      setInviteForm((prev) => ({
        ...prev,
        email: "",
        autoscuolaRole: initialAutoscuolaRole ?? "STUDENT",
      }));
      toast.success({
        title: "Invito inviato",
        description: "L'email di invito e' stata inviata.",
      });
      onOpenChange(false);
    } catch (error) {
      toast.error({
        description:
          error instanceof Error ? error.message : "Invito non riuscito.",
      });
    } finally {
      setIsInviteSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initialAutoscuolaRole === "INSTRUCTOR" || initialAutoscuolaRole === "INSTRUCTOR_OWNER"
              ? "Invita istruttore"
              : "Invita membri"}
          </DialogTitle>
          <DialogDescription>
            Invia un invito per entrare nella tua company.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="name@company.com"
              value={inviteForm.email}
              onChange={(event) =>
                setInviteForm((prev) => ({
                  ...prev,
                  email: event.target.value,
                }))
              }
            />
          </div>

          {/* Autoscuola role — only for autoscuola companies */}
          {isAutoscuola && (
            <div className="space-y-2">
              <Label>Ruolo autoscuola</Label>
              {initialAutoscuolaRole ? (
                // Locked pre-filled value, just show it read-only
                <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground">
                  {initialAutoscuolaRole === "INSTRUCTOR"
                    ? "Istruttore"
                    : initialAutoscuolaRole === "INSTRUCTOR_OWNER"
                      ? "Istruttore e Titolare"
                      : initialAutoscuolaRole === "OWNER"
                        ? "Titolare"
                        : "Allievo"}
                </div>
              ) : (
                <Select
                  value={inviteForm.autoscuolaRole}
                  onValueChange={(value) =>
                    setInviteForm((prev) => ({
                      ...prev,
                      autoscuolaRole: value as AutoscuolaRole,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona ruolo autoscuola" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STUDENT">Allievo</SelectItem>
                    <SelectItem value="INSTRUCTOR">Istruttore</SelectItem>
                    <SelectItem value="INSTRUCTOR_OWNER">Istruttore e Titolare</SelectItem>
                    <SelectItem value="OWNER">Titolare</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="submit"
              disabled={!isAdmin || isInviteSending}
              className="w-full sm:w-auto"
            >
              <MailPlus className="h-4 w-4" />
              {isInviteSending ? "Invio..." : "Invia invito"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
