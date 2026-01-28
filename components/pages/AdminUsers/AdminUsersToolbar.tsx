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
  const [showInput, setShowInput] = React.useState(false);
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
      <div
        style={{
          position: "fixed",
          display: "flex",
          justifyContent: "center",
          zIndex: 1000,
          right: 24,
        }}
      >
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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          marginBlock: 16,
        }}
      >
        <form onSubmit={handleSubmit} style={{ width: "200px" }}>
          <InputButtonProvider showInput={showInput} setShowInput={setShowInput}>
            <InputButton>
              <InputButtonAction onClick={() => {}}>
                <p style={{ color: "white" }}></p>
              </InputButtonAction>
              <InputButtonSubmit onClick={() => {}} type="submit" />
            </InputButton>
            <InputButtonInput
              type="text"
              placeholder="Search..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </InputButtonProvider>
        </form>
      </div>
      <AdminUsersInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  );
}
