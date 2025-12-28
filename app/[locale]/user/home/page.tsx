"use client";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { Sparkles, CheckCircle2, Clock3, ArrowUpRight } from "lucide-react";

const highlights = [
  { label: "Workflows attivi", value: "12", badge: "+3 vs ieri" },
  { label: "Documenti processati", value: "1.4K", badge: "98% success" },
  { label: "Task in coda", value: "23", badge: "2 critici" },
];

const recent = [
  { title: "Onboarding nuovo cliente", time: "10 min fa", status: "Completato" },
  { title: "Sync TeamSystem · fatture", time: "35 min fa", status: "In esecuzione" },
  { title: "Validazione documenti HR", time: "1h fa", status: "Completato" },
  { title: "Alert SLA workflow vendite", time: "2h fa", status: "In attesa" },
];

const quickLinks = [
  { title: "Crea workflow", desc: "Blueprint preconfigurati", icon: <Sparkles className="h-4 w-4" /> },
  { title: "Carica documenti", desc: "PDF, CSV, DOCX", icon: <ArrowUpRight className="h-4 w-4" /> },
  { title: "Apri assistente", desc: "Prompt rapidi e ricette", icon: <Sparkles className="h-4 w-4" /> },
];

export default function HomePage(): React.ReactElement {
  const userName = "Tiziano"; // TODO: fetch from session/profile when available
  return (
    <ClientPageWrapper title="Home" hideHero>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-background to-background p-6 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-primary">Overview</p>
                <h2 className="text-2xl font-semibold text-foreground">Ciao, {userName}</h2>
                <p className="text-sm text-muted-foreground">
                  Stato operativo sintetico: flussi, documenti e attività di oggi.
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary shadow-inner">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {highlights.map((item) => (
                <div key={item.label} className="rounded-xl bg-white/80 px-4 py-3 shadow-md shadow-primary/5 backdrop-blur">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-xl font-semibold text-foreground">{item.value}</p>
                  <span className="text-[11px] font-medium text-primary/80">{item.badge}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-card p-5 shadow-lg shadow-black/5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Attività recenti</h3>
              <span className="text-xs text-muted-foreground">Ultime 2 ore</span>
            </div>
            <div className="space-y-3">
              {recent.map((item) => (
                <div
                  key={item.title}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/80 px-4 py-3 shadow-sm shadow-black/5 backdrop-blur"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shadow-inner">
                      {item.status === "Completato" ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.time}</p>
                    </div>
                  </div>
                  <span
                    className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground"
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white/90 p-4 shadow-lg shadow-black/5 backdrop-blur">
            <h3 className="text-lg font-semibold text-foreground">Azioni rapide</h3>
            <p className="text-xs text-muted-foreground">Riprendi subito dove avevi lasciato.</p>
            <div className="mt-3 space-y-3">
              {quickLinks.map((item) => (
                <button
                  key={item.title}
                  className="flex w-full items-center justify-between rounded-xl bg-muted/50 px-4 py-3 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shadow-inner">
                      {item.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-white to-white p-4 shadow-lg shadow-primary/10">
            <h3 className="text-lg font-semibold text-foreground">Insight rapido</h3>
            <p className="text-xs text-muted-foreground">
              Sette giorni di performance workflow.
            </p>
            <div className="mt-4 flex items-end gap-2">
              {[60, 80, 45, 90, 72, 88, 96].map((v, idx) => (
                <div key={idx} className="flex-1 rounded-full bg-muted/60">
                  <div
                    className="w-full rounded-full bg-primary/80"
                    style={{ height: `${v}%` }}
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Miglioramento costante: +12% vs settimana scorsa.
            </p>
          </div>
        </div>
      </div>
    </ClientPageWrapper>
  );
}
