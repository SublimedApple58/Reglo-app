"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatId } from "@/lib/utils";
import DeleteDialog from "@/components/shared/delete-dialog";
import { deleteUser } from "@/lib/actions/user.actions";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import UpdateUserForm from "@/components/pages/AdminUsers/UpdateUserForm";

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
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
  const formId = "update-user-form";

  const handleOpen = (user: AdminUserRow) => {
    setActiveUser(user);
    setOpen(true);
  };

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-[120px] text-xs uppercase tracking-[0.18em]">
                ID
              </TableHead>
              <TableHead className="text-xs uppercase tracking-[0.18em]">
                Nome
              </TableHead>
              <TableHead className="text-xs uppercase tracking-[0.18em]">
                Email
              </TableHead>
              <TableHead className="text-xs uppercase tracking-[0.18em]">
                Ruolo
              </TableHead>
              <TableHead className="text-right text-xs uppercase tracking-[0.18em]">
                Azioni
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const initials = user.name
                ? user.name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()
                : "U";
              return (
                <TableRow key={user.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatId(user.id)}
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
                          {user.role === "user" ? "Member" : "Admin"}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    {user.role === "user" ? (
                      <Badge variant="secondary">User</Badge>
                    ) : (
                      <Badge variant="default">Admin</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => handleOpen(user)}
                      >
                        Edit
                      </Button>
                      <DeleteDialog id={user.id} action={deleteUser} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Drawer open={open} onOpenChange={setOpen} direction="right">
        <DrawerContent className="sm:max-w-xl h-full">
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
          <DrawerFooter className="sticky bottom-0 border-t bg-background/95 backdrop-blur flex-col gap-3 px-6 py-4">
            <Button
              type="submit"
              form={formId}
              className="w-full"
              disabled={!activeUser || isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" type="button" className="w-full">
                Chiudi
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
