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
import { MailPlus } from "lucide-react";
import { useAtomValue } from "jotai";
import { companyAtom } from "@/atoms/company.store";
import { AdminUsersInviteDialog } from "@/components/pages/AdminUsers/AdminUsersInviteDialog";

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
      <div className="fixed right-6 z-[1000] flex justify-center">
        <ManagementBar
          totalRows={totalRows}
          actions={
            isAdmin
              ? [
                  {
                    id: "invite-member",
                    label: "Invita utente",
                    icon: MailPlus,
                    variant: "default",
                    onClick: () => setInviteOpen(true),
                  },
                ]
              : []
          }
        />
      </div>
      <div className="glass-panel glass-strong flex flex-col gap-4 p-4">
        <form onSubmit={handleSubmit} className="w-full md:max-w-sm">
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
              className="border-white/60 bg-white/80 pr-14 text-sm shadow-sm"
              autoFocus
            />
          </InputButtonProvider>
        </form>
      </div>
      <AdminUsersInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  );
}
