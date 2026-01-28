"use client";

import { ArrowUp, Bot, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AiWorkflowPreview } from "@/lib/ai/types";

type WorkflowAiPanelProps = {
  collapsed: boolean;
  onToggle: () => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  loading: boolean;
  questions: string[];
  answers: Record<string, string>;
  onAnswerChange: (question: string, value: string) => void;
  error?: string | null;
  preview?: AiWorkflowPreview | null;
  onOpenPreview: () => void;
};

const ThinkingIndicator = () => (
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
    <span>AI sta pensando…</span>
  </div>
);

export function WorkflowAiPanel({
  collapsed,
  onToggle,
  prompt,
  onPromptChange,
  onGenerate,
  loading,
  questions,
  answers,
  onAnswerChange,
  error,
  preview,
  onOpenPreview,
}: WorkflowAiPanelProps) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="glass-panel flex h-full w-10 flex-col items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="rotate-90">AI</span>
      </button>
    );
  }

  const previewReady = preview?.status === "ok" || preview?.status === "blocked";

  return (
    <aside className="glass-panel flex w-80 shrink-0 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          AI
        </p>
        <Button type="button" variant="ghost" size="icon" onClick={onToggle}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          if (!loading && prompt.trim()) {
            onGenerate();
          }
        }}
      >
        <Input
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Descrivi il workflow da creare…"
          className="h-11 rounded-full border-white/40 bg-white/70 pr-11 text-sm shadow-inner"
        />
        <button
          type="submit"
          aria-label="Genera preview"
          disabled={loading || !prompt.trim()}
          className={cn(
            "absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-primary text-primary-foreground shadow-sm transition",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>

      {questions.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Chiarimenti
          </p>
          {questions.map((question) => (
            <div key={question} className="space-y-2">
              <p className="text-xs text-foreground">{question}</p>
              <Input
                value={answers[question] ?? ""}
                onChange={(event) => onAnswerChange(question, event.target.value)}
                placeholder="Scrivi qui la tua risposta"
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onGenerate}
            disabled={loading}
          >
            Invia chiarimenti
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      {preview?.status === "not_possible" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {preview.message ?? "Questo flusso non e' supportato al momento."}
        </div>
      ) : null}

      {preview?.status === "blocked" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Integra i servizi richiesti per applicare il workflow.
        </div>
      ) : null}

      {loading ? <ThinkingIndicator /> : null}

      {previewReady ? (
        <button
          type="button"
          onClick={onOpenPreview}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <Bot className="h-4 w-4" />
          Apri preview
        </button>
      ) : null}

      <p className={cn("text-[11px] text-muted-foreground")}>
        L&apos;AI usa solo i blocchi gia disponibili e le integrazioni connesse.
      </p>
    </aside>
  );
}
