"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  resolveAulaImageUrl,
  resolveAulaQuizRefs,
} from "@/lib/actions/aula.actions";
import type { Slide, SlidePackage } from "@/lib/aula/slides";

type QuizRefView = {
  text: string;
  imageUrl: string | null;
  correctAnswer: boolean;
};

/**
 * Reglo Aula — modalità presentazione full-screen delle slide (proiettore).
 *
 * Overlay a tutto schermo che renderizza una slide alla volta in tipografia
 * grande. Naviga da tastiera (← → Spazio PagSu/Giù Home Fine) o con i comandi a
 * schermo; Esc esce. Usa la Fullscreen API quando disponibile (l'apertura parte
 * da un click → user gesture); se non concessa, l'overlay copre comunque la
 * viewport. Le immagini slide e le domande `quizRef` vengono risolte on-mount.
 */
export function AulaSlideShow({
  pkg,
  initialImageUrls,
  startIndex = 0,
  onClose,
}: {
  pkg: SlidePackage;
  initialImageUrls?: Record<string, string>;
  startIndex?: number;
  onClose: () => void;
}) {
  const slides = pkg.slides;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, startIndex), Math.max(0, slides.length - 1)),
  );
  const [imageUrls, setImageUrls] = useState<Record<string, string>>(
    initialImageUrls ?? {},
  );
  const [quizRefs, setQuizRefs] = useState<Record<string, QuizRefView>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Risolve le URL firmate delle immagini slide non ancora in cache.
  useEffect(() => {
    const keys = new Set<string>();
    for (const slide of slides) {
      for (const block of slide) {
        if (block.type === "image" && block.r2Key && !imageUrls[block.r2Key]) {
          keys.add(block.r2Key);
        }
      }
    }
    if (keys.size === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        [...keys].map(async (key) => [key, await resolveAulaImageUrl(key)] as const),
      );
      if (cancelled) return;
      setImageUrls((prev) => {
        const next = { ...prev };
        for (const [key, url] of entries) if (url) next[key] = url;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [slides, imageUrls]);

  // Risolve testo/immagine/risposta delle domande referenziate dai quizRef.
  useEffect(() => {
    const ids = new Set<string>();
    for (const slide of slides) {
      for (const block of slide) {
        if (block.type === "quizRef" && block.questionId && !quizRefs[block.questionId]) {
          ids.add(block.questionId);
        }
      }
    }
    if (ids.size === 0) return;
    let cancelled = false;
    (async () => {
      const res = await resolveAulaQuizRefs([...ids]);
      if (cancelled || !res.success || !res.data) return;
      setQuizRefs((prev) => {
        const next = { ...prev };
        for (const q of res.data) {
          next[q.id] = {
            text: q.text,
            imageUrl: q.imageUrl,
            correctAnswer: q.correctAnswer,
          };
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [slides, quizRefs]);

  const go = useCallback(
    (dir: -1 | 1) => {
      setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + dir)));
    },
    [slides.length],
  );

  // Navigazione da tastiera.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case " ":
        case "PageDown":
          e.preventDefault();
          go(1);
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          go(-1);
          break;
        case "Home":
          e.preventDefault();
          setIndex(0);
          break;
        case "End":
          e.preventDefault();
          setIndex(slides.length - 1);
          break;
        case "Escape":
          onClose();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, slides.length]);

  // Entra in fullscreen all'apertura; uscire dal fullscreen chiude la presentazione.
  useEffect(() => {
    const el = containerRef.current;
    el?.requestFullscreen?.().catch(() => {});
    const onFsChange = () => {
      if (!document.fullscreenElement) onClose();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  const slide = slides[index];

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white"
    >
      {/* Contenuto slide */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-12">
        {/* Zone di click per navigare (lasciano scoperto il centro per i comandi) */}
        <button
          aria-label="Slide precedente"
          className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize focus:outline-none"
          onClick={() => go(-1)}
        />
        <button
          aria-label="Slide successiva"
          className="absolute inset-y-0 right-0 w-1/3 cursor-e-resize focus:outline-none"
          onClick={() => go(1)}
        />

        <div className="pointer-events-none mx-auto w-full max-w-5xl space-y-8 text-center">
          {!slide || slide.length === 0 ? (
            <p className="text-3xl text-neutral-500">Slide vuota</p>
          ) : (
            slide.map((block, bi) => (
              <SlideBlockView
                key={bi}
                block={block}
                imageUrls={imageUrls}
                quizRefs={quizRefs}
              />
            ))
          )}
        </div>
      </div>

      {/* Barra comandi */}
      <div className="flex items-center justify-between gap-4 border-t border-white/10 bg-black/40 px-6 py-3">
        <button
          className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-30"
          disabled={index === 0}
          onClick={() => go(-1)}
        >
          ← Precedente
        </button>
        <span className="text-sm text-neutral-400">
          {slides.length === 0 ? "0 / 0" : `${index + 1} / ${slides.length}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-30"
            disabled={index >= slides.length - 1}
            onClick={() => go(1)}
          >
            Successiva →
          </button>
          <button
            className="rounded-md bg-pink-500 px-3 py-1.5 text-sm font-medium hover:bg-pink-600"
            onClick={onClose}
          >
            Esci
          </button>
        </div>
      </div>
    </div>
  );
}

/** Render read-only di un singolo blocco in tipografia da proiettore. */
function SlideBlockView({
  block,
  imageUrls,
  quizRefs,
}: {
  block: Slide[number];
  imageUrls: Record<string, string>;
  quizRefs: Record<string, QuizRefView>;
}) {
  if (block.type === "heading") {
    return <h2 className="text-5xl font-bold leading-tight">{block.text}</h2>;
  }
  if (block.type === "text") {
    return (
      <p className="whitespace-pre-wrap text-3xl leading-relaxed text-neutral-100">
        {block.text}
      </p>
    );
  }
  if (block.type === "bullets") {
    return (
      <ul className="mx-auto max-w-3xl space-y-4 text-left text-3xl text-neutral-100">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-pink-400">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === "image") {
    const url = imageUrls[block.r2Key];
    return (
      <figure className="space-y-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={block.caption ?? ""}
            className="mx-auto max-h-[60vh] rounded-lg object-contain"
          />
        ) : (
          <div className="mx-auto flex h-64 w-full max-w-xl items-center justify-center rounded-lg bg-white/5 text-xl text-neutral-500">
            Caricamento immagine…
          </div>
        )}
        {block.caption && (
          <figcaption className="text-xl text-neutral-400">{block.caption}</figcaption>
        )}
      </figure>
    );
  }
  // quizRef
  const q = quizRefs[block.questionId];
  if (!q) {
    return <p className="text-2xl text-neutral-500">Caricamento domanda…</p>;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {q.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={q.imageUrl}
          alt=""
          className="mx-auto max-h-[45vh] rounded-lg object-contain"
        />
      )}
      <p className="text-3xl leading-relaxed">{q.text}</p>
      <div className="flex justify-center gap-4 text-2xl">
        <span
          className={
            "rounded-md px-4 py-2 " +
            (q.correctAnswer
              ? "bg-green-500/20 text-green-300 ring-1 ring-green-400"
              : "bg-white/5 text-neutral-400")
          }
        >
          Vero
        </span>
        <span
          className={
            "rounded-md px-4 py-2 " +
            (!q.correctAnswer
              ? "bg-green-500/20 text-green-300 ring-1 ring-green-400"
              : "bg-white/5 text-neutral-400")
          }
        >
          Falso
        </span>
      </div>
    </div>
  );
}
