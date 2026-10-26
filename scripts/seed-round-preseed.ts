/**
 * Round pre-seed — import dei contatti dell'outreach nel backoffice.
 *
 * 1. Esporta i file (fuori dal repo, dati riservati) in un JSON grezzo:
 *      python3 -I scripts/round-preseed/export-outreach.py \
 *        ~/Developer/reglo-deck-raccolta-2026/outreach /tmp/…/outreach.json
 * 2. Prova a secco (non scrive niente, stampa il resoconto):
 *      DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *        npx tsx scripts/seed-round-preseed.ts --data=/tmp/…/outreach.json --dry-run
 * 3. Import vero: stesso comando senza --dry-run. Su prod serve anche --prod.
 *
 * Idempotente: ogni contatto ha una `importKey`; chi c'è già NON viene
 * toccato (le modifiche fatte dal backoffice restano). Con --update i campi
 * importati si riscrivono (lo storico no).
 *
 * Le «ondate» non esistono più: la colonna si ignora e la parola si toglie
 * dai testi (lo script si ferma se ne resta traccia).
 */

import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

import {
  milestonesAfterStatus,
  summarize,
  STATUS_LABEL,
  CATEGORY_LABEL,
  type LeadRole,
  type Milestones,
  type RoundCategory,
  type RoundChannel,
  type RoundOwner,
  type RoundPriority,
  type RoundStatus,
} from "../lib/round/round-constants";

type Contact = {
  sheet: string;
  group: string | null;
  name: string;
  organization: string | null;
  channel: string | null;
  status: string | null;
  notes: string | null;
};
type Cells = Record<string, string | null>;
type Export = {
  contacts: Contact[];
  archive: Cells[];
  angels: Cells[];
  angelConflicts: Array<{ name: string; reason: string | null }>;
  angelPaused: Array<{ name: string; reason: string | null }>;
  leads: Cells[];
};

const ROUND_NAME = "Pre-seed 2026";
const ROUND_TARGET_CENTS = 100_000_000; // 1 M€
const OUTREACH_START = "2026-10-19";
const IMPORT_AUTHOR = "Import outreach";

const arg = (name: string) =>
  process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Toglie ogni riferimento alle ondate («Previsto in ondata 1, mai inviato» → «Previsto, mai inviato»). */
const scrub = (t: string | null | undefined): string | null => {
  if (!t) return null;
  const out = t
    .replace(/\s*\b(?:nella |della |dell'|in |per l'|per la )?ondat[ae](?:\s*\d+)?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
  return out || null;
};
const real = (t: string | null | undefined) => {
  const v = scrub(t);
  return v && !/^tbd\b/i.test(v) ? v : null;
};

const CATEGORY_BY_SHEET: Array<[RegExp, RoundCategory]> = [
  [/^business angel/i, "business_angel"],
  [/^club/i, "club_angel"],
  [/^fondi vc ital/i, "vc_italia"],
  [/^family/i, "family_office"],
  [/^fondi vc europ/i, "vc_europa"],
  [/^acceleratori/i, "altro"],
];

const CANONICAL_CHANNEL = /^(linkedin|email diretta|modulo o candidatura sul sito|candidatura|call|altro|tbd|presentazione da qualcuno)$/i;

function channelOf(text: string | null): RoundChannel | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes("linkedin")) return "linkedin";
  if (t.includes("modulo") || t.includes("candidatura")) return "modulo";
  if (t.includes("mail")) return "email";
  if (t === "call") return "call";
  if (t.includes("intro") || t.includes("presentazione")) return "intro";
  if (t === "altro") return "altro";
  return null;
}

const dates = (text: string) =>
  [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)]
    .map(([, d, m]) => `2026-${m.padStart(2, "0")}-${d.padStart(2, "0")}`)
    .filter((v) => v >= "2026-09-01" && v <= "2026-12-31")
    .sort();

const leadRoleOf = (giudizio: string | null): LeadRole | null => {
  const g = (giudizio ?? "").toLowerCase();
  if (g.includes("probabile")) return "lead_probabile";
  if (g.includes("possibile")) return "lead_possibile";
  if (g.includes("follower")) return "follower";
  return null;
};

