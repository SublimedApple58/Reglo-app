"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAulaLiveSession,
  resolveAulaImageUrl,
  saveAulaPackage,
  uploadAulaImage,
} from "@/lib/actions/aula.actions";
import type { SlideBlock, SlidePackage } from "@/lib/aula/slides";

type Lesson = {
  id: string;
  companyId: string | null;
  title: string;
  isTemplate: boolean;
  chapterId: string | null;
};

const BLOCK_LABELS: Record<SlideBlock["type"], string> = {
  heading: "Titolo",
  text: "Testo",
  bullets: "Elenco",
  image: "Immagine",
  quizRef: "Domanda quiz",
};

/** Legge un File come base64 puro (senza prefisso data:) lato browser. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Sposta l'elemento `from` di `dir` posizioni in un array (clone). */
function move<T>(arr: T[], from: number, dir: -1 | 1): T[] {
  const to = from + dir;
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * Reglo Aula — editor del pacchetto slide (.rppt) + avvio quiz live.
 * Editor a blocchi: ogni slide è un array ordinato di blocchi tipizzati.
 * Le immagini vengono caricate su R2 (uploadAulaImage) e referenziate per r2Key.
 */
export function AulaLessonEditor({
  lesson,
  initialPackage,
}: {
  lesson: Lesson;
  initialPackage: SlidePackage;
}) {
  const router = useRouter();
  const [pkg, setPkg] = useState<SlidePackage>(initialPackage);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Cache r2Key → URL firmato per l'anteprima immagini.
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const editable = !lesson.isTemplate && lesson.companyId !== null;
  const slides = pkg.slides;
  const activeSlide = slides[active];

  // Risolve le URL firmate delle immagini referenziate ma non ancora in cache.
  useEffect(() => {
    const keys = new Set<string>();
    for (const slide of slides) {
      for (const block of slide) {
        if (block.type === "image" && !imageUrls[block.r2Key]) keys.add(block.r2Key);
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

  const updatePackage = useCallback((next: SlidePackage) => {
    setPkg(next);
    setDirty(true);
    setMessage(null);
  }, []);

  const updateSlide = useCallback(
    (index: number, blocks: SlideBlock[]) => {
      updatePackage({
        ...pkg,
        slides: pkg.slides.map((s, i) => (i === index ? blocks : s)),
      });
    },
    [pkg, updatePackage],
  );

  // ── Slide ───────────────────────────────────────────────────────────────────
  const addSlide = () => {
    updatePackage({ ...pkg, slides: [...pkg.slides, [{ type: "heading", text: "Nuova slide" }]] });
    setActive(pkg.slides.length);
  };
  const deleteSlide = (index: number) => {
    const next = pkg.slides.filter((_, i) => i !== index);
    updatePackage({ ...pkg, slides: next });
    setActive((a) => Math.max(0, Math.min(a, next.length - 1)));
  };
  const moveSlide = (index: number, dir: -1 | 1) => {
    const next = move(pkg.slides, index, dir);
    if (next === pkg.slides) return;
    updatePackage({ ...pkg, slides: next });
    setActive(index + dir);
  };

  // ── Blocchi della slide attiva ────────────────────────────────────────────────
  const addBlock = (type: SlideBlock["type"]) => {
    if (!activeSlide) return;
    const fresh: Record<SlideBlock["type"], SlideBlock> = {
      heading: { type: "heading", text: "Titolo" },
      text: { type: "text", text: "" },
      bullets: { type: "bullets", items: [""] },
      image: { type: "image", r2Key: "" },
      quizRef: { type: "quizRef", questionId: "" },
    };
    updateSlide(active, [...activeSlide, fresh[type]]);
  };
  const updateBlock = (bi: number, block: SlideBlock) => {
    if (!activeSlide) return;
    updateSlide(active, activeSlide.map((b, i) => (i === bi ? block : b)));
  };
  const deleteBlock = (bi: number) => {
    if (!activeSlide) return;
    updateSlide(active, activeSlide.filter((_, i) => i !== bi));
  };
  const moveBlock = (bi: number, dir: -1 | 1) => {
    if (!activeSlide) return;
    updateSlide(active, move(activeSlide, bi, dir));
  };

  const handleImageUpload = (bi: number, file: File) => {
    startTransition(async () => {
      const base64 = await fileToBase64(file);
      const ext = file.name.split(".").pop() || "png";
      const res = await uploadAulaImage({ base64, ext, contentType: file.type || "image/png" });
      if (res.success && res.data) {
        const r2Key = res.data.r2Key;
        const url = await resolveAulaImageUrl(r2Key);
        if (url) setImageUrls((prev) => ({ ...prev, [r2Key]: url }));
        updateBlock(bi, { type: "image", r2Key });
      } else {
        setMessage(res.message ?? "Upload immagine fallito");
      }
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveAulaPackage(lesson.id, pkg);
      if (res.success) {
        setDirty(false);
        setMessage("Salvato.");
      } else {
        setMessage(res.message ?? "Errore nel salvataggio");
      }
    });
  };

  const handleStartQuiz = () => {
    startTransition(async () => {
      const res = await createAulaLiveSession({ lessonId: lesson.id, count: 5 });
      if (res.success && res.data) {
        router.push(`live/${res.data.code}`);
      } else {
        setMessage(res.message ?? "Impossibile avviare il quiz");
      }
    });
  };

  const slideCount = useMemo(() => slides.length, [slides]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{lesson.title}</h1>
        <div className="flex items-center gap-2">
          {editable && (
            <button
              className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
              disabled={pending || !dirty}
              onClick={handleSave}
            >
              {dirty ? "Salva" : "Salvato"}
            </button>
          )}
          <button
            className="rounded-md bg-pink-500 px-4 py-2 text-white disabled:opacity-50"
            disabled={pending}
            onClick={handleStartQuiz}
          >
            Avvia quiz
          </button>
        </div>
      </div>

      {!editable && (
        <p className="text-amber-600">
          Questa è una lezione standard (sola lettura). Personalizzala dalla lista
          per poterla modificare.
        </p>
      )}
      {message && <p className="text-neutral-600">{message}</p>}

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        {/* Rail slide */}
        <aside className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-500">
              Slide ({slideCount})
            </h2>
            {editable && (
              <button className="rounded-md border px-2 py-0.5 text-sm" onClick={addSlide}>
                +
              </button>
            )}
          </div>
          <ol className="space-y-1">
            {slides.map((slide, i) => (
              <li key={i}>
                <button
                  onClick={() => setActive(i)}
                  className={
                    "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm " +
                    (i === active ? "border-pink-500 bg-pink-50" : "hover:bg-neutral-50")
                  }
                >
                  <span className="truncate">
                    {i + 1}.{" "}
                    {(() => {
                      const h = slide.find((b) => b.type === "heading");
                      return h && h.type === "heading" ? h.text : `Slide ${i + 1}`;
                    })()}
                  </span>
                  <span className="ml-2 text-xs text-neutral-400">{slide.length}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        {/* Editor slide attiva */}
        <section className="space-y-4">
          {!activeSlide && (
            <p className="text-neutral-500">Nessuna slide. Aggiungine una per iniziare.</p>
          )}
          {activeSlide && (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                <span className="text-sm font-medium">Slide {active + 1}</span>
                {editable && (
                  <>
                    <button className="rounded border px-2 py-1 text-xs disabled:opacity-30" disabled={active === 0} onClick={() => moveSlide(active, -1)}>↑</button>
                    <button className="rounded border px-2 py-1 text-xs disabled:opacity-30" disabled={active === slideCount - 1} onClick={() => moveSlide(active, 1)}>↓</button>
                    <button className="rounded border border-red-300 px-2 py-1 text-xs text-red-600" onClick={() => deleteSlide(active)}>Elimina slide</button>
                  </>
                )}
              </div>

              <ol className="space-y-3">
                {activeSlide.map((block, bi) => (
                  <li key={bi} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                        {BLOCK_LABELS[block.type]}
                      </span>
                      {editable && (
                        <div className="flex gap-1">
                          <button className="rounded border px-2 py-0.5 text-xs disabled:opacity-30" disabled={bi === 0} onClick={() => moveBlock(bi, -1)}>↑</button>
                          <button className="rounded border px-2 py-0.5 text-xs disabled:opacity-30" disabled={bi === activeSlide.length - 1} onClick={() => moveBlock(bi, 1)}>↓</button>
                          <button className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-600" onClick={() => deleteBlock(bi)}>✕</button>
                        </div>
                      )}
                    </div>
                    <BlockEditor
                      block={block}
                      readOnly={!editable}
                      imageUrl={block.type === "image" ? imageUrls[block.r2Key] : undefined}
                      onChange={(b) => updateBlock(bi, b)}
                      onUpload={(file) => handleImageUpload(bi, file)}
                    />
                  </li>
                ))}
              </ol>

              {editable && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {(Object.keys(BLOCK_LABELS) as SlideBlock["type"][]).map((t) => (
                    <button key={t} className="rounded-md border px-3 py-1 text-sm hover:bg-neutral-50" onClick={() => addBlock(t)}>
                      + {BLOCK_LABELS[t]}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** Editor di un singolo blocco, in base al tipo. */
function BlockEditor({
  block,
  readOnly,
  imageUrl,
  onChange,
  onUpload,
}: {
  block: SlideBlock;
  readOnly: boolean;
  imageUrl?: string;
  onChange: (b: SlideBlock) => void;
  onUpload: (file: File) => void;
}) {
  if (block.type === "heading") {
    return (
      <input
        className="w-full rounded-md border px-3 py-2 text-lg font-semibold disabled:bg-neutral-50"
        value={block.text}
        readOnly={readOnly}
        placeholder="Titolo della slide"
        onChange={(e) => onChange({ type: "heading", text: e.target.value })}
      />
    );
  }
  if (block.type === "text") {
    return (
      <textarea
        className="min-h-24 w-full rounded-md border px-3 py-2 disabled:bg-neutral-50"
        value={block.text}
        readOnly={readOnly}
        placeholder="Testo…"
        onChange={(e) => onChange({ type: "text", text: e.target.value })}
      />
    );
  }
  if (block.type === "bullets") {
    return (
      <div className="space-y-2">
        {block.items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <span className="pt-2 text-neutral-400">•</span>
            <input
              className="flex-1 rounded-md border px-3 py-1.5 disabled:bg-neutral-50"
              value={item}
              readOnly={readOnly}
              onChange={(e) =>
                onChange({
                  type: "bullets",
                  items: block.items.map((it, j) => (j === i ? e.target.value : it)),
                })
              }
            />
            {!readOnly && (
              <button
                className="rounded border border-red-300 px-2 text-xs text-red-600"
                onClick={() =>
                  onChange({ type: "bullets", items: block.items.filter((_, j) => j !== i) })
                }
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            className="rounded-md border px-3 py-1 text-sm"
            onClick={() => onChange({ type: "bullets", items: [...block.items, ""] })}
          >
            + Voce
          </button>
        )}
      </div>
    );
  }
  if (block.type === "image") {
    return (
      <div className="space-y-2">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={block.caption ?? ""} className="max-h-64 rounded-md border" />
        ) : block.r2Key ? (
          <div className="flex h-32 items-center justify-center rounded-md border bg-neutral-50 text-sm text-neutral-400">
            Caricamento anteprima…
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-neutral-400">
            Nessuna immagine
          </div>
        )}
        {!readOnly && (
          <input
            type="file"
            accept="image/*"
            className="text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
            }}
          />
        )}
        <input
          className="w-full rounded-md border px-3 py-1.5 text-sm disabled:bg-neutral-50"
          value={block.caption ?? ""}
          readOnly={readOnly}
          placeholder="Didascalia (opzionale)"
          onChange={(e) =>
            onChange({ type: "image", r2Key: block.r2Key, caption: e.target.value || undefined })
          }
        />
      </div>
    );
  }
  // quizRef
  return (
    <input
      className="w-full rounded-md border px-3 py-2 font-mono text-sm disabled:bg-neutral-50"
      value={block.questionId}
      readOnly={readOnly}
      placeholder="ID domanda quiz (UUID)"
      onChange={(e) => onChange({ type: "quizRef", questionId: e.target.value })}
    />
  );
}
