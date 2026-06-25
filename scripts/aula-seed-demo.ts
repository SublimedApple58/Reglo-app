import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Reglo Aula — seed DEMO: una lezione "vera" con slide + quiz, per dimostrazioni.
 *
 * Crea per una company:
 *  1. abilita il flag `aulaEnabled` (idempotente)
 *  2. una AulaLesson agganciata a un capitolo con domande (per il quiz live)
 *  3. un pacchetto slide (.rppt) su R2 con contenuto reale: titoli, testo,
 *     elenchi e blocchi quizRef (domande della banca → mostrate in presentazione)
 *
 * Self-contained: NON importa lib/aula/* (sono "server-only"). Parla con R2 via SDK.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *     npx tsx scripts/aula-seed-demo.ts "<nome o id company>"
 */

const prisma = new PrismaClient();

const AULA_PACKAGE_VERSION = 1 as const;

const companyPackageKey = (companyId: string, lessonId: string) =>
  `aula/${companyId}/${lessonId}.json`;

function getR2() {
  const bucket = process.env.R2_BUCKET_NAME ?? process.env.R2_BUCKET;
  const rawEndpoint = process.env.R2_ENDPOINT;
  if (!bucket) throw new Error("R2_BUCKET_NAME mancante");
  if (!rawEndpoint) throw new Error("R2_ENDPOINT mancante");
  // normalizeEndpoint: rimuove un eventuale /<bucket> finale
  const trimmed = rawEndpoint.replace(/\/+$/, "");
  const endpoint = trimmed.endsWith(`/${bucket}`)
    ? trimmed.slice(0, -(bucket.length + 1))
    : trimmed;
  const client = new S3Client({
    region: process.env.R2_REGION ?? "auto",
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });
  return { client, bucket };
}

function buildSlides(chapterLabel: string, quizIds: string[]) {
  const slides: unknown[][] = [
    [
      { type: "heading", text: chapterLabel },
      {
        type: "text",
        text: "Lezione di teoria in aula. Usa le frecce ← → per navigare le slide; i blocchi quiz mostrano prima la domanda e poi la soluzione con “Vedi soluzione”.",
      },
    ],
    [
      { type: "heading", text: "Concetti chiave" },
      {
        type: "bullets",
        items: [
          "Rispetta sempre la segnaletica verticale e orizzontale.",
          "Adegua la velocità alle condizioni della strada e del traffico.",
          "Mantieni la distanza di sicurezza dal veicolo che precede.",
          "Da' la precedenza secondo le regole e i segnali.",
        ],
      },
    ],
    [
      { type: "heading", text: "Mettiamoci alla prova" },
      { type: "text", text: "Rispondi Vero o Falso alle seguenti affermazioni." },
      ...(quizIds[0] ? [{ type: "quizRef", questionId: quizIds[0] }] : []),
    ],
    ...(quizIds[1] ? [[{ type: "quizRef", questionId: quizIds[1] }]] : []),
    ...(quizIds[2] ? [[{ type: "quizRef", questionId: quizIds[2] }]] : []),
    [
      { type: "heading", text: "Riepilogo" },
      {
        type: "bullets",
        items: [
          "Hai ripassato i concetti principali del capitolo.",
          "Avvia il “Quiz live” per verificare la classe in tempo reale.",
        ],
      },
    ],
  ];
  return { version: AULA_PACKAGE_VERSION, slides };
}

/** Domande demo V/F (usate solo se la banca quiz è vuota). */
const DEMO_QUESTIONS: { text: string; correct: boolean }[] = [
  { text: "Il segnale di STOP obbliga sempre a fermarsi completamente.", correct: true },
  { text: "È consentito sostare davanti a un passo carrabile.", correct: false },
  { text: "La distanza di sicurezza aumenta con l'aumentare della velocità.", correct: true },
  { text: "Con la nebbia fitta è corretto accendere i fari abbaglianti.", correct: false },
  { text: "Sulle strisce pedonali il pedone che attraversa ha la precedenza.", correct: true },
  { text: "Alla guida è permesso usare il telefono cellulare tenendolo in mano.", correct: false },
];

