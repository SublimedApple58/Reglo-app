"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Upload, Check } from "lucide-react";

/**
 * Rinnovo Patenti — public citizen chatbot (primary interface).
 * Talks to /api/renewal/[slug]/{start,chat,upload}. No auth.
 */

type ChatBubble = { id: string; role: "user" | "assistant"; text: string };

const DOC_BUTTONS: { type: string; label: string }[] = [
  { type: "identity", label: "Documento d'identità" },
  { type: "license", label: "Patente attuale" },
  { type: "photo", label: "Fototessera" },
];

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

let bubbleSeq = 0;
const nextId = () => `b${bubbleSeq++}`;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function RenewalChat({
  slug,
  companyName,
  initialRequestId,
  resumeMode = false,
}: {
  slug: string;
  companyName: string;
  /** When set (resume link from email), reuse this request instead of creating one. */
  initialRequestId?: string;
  resumeMode?: boolean;
}) {
  const [requestId, setRequestId] = useState<string | null>(initialRequestId ?? null);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<Set<string>>(new Set());
  const [fatalError, setFatalError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Start the session once — unless we're resuming an existing request.
  useEffect(() => {
    let cancelled = false;
    if (initialRequestId) {
      setMessages([
        {
          id: nextId(),
          role: "assistant",
          text: `Bentornato! ${companyName} ha bisogno che tu ricarichi alcuni documenti per completare la pratica. Usa i pulsanti qui sotto per caricarli.`,
        },
      ]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/renewal/${slug}/start`, { method: "POST" });
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) {
          setFatalError("Servizio non disponibile. Contatta l'autoscuola.");
          return;
        }
        setRequestId(json.data.requestId);
        setMessages([
          {
            id: nextId(),
            role: "assistant",
            text: `Ciao! Sono l'assistente di ${companyName} per il rinnovo della patente. Ti guido io: carica i documenti con i pulsanti qui sotto e dimmi pure quando vuoi prenotare la visita medica. Come posso aiutarti?`,
          },
        ]);
      } catch {
        if (!cancelled) setFatalError("Errore di connessione. Riprova più tardi.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, companyName, initialRequestId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = useCallback(
    async (text: string, imageDataUrls?: string[]) => {
      if (!requestId || busy) return;
      const trimmed = text.trim();
      if (!trimmed && !imageDataUrls?.length) return;
      setBusy(true);
      if (trimmed) {
        setMessages((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);
      }
      try {
        const res = await fetch(`/api/renewal/${slug}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, message: trimmed, imageDataUrls }),
        });
        const json = await res.json();
        const reply = json.success
          ? json.data.reply
          : "Scusa, si è verificato un problema. Riprova o contatta l'autoscuola.";
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: reply }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: "Errore di connessione. Riprova." },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [requestId, busy, slug],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput("");
    void send(text);
  };

  const onPickFile = async (type: string, label: string, file: File | undefined) => {
    if (!file || !requestId) return;
    if (file.size > MAX_BYTES) {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: "Il file è troppo grande (max 10 MB)." },
      ]);
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("requestId", requestId);
      form.append("type", type);
      form.append("file", file);
      const res = await fetch(`/api/renewal/${slug}/upload`, { method: "POST", body: form });
      const json = await res.json();
      if (!json.success) {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: "Caricamento non riuscito. Riprova." },
        ]);
        return;
      }
      setUploaded((prev) => new Set(prev).add(type));
      // Trigger a light vision soft-check for images (not PDFs).
      const imageDataUrls =
        file.type.startsWith("image/") ? [await readAsDataUrl(file)] : undefined;
      await send(`Ho caricato: ${label}.`, imageDataUrls);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: "Errore durante il caricamento." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (fatalError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
        <p className="max-w-sm text-center text-neutral-600">{fatalError}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-navy-900" />
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {resumeMode ? "Integra i documenti" : "Rinnovo patente"}
            </p>
            <p className="text-xs text-neutral-500">{companyName}</p>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="mx-auto w-full max-w-2xl flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm " +
                (m.role === "user"
                  ? "bg-[#222222] text-white"
                  : "bg-white text-neutral-800 shadow-sm ring-1 ring-neutral-200")
              }
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white px-4 py-2 text-sm text-neutral-400 shadow-sm ring-1 ring-neutral-200">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="flex flex-wrap gap-2">
            {DOC_BUTTONS.map((doc) => (
              <div key={doc.type}>
                <input
                  ref={(el) => {
                    fileInputs.current[doc.type] = el;
                  }}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    void onPickFile(doc.type, doc.label, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !requestId}
                  onClick={() => fileInputs.current[doc.type]?.click()}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 " +
                    (uploaded.has(doc.type)
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50")
                  }
                >
                  {uploaded.has(doc.type) ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {doc.label}
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={onSubmit} className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!requestId}
              placeholder="Scrivi un messaggio…"
              className="flex-1 rounded-full border border-neutral-300 px-4 py-2 text-sm outline-none focus:border-navy-900"
            />
            <button
              type="submit"
              disabled={busy || !requestId || !input.trim()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#222222] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              aria-label="Invia"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