type Interaction = { occurredOn: string; kind: string; body: string; authorName: string };
type Draft = {
  importKey: string;
  name: string;
  organization: string | null;
  category: RoundCategory;
  subcategory: string | null;
  city: string | null;
  email: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  channel: RoundChannel | null;
  channelDetail: string | null;
  owner: RoundOwner | null;
  status: RoundStatus;
  blockedReason: string | null;
  leadRole: LeadRole | null;
  priority: RoundPriority | null;
  ticket: string | null;
  fit: string | null;
  source: string | null;
  notes: string | null;
  lastContactOn: string | null;
  nextStepOn: string | null;
  nextStepNote: string | null;
  milestones: Milestones;
  excludedOn: string | null;
  excludedReason: string | null;
  interactions: Interaction[];
};

const NO_MILESTONES: Milestones = {
  contactedOn: null,
  respondedOn: null,
  callOn: null,
  interestedOn: null,
  committedOn: null,
};

const kindOfChannel = (c: RoundChannel | null) =>
  c === "linkedin" ? "messaggio" : c === "email" ? "mail" : c === "modulo" ? "modulo" : c === "call" ? "call" : "nota";

function build(data: Export): Draft[] {
  const archive = new Map(data.archive.filter((a) => a.nome).map((a) => [norm(a.nome!), a]));
  const angels = new Map(data.angels.filter((a) => a.Nome).map((a) => [norm(a.Nome!), a]));
  const conflicts = new Map(data.angelConflicts.map((a) => [norm(a.name), a.reason]));
  const paused = new Map(data.angelPaused.map((a) => [norm(a.name), a.reason]));
  const leads = data.leads.filter((l) => l.Fondo);
  const leadOf = (name: string) => leads.find((l) => norm(l.Fondo!).startsWith(norm(name)));

  return data.contacts.map((c) => {
    const category = CATEGORY_BY_SHEET.find(([re]) => re.test(c.sheet))?.[1];
    if (!category) throw new Error(`Foglio sconosciuto: ${c.sheet}`);
    const key = norm(c.name);
    const a = archive.get(key);
    const g = angels.get(key);
    const lead = category === "vc_italia" || category === "club_angel" ? leadOf(c.name) : undefined;
    const statusText = scrub(c.status) ?? "";
    const notesText = scrub(c.notes);
    const group = (c.group ?? "").toLowerCase();

    const channel = channelOf(c.channel) ?? channelOf(a?.canale ?? null);
    const channelDetail =
      (c.channel && !CANONICAL_CHANNEL.test(c.channel) ? real(c.channel) : null) ??
      real(a?.["link o indirizzo"]) ??
      real(g?.["Canale migliore"]);

    const linkedinFromAngel = g?.Link && /linkedin\.com/i.test(g.Link) ? g.Link : null;
    const leadLinkedin = lead?.LinkedIn?.split(/\s·\s|\s+/).find((u) => u.startsWith("http")) ?? null;

    const notes: string[] = [];
    if (notesText && notesText !== statusText) notes.push(notesText);
    if (real(g?.Note)) notes.push(real(g?.Note)!);
    if (conflicts.has(key)) notes.push(`Possibile conflitto: ${conflicts.get(key)}`);
    if (paused.has(key)) notes.push(`In pausa: ${paused.get(key)}`);
    if (lead) {
      const parts = [
        `Valutazione lead (24/10): ${lead.Giudizio}. ${lead.Motivo ?? ""}`.trim(),
        lead["Round guidati 0,5-2 M€ (ultimi 24 mesi)"] ? `Round guidati: ${lead["Round guidati 0,5-2 M€ (ultimi 24 mesi)"]}` : null,
        lead["Attivo ora"] ? `Attivo ora: ${lead["Attivo ora"]}` : null,
        lead["Persona da contattare"] ? `Persone: ${lead["Persona da contattare"]}` : null,
        lead["Conflitto con Reglo"] ? `Conflitto: ${lead["Conflitto con Reglo"]}` : null,
        lead.Note ? lead.Note : null,
      ].filter(Boolean);
      notes.push(parts.join("\n"));
    }

    const draft: Draft = {
      importKey: `${category}:${slug(c.name)}`,
      name: c.name,
      organization: real(c.organization) ?? real(g?.["Chi è"]),
      category,
      subcategory: real(a?.tipo) ?? real(g?.Tipo),
      city: real(a?.["città"]),
      email: real(a?.["email pubblica"]),
      linkedinUrl: real(a?.LinkedIn) ?? linkedinFromAngel ?? leadLinkedin,
      websiteUrl: real(a?.sito) ?? (g?.Link && !linkedinFromAngel && g.Link.startsWith("http") ? g.Link : null),
      channel,
      channelDetail,
      owner: null,
      status: "da_contattare",
      blockedReason: null,
      leadRole: leadRoleOf(lead?.Giudizio ?? null) ?? (g && /^(sì|si|possibile)$/i.test(g["Possibile lead"] ?? "") ? "lead_possibile" : null),
      priority: (["A", "B", "C"].includes(a?.["priorità"] ?? "") ? a!["priorità"] : ["A", "B", "C"].includes(g?.["Priorità"] ?? "") ? g!["Priorità"] : null) as RoundPriority | null,
      ticket: real(lead?.["Primo ticket tipico"]) ?? real(a?.["ticket tipico"]) ?? real(g?.["Ticket tipico"]),
      fit: real(a?.["perché è adatto"]) ?? real(g?.["Perché è adatto a Reglo"]),
      source: real(a?.fonte) ?? real(g?.Fonte) ?? real(lead?.Fonti),
      notes: scrub(notes.join("\n\n")),
      lastContactOn: null,
      nextStepOn: null,
      nextStepNote: null,
      milestones: { ...NO_MILESTONES },
      excludedOn: null,
      excludedReason: null,
      interactions: [],
    };

    // Chi se ne occupa: il gruppo di Gabriele; tra i «Contattati da noi» Hiro
    // dove il contatto è un modulo o una mail (li ha mandati Hiro), sennò Tiziano.
    if (group.startsWith("gabriele")) draft.owner = "gabriele";
    else if (group.startsWith("contattati")) draft.owner = channel === "modulo" || channel === "email" ? "hiro" : "tiziano";

    if (group.startsWith("esclusi")) {
      draft.excludedReason = notesText && notesText.length > statusText.length ? notesText : statusText || "Escluso";
      draft.excludedOn = dates(`${statusText} ${notesText ?? ""}`)[0] ?? "2026-10-24";
      return draft;
    }

    const allDates = dates(`${statusText} ${notesText ?? ""}`);
    const contactedAt = allDates[0] ?? OUTREACH_START;
    const setStatus = (status: RoundStatus, on = contactedAt) => {
      draft.status = status;
      draft.milestones = milestonesAfterStatus(draft.milestones, status, on);
    };

    if (/^bloccato:/i.test(statusText)) {
      draft.status = "bloccato";
      draft.blockedReason = statusText.replace(/^bloccato:\s*/i, "");
    } else if (/^non ancora contattato/i.test(statusText)) {
      draft.status = /^in pausa/i.test(notesText ?? "") ? "in_pausa" : "da_contattare";
    } else if (/^(nessuna risposta|invito linkedin non ancora accettato|solo risposta automatica)/i.test(statusText)) {
      setStatus("contattato");
    } else if (/ha risposto/i.test(statusText)) {
      setStatus("risposto");
    } else if (/^(call|mail 19\/10\. risposta)/i.test(statusText)) {
      setStatus("contattato"); // rifinito sotto, caso per caso
    } else {
      throw new Error(`Stato non riconosciuto per «${c.name}»: ${statusText}`);
    }

    if (draft.status !== "da_contattare" && draft.status !== "in_pausa" && draft.status !== "bloccato") {
      draft.lastContactOn = allDates[allDates.length - 1] ?? OUTREACH_START;
      draft.interactions.push({
        occurredOn: contactedAt,
        kind: kindOfChannel(channel),
        body: notesText ?? statusText,
        authorName: IMPORT_AUTHOR,
      });
    }
    return draft;
  });
}

