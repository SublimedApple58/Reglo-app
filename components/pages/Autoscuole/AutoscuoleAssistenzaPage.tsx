"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2, MessageCircle, Phone } from "lucide-react";

import {
  getSupportConversation,
  sendSupportMessage,
  type SupportMessageDto,
} from "@/lib/actions/support.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SUPPORT_WHATSAPP = "https://wa.me/393477756855";
const SUPPORT_PHONE = "+39 347 775 6855";

const POLL_INTERVAL_MS = 10_000;

const QUICK_REPLIES = [
  "Come funzionano i crediti guida?",
  "Ho un problema con una prenotazione",
  "Vorrei essere richiamato",
];

const WELCOME_TEXT =
  "Ciao! Qui parli direttamente con il team Reglo: scrivici qualsiasi cosa e ti rispondiamo in questa chat. Se preferisci, ci trovi anche su WhatsApp o al telefono.";

function ContactCards() {
  return (
    <div className="mt-2 flex w-[300px] max-w-full flex-col gap-2">
      <a
        href={SUPPORT_WHATSAPP}
        target="_blank"
        rel="noreferrer"
        className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[#e6e6e6] bg-white px-4 py-3.5 transition-all hover:border-[#222222] hover:bg-[#fafafa]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f3f3f3]">
          <MessageCircle className="size-5 text-foreground" strokeWidth={1.7} />
        </div>
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-foreground">Inviaci un messaggio</div>
          <div className="mt-px text-[12.5px] font-medium text-[#929292]">
            Tempo di risposta: entro 24 ore
          </div>
        </div>
      </a>
      <a
        href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}
        className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[#e6e6e6] bg-white px-4 py-3.5 transition-all hover:border-[#222222] hover:bg-[#fafafa]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f3f3f3]">
          <Phone className="size-5 text-foreground" strokeWidth={1.7} />
        </div>
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-foreground">Chiama</div>
          <div className="mt-px text-[12.5px] font-medium text-[#929292]">{SUPPORT_PHONE}</div>
        </div>
      </a>
    </div>
  );
}

/** Avatar del team = logo Reglo (lo stesso della top bar) in un cerchio bianco. */
function AssistantAvatar({ size }: { size: number }) {
  const logoSize = Math.round(size * 0.52);
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#e6e6e6] bg-white"
      style={{ width: size, height: size }}
    >
      <Image
        src="/images/nav/logo-reglo-tight.png"
        alt="Team Reglo"
        width={logoSize}
        height={logoSize}
        className="block select-none object-contain"
      />
    </div>
  );
}

/** Etichetta del separatore giorno: Oggi / Ieri / "8 luglio 2026". */
function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Oggi";
  if (sameDay(date, yesterday)) return "Ieri";
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

type MessageGroup = { day: string; messages: SupportMessageDto[] };

