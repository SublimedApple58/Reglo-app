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
  "Mostrami i workflow più usati questa settimana",
  "Come posso collegare il mio storage?",
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

  const showSlashMenu = input.trim().startsWith("/");
  const slashQuery = input.replace("/", "").toLowerCase();
  const filteredCommands = useMemo(
    () =>
      slashCommands.filter(
        ({ command, hint }) =>
          command.toLowerCase().includes(slashQuery) ||
          hint.toLowerCase().includes(slashQuery),
      ),
    [slashQuery],
  );

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMessage: Message = {
      id: `${Date.now()}`,
      text: input.trim(),
      role: "user",
    };
    setMessages((prev) => [...prev, newMessage]);
    setInput("");
    queueMicrotask(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const handleSend = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendMessage();
  };

  return (
    <ClientPageWrapper title="Assistant">
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Assistant sandbox
              </CardTitle>
              <CardDescription>
                Chat essenziale con suggerimenti rapidi e slash commands.
              </CardDescription>
            </div>
            <Badge variant="outline">UI only</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative rounded-2xl border bg-muted/30">
              <div
                ref={listRef}
                className="max-h-[360px] space-y-3 overflow-y-auto p-4"
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
                  <div className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2 text-sm text-muted-foreground">
                    <MessageCircle className="h-4 w-4 text-primary" />
                    Nessun messaggio ancora. Inizia con un comando o una domanda.
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t bg-background/60 p-3">
                {!input.trim() && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Domande frequenti
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {frequentQuestions.map((question) => (
                        <motion.button
                          key={question}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setInput(question)}
                          className="rounded-full border bg-muted px-3 py-2 text-left text-sm transition hover:border-primary/50 hover:text-foreground"
                        >
                          {question}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={handleSend} className="relative space-y-2">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder='Scrivi un prompt o "/" per i comandi rapidi'
                    className="w-full pr-24"
                    rows={3}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Invio per inviare, Shift+Invio per nuova linea</span>
                    <Badge variant="outline">Mock agent</Badge>
                  </div>
                  <Button type="submit" className="absolute right-1 top-1 h-8">
                    Invia
                  </Button>

                  <AnimatePresence>
                    {showSlashMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.15 }}
                        className="absolute -top-[228px] left-0 right-0"
                      >
                        <CommandPalette
                          commands={filteredCommands}
                          onSelect={(command) => setInput(`${command} `)}
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
          <Card>
            <CardHeader>
              <CardTitle>Comandi disponibili</CardTitle>
              <CardDescription>Gli stessi mostrati con &ldquo;/&rdquo;.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {slashCommands.map((item) => (
                <div
                  key={item.command}
                  className="flex items-start justify-between rounded-lg border px-3 py-2"
                >
                  <div>
                    <p className="font-mono text-sm text-primary">{item.command}</p>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setInput(`${item.command} `)}
                  >
                    Usa
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Note conversazione</CardTitle>
              <CardDescription>
                Solo UI: salva promemoria rapidi sulle chat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                className="min-h-[120px]"
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
    <div className="relative max-w-[80%] rounded-2xl bg-gradient-to-br from-primary to-primary/70 px-4 py-3 text-sm text-white shadow-lg">
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
    <Card className="shadow-xl">
      <CardContent className="p-2">
        <MotionHighlight className="flex flex-col gap-2">
          {commands.length ? (
            commands.map((item) => (
              <MotionHighlightItem key={item.command} value={item.command}>
                <button
                  type="button"
                  onClick={() => onSelect(item.command)}
                  className={cn(
                    "flex w-full items-start justify-between rounded-lg px-3 py-2 text-left transition",
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