/** Crea un capitolo demo + domande V/F (idempotente su chapterNumber/externalId). */
async function ensureDemoQuiz() {
  const DEMO_CHAPTER_NUMBER = 999;
  const DEMO_EXTERNAL_BASE = 990000;
  const chapter = await prisma.quizChapter.upsert({
    where: { chapterNumber: DEMO_CHAPTER_NUMBER },
    update: {},
    create: { chapterNumber: DEMO_CHAPTER_NUMBER, description: "Demo Aula (V/F)" },
    select: { id: true, chapterNumber: true, description: true },
  });
  for (let i = 0; i < DEMO_QUESTIONS.length; i++) {
    const q = DEMO_QUESTIONS[i];
    await prisma.quizQuestion.upsert({
      where: { externalId: DEMO_EXTERNAL_BASE + i },
      update: { questionText: q.text, correctAnswer: q.correct, chapterId: chapter.id },
      create: {
        externalId: DEMO_EXTERNAL_BASE + i,
        argumentId: "demo",
        chapterId: chapter.id,
        questionText: q.text,
        correctAnswer: q.correct,
      },
    });
  }
  return chapter;
}

async function main() {
  const arg = process.argv[2];
  if (!arg)
    throw new Error(
      'Passa nome o id della company: npx tsx scripts/aula-seed-demo.ts "<company>"',
    );

  const isUuid =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      arg,
    );
  const company = await prisma.company.findFirst({
    where: isUuid
      ? { id: arg }
      : { name: { contains: arg, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`Company non trovata per "${arg}"`);
  console.log(`Company: ${company.name} (${company.id})`);

  // 1. abilita aulaEnabled (idempotente)
  const service = await prisma.companyService.findUnique({
    where: { companyId_serviceKey: { companyId: company.id, serviceKey: "AUTOSCUOLE" } },
  });
  const limits = { ...((service?.limits as Record<string, unknown>) ?? {}), aulaEnabled: true };
  await prisma.companyService.upsert({
    where: { companyId_serviceKey: { companyId: company.id, serviceKey: "AUTOSCUOLE" } },
    update: { limits },
    create: { companyId: company.id, serviceKey: "AUTOSCUOLE", status: "ACTIVE", limits },
  });
  console.log("aulaEnabled = true");

  // 2. capitolo con domande: usa quello esistente o crea un capitolo demo
  let chapter = await prisma.quizChapter.findFirst({
    where: { questions: { some: {} } },
    orderBy: { chapterNumber: "asc" },
    select: { id: true, chapterNumber: true, description: true },
  });
  if (!chapter) {
    console.log("Nessuna banca domande: creo un capitolo demo + domande V/F.");
    chapter = await ensureDemoQuiz();
  }
  const questions = await prisma.quizQuestion.findMany({
    where: { chapterId: chapter.id },
    orderBy: { externalId: "asc" },
    take: 6,
    select: { id: true },
  });
  const quizIds = questions.map((q) => q.id);
  const chapterLabel = `Cap. ${chapter.chapterNumber}${chapter.description ? ` — ${chapter.description}` : ""}`;

  // 3. crea (o riusa) la lezione demo
  const title = "Demo Aula — Lezione con slide e quiz";
  const existing = await prisma.aulaLesson.findFirst({
    where: { companyId: company.id, title },
  });
  const lesson =
    existing ??
    (await prisma.aulaLesson.create({
      data: {
        companyId: company.id,
        chapterId: chapter.id,
        title,
        description: `Slide di teoria + quiz live sul ${chapterLabel}`,
        isTemplate: false,
        packageR2Key: "",
      },
    }));

  // 4. pacchetto slide su R2
  const key = companyPackageKey(company.id, lesson.id);
  const pkg = buildSlides(chapterLabel, quizIds);
  const { client, bucket } = getR2();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(pkg),
      ContentType: "application/json",
    }),
  );
  await prisma.aulaLesson.update({
    where: { id: lesson.id },
    data: { packageR2Key: key, chapterId: chapter.id },
  });

  const quizRefBlocks = pkg.slides
    .flat()
    .filter((b) => (b as { type?: string }).type === "quizRef").length;
  console.log(`Lezione: ${title} (${lesson.id})`);
  console.log(`  capitolo: ${chapterLabel} (${quizIds.length} domande per il quiz live)`);
  console.log(`  slide: ${pkg.slides.length} (di cui ${quizRefBlocks} blocchi quiz in presentazione)`);
  console.log(`  pacchetto R2: ${key}`);
  console.log("\nOra: /it/aula → 'Modifica' la lezione (Presenta le slide) oppure 'Avvia quiz' per il live.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
