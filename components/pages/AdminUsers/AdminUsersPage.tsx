"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAtomValue } from "jotai";

import { companyAtom } from "@/atoms/company.store";
import { FadeIn } from "@/components/ui/fade-in";
import { PageHeader } from "@/components/ui/page-header";
import { DetailPanel } from "@/components/ui/detail-panel";
import { AdminUsersInviteDialog } from "@/components/pages/AdminUsers/AdminUsersInviteDialog";
import { AdminUsersCreateDialog } from "@/components/pages/AdminUsers/AdminUsersCreateDialog";
import { updateUser, deleteUser } from "@/lib/actions/user.actions";
import {
  sendTestPushToStudent,
  sendBroadcastPush,
  clearPushDevices,
} from "@/lib/actions/autoscuole.actions";
import {
  cancelCompanyInvite,
  resendCompanyInvite,
} from "@/lib/actions/invite.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Loader2,
  MailPlus,
  MoreHorizontal,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

type AutoscuolaRole = "OWNER" | "INSTRUCTOR_OWNER" | "INSTRUCTOR" | "STUDENT";

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  autoscuolaRole?: AutoscuolaRole;
  status: "active" | "invited";
};

// ─── Constants / helpers ─────────────────────────────────────────────────────

const ROLE_LABELS: Record<AutoscuolaRole, string> = {
  OWNER: "Titolare",
  INSTRUCTOR_OWNER: "Istruttore e Titolare",
  INSTRUCTOR: "Istruttore",
  STUDENT: "Allievo",
};

const ROLE_OPTIONS: AutoscuolaRole[] = [
  "OWNER",
  "INSTRUCTOR_OWNER",
  "INSTRUCTOR",
  "STUDENT",
];

const AVATAR_COLORS = ["#222222", "#3f3f3f", "#6a6a6a", "#460479", "#428bff", "#1a7f50", "#c13515", "#b45309"];

const avatarColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

