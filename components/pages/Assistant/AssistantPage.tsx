"use client";

import React, { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MessageCircle, Sparkles } from "lucide-react";
import {
  MotionHighlight,
  MotionHighlightItem,
} from "@/components/animate-ui/effects/motion-highlight";

type Message = {
  id: string;
  text: string;
  role: "user";
};

const frequentQuestions = [
  "Mostrami i workflow più usati questo mese",
  "Come posso collegare una nuova integrazione?",
  "Crea una checklist per l'onboarding",
  "Quali documenti sono in attesa di firma?",
];

const slashCommands = [
  { command: "/riassumi", hint: "Riassumi un testo incollato" },
  { command: "/estrai-date", hint: "Trova scadenze dentro un documento" },
  { command: "/genera-email", hint: "Bozza di email formale" },
  { command: "/crea-task", hint: "Apri un task nel workspace" },
  { command: "/spiega", hint: "Spiegami questo punto in parole semplici" },
];

export function AssistantPage(): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const trimmedInput = input.trim();
  const showSlashMenu = trimmedInput.startsWith("/");
  const slashQuery = trimmedInput.startsWith("/")
    ? trimmedInput.slice(1).toLowerCase()
    : "";
  const filteredCommands = useMemo(
    () =>
      slashCommands.filter(
        ({ command, hint }) =>
          command.toLowerCase().includes(slashQuery) ||
          hint.toLowerCase().includes(slashQuery),
      ),
    [slashQuery],
  );

  const focusInput = () => {
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMessage: Message = {
      id: `${Date.now()}`,
      text: input.trim(),
      role: "user",
    };
    setMessages((prev) => [...prev, newMessage]);
    setInput("");
    focusInput();
    queueMicrotask(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const handleSend = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendMessage();
  };

  const handleQuickInsert = (value: string) => {
    setInput(value);
    focusInput();
  };

  const handleCommandSelect = (command: string) => {
    setInput(`${command} `);
    focusInput();
  };

  return (
    <ClientPageWrapper
      title="Assistant"
      subTitle="Prompt rapidi, comandi smart e suggerimenti contestuali."
    >
      <div className="grid gap-4 xl:grid-cols-[2.1fr_1fr]">
        <Card className="glass-panel glass-strong relative overflow-hidden">
          <CardHeader className="relative flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 shadow-inner">
                  <Sparkles className="h-4 w-4 text-primary" />
                </span>
                Reglo Assistant
              </CardTitle>
              <CardDescription className="text-sm">
                Prompt rapido, comandi smart e suggerimenti contestuali.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-white/60 bg-white/70 text-xs">
              Beta
            </Badge>
          </CardHeader>
          <CardContent className="relative space-y-4">
            <div className="relative rounded-3xl border border-white/40 bg-white/60 shadow-inner backdrop-blur">
              <div
                ref={listRef}
                className="max-h-[380px] space-y-3 overflow-y-auto px-4 pb-4 pt-6"
              >
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="flex justify-end"
                    >
                      <MessageBubble text={message.text} />
                    </motion.div>
                  ))}
                </AnimatePresence>

                {!messages.length && (
                  <div className="flex items-center gap-3 rounded-2xl border border-white/50 bg-white/70 px-3 py-2 text-sm text-muted-foreground shadow-sm">
                    <MessageCircle className="h-4 w-4 text-primary" />
                    Nessun messaggio ancora. Inizia con un comando o una domanda.
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-white/40 bg-white/70 px-4 py-4">
                {!input.trim() && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Suggerimenti
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {frequentQuestions.map((question) => (
                        <motion.button
                          key={question}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleQuickInsert(question)}
                          className="rounded-full border border-white/50 bg-white/70 px-3 py-2 text-left text-sm text-foreground/80 transition hover:border-primary/40 hover:text-foreground"
                        >
                          {question}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={handleSend} className="relative space-y-2">
                  <div className="relative">
                    <Textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder='Scrivi un prompt o "/" per i comandi rapidi'
                      className="min-h-[110px] w-full border-white/50 bg-white/80 pr-20 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-primary/50"
                      rows={3}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          sendMessage();
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      className="absolute bottom-3 right-3 h-10 w-10 rounded-full bg-primary text-white shadow-lg"
                    >
                      Invia
                    </Button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Invio per inviare, Shift+Invio per nuova linea</span>
                    <Badge variant="outline" className="border-white/60 bg-white/70 text-[10px]">
                      Mock agent
                    </Badge>
                  </div>

                  <AnimatePresence>
                    {showSlashMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-30"
                      >
                        <CommandPalette
                          commands={filteredCommands}
                          onSelect={handleCommandSelect}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </form>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="glass-panel glass-strong">
            <CardHeader>
              <CardTitle className="text-base">Comandi disponibili</CardTitle>
              <CardDescription>Gli stessi mostrati con &ldquo;/&rdquo;.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {slashCommands.map((item) => (
                <div
                  key={item.command}
                  className="flex items-start justify-between rounded-2xl border border-white/50 bg-white/70 px-3 py-2 shadow-sm"
                >
                  <div>
                    <p className="font-mono text-sm text-primary">{item.command}</p>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleCommandSelect(item.command)}
                  >
                    Usa
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel glass-strong">
            <CardHeader>
              <CardTitle className="text-base">Note conversazione</CardTitle>
              <CardDescription>
                Solo UI: salva promemoria rapidi sulle chat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                className="min-h-[120px] border-white/50 bg-white/80"
                placeholder="Es. chiedi riepilogo ordini, ricordati di allegare PDF..."
              />
              <Separator />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>La logica AI non è cablata.</span>
                <Badge variant="secondary">Frontend only</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ClientPageWrapper>
  );
}

function MessageBubble({ text }: { text: string }) {
  return (
    <div className="relative max-w-[80%] rounded-2xl bg-gradient-to-br from-primary/90 to-primary px-4 py-3 text-sm text-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.6)]">
      {text}
    </div>
  );
}

function CommandPalette({
  commands,
  onSelect,
}: {
  commands: { command: string; hint: string }[];
  onSelect: (command: string) => void;
}) {
  return (
    <Card className="glass-panel shadow-xl">
      <CardContent className="p-2">
        <MotionHighlight className="flex flex-col gap-2">
          {commands.length ? (
            commands.map((item) => (
              <MotionHighlightItem key={item.command} value={item.command}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelect(item.command)}
                  className={cn(
                    "flex w-full items-start justify-between rounded-2xl px-3 py-2 text-left transition",
                    "hover:text-foreground",
                  )}
                >
                  <div>
                    <p className="font-mono text-sm">{item.command}</p>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  </div>
                  <Badge variant="outline">↵</Badge>
                </button>
              </MotionHighlightItem>
            ))
          ) : (
            <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Nessun comando trovato.
            </div>
          )}
        </MotionHighlight>
      </CardContent>
    </Card>
  );
}

export default AssistantPage;
