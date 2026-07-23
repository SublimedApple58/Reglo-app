"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  ChevronDown,
  ChevronUp,
  Play,
  Plus,
  Presentation,
  Trash2,
  X,
} from "lucide-react";
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
import { aulaErrorMessage } from "@/components/pages/Aula/aula-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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

  // Avvisa se si chiude/ricarica la scheda con modifiche non salvate.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

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
          setMessage(aulaErrorMessage(res.message, "Upload immagine fallito"));
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
        setMessage(aulaErrorMessage(res.message, "Errore nel salvataggio"));
      }
    });
  };

  const handleStartQuiz = (mode: "LIVE" | "EXAM") => {
    startTransition(async () => {
      // Usa le domande scelte dal docente nei blocchi quizRef della lezione;
      // se non ce ne sono, ripiega su N domande casuali dal capitolo.
      const questionIds = Array.from(
        new Set(
          pkg.slides.flatMap((s) =>
            s
              .filter(
                (b): b is Extract<SlideBlock, { type: "quizRef" }> =>
                  b.type === "quizRef" && !!b.questionId,
              )
              .map((b) => b.questionId),
          ),
        ),
      );
      const res = await createAulaLiveSession({
        lessonId: lesson.id,
        mode,
        // count è richiesto dal tipo; viene ignorato quando passiamo questionIds
        // espliciti (resolveQuestionIds dà priorità a quelli).
        count: 5,
        ...(questionIds.length > 0 ? { questionIds } : {}),
      });
      if (res.success && res.data) {
        router.push(`/aula/live/${res.data.code}`);
      } else {
        setMessage(aulaErrorMessage(res.message, "Impossibile avviare il quiz"));
      }
    });
  };

  const slideCount = useMemo(() => slides.length, [slides]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={lesson.title}
        subtitle={[
          `${slideCount} slide`,
          ...(editable ? [] : ["Sola lettura"]),
        ]}
        actions={
          <>
            {editable && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending || !dirty}
                onClick={handleSave}
              >
                {dirty ? "Salva" : "Salvato"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={slideCount === 0}
              onClick={() => setPresenting(true)}
            >
              <Presentation />
              Presenta
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => handleStartQuiz("LIVE")}
              title="Una domanda alla volta, a ritmo del docente"
            >
              <Play />
              Quiz live
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => handleStartQuiz("EXAM")}
              title="Tutte le domande insieme, correzione finale a schermo"
            >
              Quiz completo
            </Button>
          </>
        }
      />

      {presenting && (
        <AulaSlideShow
          pkg={pkg}
          initialImageUrls={imageUrls}
          startIndex={active}
          onClose={() => setPresenting(false)}
        />
      )}

      {!editable && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-medium text-yellow-700">
          Questa è una lezione standard (sola lettura). Personalizzala dalla lista
          per poterla modificare.
        </div>
      )}
      {message && (
        <p
          className={cn(
            "text-sm font-medium",
            message === "Salvato." ? "text-positive" : "text-destructive",
          )}
        >
          {message}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        {/* Rail slide */}
        <aside className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="ds-caption text-muted-foreground">
              Slide ({slideCount})
            </h2>
            {editable && (
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={addSlide}
                title="Aggiungi slide"
              >
                <Plus />
              </Button>
            )}
          </div>
          <ol className="space-y-1.5">
            {slides.map((slide, i) => (
              <li key={i}>
                <button
                  onClick={() => setActive(i)}
                  className={cn(
                    "reglo-focus-ring flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors duration-[var(--motion-fast)]",
                    i === active
                      ? "border-primary bg-primary/5 font-medium text-foreground"
                      : "border-border hover:bg-secondary",
                  )}
                >
                  <span className="truncate">
                    {i + 1}.{" "}
                    {(() => {
                      const h = slide.find((b) => b.type === "heading");
                      return h && h.type === "heading" ? h.text : `Slide ${i + 1}`;
                    })()}
                  </span>
                  <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {slide.length}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        {/* Editor slide attiva */}
        <section className="space-y-4">
          {!activeSlide && (
            <p className="text-sm text-muted-foreground">
              Nessuna slide. Aggiungine una per iniziare.
            </p>
          )}
          {activeSlide && (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
                <span className="ds-section-tertiary mr-auto">
                  Slide {active + 1}
                </span>
                {editable && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={active === 0}
                      onClick={() => moveSlide(active, -1)}
                      title="Sposta su"
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={active === slideCount - 1}
                      onClick={() => moveSlide(active, 1)}
                      title="Sposta giù"
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/5"
                      onClick={() => deleteSlide(active)}
                    >
                      <Trash2 />
                      Elimina slide
                    </Button>
                  </>
                )}
              </div>

              <ol className="space-y-3">
                {activeSlide.map((block, bi) => (
                  <li
                    key={bi}
                    className="rounded-lg border border-border bg-card p-4 shadow-card"
                  >
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="ds-caption text-muted-foreground">
                        {BLOCK_LABELS[block.type]}
                      </span>
                      {editable && (
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            disabled={bi === 0}
                            onClick={() => moveBlock(bi, -1)}
                            title="Sposta su"
                          >
                            <ChevronUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            disabled={bi === activeSlide.length - 1}
                            onClick={() => moveBlock(bi, 1)}
                            title="Sposta giù"
                          >
                            <ChevronDown />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/5"
                            onClick={() => deleteBlock(bi)}
                            title="Elimina blocco"
                          >
                            <X />
                          </Button>
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
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {(Object.keys(BLOCK_LABELS) as SlideBlock["type"][]).map((t) => (
                    <Button
                      key={t}
                      variant="outline"
                      size="sm"
                      onClick={() => addBlock(t)}
                    >
                      <Plus />
                      {BLOCK_LABELS[t]}
                    </Button>
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
      <Input
        className="h-12 text-lg font-semibold"
        value={block.text}
        readOnly={readOnly}
        placeholder="Titolo della slide"
        onChange={(e) => onChange({ type: "heading", text: e.target.value })}
      />
    );
  }
  if (block.type === "text") {
    return (
      <Textarea
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
          <div key={i} className="flex items-center gap-2">
            <span className="text-muted-foreground">•</span>
            <Input
              className="h-10 flex-1"
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
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-destructive hover:bg-destructive/5"
                onClick={() =>
                  onChange({ type: "bullets", items: block.items.filter((_, j) => j !== i) })
                }
                title="Rimuovi voce"
              >
                <X />
              </Button>
            )}
          </div>
        ))}
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange({ type: "bullets", items: [...block.items, ""] })}
          >
            <Plus />
            Voce
          </Button>
        )}
      </div>
    );
  }
  if (block.type === "image") {
    return (
      <div className="space-y-2">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={block.caption ?? ""}
            className="max-h-64 max-w-full rounded-lg border border-border"
          />
        ) : block.r2Key ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-border bg-secondary text-sm text-muted-foreground">
            Caricamento anteprima…
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            Nessuna immagine
          </div>
        )}
        {!readOnly && (
          <Input
            type="file"
            accept="image/*"
            className="h-auto py-2.5"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
            }}
          />
        )}
        <Input
          className="h-10 text-sm"
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
 * Selettore di una domanda del quiz: capitolo → domanda.
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
      <p className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
        {quizText ?? "Domanda quiz"}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {questionId && (
        <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-foreground">
          <span className="font-semibold text-primary">Selezionata:</span>{" "}
          {quizText ?? "caricamento…"}
        </p>
      )}
      <Select
        value={chapterId || undefined}
        onValueChange={(v) => {
          setChapterId(v);
          setFilter("");
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="— Scegli un capitolo —" />
        </SelectTrigger>
        <SelectContent>
          {chapters.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.chapterNumber}. {c.description}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {chapterId && (
        <>
          <Input
            className="h-10"
            placeholder="Filtra domande…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {!questions ? (
            <p className="text-sm text-muted-foreground">Caricamento domande…</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  Nessuna domanda trovata.
                </li>
              )}
              {filtered.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => onChange(q.id)}
                    className={cn(
                      "reglo-focus-ring w-full rounded-md px-3 py-2 text-left text-sm transition-colors duration-[var(--motion-fast)]",
                      q.id === questionId
                        ? "bg-primary/10 font-medium text-foreground"
                        : "hover:bg-secondary",
                    )}
                  >
                    {q.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {questions && filtered.length === 200 && (
            <p className="text-xs text-muted-foreground">
              Mostrate le prime 200 — affina il filtro per trovarne altre.
            </p>
          )}
        </>
      )}
    </div>
  );
}
