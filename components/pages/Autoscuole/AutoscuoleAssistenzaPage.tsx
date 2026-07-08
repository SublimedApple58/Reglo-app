"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowUp, ChevronDown, MessageCircle, Phone } from "lucide-react";

import { cn } from "@/lib/utils";

const SUPPORT_WHATSAPP = "https://wa.me/393477756855";
const SUPPORT_PHONE = "+39 347 775 6855";

const QUICK_REPLIES = [
  "Come funzionano i crediti guida?",
  "Ho un problema con una prenotazione",
  "Voglio parlare con una persona",
];

const WELCOME_TEXT =
  "Ciao! Sono Giulia, l'assistente Reglo. Il centro assistenza con AI è in arrivo: presto potrai farmi qualsiasi domanda sulla piattaforma. Nel frattempo il team è a tua disposizione qui sotto.";

const CANNED_REPLY =
  "Grazie del messaggio! Questa chat è in anteprima e non è ancora collegata al team. Per una risposta rapida scrivici su WhatsApp o chiamaci:";

type ChatMessage = { role: "assistant" | "user"; text: string; withContacts?: boolean };

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

function AssistantAvatar({ size }: { size: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#222222]"
      style={{ width: size, height: size }}
    >
      <Image
        src="/images/menu/assistente-giulia.png"
        alt="Giulia"
        width={size}
        height={size}
        className="block h-full w-full object-cover"
      />
    </div>
  );
}

/**
 * Centro assistenza (overlay full-screen dal proto #section-assistenza).
 * MOCK: la chat non è collegata a un backend — la risposta indirizza ai
 * canali di supporto reali (WhatsApp / telefono).
 */
export function AutoscuoleAssistenzaPage() {
  const router = useRouter();
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    { role: "assistant", text: WELCOME_TEXT, withContacts: true },
  ]);
  const [input, setInput] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const messagesRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || typing) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { role: "assistant", text: CANNED_REPLY, withContacts: true }]);
    }, 1200);
  };

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

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[380px_1fr]">
        {/* ── Lista conversazioni ── */}
        <div className="hidden min-h-0 overflow-y-auto border-r border-[#ebebeb] px-5 py-[30px] lg:block">
          <div className="mx-1.5 mb-[18px]">
            <div className="mb-5 flex h-11 items-center justify-between gap-2.5">
              <div className="text-[32px] font-bold tracking-[-0.6px] text-foreground">Messaggi</div>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                className="flex cursor-default items-center gap-1.5 rounded-[20px] bg-[#222222] px-4 py-2 text-sm font-semibold text-white"
              >
                Tutti
                <ChevronDown className="size-3.5" strokeWidth={1.7} />
              </button>
              <button
                type="button"
                className="cursor-default rounded-[20px] border border-[#e3e3e3] bg-white px-4 py-2 text-sm font-semibold text-[#6a6a6a]"
              >
                Non letti
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex cursor-default items-center gap-3.5 rounded-2xl bg-[#f3f3f3] p-3.5">
              <AssistantAvatar size={56} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15.5px] font-bold text-foreground">
                  Assistente Reglo
                </div>
                <div className="mt-0.5 truncate text-[15px] font-medium text-[#929292]">
                  {messages[messages.length - 1]?.text}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Chat ── */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
          <div className="flex shrink-0 items-center gap-3 border-b border-[#f0f0f0] px-6 py-[18px]">
            <AssistantAvatar size={44} />
            <div className="text-[19px] font-bold tracking-[-0.3px] text-foreground">
              Assistente Reglo
            </div>
          </div>

          <div
            ref={messagesRef}
            className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto bg-[#fafafa] px-6 py-6"
          >
            <div className="text-center">
              <span className="text-[13px] font-bold text-[#717171]">Oggi</span>
            </div>
            <div className="mb-2 text-center">
              <span className="text-[12.5px] font-medium text-[#9a9a9a]">
                Può sbagliare, verifica le info importanti.
              </span>
            </div>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn("flex items-end gap-2.5", msg.role === "user" && "justify-end")}
              >
                {msg.role === "assistant" && <AssistantAvatar size={30} />}
                <div className={cn("flex max-w-[560px] flex-col", msg.role === "user" && "items-end")}>
                  {msg.role === "assistant" && (
                    <div className="mb-1 ml-1 text-xs font-semibold text-[#929292]">
                      Giulia · Assistente Reglo
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3 text-[14.5px] font-medium leading-relaxed",
                      msg.role === "assistant"
                        ? "border border-[#ececec] bg-white text-[#333333]"
                        : "bg-[#222222] text-white",
                    )}
                  >
                    {msg.text}
                  </div>
                  {msg.withContacts && <ContactCards />}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex items-end gap-2.5">
                <AssistantAvatar size={30} />
                <div className="rounded-2xl border border-[#ececec] bg-white px-4 py-3.5">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c1c1c1] [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c1c1c1] [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c1c1c1] [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick replies + input */}
          <div className="flex shrink-0 flex-wrap gap-2 px-6 pt-3.5">
            {QUICK_REPLIES.map((qr) => (
              <button
                key={qr}
                type="button"
                onClick={() => send(qr)}
                className="cursor-pointer rounded-[20px] border border-[#e3e3e3] bg-white px-3.5 py-2 text-[13px] font-medium text-[#444444] transition-all hover:-translate-y-px hover:border-[#222222] hover:bg-[#f3f3f3] hover:text-foreground hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
              >
                {qr}
              </button>
            ))}
          </div>
          <div className="shrink-0 px-6 pb-5 pt-3.5">
            <div className="flex items-center gap-2 rounded-[26px] border-[1.5px] border-[#dddddd] bg-white py-1.5 pl-5 pr-1.5 transition-colors focus-within:border-[#222222]">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send(input);
                }}
                placeholder="Scrivi un messaggio"
                className="min-w-0 flex-1 border-none bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:text-[#929292]"
              />
              <button
                type="button"
                onClick={() => send(input)}
                disabled={!input.trim() || typing}
                aria-label="Invia"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-navy-900 text-white transition-colors hover:bg-navy-800 disabled:cursor-default disabled:opacity-40"
              >
                <ArrowUp className="size-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
