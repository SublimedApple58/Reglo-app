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
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  // Prova a entrare in fullscreen all'apertura (comodo sul proiettore), ma NON
  // legare la chiusura all'uscita dal fullscreen: l'overlay è già `fixed inset-0`
  // e copre tutto. Si chiude solo con "Esci" o Escape. Più robusto dal vivo.
  useEffect(() => {
    containerRef.current?.requestFullscreen?.().catch(() => {});
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else containerRef.current?.requestFullscreen?.().catch(() => {});
  };

  const slide = slides[index];

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white"
    >
      {/* Contenuto slide — centrato, ma scrollabile se eccede l'altezza */}
      <div className="relative flex-1 overflow-y-auto">
        {/* Zone di click per navigare (laterali, lasciano scoperto il centro) */}
        <button
          aria-label="Slide precedente"
          className="absolute inset-y-0 left-0 z-10 w-1/4 cursor-w-resize focus:outline-none"
          onClick={() => go(-1)}
        />
        <button
          aria-label="Slide successiva"
          className="absolute inset-y-0 right-0 z-10 w-1/4 cursor-e-resize focus:outline-none"
          onClick={() => go(1)}
        />

        <div className="flex min-h-full items-center justify-center p-12">
          <div className="mx-auto w-full max-w-5xl space-y-8 text-center">
            {!slide || slide.length === 0 ? (
              <p className="text-3xl text-neutral-500">Slide vuota</p>
            ) : (
              groupConsecutiveImages(slide).map((group, gi) =>
                group.kind === "images" ? (
                  // Immagini consecutive: affiancate (responsive), non impilate.
                  <div
                    key={`${index}-${gi}`}
                    className="flex flex-wrap items-stretch justify-center gap-6"
                  >
                    {group.blocks.map((b, j) => (
                      <PresImage
                        key={j}
                        block={b}
                        imageUrls={imageUrls}
                        count={group.blocks.length}
                      />
                    ))}
                  </div>
                ) : (
                  // key con l'indice slide → il blocco si rimonta cambiando slide
                  // (azzera lo stato "Vedi soluzione" dei quizRef).
                  <SlideBlockView
                    key={`${index}-${gi}`}
                    block={group.block}
                    quizRefs={quizRefs}
                  />
                ),
              )
            )}
          </div>
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
            className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Esci da schermo intero" : "Schermo intero"}
          >
            {isFullscreen ? "⤢" : "⛶"}
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

type SlideBlock = Slide[number];

/** Raggruppa blocchi immagine consecutivi (per affiancarli a schermo). */
function groupConsecutiveImages(
  blocks: SlideBlock[],
): ({ kind: "images"; blocks: SlideBlock[] } | { kind: "block"; block: SlideBlock })[] {
  const groups: (
    | { kind: "images"; blocks: SlideBlock[] }
    | { kind: "block"; block: SlideBlock }
  )[] = [];
  for (const b of blocks) {
    const last = groups[groups.length - 1];
    if (b.type === "image" && last && last.kind === "images") {
      last.blocks.push(b);
    } else if (b.type === "image") {
      groups.push({ kind: "images", blocks: [b] });
    } else {
      groups.push({ kind: "block", block: b });
    }
  }
  return groups;
}

/** Singola immagine da proiettore; la larghezza si adatta a quante ce ne sono. */
function PresImage({
  block,
  imageUrls,
  count,
}: {
  block: SlideBlock;
  imageUrls: Record<string, string>;
  count: number;
}) {
  if (block.type !== "image") return null;
  const url = imageUrls[block.r2Key];
  // 1 immagine → piena; 2 → ~metà ciascuna; 3+ → ~terzo (con wrap).
  const figW =
    count === 1 ? "w-full" : count === 2 ? "w-[48%] min-w-[280px]" : "w-[31%] min-w-[240px]";
  const imgH = count === 1 ? "max-h-[62vh]" : "max-h-[56vh]";
  return (
    <figure className={`flex flex-col items-center gap-2 ${figW}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={block.caption ?? ""}
          className={`${imgH} max-w-full rounded-lg object-contain`}
        />
      ) : (
        <div className="flex h-56 w-full items-center justify-center rounded-lg bg-white/5 text-lg text-neutral-500">
          Caricamento immagine…
        </div>
      )}
      {block.caption && (
        <figcaption className="text-lg text-neutral-400">{block.caption}</figcaption>
      )}
    </figure>
  );
}

/** Render read-only di un singolo blocco in tipografia da proiettore. */
function SlideBlockView({
  block,
  quizRefs,
}: {
  block: SlideBlock;
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
  // image → gestita da PresImage (raggruppamento/affiancamento) nel render padre.
  if (block.type === "image") return null;
  // quizRef
  const q = quizRefs[block.questionId];
  if (!q) {
    return <p className="text-2xl text-neutral-500">Caricamento domanda…</p>;
  }
  return <PresQuizRef q={q} />;
}

/**
 * Domanda in presentazione: prima si mostra senza soluzione (Vero/Falso neutri),
 * poi "Vedi soluzione" evidenzia la risposta corretta. Lo stato si azzera al
 * cambio slide perché il blocco è montato con una key che include l'indice.
 */
function PresQuizRef({ q }: { q: QuizRefView }) {
  const [revealed, setRevealed] = useState(false);
  const optionClass = (isThisOne: boolean) =>
    "rounded-md px-6 py-2 " +
    (revealed && isThisOne
      ? "bg-green-500/20 text-green-300 ring-1 ring-green-400"
      : "bg-white/5 text-neutral-300");
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
        <span className={optionClass(q.correctAnswer)}>Vero</span>
        <span className={optionClass(!q.correctAnswer)}>Falso</span>
      </div>
      {revealed ? (
        <p className="text-xl text-neutral-400">
          Risposta corretta: {q.correctAnswer ? "Vero" : "Falso"}
        </p>
      ) : (
        <button
          className="rounded-md bg-pink-500 px-6 py-2 text-lg font-medium text-white hover:bg-pink-600"
          onClick={() => setRevealed(true)}
        >
          Vedi soluzione
        </button>
      )}
    </div>
  );
}
