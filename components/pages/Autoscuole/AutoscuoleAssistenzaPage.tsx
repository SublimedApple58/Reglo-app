"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  IdCard,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  Send,
  Settings,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

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

type FaqPathStep = { icon: LucideIcon; label: string };

type Faq = {
  question: string;
  answer: string;
  path: { title: string; steps: FaqPathStep[] };
};

/**
 * Domande preimpostate con risposta IMMEDIATA (dal proto, aiQuickReplies +
 * aiReply): il click NON scrive al team, appende in locale la coppia
 * domanda/risposta con la card "Percorso". Effimere come il benvenuto.
 * I percorsi riflettono la NOSTRA app (auto-save, pane unificati), non il proto.
 */
const FAQS: Faq[] = [
  {
    question: "Come apro le prenotazioni?",
    answer:
      "Ecco come aprire le prenotazioni. Imposta le settimane prenotabili e la data di apertura: il salvataggio è automatico e gli allievi idonei ricevono subito la notifica.",
    path: {
      title: "Apri le prenotazioni",
      steps: [
        { icon: Settings, label: "Impostazioni" },
        { icon: Calendar, label: "Prenotazioni e allievi" },
        { icon: Clock, label: "Prenotazioni aperte dal" },
        { icon: Check, label: "Si salva da solo" },
      ],
    },
  },
  {
    question: "Aggiungere un allievo",
    answer:
      "Per aggiungere un allievo usa “Invita allievo”: inserisci nome e contatto e riceverà il link per registrarsi da solo.",
    path: {
      title: "Aggiungi un allievo",
      steps: [
        { icon: Users, label: "Allievi" },
        { icon: UserPlus, label: "Invita allievo" },
        { icon: IdCard, label: "Nome e contatto" },
        { icon: Send, label: "Invia link" },
      ],
    },
  },
  {
    question: "Creare una guida di gruppo",
    answer:
      "La guida di gruppo si crea dall'Agenda. Scegli giorno, durata e capienza, poi pre-inserisci gli allievi o apri i posti agli inviti.",
    path: {
      title: "Crea una guida di gruppo",
      steps: [
        { icon: Calendar, label: "Agenda" },
        { icon: Plus, label: "Clic su uno slot" },
        { icon: Users, label: "Guida di gruppo" },
        { icon: Check, label: "Apri i posti" },
      ],
    },
  },
];

/** Card "Percorso" sotto la risposta automatica (proto aiPathCard). */
function FaqPathCard({ path }: { path: Faq["path"] }) {
  return (
    <div className="mt-2 rounded-[14px] border border-[#ececec] bg-white px-[17px] py-[15px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="mb-[13px] flex items-center gap-[7px]">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.5px] text-[#1a1a2e]">
          Percorso
        </span>
        <span className="text-[13px] font-bold text-foreground">{path.title}</span>
      </div>
      <div className="flex flex-wrap items-start gap-0.5">
        {path.steps.map((step, i) => (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <ChevronRight className="mt-[13px] size-[13px] shrink-0 text-[#d4d4d4]" strokeWidth={2.4} />
            )}
            <div className="flex w-[66px] flex-col items-center gap-[7px]">
              <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[#eeeef4]">
                <step.icon className="size-[18px] text-[#1a1a2e]" strokeWidth={1.8} />
              </div>
              <div className="text-center text-[11px] font-semibold leading-[1.25] text-[#444444]">
                {step.label}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

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
  // FAQ cliccate: coppie domanda/risposta immediate, solo in memoria.
  const [faqLog, setFaqLog] = React.useState<Faq[]>([]);
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
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
  }, [messages, sending, faqLog]);

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
      if (inputRef.current) inputRef.current.style.height = "auto";
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
      <div className="h-[72px] shrink-0 border-b border-[#dddddd]">
        {/* Stesso container della top bar principale: logo sempre nello stesso punto */}
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-4 lg:px-10">
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
          className="cursor-pointer select-none rounded-full bg-[#f2f2f2] px-[22px] py-2 text-sm font-medium text-foreground transition-colors hover:bg-[#e8e8e8]"
        >
          Fatto
        </button>
        </div>
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

                {/* FAQ: domanda dell'utente + risposta automatica con Percorso */}
                {faqLog.map((faq, i) => (
                  <React.Fragment key={`faq-${i}`}>
                    <div className="flex justify-end">
                      <div className="max-w-[560px] rounded-2xl bg-[#222222] px-4 py-3 text-[14.5px] font-medium leading-relaxed text-white">
                        {faq.question}
                      </div>
                    </div>
                    <div className="flex items-end gap-2.5">
                      <AssistantAvatar size={30} />
                      <div className="flex max-w-[560px] flex-col">
                        <div className="mb-1 ml-1 text-xs font-semibold text-[#929292]">
                          Assistente Reglo · Risposta automatica
                        </div>
                        <div className="rounded-2xl border border-[#ececec] bg-white px-4 py-3 text-[14.5px] font-medium leading-relaxed text-[#333333]">
                          {faq.answer}
                        </div>
                        <FaqPathCard path={faq.path} />
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </FadeIn>
            )}
            </div>
          </div>

          {/* Domande preimpostate (risposta immediata) + input */}
          {loaded && (
            <div className="mx-auto flex w-full max-w-[860px] shrink-0 flex-wrap gap-2 px-6 pt-3.5">
              {FAQS.filter((faq) => !faqLog.includes(faq)).map((faq) => (
                <button
                  key={faq.question}
                  type="button"
                  onClick={() => setFaqLog((prev) => [...prev, faq])}
                  className="cursor-pointer rounded-[20px] border border-[#e3e3e3] bg-white px-3.5 py-2 text-[13px] font-medium text-[#444444] transition-all hover:-translate-y-px hover:border-[#222222] hover:bg-[#f3f3f3] hover:text-foreground hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
                >
                  {faq.question}
                </button>
              ))}
            </div>
          )}
          {/* Box messaggio dal proto (aiBoxStyle): bordo 2px, radius 16, min-h 92, freccia in basso a dx */}
          <div className="mx-auto w-full max-w-[860px] shrink-0 px-6 pb-5 pt-3.5">
            <div className="relative min-h-[92px] rounded-[16px] border-2 border-[#dddddd] bg-white px-[17px] pb-[15px] pt-4 transition-colors focus-within:border-[#222222]">
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Scrivi un messaggio..."
                className="block min-h-[34px] w-full resize-none border-none bg-transparent pr-11 text-[15px] font-medium leading-normal text-foreground outline-none placeholder:text-[#929292]"
              />
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={!input.trim() || sending}
                aria-label="Invia"
                className={cn(
                  "absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full transition-colors",
                  input.trim()
                    ? "cursor-pointer bg-[#222222] text-white hover:bg-black"
                    : "cursor-default bg-[#ebebeb] text-[#b0b0b0]",
                )}
              >
                {sending ? (
                  <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
                ) : (
                  <ArrowUp className="size-[18px]" strokeWidth={2} />
                )}
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}