function groupByDay(messages: SupportMessageDto[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const day = dayLabel(message.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.messages.push(message);
    else groups.push({ day, messages: [message] });
  }
  return groups;
}

/**
 * Centro assistenza (overlay full-screen dal proto #section-assistenza).
 * Chat REALE col team Reglo: i messaggi finiscono sul SupportThread della
 * company e le risposte arrivano dal backoffice (/backoffice/support).
 * Aggiornamento via polling ogni 10s a pagina aperta; aprire la chat azzera
 * i non-letti lato company (badge nel menu della shell).
 */
export function AutoscuoleAssistenzaPage() {
  const router = useRouter();
  const toast = useFeedbackToast();
  const [messages, setMessages] = React.useState<SupportMessageDto[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const sendingRef = React.useRef(false);

  const refresh = React.useCallback(async () => {
    // Durante l'invio evitiamo il refetch: arriverebbe senza il messaggio
    // appena appeso e farebbe "sparire" la bolla per un giro.
    if (sendingRef.current) return;
    const res = await getSupportConversation();
    if (res.success && res.data && !sendingRef.current) {
      setMessages(res.data.messages);
    }
    // Anche su errore usciamo dallo skeleton: benvenuto + input restano
    // utilizzabili e il prossimo giro di polling ritenta.
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  React.useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    sendingRef.current = true;
    try {
      const res = await sendSupportMessage({ body: trimmed });
      if (!res.success || !res.data) {
        toast.error({ description: res.message ?? "Invio non riuscito, riprova." });
        return;
      }
      setInput("");
      setMessages((prev) => [...prev, res.data]);
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const groups = groupByDay(messages);

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-white"
      data-testid="autoscuole-assistenza-page"
    >
      {/* ── Header overlay ── */}
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#dddddd] px-6 lg:px-10">
        <Image
          src="/images/nav/logo-reglo-tight.png"
          alt="Reglo"
          width={30}
          height={30}
          className="select-none object-contain"
        />
        <button
          type="button"
          onClick={() => router.push("/user/autoscuole")}
          className="cursor-pointer select-none rounded-full px-[22px] py-2 text-sm font-medium text-foreground transition-colors hover:bg-[#f2f2f2]"
        >
          Fatto
        </button>
      </div>

      {/* ── Chat unica, centrata (niente lista conversazioni) ── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <div className="shrink-0 border-b border-[#f0f0f0]">
            <div className="mx-auto flex w-full max-w-[860px] items-center gap-3 px-6 py-[18px]">
              <AssistantAvatar size={44} />
              <div>
                <div className="text-[19px] font-bold tracking-[-0.3px] text-foreground">
                  Team Reglo
                </div>
                <div className="text-[12.5px] font-medium text-[#929292]">
                  Ti rispondiamo in giornata, direttamente qui
                </div>
              </div>
            </div>
          </div>

          <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa]">
            <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3.5 px-6 py-6">
            {!loaded ? (
              <div className="flex flex-col gap-3.5">
                <div className="flex items-end gap-2.5">
                  <Skeleton className="size-[30px] rounded-full" />
                  <Skeleton className="h-16 w-[360px] max-w-[70%] rounded-2xl" />
                </div>
                <div className="flex justify-end">
                  <Skeleton className="h-11 w-[240px] rounded-2xl" />
                </div>
                <div className="flex items-end gap-2.5">
                  <Skeleton className="size-[30px] rounded-full" />
                  <Skeleton className="h-11 w-[300px] max-w-[60%] rounded-2xl" />
                </div>
              </div>
            ) : (
              <FadeIn className="flex flex-col gap-3.5">
                {/* Benvenuto (non persistito): presenta la chat + contatti */}
                <div className="flex items-end gap-2.5">
                  <AssistantAvatar size={30} />
                  <div className="flex max-w-[560px] flex-col">
                    <div className="mb-1 ml-1 text-xs font-semibold text-[#929292]">Team Reglo</div>
                    <div className="rounded-2xl border border-[#ececec] bg-white px-4 py-3 text-[14.5px] font-medium leading-relaxed text-[#333333]">
                      {WELCOME_TEXT}
                    </div>
                    <ContactCards />
                  </div>
                </div>

                {groups.map((group) => (
                  <React.Fragment key={group.day}>
                    <div className="mt-1 text-center">
                      <span className="text-[13px] font-bold text-[#717171]">{group.day}</span>
                    </div>
                    {group.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex items-end gap-2.5",
                          msg.sender === "company" && "justify-end",
                        )}
                      >
                        {msg.sender === "reglo" && <AssistantAvatar size={30} />}
                        <div
                          className={cn(
                            "flex max-w-[560px] flex-col",
                            msg.sender === "company" && "items-end",
                          )}
                        >
                          <div
                            className={cn(
                              "mb-1 text-xs font-semibold text-[#929292]",
                              msg.sender === "reglo" ? "ml-1" : "mr-1",
                            )}
                          >
                            {msg.sender === "reglo"
                              ? (msg.senderName ?? "Team Reglo")
                              : (msg.senderName ?? "Tu")}
                            {" · "}
                            {timeLabel(msg.createdAt)}
                          </div>
                          <div
                            className={cn(
                              "whitespace-pre-wrap rounded-2xl px-4 py-3 text-[14.5px] font-medium leading-relaxed",
                              msg.sender === "reglo"
                                ? "border border-[#ececec] bg-white text-[#333333]"
                                : "bg-[#222222] text-white",
                            )}
                          >
                            {msg.body}
                          </div>
                        </div>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </FadeIn>
            )}
            </div>
          </div>

          {/* Quick replies + input */}
          {loaded && messages.length === 0 && (
            <div className="mx-auto flex w-full max-w-[860px] shrink-0 flex-wrap gap-2 px-6 pt-3.5">
              {QUICK_REPLIES.map((qr) => (
                <button
                  key={qr}
                  type="button"
                  onClick={() => void send(qr)}
                  className="cursor-pointer rounded-[20px] border border-[#e3e3e3] bg-white px-3.5 py-2 text-[13px] font-medium text-[#444444] transition-all hover:-translate-y-px hover:border-[#222222] hover:bg-[#f3f3f3] hover:text-foreground hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
                >
                  {qr}
                </button>
              ))}
            </div>
          )}
          <div className="mx-auto w-full max-w-[860px] shrink-0 px-6 pb-5 pt-3.5">
            <div className="flex items-center gap-2 rounded-[26px] border-[1.5px] border-[#dddddd] bg-white py-1.5 pl-5 pr-1.5 transition-colors focus-within:border-[#222222]">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void send(input);
                }}
                placeholder="Scrivi al team Reglo"
                className="min-w-0 flex-1 border-none bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:text-[#929292]"
              />
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={!input.trim() || sending}
                aria-label="Invia"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-navy-900 text-white transition-colors hover:bg-navy-800 disabled:cursor-default disabled:opacity-40"
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                ) : (
                  <ArrowUp className="size-4" strokeWidth={2} />
                )}
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}
