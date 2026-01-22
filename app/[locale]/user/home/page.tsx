"use client";

import React, { useState } from "react";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import {
  ArrowUpRight,
  Bot,
  FileUp,
  ReceiptText,
  Sparkles,
  Workflow,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useAtomValue } from "jotai";
import { userSessionAtom } from "@/atoms/user.store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import slugify from "slugify";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { getHomeOverview } from "@/lib/actions/home.actions";

type QuickAction = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactElement;
  onClick: () => void;
};

type HomeOverview = {
  companyName: string;
  metrics: {
    documentsCompletedMonth: number;
    workflowsCompletedMonth: number;
    activeWorkflows: number;
    pendingDocuments: number;
  };
  recentDocuments: Array<{
    id: string;
    name: string;
    templateName: string;
    status: string;
    completedAt: string | null;
    updatedAt: string;
  }>;
  recentRuns: Array<{
    id: string;
    workflowName: string;
    status: string;
    finishedAt: string | null;
    createdAt: string;
  }>;
};

export default function HomePage(): React.ReactElement {
  const router = useRouter();
  const session = useAtomValue(userSessionAtom);
  const toast = useFeedbackToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const [overview, setOverview] = useState<HomeOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      if (active) setIsLoading(true);
      const res = await getHomeOverview();
      if (!active) return;
      if (!res.success || !res.data) {
        toast.error({
          description: res.message ?? "Impossibile caricare la dashboard.",
        });
        setIsLoading(false);
        return;
      }
      setOverview(res.data);
      setIsLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [toast]);

  const greetingName =
    session?.user?.name?.split(" ").filter(Boolean)[0] ?? "there";
  const metrics = overview?.metrics;

  const quickActions: QuickAction[] = [
    {
      id: "create-workflow",
      title: "Crea nuovo workflow",
      description: "Da zero o con blueprint",
      icon: <Sparkles className="h-4 w-4" />,
      onClick: () => setCreateOpen(true),
    },
    {
      id: "upload-docs",
      title: "Carica documenti",
      description: "PDF, CSV, DOCX",
      icon: <FileUp className="h-4 w-4" />,
      onClick: () => router.push("/user/doc_manager"),
    },
    {
      id: "open-assistant",
      title: "Apri assistente",
      description: "Prompt rapidi e ricette",
      icon: <Bot className="h-4 w-4" />,
      onClick: () => router.push("/user/assistant"),
    },
    {
      id: "open-compilazioni",
      title: "Gestisci compilazioni",
      description: "Richieste in corso e completate",
      icon: <ClipboardCheck className="h-4 w-4" />,
      onClick: () => router.push("/user/compilazioni"),
    },
  ];

  const formatShortDate = (value: string | null) => {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
    });
  };

  return (
    <ClientPageWrapper title="Home" hideHero>
      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          <section className="rounded-3xl border bg-gradient-to-br from-[#e9f2f2] via-white to-[#f6f7fb] p-6 shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#324e7a]">
                  Bentornato
                </p>
                <h1 className="text-2xl font-semibold text-[#324e7a]">
                  Ciao, {greetingName}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Snapshot operativo del mese corrente.
                </p>
              </div>
              <div className="rounded-2xl border bg-white/80 px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Workspace
                </p>
                <p className="text-lg font-semibold text-[#324e7a]">
                  {overview?.companyName ?? "Reglo"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Dati aggiornati in tempo reale
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <MetricCard
                title="Compilazioni completate"
                value={metrics?.documentsCompletedMonth ?? 0}
                description="Mese corrente"
                isLoading={isLoading}
                accent="bg-[#a9d9d1]"
                icon={<ClipboardCheck className="h-4 w-4" />}
              />
              <MetricCard
                title="Workflow completati"
                value={metrics?.workflowsCompletedMonth ?? 0}
                description="Mese corrente"
                isLoading={isLoading}
                accent="bg-[#60579e]"
                icon={<Workflow className="h-4 w-4" />}
              />
              <MetricCard
                title="Workflow attivi"
                value={metrics?.activeWorkflows ?? 0}
                description="Attivi ora"
                isLoading={isLoading}
                accent="bg-[#d8d2f1]"
                icon={<Sparkles className="h-4 w-4" />}
              />
              <MetricCard
                title="Compilazioni in attesa"
                value={metrics?.pendingDocuments ?? 0}
                description="Da completare"
                isLoading={isLoading}
                accent="bg-[#e9f2f2]"
                icon={<ReceiptText className="h-4 w-4" />}
              />
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Attivit&#224; recente
                </p>
                <p className="text-sm text-muted-foreground">
                  Eventi del mese corrente su documenti e workflow.
                </p>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => router.push("/user/compilazioni")}
              >
                <ClipboardCheck className="h-4 w-4" />
                Vedi compilazioni
              </Button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Compilazioni
                </p>
                <div className="mt-3 space-y-3">
                  {isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ) : overview?.recentDocuments.length ? (
                    overview.recentDocuments.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {item.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.templateName}
                          </p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <p>{formatShortDate(item.completedAt ?? item.updatedAt)}</p>
                          <p>{item.status === "completed" ? "Completato" : "In corso"}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Nessuna compilazione recente.
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Workflow
                </p>
                <div className="mt-3 space-y-3">
                  {isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ) : overview?.recentRuns.length ? (
                    overview.recentRuns.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {item.workflowName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.status === "completed"
                              ? "Completato"
                              : item.status === "failed"
                                ? "Errore"
                                : item.status}
                          </p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <p>{formatShortDate(item.finishedAt ?? item.createdAt)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Nessuna esecuzione recente.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border bg-white/90 p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-foreground">Azioni rapide</h3>
            <p className="text-xs text-muted-foreground">
              Crea e avvia subito il prossimo flusso.
            </p>
            <div className="mt-4 space-y-3">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  className="flex w-full items-center justify-between rounded-xl bg-muted/50 px-4 py-3 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
                  type="button"
                  onClick={action.onClick}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shadow-inner">
                      {action.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {action.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {action.description}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo workflow</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = workflowName.trim();
              if (!trimmed) return;
              const slug =
                slugify(trimmed, { lower: true, strict: true }) ||
                `workflow-${Date.now()}`;
              const params = new URLSearchParams();
              params.set("mode", "new");
              params.set("name", trimmed);
              router.push(`/user/workflows/${slug}?${params.toString()}`);
              setWorkflowName("");
              setCreateOpen(false);
            }}
          >
            <Input
              value={workflowName}
              onChange={(event) => setWorkflowName(event.target.value)}
              placeholder="Nome workflow"
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={!workflowName.trim()}>
                Crea
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ClientPageWrapper>
  );
}

function MetricCard({
  title,
  value,
  description,
  isLoading,
  accent,
  icon,
}: {
  title: string;
  value: number;
  description: string;
  isLoading: boolean;
  accent: string;
  icon: React.ReactElement;
}): React.ReactElement {
  return (
    <div className="rounded-2xl border bg-white/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </p>
          <div className="mt-2 flex items-end gap-2">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-semibold text-[#324e7a]">{value}</p>
            )}
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${accent}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}
