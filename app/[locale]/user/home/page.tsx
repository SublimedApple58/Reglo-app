"use client";

import React, { useMemo, useState } from "react";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import {
  ArrowUpRight,
  Bot,
  Sparkles,
  FileUp,
  ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  computePlanUsage,
  formatCurrency,
  type PlanKey,
} from "@/lib/plan-usage";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import slugify from "slugify";

type QuickAction = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactElement;
  onClick: () => void;
};

const planKey: PlanKey = "growth";
const usageSnapshot = {
  documentsUsed: 612,
  workflowsUsed: 46,
};

export default function HomePage(): React.ReactElement {
  const router = useRouter();
  const { data: session } = useSession();
  const [createOpen, setCreateOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const summary = useMemo(
    () => computePlanUsage(planKey, usageSnapshot),
    [],
  );

  const greetingName =
    session?.user?.name?.split(" ").filter(Boolean)[0] ?? "there";

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
  ];

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
                  Questo mese stai usando Reglo al massimo del suo potenziale.
                </p>
              </div>
              <div className="rounded-2xl border bg-white/80 px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Piano attuale
                </p>
                <p className="text-lg font-semibold text-[#324e7a]">
                  {summary.plan.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  Prezzo base {formatCurrency(summary.plan.basePrice)} / mese
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <UsageCard
                title="Documenti compilati"
                used={summary.docs.used}
                limit={summary.docs.currentLimit}
                remaining={summary.docs.remainingToNext}
                extraBlocks={summary.docs.extraBlocks}
                unitLabel="documenti"
                blockSize={summary.docs.blockSize}
                trackColor="bg-[#e9f2f2]"
                barColor="bg-[#a9d9d1]"
              />
              <UsageCard
                title="Workflow eseguiti"
                used={summary.workflows.used}
                limit={summary.workflows.currentLimit}
                remaining={summary.workflows.remainingToNext}
                extraBlocks={summary.workflows.extraBlocks}
                unitLabel="workflow"
                blockSize={summary.workflows.blockSize}
                trackColor="bg-[#e5e4f0]"
                barColor="bg-[#60579e]"
              />
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Consumi &amp; soglie
                </p>
                <p className="text-sm text-muted-foreground">
                  Controlla quando scattera il prossimo extra.
                </p>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => router.push("/user/billing")}
              >
                <ReceiptText className="h-4 w-4" />
                Vedi prossimo addebito
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <p className="font-semibold text-[#324e7a]">Documenti</p>
                <p>
                  Soglia base: {summary.docs.included} · Extra attivi:{" "}
                  {summary.docs.extraBlocks || 0}
                </p>
                <p>
                  Prossimo scatto: +{summary.docs.blockSize} documenti
                </p>
              </div>
              <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <p className="font-semibold text-[#324e7a]">Workflow</p>
                <p>
                  Soglia base: {summary.workflows.included} · Extra attivi:{" "}
                  {summary.workflows.extraBlocks || 0}
                </p>
                <p>
                  Prossimo scatto: +{summary.workflows.blockSize} workflow
                </p>
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

          <section className="rounded-2xl border bg-gradient-to-br from-[#e5e4f0] via-white to-white p-4 shadow-sm">
            <h3 className="text-base font-semibold text-[#324e7a]">
              Prossimo addebito
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Troverai il dettaglio completo nella sezione Billing.
            </p>
            <Button
              className="mt-4 w-full"
              variant="default"
              onClick={() => router.push("/user/billing")}
            >
              Apri dettaglio costi
            </Button>
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

function UsageCard({
  title,
  used,
  limit,
  remaining,
  extraBlocks,
  unitLabel,
  blockSize,
  trackColor,
  barColor,
}: {
  title: string;
  used: number;
  limit: number;
  remaining: number;
  extraBlocks: number;
  unitLabel: string;
  blockSize: number;
  trackColor: string;
  barColor: string;
}): React.ReactElement {
  const percent = Math.min((used / limit) * 100, 100);

  return (
    <div className="rounded-2xl border bg-white/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </p>
          <div className="mt-1 flex items-end gap-2">
            <p className="text-2xl font-semibold text-[#324e7a]">{used}</p>
            <p className="text-xs text-muted-foreground">su {limit}</p>
          </div>
        </div>
        {extraBlocks ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            +{extraBlocks} extra
          </span>
        ) : null}
      </div>
      <div className={`mt-4 h-2 rounded-full ${trackColor}`}>
        <div
          className={`h-2 rounded-full ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {remaining > 0
          ? `${remaining} ${unitLabel} al prossimo scatto`
          : `Prossimo scatto: +${blockSize} ${unitLabel}`}
      </p>
    </div>
  );
}
