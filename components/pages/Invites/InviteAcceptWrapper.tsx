"use client";

import { useEffect, useState } from "react";
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
  getCompanyInvite,
} from "@/lib/actions/invite.actions";

type InviteDetails = {
  companyName: string;
  email: string;
  role: string;
  expiresAt: Date | string;
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
  const toast = useFeedbackToast();
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const locale = typeof params?.locale === "string" ? params.locale : undefined;

  useEffect(() => {
    let isMounted = true;
    const loadInvite = async () => {
      const res = await getCompanyInvite({ token });
      if (!isMounted) return;
      if (!res.success) {
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
    const base = locale ? `/${locale}` : "";
    router.push(`${base}/user/home`);
  };

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
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button onClick={handleAccept} disabled={accepting}>
              {accepting ? "Accepting..." : "Accept invite"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
