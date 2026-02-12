"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DeleteDialog from "@/components/shared/delete-dialog";
import { deleteUser } from "@/lib/actions/user.actions";
import {
  cancelCompanyInvite,
  resendCompanyInvite,
} from "@/lib/actions/invite.actions";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import UpdateUserForm from "@/components/pages/AdminUsers/UpdateUserForm";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { cn } from "@/lib/utils";

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  autoscuolaRole?: "OWNER" | "INSTRUCTOR" | "STUDENT";
  status: "active" | "invited";
};

type AdminUsersTableProps = {
  users: AdminUserRow[];
};

export function AdminUsersTable({
  users,
}: AdminUsersTableProps): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [activeUser, setActiveUser] = React.useState<AdminUserRow | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [selectedItems, setSelectedItems] = React.useState<Record<string, boolean>>({});
  const formId = "update-user-form";

  const handleOpen = (user: AdminUserRow) => {
    setActiveUser({
      ...user,
      autoscuolaRole: user.autoscuolaRole ?? "STUDENT",
    });
    setOpen(true);
  };

  const toggleSelectAll = () => {
    const next = { ...selectedItems };
    const allSelected = users.length > 0 && users.every((row) => selectedItems[row.id]);
    users.forEach((row) => {
      next[row.id] = !allSelected;
    });
    setSelectedItems(next);
  };

  const toggleSelect = (id: string) => {
    setSelectedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allOnPageSelected =
    users.length > 0 && users.every((row) => selectedItems[row.id]);

  const handleResendInvite = async () => {
    if (!activeUser) return;
    setIsResending(true);
    const res = await resendCompanyInvite({ inviteId: activeUser.id });
    setIsResending(false);
    if (!res.success) {
      router.refresh();
      return;
    }
    router.refresh();
  };

  const handleCancelInvite = async () => {
    if (!activeUser) return;
    setIsCancelling(true);
    const res = await cancelCompanyInvite({ inviteId: activeUser.id });
    setIsCancelling(false);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <div className="glass-panel glass-strong mt-4 p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px] text-center">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all users on this page"
                />
              </TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Ruolo</TableHead>
              <TableHead>Ruolo Autoscuola</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length ? (
              users.map((user) => {
                const initials = user.name
                  ? user.name
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()
                  : "U";
                const isAdmin = user.role === "admin";
                const isInvited = user.status === "invited";
                return (
                  <TableRow key={user.id}>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={selectedItems[user.id] || false}
                        onCheckedChange={() => toggleSelect(user.id)}
                        aria-label={`Select user ${user.email}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {user.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {isAdmin ? "Admin" : "Member"}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "rounded-full border border-white/60 bg-white/70 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm",
                          isAdmin ? "text-emerald-700" : "text-slate-600",
                        )}
                      >
                        {isAdmin ? "Admin" : "Member"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "rounded-full border border-white/60 bg-white/70 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm",
                          user.autoscuolaRole === "OWNER"
                            ? "text-sky-700"
                            : user.autoscuolaRole === "INSTRUCTOR"
                              ? "text-indigo-700"
                              : "text-emerald-700",
                        )}
                      >
                        {user.autoscuolaRole === "OWNER"
                          ? "Titolare"
                          : user.autoscuolaRole === "INSTRUCTOR"
                            ? "Istruttore"
                            : "Allievo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full border border-white/60 bg-white/70 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm",
                          isInvited ? "text-amber-700" : "text-emerald-700",
                        )}
                      >
                        {isInvited ? "Invited" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => handleOpen(user)}
                          className="rounded-full px-3 text-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                        >
                          Edit
                        </Button>
                        {isInvited ? null : (
                          <DeleteDialog id={user.id} action={deleteUser} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Nessun utente disponibile.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Drawer open={open} onOpenChange={setOpen} direction="right">
        <DrawerContent className="sm:max-w-xl h-full">
          {activeUser?.status === "invited" ? (
            <>
              <DrawerHeader>
                <DrawerTitle>Invito in attesa</DrawerTitle>
                <DrawerDescription>
                  L&apos;utente non ha ancora accettato l&apos;invito.
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex-1 space-y-4 px-6 pb-6">
                <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm">
                  <p className="font-medium text-foreground">
                    {activeUser.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ruolo: {activeUser.role === "admin" ? "Admin" : "Member"}
                  </p>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleResendInvite}
                  disabled={isResending}
                >
                  {isResending ? "Reinvio..." : "Reinvia invito"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={isCancelling}
                    >
                      Annulla invito
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Annullare l&apos;invito?</AlertDialogTitle>
                      <AlertDialogDescription>
                        L&apos;utente non potr&agrave; pi&ugrave; accettare
                        questo invito.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Chiudi</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCancelInvite}>
                        {isCancelling ? "Annullando..." : "Annulla invito"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <DrawerFooter className="sticky bottom-0 border-t border-white/60 bg-white/90 backdrop-blur flex-col gap-3 px-6 py-4">
                <DrawerClose asChild>
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    Chiudi
                  </Button>
                </DrawerClose>
              </DrawerFooter>
            </>
          ) : (
            <>
              <DrawerHeader>
                <DrawerTitle>Update user</DrawerTitle>
                <DrawerDescription>
                  Modifica nome e ruolo dell&apos;utente selezionato.
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                {activeUser ? (
                  <UpdateUserForm
                    user={activeUser}
                    redirectOnSuccess={false}
                    formId={formId}
                    showFooterActions={false}
                    onSubmittingChange={setIsSubmitting}
                    onSuccess={() => {
                      setOpen(false);
                      router.refresh();
                    }}
                  />
                ) : null}
              </div>
              <DrawerFooter className="sticky bottom-0 border-t border-white/60 bg-white/90 backdrop-blur flex-col gap-3 px-6 py-4">
                <Button
                  type="submit"
                  form={formId}
                  className="w-full rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  disabled={!activeUser || isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save changes"}
                </Button>
                <DrawerClose asChild>
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    Chiudi
                  </Button>
                </DrawerClose>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
