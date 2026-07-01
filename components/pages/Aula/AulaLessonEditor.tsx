"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAulaLiveSession,
  listAulaChapterQuestions,
  listAulaChapters,
  resolveAulaImageUrl,
  resolveAulaQuizRefs,
  saveAulaPackage,
  uploadAulaImage,
} from "@/lib/actions/aula.actions";
import type { SlideBlock, SlidePackage } from "@/lib/aula/slides";
import { AulaSlideShow } from "@/components/pages/Aula/AulaSlideShow";

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

/** Legge un File come data URL lato browser. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Ridimensiona/comprime un'immagine lato client (canvas → JPEG) prima dell'upload.
 * I Server Actions hanno un limite di body (~MB): una foto reale lo supererebbe.
 * Riducendo a `maxDim` px il lato lungo il payload resta piccolo — ed è comunque
 * più che sufficiente per la proiezione in aula.
 */
async function downscaleImage(
  file: File,
  maxDim = 1600,
  quality = 0.85,
): Promise<{ base64: string; ext: string; contentType: string }> {
  const dataUrl = await fileToDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("File immagine non valido"));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile nel browser");
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", quality);
  return {
    base64: out.slice(out.indexOf(",") + 1),
    ext: "jpg",
    contentType: "image/jpeg",
  };
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
  const [presenting, setPresenting] = useState(false);
  // Cache r2Key → URL firmato per l'anteprima immagini.
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  // Selettore quizRef: capitoli, domande per capitolo, testo delle domande scelte.
  const [chapters, setChapters] = useState<
    { id: string; chapterNumber: number; description: string }[]
  >([]);
  const [questionsByChapter, setQuestionsByChapter] = useState<
    Record<string, { id: string; text: string }[]>
  >({});
  const [quizTexts, setQuizTexts] = useState<Record<string, string>>({});

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

  // Carica l'elenco capitoli una volta sola (per il selettore quizRef).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listAulaChapters();
      if (!cancelled && res.success && res.data) setChapters(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Risolve il testo delle domande referenziate dai quizRef (per mostrarle scelte).
  useEffect(() => {
    const ids = new Set<string>();
    for (const slide of slides) {
      for (const block of slide) {
        if (block.type === "quizRef" && block.questionId && !quizTexts[block.questionId]) {
          ids.add(block.questionId);
        }
      }
    }
    if (ids.size === 0) return;
    let cancelled = false;
    (async () => {
      const res = await resolveAulaQuizRefs([...ids]);
      if (cancelled || !res.success || !res.data) return;
      setQuizTexts((prev) => {
        const next = { ...prev };
        for (const q of res.data) next[q.id] = q.text;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [slides, quizTexts]);

  // Carica (e mette in cache) le domande di un capitolo, on demand.
  const ensureChapterQuestions = useCallback(
    async (chapterId: string) => {
      if (questionsByChapter[chapterId]) return;
      const res = await listAulaChapterQuestions(chapterId);
      if (res.success && res.data) {
        setQuestionsByChapter((prev) => ({ ...prev, [chapterId]: res.data }));
      }
    },
    [questionsByChapter],
  );

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
      try {
        const { base64, ext, contentType } = await downscaleImage(file);
        // Guardia: resta ben sotto il bodySizeLimit del server action.
        const approxBytes = Math.ceil((base64.length * 3) / 4);
        if (approxBytes > 3.5 * 1024 * 1024) {
          setMessage("Immagine troppo grande anche dopo la compressione. Usane una più leggera.");
          return;
        }
        const res = await uploadAulaImage({ base64, ext, contentType });
        if (res.success && res.data) {
          const r2Key = res.data.r2Key;
          const url = await resolveAulaImageUrl(r2Key);
          if (url) setImageUrls((prev) => ({ ...prev, [r2Key]: url }));
          updateBlock(bi, { type: "image", r2Key });
        } else {
          setMessage(res.message ?? "Upload immagine fallito");
        }
      } catch (err) {
        // Qualsiasi errore (file non valido, rigetto del server action, ecc.)
        // viene mostrato invece di fallire in silenzio.
        setMessage(err instanceof Error ? err.message : "Upload immagine fallito");
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

  const handleStartQuiz = (mode: "LIVE" | "EXAM") => {
    startTransition(async () => {
      const res = await createAulaLiveSession({ lessonId: lesson.id, count: 5, mode });
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
            className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
            disabled={slideCount === 0}
            onClick={() => setPresenting(true)}
          >
            Presenta
          </button>
          <button
            className="rounded-md bg-pink-500 px-4 py-2 text-white disabled:opacity-50"
            disabled={pending}
            onClick={() => handleStartQuiz("LIVE")}
            title="Una domanda alla volta, a ritmo del docente"
          >
            Quiz live
          </button>
          <button
            className="rounded-md border border-pink-500 px-4 py-2 text-pink-600 disabled:opacity-50"
            disabled={pending}
            onClick={() => handleStartQuiz("EXAM")}
            title="Tutte le domande insieme, correzione finale a schermo"
          >
            Quiz completo
          </button>
        </div>
      </div>

      {presenting && (
        <AulaSlideShow
          pkg={pkg}
          initialImageUrls={imageUrls}
          startIndex={active}
          onClose={() => setPresenting(false)}
        />
      )}

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
                      chapters={chapters}
                      questionsByChapter={questionsByChapter}
                      ensureChapterQuestions={ensureChapterQuestions}
                      quizText={block.type === "quizRef" ? quizTexts[block.questionId] : undefined}
                      defaultChapterId={lesson.chapterId}
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

type Chapter = { id: string; chapterNumber: number; description: string };
type Question = { id: string; text: string };

/** Editor di un singolo blocco, in base al tipo. */
function BlockEditor({
  block,
  readOnly,
  imageUrl,
  chapters,
  questionsByChapter,
  ensureChapterQuestions,
  quizText,
  defaultChapterId,
  onChange,
  onUpload,
}: {
  block: SlideBlock;
  readOnly: boolean;
  imageUrl?: string;
  chapters: Chapter[];
  questionsByChapter: Record<string, Question[]>;
  ensureChapterQuestions: (chapterId: string) => void | Promise<void>;
  quizText?: string;
  defaultChapterId: string | null;
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
          <img src={imageUrl} alt={block.caption ?? ""} className="max-h-64 max-w-full rounded-md border" />
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
    <QuizRefPicker
      questionId={block.questionId}
      quizText={quizText}
      chapters={chapters}
      questionsByChapter={questionsByChapter}
      ensureChapterQuestions={ensureChapterQuestions}
      defaultChapterId={defaultChapterId}
      readOnly={readOnly}
      onChange={(questionId) => onChange({ type: "quizRef", questionId })}
    />
  );
}

/**
 * Selettore di una domanda del quiz: capitolo → domanda (dropdown).
 * Evita di incollare l'UUID a mano. Mostra la domanda attualmente scelta.
 */
function QuizRefPicker({
  questionId,
  quizText,
  chapters,
  questionsByChapter,
  ensureChapterQuestions,
  defaultChapterId,
  readOnly,
  onChange,
}: {
  questionId: string;
  quizText?: string;
  chapters: Chapter[];
  questionsByChapter: Record<string, Question[]>;
  ensureChapterQuestions: (chapterId: string) => void | Promise<void>;
  defaultChapterId: string | null;
  readOnly: boolean;
  onChange: (questionId: string) => void;
}) {
  const [chapterId, setChapterId] = useState<string>(defaultChapterId ?? "");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (chapterId) void ensureChapterQuestions(chapterId);
  }, [chapterId, ensureChapterQuestions]);

  const questions = chapterId ? (questionsByChapter[chapterId] ?? null) : null;
  const filtered = useMemo(() => {
    if (!questions) return [];
    const f = filter.trim().toLowerCase();
    const list = f
      ? questions.filter((q) => q.text.toLowerCase().includes(f))
      : questions;
    return list.slice(0, 200);
  }, [questions, filter]);

  if (readOnly) {
    return (
      <p className="rounded-md border bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
        {quizText ?? "Domanda quiz"}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {questionId && (
        <p className="rounded-md bg-pink-50 px-3 py-2 text-sm text-neutral-700">
          <span className="font-medium">Selezionata:</span>{" "}
          {quizText ?? "caricamento…"}
        </p>
      )}
      <select
        className="w-full rounded-md border px-3 py-2 text-sm"
        value={chapterId}
        onChange={(e) => {
          setChapterId(e.target.value);
          setFilter("");
        }}
      >
        <option value="">— Scegli un capitolo —</option>
        {chapters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.chapterNumber}. {c.description}
          </option>
        ))}
      </select>

      {chapterId && (
        <>
          <input
            className="w-full rounded-md border px-3 py-1.5 text-sm"
            placeholder="Filtra domande…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {!questions ? (
            <p className="text-sm text-neutral-400">Caricamento domande…</p>
          ) : (
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={questionId}
              onChange={(e) => onChange(e.target.value)}
              size={6}
            >
              <option value="">— Scegli una domanda —</option>
              {filtered.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.text}
                </option>
              ))}
            </select>
          )}
          {questions && filtered.length === 200 && (
            <p className="text-xs text-neutral-400">
              Mostrate le prime 200 — affina il filtro per trovarne altre.
            </p>
          )}
        </>
      )}
    </div>
  );
}