function RolePill({ role }: { role: AutoscuolaRole }) {
  const isStudent = role === "STUDENT";
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-[20px] border px-2.5 py-[3px] text-xs font-semibold",
        isStudent
          ? "border-[#e5e5e5] bg-[#f7f7f7] text-[#6a6a6a]"
          : "border-[#cfcfdc] bg-[#eef0f6] text-navy-900",
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

function StatusPill({ status }: { status: "active" | "invited" }) {
  return status === "active" ? (
    <span className="whitespace-nowrap rounded-[20px] border border-[#c5e8d4] bg-[#f0faf4] px-2.5 py-[3px] text-xs font-semibold text-[#1a7f50]">
      Attivo
    </span>
  ) : (
    <span className="whitespace-nowrap rounded-[20px] border border-[#f0e060] bg-[#fffce0] px-2.5 py-[3px] text-xs font-semibold text-[#7a6a00]">
      Invitato
    </span>
  );
}

const panelInputClass =
  "w-full rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 py-2.5 text-sm font-medium text-foreground outline-none transition focus:border-[#222222]";

// ─── Main component ──────────────────────────────────────────────────────────

export function AdminUsersPage({
  users,
  page,
  totalPages,
  total,
  initialQuery,
  roleFilter,
}: {
  users: AdminUserRow[];
  page: number;
  totalPages: number;
  total: number;
  initialQuery: string;
  roleFilter: AutoscuolaRole | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useFeedbackToast();
  const company = useAtomValue(companyAtom);
  const isAdmin = company?.role === "admin";
  const [isRefetching, startRefetch] = React.useTransition();

  // Toolbar state
  const [searchOpen, setSearchOpen] = React.useState(Boolean(initialQuery));
  const [searchValue, setSearchValue] = React.useState(initialQuery);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [pushOpen, setPushOpen] = React.useState(false);
  const [clearPushOpen, setClearPushOpen] = React.useState(false);
  const [clearingPush, setClearingPush] = React.useState(false);

  // Push dialog state
  const [pushTitle, setPushTitle] = React.useState("");
  const [pushBody, setPushBody] = React.useState("");
  const [pushRole, setPushRole] = React.useState<string>("all");
  const [pushSending, setPushSending] = React.useState(false);

  // Detail panel state
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [activeUser, setActiveUser] = React.useState<AdminUserRow | null>(null);

  React.useEffect(() => {
    setSearchValue(initialQuery);
  }, [initialQuery]);

  const pushParams = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      // startTransition: la lista corrente resta visibile (opacity ridotta)
      // durante il refetch server, senza far scattare il loading.tsx di route.
      startRefetch(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [searchParams, router, pathname],
  );

  const goToPage = (next: number) => {
    if (next < 1 || next > Math.max(totalPages, 1) || next === page) return;
    pushParams((params) => params.set("page", String(next)));
  };

  const submitSearch = () => {
    pushParams((params) => {
      if (searchValue.trim()) params.set("query", searchValue.trim());
      else params.delete("query");
      params.set("page", "1");
    });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchValue("");
    if (initialQuery) {
      pushParams((params) => {
        params.delete("query");
        params.set("page", "1");
      });
    }
  };

  const setRoleFilter = (role: AutoscuolaRole | null) => {
    pushParams((params) => {
      if (role) params.set("role", role);
      else params.delete("role");
      params.set("page", "1");
    });
  };

  const openDetail = (user: AdminUserRow) => {
    setActiveUser(user);
    setPanelOpen(true);
  };

  return (
    <div className="w-full" data-testid="admin-users-page">
      <FadeIn className="mx-auto max-w-7xl space-y-5">
        <PageHeader
          title="Utenti"
          subtitle={`Sono registrati in autoscuola un totale di ${total} ${total === 1 ? "utente" : "utenti"}`}
        />

        {/* Toolbar */}
        <div className="relative flex min-h-[42px] flex-nowrap items-center gap-2.5">
          {/* Pagination */}
          <div className="flex shrink-0 select-none items-center gap-2 text-[13px] font-medium text-[#929292]">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              aria-label="Pagina precedente"
              className="cursor-pointer px-0.5 text-[#929292] transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40"
            >
              <ChevronLeft className="size-4" strokeWidth={1.8} />
            </button>
            <span>
              {String(page).padStart(2, "0")} / {Math.max(totalPages, 1)}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              aria-label="Pagina successiva"
              className="cursor-pointer px-0.5 text-[#929292] transition-colors hover:text-navy-900 disabled:cursor-default disabled:opacity-40"
            >
              <ChevronRight className="size-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="flex-1" />

          {/* Filtri ruolo */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative flex h-[34px] shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-[#f0f0f0]"
              >
                <ListFilter className="size-4 text-[#888888]" strokeWidth={1.7} />
                <span className="text-[13px] font-medium text-[#555555]">Filtri</span>
                {roleFilter && (
                  <span className="absolute right-0.5 top-0.5 h-[7px] w-[7px] rounded-full bg-navy-900" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[190px]">
              {ROLE_OPTIONS.map((role) => (
                <DropdownMenuItem
                  key={role}
                  onClick={() => setRoleFilter(roleFilter === role ? null : role)}
                  className="flex items-center justify-between text-[13px] font-medium"
                >
                  {ROLE_LABELS[role]}
                  {roleFilter === role && (
                    <span className="h-[7px] w-[7px] rounded-full bg-navy-900" />
                  )}
                </DropdownMenuItem>
              ))}
              {roleFilter && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setRoleFilter(null)}
                    className="text-[13px] font-medium text-navy-900"
                  >
                    Rimuovi filtri
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Crea utente */}
          {isAdmin && (
            <button
              type="button"
              title="Crea utente"
              onClick={() => setCreateOpen(true)}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center text-[#929292] transition-colors hover:text-foreground"
            >
              <UserPlus className="size-[21px]" strokeWidth={1.9} />
            </button>
          )}

          {/* Search: icona → pillola espansa */}
          {!searchOpen ? (
            <button
              type="button"
              title="Cerca utenti"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center text-[#929292] transition-colors hover:text-foreground"
            >
              <Search className="size-[19px]" strokeWidth={1.7} />
            </button>
          ) : (
            <div className="absolute right-0 top-1/2 z-[5] flex -translate-y-1/2 items-center gap-3 bg-white pl-4">
              <div className="flex min-w-[200px] max-w-[280px] items-center gap-2 rounded-[50px] border-[1.5px] border-[#222222] bg-white px-3.5 py-[9px]">
                <Search className="size-[15px] shrink-0 text-[#929292]" strokeWidth={1.6} />
                <input
                  autoFocus
                  placeholder="Cerca utenti"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitSearch();
                    if (e.key === "Escape") closeSearch();
                  }}
                  className="min-w-0 flex-1 border-none bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-[#929292]"
                />
              </div>
              <button
                type="button"
                onClick={closeSearch}
                className="shrink-0 cursor-pointer select-none text-sm font-semibold text-foreground hover:underline"
              >
                Annulla
              </button>
            </div>
          )}

          {/* Altre azioni admin */}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Altre azioni"
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center text-[#929292] transition-colors hover:text-foreground"
                >
                  <MoreHorizontal className="size-[21px]" strokeWidth={1.9} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[210px]">
                <DropdownMenuItem
                  onClick={() => setInviteOpen(true)}
                  className="gap-2.5 text-[13px] font-medium"
                >
                  <MailPlus className="size-4 text-[#6a6a6a]" strokeWidth={1.7} />
                  Invita utente
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setPushOpen(true)}
                  className="gap-2.5 text-[13px] font-medium"
                >
                  <Bell className="size-4 text-[#6a6a6a]" strokeWidth={1.7} />
                  Invia notifica push
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setClearPushOpen(true)}
                  className="gap-2.5 text-[13px] font-medium text-[#c13515]"
                >
                  <Trash2 className="size-4" strokeWidth={1.7} />
                  Reset push token
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Rows — restano visibili (attenuate) durante il refetch */}
        <div
          className={cn(
            "border-t border-[#f0f0f0] transition-opacity duration-200",
            isRefetching && "pointer-events-none opacity-60",
          )}
        >
          {users.length ? (
            users.map((user) => (
              <div
                key={user.id}
                className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_150px_100px_100px] items-center gap-3 border-b border-[#f0f0f0] py-3.5 transition-colors hover:bg-[#fafafa] max-lg:grid-cols-[minmax(0,1.5fr)_110px_100px]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: avatarColor(user.id) }}
                  >
                    <span className="text-xs font-bold text-white">{initialsOf(user.name)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-foreground">
                      {user.name}
                    </div>
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-[#929292] lg:hidden">
                      {user.email}
                    </div>
                  </div>
                </div>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap pr-3 text-[13px] font-medium text-[#6a6a6a] max-lg:hidden">
                  {user.email}
                </div>
                <div className="flex items-center">
                  <RolePill role={user.autoscuolaRole ?? "STUDENT"} />
                </div>
                <div className="flex items-center">
                  <StatusPill status={user.status} />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => openDetail(user)}
                    className="cursor-pointer select-none whitespace-nowrap rounded-[8px] border border-[#dddddd] px-3.5 py-[7px] text-[13px] font-medium text-foreground transition-colors hover:border-[#cdcdcd] hover:bg-[#f2f2f2]"
                  >
                    Dettaglio
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-16 text-center">
              <Search className="mx-auto mb-3 size-8 text-[#dddddd]" strokeWidth={2} />
              <div className="mb-1 text-sm font-semibold text-foreground">Nessun risultato</div>
              <div className="text-[13px] font-medium text-[#929292]">Nessun utente trovato</div>
            </div>
          )}
        </div>
      </FadeIn>

      {/* ── Detail panel utente ── */}
      <DetailPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        testId="user-detail-panel"
        className="w-[min(520px,92vw)]"
      >
        {activeUser && (
          <UserDetailPanelContent
            key={activeUser.id}
            user={activeUser}
            isAdmin={isAdmin}
            onClose={() => setPanelOpen(false)}
            onChanged={() => router.refresh()}
          />
        )}
      </DetailPanel>

      {/* ── Dialog esistenti ── */}
      <AdminUsersCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AdminUsersInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      {/* Broadcast push */}
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

      {/* Reset push token (conferma) */}
      <AlertDialog open={clearPushOpen} onOpenChange={setClearPushOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancellare tutti i push token?</AlertDialogTitle>
            <AlertDialogDescription>
              Gli utenti dovranno riaprire l&apos;app per ri-registrare il dispositivo alle notifiche.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearingPush}
              onClick={async (e) => {
                e.preventDefault();
                setClearingPush(true);
                const res = await clearPushDevices();
                setClearingPush(false);
                setClearPushOpen(false);
                if (!res.success) {
                  toast.error({ description: res.message ?? "Errore." });
                  return;
                }
                toast.success({ description: `${res.data!.deleted} device token eliminati.` });
              }}
            >
              {clearingPush ? "Cancellazione..." : "Conferma"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Detail panel content ────────────────────────────────────────────────────

function UserDetailPanelContent({
  user,
  isAdmin,
  onClose,
  onChanged,
}: {
  user: AdminUserRow;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useFeedbackToast();
  const [name, setName] = React.useState(user.name);
  const [role, setRole] = React.useState<AutoscuolaRole>(user.autoscuolaRole ?? "STUDENT");
  const [saving, setSaving] = React.useState(false);
  const [testPushing, setTestPushing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);

  const isInvited = user.status === "invited";
  const dirty = name.trim() !== user.name || role !== (user.autoscuolaRole ?? "STUDENT");

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error({ description: "Il nome non può essere vuoto." });
      return;
    }
    setSaving(true);
    const res = await updateUser({
      id: user.id,
      name: name.trim(),
      email: user.email,
      autoscuolaRole: role,
    });
    setSaving(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile salvare." });
      return;
    }
    toast.success({ description: "Utente aggiornato." });
    onChanged();
  };

  const handleTestPush = async () => {
    setTestPushing(true);
    const res = await sendTestPushToStudent(user.id);
    setTestPushing(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Errore invio push." });
      return;
    }
    const d = res.data!;
    const details = [
      `${d.sent} inviate, ${d.failed} fallite, ${d.skipped} saltate`,
      ...(d.errorCodes?.length ? [`${d.errorCodes.join(", ")}`] : []),
    ].join(" · ");
    (d.failed ? toast.error : toast.success)({ description: `Push: ${details}` });
  };

  const handleDelete = async () => {
    setDeleting(true);
    const res = await deleteUser(user.id);
    setDeleting(false);
    setDeleteOpen(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile eliminare." });
      return;
    }
    toast.success({ description: "Utente eliminato." });
    onClose();
    onChanged();
  };

  const handleResendInvite = async () => {
    setResending(true);
    const res = await resendCompanyInvite({ inviteId: user.id });
    setResending(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile reinviare l'invito." });
      return;
    }
    toast.success({ description: "Invito reinviato." });
    onChanged();
  };

  const handleCancelInvite = async () => {
    setCancelling(true);
    const res = await cancelCompanyInvite({ inviteId: user.id });
    setCancelling(false);
    setCancelOpen(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile annullare l'invito." });
      return;
    }
    toast.success({ description: "Invito annullato." });
    onClose();
    onChanged();
  };

  return (
    <div>
      {/* Header centrato come il panel Allievi */}
      <div className="border-b border-[#dddddd] px-6 pb-5 pt-6">
        <div className="relative flex flex-col items-center pt-2 text-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="absolute right-0 top-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f2f2f2]"
          >
            <X className="size-3.5 text-[#6a6a6a]" strokeWidth={1.8} />
          </button>
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: avatarColor(user.id) }}
          >
            <span className="text-lg font-bold text-white">{initialsOf(user.name)}</span>
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold tracking-[-0.2px] text-foreground">{user.name}</div>
            <div className="mt-0.5 text-[13px] font-medium text-[#929292]">{user.email}</div>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            <RolePill role={user.autoscuolaRole ?? "STUDENT"} />
            <StatusPill status={user.status} />
          </div>
        </div>
      </div>

      <div className="space-y-7 p-6">
        {isInvited ? (
          <>
            <div>
              <div className="mb-4 text-xs font-semibold text-[#929292]">Invito in attesa</div>
              <p className="text-[13px] font-medium leading-relaxed text-[#6a6a6a]">
                L&apos;utente non ha ancora accettato l&apos;invito ricevuto via email. Puoi
                reinviarlo oppure annullarlo.
              </p>
            </div>
            {isAdmin && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleResendInvite}
                  disabled={resending}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-navy-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
                >
                  {resending && <Loader2 className="size-4 animate-spin" />}
                  Reinvia invito
                </button>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  disabled={cancelling}
                  className="w-full cursor-pointer rounded-[10px] border border-[#dddddd] bg-white px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-[#222222] disabled:opacity-60"
                >
                  Annulla invito
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Anagrafica */}
            <div>
              <div className="mb-4 text-xs font-semibold text-[#929292]">Anagrafica</div>
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold text-foreground">Nome e cognome</div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!isAdmin}
                    className={cn(panelInputClass, !isAdmin && "opacity-60")}
                    placeholder="Nome utente"
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold text-foreground">Email</div>
                  <div className="text-sm font-medium text-[#6a6a6a]">{user.email}</div>
                  <div className="mt-1 text-xs font-medium text-[#b2b2b2]">
                    L&apos;email non è modificabile.
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold text-foreground">Ruolo autoscuola</div>
                  <Select
                    value={role}
                    onValueChange={(v) => setRole(v as AutoscuolaRole)}
                    disabled={!isAdmin}
                  >
                    <SelectTrigger className="h-10 w-full rounded-[10px] border-[1.5px] border-[#dddddd] text-sm font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !dirty}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-navy-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-navy-800 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    Salva modifiche
                  </button>
                )}
              </div>
            </div>

            {/* Azioni */}
            {isAdmin && (
              <div className="border-t border-[#f2f2f2] pt-6">
                <div className="mb-4 text-xs font-semibold text-[#929292]">Azioni</div>
                <div className="space-y-3.5">
                  <button
                    type="button"
                    onClick={handleTestPush}
                    disabled={testPushing}
                    className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[#428bff] hover:underline disabled:opacity-60"
                  >
                    {testPushing && <Loader2 className="size-3.5 animate-spin" />}
                    Invia notifica di prova
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    disabled={deleting}
                    className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[#c13515] hover:underline disabled:opacity-60"
                  >
                    Elimina utente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Conferma eliminazione */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;utente verrà rimosso dall&apos;autoscuola. L&apos;operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className="bg-[#c13515] hover:bg-[#a52d12]"
            >
              {deleting ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conferma annulla invito */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullare l&apos;invito?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;utente non potrà più accettare questo invito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                handleCancelInvite();
              }}
            >
              {cancelling ? "Annullando..." : "Annulla invito"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
