"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  acceptCompanyInvite,
  acceptCompanyInviteAndRegister,
  acceptCompanyInviteWithPassword,
  getCompanyInviteContext,
} from "@/lib/actions/invite.actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOutUser } from "@/lib/actions/user.actions";
import { setActiveCompany } from "@/lib/actions/company.actions";

type InviteDetails = {
  companyId: string;
  companyName: string;
  email: string;
  role: string;
  expiresAt: Date | string;
  hasAccount: boolean;
  alreadyMember: boolean;
  isAuthenticated: boolean;
  sessionEmail: string | null;
};

export default function InviteAcceptWrapper({
  token,
}: {
  token: string;
}): React.ReactElement {
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const toast = useFeedbackToast();
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const locale = typeof params?.locale === "string" ? params.locale : undefined;
  const base = locale ? `/${locale}` : "";

  useEffect(() => {
    let isMounted = true;
    const loadInvite = async () => {
      const res = await getCompanyInviteContext({ token });
      if (!isMounted) return;
      if (!res.success || !res.data) {
        setError(res.message ?? "Invite not available.");
        setLoading(false);
        return;
      }
      setInvite(res.data);
      setLoading(false);
    };

    loadInvite();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    const res = await acceptCompanyInvite({ token });
    if (!res.success) {
      toast.error({ description: res.message ?? "Invite failed." });
      setAccepting(false);
      return;
    }

    toast.success({
      title: "Invite accepted",
      description: res.message ?? "You joined the company.",
    });
    router.push(`${base}/user/home`);
  };

  const handleAcceptWithPassword = async () => {
    setAccepting(true);
    const res = await acceptCompanyInviteWithPassword({ token, password });
    if (!res.success) {
      toast.error({ description: res.message ?? "Invite failed." });
      setAccepting(false);
      return;
    }
    toast.success({
      title: "Invite accepted",
      description: res.message ?? "You joined the company.",
    });
  };

  const handleAcceptAndRegister = async () => {
    setAccepting(true);
    const res = await acceptCompanyInviteAndRegister({
      token,
      name,
      password,
      confirmPassword,
    });
    if (!res.success) {
      toast.error({ description: res.message ?? "Invite failed." });
      setAccepting(false);
      return;
    }
    toast.success({
      title: "Invite accepted",
      description: res.message ?? "You joined the company.",
    });
  };

  const handleGoToCompany = async () => {
    if (!invite) return;
    setAccepting(true);
    const res = await setActiveCompany({ companyId: invite.companyId });
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile entrare." });
      setAccepting(false);
      return;
    }
    router.push(`${base}/user/home`);
  };

  const isWrongAccount = useMemo(() => {
    if (!invite?.isAuthenticated) return false;
    if (!invite.sessionEmail) return false;
    return invite.sessionEmail !== invite.email.toLowerCase();
  }, [invite]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Loading invite</CardTitle>
            <CardDescription>Checking your invitation.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Invite not available</CardTitle>
            <CardDescription>{error ?? "Invite not found."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.back()}>
              Go back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Join {invite.companyName}</CardTitle>
          <CardDescription>
            You are invited as {invite.role === "admin" ? "Admin" : "Member"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">{invite.email}</p>
            <p className="text-xs text-muted-foreground">
              Accept the invite to access the company workspace.
            </p>
          </div>
          {isWrongAccount ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                Sei loggato con un&apos;email diversa da quella invitata.
                Esci e accedi con {invite.email}.
              </div>
              <form action={signOutUser}>
                <Button variant="outline" type="submit" className="w-full">
                  Esci
                </Button>
              </form>
            </div>
          ) : invite.alreadyMember ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                Sei gi&agrave; membro di questa company.
              </div>
              {invite.isAuthenticated ? (
                <Button
                  onClick={handleGoToCompany}
                  disabled={accepting}
                  className="w-full"
                >
                  {accepting ? "Caricamento..." : "Vai alla company"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() =>
                    router.push(
                      `${base}/sign-in?callbackUrl=${encodeURIComponent(
                        `${base}/invite/${token}`
                      )}`
                    )
                  }
                  className="w-full"
                >
                  Accedi per continuare
                </Button>
              )}
            </div>
          ) : invite.isAuthenticated ? (
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button onClick={handleAccept} disabled={accepting}>
                {accepting ? "Accepting..." : "Accept invite"}
              </Button>
            </div>
          ) : invite.hasAccount ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="invite-password">Password</Label>
                <Input
                  id="invite-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button
                onClick={handleAcceptWithPassword}
                disabled={accepting || !password}
                className="w-full"
              >
                {accepting ? "Accepting..." : "Accept invite"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="invite-name">Nome completo</Label>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nome e Cognome"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-password-new">Password</Label>
                <Input
                  id="invite-password-new"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-password-confirm">Conferma password</Label>
                <Input
                  id="invite-password-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <Button
                onClick={handleAcceptAndRegister}
                disabled={
                  accepting || !name.trim() || !password || !confirmPassword
                }
                className="w-full"
              >
                {accepting ? "Creazione..." : "Crea account e accetta"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
