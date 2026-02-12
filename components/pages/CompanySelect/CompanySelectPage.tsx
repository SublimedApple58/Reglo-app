"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createCompanyForUser, setActiveCompany } from "@/lib/actions/company.actions";
import { Building2, Plus } from "lucide-react";

type CompanyOption = {
  id: string;
  name: string;
  role: "admin" | "member";
  logoUrl: string | null;
  plan: string;
};

type CompanySelectPageProps = {
  companies: CompanyOption[];
  activeCompanyId: string | null;
  locale: string;
};

export function CompanySelectPage({
  companies,
  activeCompanyId,
  locale,
}: CompanySelectPageProps): React.ReactElement {
  const router = useRouter();
  const toast = useFeedbackToast();
  const [creating, setCreating] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [companyName, setCompanyName] = React.useState("");

  const handleSelect = async (companyId: string) => {
    if (companyId === activeCompanyId) {
      router.push(`/${locale}/user/home`);
      return;
    }
    const res = await setActiveCompany({ companyId });
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile selezionare company." });
      return;
    }
    router.push(`/${locale}/user/home`);
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = companyName.trim();
    if (!name) {
      toast.error({ description: "Inserisci un nome company." });
      return;
    }
    setCreating(true);
    const res = await createCompanyForUser({ name });
    if (!res.success) {
      toast.error({ description: res.message ?? "Creazione non riuscita." });
      setCreating(false);
      return;
    }
    setCreating(false);
    setCreateOpen(false);
    setCompanyName("");
    router.push(`/${locale}/user/home`);
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Company
        </p>
        <h1 className="text-3xl font-semibold text-[#324e7a]">
          Scegli la company da aprire
        </h1>
        <p className="text-sm text-muted-foreground">
          Puoi cambiare company in qualsiasi momento dal menu in alto nella sidebar.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {companies.map((company) => (
          <Card key={company.id} className="glass-panel glass-strong">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg">{company.name}</CardTitle>
              <CardDescription className="text-xs">
                {company.plan} · {company.role === "admin" ? "Admin" : "Member"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => handleSelect(company.id)}
              >
                Entra nella company
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass-panel glass-strong border-dashed border-primary/25">
        <CardContent className="flex flex-col items-start gap-3 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-white shadow-sm">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Crea una nuova company</p>
              <p className="text-xs text-muted-foreground">
                Avvia una nuova area di lavoro separata.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nuova company
          </Button>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crea nuova company</DialogTitle>
            <DialogDescription>
              Dai un nome alla nuova company per iniziare.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Nome company</Label>
              <Input
                id="company-name"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Es. Studio Reglo"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={creating}>
                {creating ? "Creazione..." : "Crea company"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