/** Le risposte note (dal 19 al 25 ottobre), sopra a quanto dicono i fogli. */
function applyKnownAnswers(drafts: Draft[]) {
  const find = (name: string, category?: RoundCategory) => {
    const d = drafts.find((x) => norm(x.name) === norm(name) && (!category || x.category === category));
    if (!d) throw new Error(`Risposta nota senza contatto: ${name}`);
    return d;
  };
  const step = (d: Draft, status: RoundStatus, on: string) => {
    d.status = status;
    d.milestones = milestonesAfterStatus(d.milestones, status, on);
  };
  const log = (d: Draft, occurredOn: string, kind: string, body: string) =>
    d.interactions.push({ occurredOn, kind, body, authorName: IMPORT_AUTHOR });

  const bheroes = find("B Heroes", "vc_italia");
  bheroes.interactions = [];
  step(bheroes, "risposto", "2026-10-19");
  step(bheroes, "call", "2026-10-20");
  bheroes.leadRole = "follower";
  bheroes.lastContactOn = "2026-10-20";
  log(bheroes, "2026-10-19", "modulo", "Candidatura sul portale B Heroes.");
  log(bheroes, "2026-10-19", "risposta", "Evgenia Puzynkina (dealflow manager) chiede una call.");
  log(bheroes, "2026-10-20", "call", "Call con Evgenia Puzynkina e Gabriele. Fanno da follower: serve prima un lead.");

  const geeks = find("Startup Geeks (Investment Club)");
  geeks.interactions = [];
  step(geeks, "call", "2026-10-20");
  geeks.status = "in_pausa";
  geeks.lastContactOn = "2026-10-22";
  geeks.nextStepOn = "2027-01-11";
  geeks.nextStepNote = "In stand-by fino al 2027: riprendere il contatto.";
  log(geeks, "2026-10-20", "call", "Call con Gabriele.");
  log(geeks, "2026-10-22", "risposta", "Mail di Davide Bolognini: in stand-by fino al 2027.");

  const nana = find("Nana Bianca");
  nana.interactions = [];
  step(nana, "no", "2026-10-19");
  nana.lastContactOn = "2026-10-19";
  nana.nextStepOn = "2027-03-01";
  nana.nextStepNote = "Ricandidarsi a Hubble (batch di marzo).";
  log(nana, "2026-10-19", "mail", "Mail di presentazione.");
  log(nana, "2026-10-19", "risposta", "No per ora: ricandidarsi a Hubble a marzo.");

  const foresti = find("Luca Foresti");
  foresti.interactions = [];
  step(foresti, "risposto", "2026-10-19");
  foresti.lastContactOn = "2026-10-19";
  log(foresti, "2026-10-19", "messaggio", "Scritto da Gabriele su LinkedIn.");
  log(foresti, "2026-10-19", "risposta", "Ha risposto con un 👍 su LinkedIn.");

  const belleri = find("Mirko Belleri");
  belleri.interactions = [];
  belleri.organization = "ZNext";
  step(belleri, "call", "2026-10-23");
  step(belleri, "interessato", "2026-10-23");
  belleri.leadRole = "follower";
  belleri.lastContactOn = "2026-10-23";
  belleri.nextStepOn = "2026-10-28";
  belleri.nextStepNote = "Ricontattarlo: ci presenta a Zanichelli Venture.";
  log(belleri, "2026-10-23", "call", "Call positiva: ci presenta a Zanichelli Venture (follower).");

  const iff = find("Italian Founders Fund");
  iff.interactions = [];
  iff.leadRole = "lead_probabile";
  iff.lastContactOn = "2026-10-20";
  iff.nextStepOn = "2026-11-03";
  iff.nextStepNote = "Se non si fanno vivi entro il 3/11: nessun fit.";
  log(iff, "2026-10-19", "mail", "Mail di presentazione.");
  log(iff, "2026-10-19", "nota", "Solo risposta automatica: si fanno vivi entro 2 settimane se c'è fit.");
  log(iff, "2026-10-20", "modulo", "Modulo Notion compilato da Gabriele (referente Tiziano).");

  const azimut = find("Azimut Libera Impresa SGR");
  azimut.excludedOn = "2026-10-24";
  azimut.excludedReason = "Conflitto: ha co-guidato il seed di Guidoio (concorrente diretto).";

  const cdp = find("CDP Venture Capital");
  if (!cdp.excludedOn) throw new Error("CDP Venture Capital doveva essere tra gli esclusi.");
}

