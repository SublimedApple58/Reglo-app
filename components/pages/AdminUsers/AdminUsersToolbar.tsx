"use client";

import React from "react";
import {
  InputButton,
  InputButtonAction,
  InputButtonInput,
  InputButtonProvider,
  InputButtonSubmit,
} from "@/components/animate-ui/buttons/input";
import { ManagementBar } from "@/components/animate-ui/ui-elements/management-bar";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, Loader2, MailPlus, UserPlus } from "lucide-react";
import { useAtomValue } from "jotai";
import { companyAtom } from "@/atoms/company.store";
import { AdminUsersInviteDialog } from "@/components/pages/AdminUsers/AdminUsersInviteDialog";
import { AdminUsersCreateDialog } from "@/components/pages/AdminUsers/AdminUsersCreateDialog";
import { sendBroadcastPush } from "@/lib/actions/autoscuole.actions";
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
import { useFeedbackToast } from "@/components/ui/feedback-toast";

type AdminUsersToolbarProps = {
  totalRows: number;
  initialQuery?: string | null;
};

export function AdminUsersToolbar({
  totalRows,
  initialQuery,
}: AdminUsersToolbarProps): React.ReactElement {
  const [showInput, setShowInput] = React.useState(true);
  const [value, setValue] = React.useState(initialQuery ?? "");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pushOpen, setPushOpen] = React.useState(false);
  const [pushTitle, setPushTitle] = React.useState("");
  const [pushBody, setPushBody] = React.useState("");
  const [pushRole, setPushRole] = React.useState<string>("all");
  const [pushSending, setPushSending] = React.useState(false);
  const toast = useFeedbackToast();
  const company = useAtomValue(companyAtom);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = company?.role === "admin";

  React.useEffect(() => {
    setValue(initialQuery ?? "");
  }, [initialQuery]);

  const handleSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!showInput) {
        setShowInput(true);
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("query", value);
      } else {
        params.delete("query");
      }
      params.set("page", "1");
      router.push(`${pathname}?${params}`);
    },
    [showInput, value, pathname, router, searchParams],
  );

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSubmit} className="w-full sm:max-w-sm">
          <InputButtonProvider showInput={showInput} setShowInput={setShowInput} className="w-full">
            <InputButton className="w-full">
              <InputButtonAction className="hidden" />
              <InputButtonSubmit
                onClick={() => {}}
                type="submit"
                className="bg-foreground text-background hover:bg-foreground/90"
              />
            </InputButton>
            <InputButtonInput
              type="text"
              placeholder="Cerca utenti"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="pr-14 text-sm"
              autoFocus
            />
          </InputButtonProvider>
        </form>

        <ManagementBar
          totalRows={totalRows}
          actions={
            isAdmin
              ? [
                  {
                    id: "create-member",
                    label: "Crea utente",
                    icon: UserPlus,
                    variant: "default",
                    onClick: () => setCreateOpen(true),
                  },
                  {
                    id: "invite-member",
                    label: "Invita utente",
                    icon: MailPlus,
                    variant: "outline" as const,
                    onClick: () => setInviteOpen(true),
                  },
                  {
                    id: "broadcast-push",
                    label: "Invia notifica",
                    icon: Bell,
                    variant: "outline" as const,
                    onClick: () => setPushOpen(true),
                  },
                ]
              : []
          }
        />
      </div>
      <AdminUsersInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <AdminUsersCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={pushOpen} onOpenChange={setPushOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invia notifica push</DialogTitle>
            <DialogDescription>
              Invia una notifica push agli utenti della company.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!pushTitle.trim() || !pushBody.trim()) return;
              setPushSending(true);
              const res = await sendBroadcastPush({
                title: pushTitle.trim(),
                body: pushBody.trim(),
                role: pushRole === "all" ? null : (pushRole as "OWNER" | "INSTRUCTOR" | "STUDENT"),
              });
              setPushSending(false);
              if (!res.success) {
                toast.error({ description: res.message ?? "Errore invio push." });
                return;
              }
              const d = res.data!;
              const details = [
                `${d.targeted} destinatari, ${d.sent} ricevute, ${d.failed} fallite, ${d.skipped} senza device`,
                ...(d.errorCodes?.length ? [`Codici: ${d.errorCodes.join(", ")}`] : []),
                ...(d.errorMessages?.length ? [`Errori: ${d.errorMessages.join(", ")}`] : []),
              ].join(" · ");
              (d.failed ? toast.error : toast.success)({ description: details });
              setPushOpen(false);
              setPushTitle("");
              setPushBody("");
              setPushRole("all");
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Destinatari</Label>
              <Select value={pushRole} onValueChange={setPushRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="STUDENT">Solo Allievi</SelectItem>
                  <SelectItem value="INSTRUCTOR">Solo Istruttori</SelectItem>
                  <SelectItem value="OWNER">Solo Titolari</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="push-title">Titolo</Label>
              <Input
                id="push-title"
                placeholder="Titolo notifica"
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="push-body">Messaggio</Label>
              <Input
                id="push-body"
                placeholder="Corpo del messaggio"
                value={pushBody}
                onChange={(e) => setPushBody(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pushSending} className="w-full sm:w-auto">
                {pushSending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="mr-2 h-4 w-4" />
                )}
                {pushSending ? "Invio in corso…" : "Invia notifica"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
