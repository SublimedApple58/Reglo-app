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

type AdminUsersInviteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AdminUsersInviteDialog({
  open,
  onOpenChange,
}: AdminUsersInviteDialogProps): React.ReactElement {
  const company = useAtomValue(companyAtom);
  const toast = useFeedbackToast();
  const [inviteForm, setInviteForm] = React.useState({
    email: "",
    role: "member",
  });
  const [isInviteSending, setIsInviteSending] = React.useState(false);

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
        role: inviteForm.role as "member" | "admin",
      });

      if (!res.success) {
        throw new Error(res.message ?? "Invito non riuscito.");
      }

      setInviteForm((prev) => ({ ...prev, email: "" }));
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
          <DialogTitle>Invita membri</DialogTitle>
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
          <div className="space-y-2">
            <Label>Ruolo</Label>
            <Select
              value={inviteForm.role}
              onValueChange={(value) =>
                setInviteForm((prev) => ({
                  ...prev,
                  role: value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona ruolo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