function checkNoWaves(drafts: Draft[]) {
  for (const d of drafts) {
    const blob = JSON.stringify(d);
    if (/\bondat[ae]\b/i.test(blob)) throw new Error(`Resta una «ondata» in ${d.name}: ${blob.match(/.{0,40}\bondat[ae]\b.{0,40}/i)?.[0]}`);
  }
}

const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

function fieldsOf(d: Draft) {
  return {
    name: d.name,
    organization: d.organization,
    category: d.category,
    subcategory: d.subcategory,
    city: d.city,
    email: d.email,
    linkedinUrl: d.linkedinUrl,
    websiteUrl: d.websiteUrl,
    channel: d.channel,
    channelDetail: d.channelDetail,
    owner: d.owner,
    status: d.status,
    blockedReason: d.blockedReason,
    leadRole: d.leadRole,
    priority: d.priority,
    ticket: d.ticket,
    fit: d.fit,
    source: d.source,
    notes: d.notes,
    lastContactOn: day(d.lastContactOn),
    nextStepOn: day(d.nextStepOn),
    nextStepNote: d.nextStepNote,
    contactedOn: day(d.milestones.contactedOn),
    respondedOn: day(d.milestones.respondedOn),
    callOn: day(d.milestones.callOn),
    interestedOn: day(d.milestones.interestedOn),
    committedOn: day(d.milestones.committedOn),
    excludedAt: d.excludedOn ? new Date(`${d.excludedOn}T12:00:00.000Z`) : null,
    excludedReason: d.excludedReason,
    updatedByName: IMPORT_AUTHOR,
  };
}

async function main() {
  const path = arg("data");
  if (!path) throw new Error("Manca --data=<outreach.json> (vedi l'intestazione dello script).");
  if (/prod/i.test(process.env.DOTENV_CONFIG_PATH ?? "") && !flag("prod")) {
    throw new Error("Su prod serve anche --prod.");
  }
  const dryRun = flag("dry-run");
  const update = flag("update");

  const drafts = build(JSON.parse(readFileSync(path, "utf8")) as Export);
  applyKnownAnswers(drafts);
  checkNoWaves(drafts);

  const keys = new Set<string>();
  for (const d of drafts) {
    if (keys.has(d.importKey)) throw new Error(`Chiave doppia: ${d.importKey}`);
    keys.add(d.importKey);
  }

  const s = summarize(
    drafts.map((d) => ({ ...d.milestones, status: d.status, category: d.category, excluded: !!d.excludedOn, commitmentCents: null })),
  );
  console.log(`Contatti: ${drafts.length} (nel round ${s.total}, esclusi ${s.excluded})`);
  console.log(
    "Per stato:",
    Object.entries(s.byStatus)
      .filter(([, n]) => n)
      .map(([k, n]) => `${STATUS_LABEL[k as RoundStatus]} ${n}`)
      .join(" · "),
  );
  console.log(
    "Per tipologia:",
    Object.entries(s.byCategory)
      .map(([k, v]) => `${CATEGORY_LABEL[k as RoundCategory]} ${v.total}`)
      .join(" · "),
  );
  const owners = drafts.reduce<Record<string, number>>((acc, d) => ((acc[d.owner ?? "nessuno"] = (acc[d.owner ?? "nessuno"] ?? 0) + 1), acc), {});
  console.log("Chi se ne occupa:", JSON.stringify(owners));
  console.log(
    "Arricchiti:",
    `email ${drafts.filter((d) => d.email).length}, LinkedIn ${drafts.filter((d) => d.linkedinUrl).length}, sito ${drafts.filter((d) => d.websiteUrl).length}, sottocategoria ${drafts.filter((d) => d.subcategory).length}, priorità ${drafts.filter((d) => d.priority).length}, lead/follower ${drafts.filter((d) => d.leadRole).length}`,
  );
  console.log("Interazioni:", drafts.reduce((n, d) => n + d.interactions.length, 0));

  if (dryRun) {
    console.log("\nProva a secco: nessuna scrittura.");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const round =
      (await prisma.fundraisingRound.findFirst({ where: { name: ROUND_NAME } })) ??
      (await prisma.fundraisingRound.create({ data: { name: ROUND_NAME, targetCents: ROUND_TARGET_CENTS } }));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const d of drafts) {
      const existing = await prisma.roundInvestor.findUnique({
        where: { roundId_importKey: { roundId: round.id, importKey: d.importKey } },
        select: { id: true },
      });
      if (existing) {
        if (update) {
          await prisma.roundInvestor.update({ where: { id: existing.id }, data: fieldsOf(d) });
          updated += 1;
        } else skipped += 1;
        continue;
      }
      await prisma.roundInvestor.create({
        data: {
          ...fieldsOf(d),
          roundId: round.id,
          importKey: d.importKey,
          interactions: {
            create: d.interactions.map((i) => ({ ...i, occurredOn: new Date(`${i.occurredOn}T00:00:00.000Z`) })),
          },
        },
      });
      created += 1;
    }
    console.log(`\nFatto: ${created} creati, ${updated} aggiornati, ${skipped} già presenti (non toccati).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
