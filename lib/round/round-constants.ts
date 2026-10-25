/**
 * Round pre-seed: i valori a scelta chiusa (salvati come TEXT, vedi lo schema)
 * e le regole pure dell'imbuto. Nessun accesso al DB: usabile da client,
 * server, script di import e test.
 */

export const ROUND_CATEGORIES = [
  "business_angel",
  "club_angel",
  "vc_italia",
  "family_office",
  "vc_europa",
  "altro",
] as const;
export type RoundCategory = (typeof ROUND_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<RoundCategory, string> = {
  business_angel: "Business angel",
  club_angel: "Club e network di angel",
  vc_italia: "Fondi VC italiani",
  family_office: "Family office e fondi d'impresa",
  vc_europa: "Fondi VC europei",
  altro: "Acceleratori, piattaforme e altro",
};

export const CATEGORY_SHORT: Record<RoundCategory, string> = {
  business_angel: "Angel",
  club_angel: "Club",
  vc_italia: "VC Italia",
  family_office: "Family office",
  vc_europa: "VC Europa",
  altro: "Altro",
};

export const ROUND_STATUSES = [
  "da_contattare",
  "contattato",
  "bloccato",
  "risposto",
  "call",
  "interessato",
  "impegno",
  "no",
  "in_pausa",
] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const STATUS_LABEL: Record<RoundStatus, string> = {
  da_contattare: "Da contattare",
  contattato: "Contattato",
  bloccato: "Bloccato",
  risposto: "Ha risposto",
  call: "Call fatta",
  interessato: "Interessato",
  impegno: "Impegno",
  no: "No",
  in_pausa: "In pausa",
};

export const STATUS_HINT: Record<RoundStatus, string> = {
  da_contattare: "Nessun contatto ancora partito.",
  contattato: "Messaggio, mail o modulo inviato: si aspetta.",
  bloccato: "Il contatto non può partire o proseguire finché non si sblocca qualcosa.",
  risposto: "Ha risposto, senza una call.",
  call: "Call fatta.",
  interessato: "Interesse esplicito a entrare nel round.",
  impegno: "Ha preso un impegno, con un importo.",
  no: "Ha detto di no.",
  in_pausa: "Fermo per scelta nostra o loro, da riprendere.",
};

/** Colore del pallino di stato: lo stesso tono delle fette della ciambella. */
export const STATUS_COLOR: Record<RoundStatus, string> = {
  da_contattare: "#e4d3bd",
  contattato: "#9d86e8",
  bloccato: "#ef6e5d",
  risposto: "#f17fab",
  call: "#f0954a",
  interessato: "#62c497",
  impegno: "#3aa87d",
  no: "#cbbdad",
  in_pausa: "#efc154",
};

export const ROUND_OWNERS = ["tiziano", "gabriele", "hiro"] as const;
export type RoundOwner = (typeof ROUND_OWNERS)[number];
export const OWNER_LABEL: Record<RoundOwner, string> = {
  tiziano: "Tiziano",
  gabriele: "Gabriele",
  hiro: "Hiro",
};

export const ROUND_CHANNELS = ["linkedin", "email", "modulo", "call", "intro", "altro"] as const;
export type RoundChannel = (typeof ROUND_CHANNELS)[number];
export const CHANNEL_LABEL: Record<RoundChannel, string> = {
  linkedin: "LinkedIn",
  email: "Email",
  modulo: "Modulo o candidatura",
  call: "Call",
  intro: "Presentazione",
  altro: "Altro",
};

export const LEAD_ROLES = ["lead_probabile", "lead_possibile", "follower"] as const;
export type LeadRole = (typeof LEAD_ROLES)[number];
export const LEAD_ROLE_LABEL: Record<LeadRole, string> = {
  lead_probabile: "Lead probabile",
  lead_possibile: "Lead possibile",
  follower: "Follower",
};

export const PRIORITIES = ["A", "B", "C"] as const;
export type RoundPriority = (typeof PRIORITIES)[number];

export const INTERACTION_KINDS = ["messaggio", "mail", "call", "modulo", "risposta", "nota", "stato"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];
export const INTERACTION_LABEL: Record<InteractionKind, string> = {
  messaggio: "Messaggio",
  mail: "Mail",
  call: "Call",
  modulo: "Modulo",
  risposta: "Risposta",
  nota: "Nota",
  stato: "Cambio di stato",
};
/** Quelli che si scrivono a mano (il cambio di stato lo scrive il sistema). */
export const MANUAL_INTERACTION_KINDS = INTERACTION_KINDS.filter((k) => k !== "stato");

// ── Imbuto ────────────────────────────────────────────────────────────────────

export const FUNNEL_STAGES = ["contacted", "responded", "call", "interested", "committed"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export const FUNNEL_LABEL: Record<FunnelStage, string> = {
  contacted: "Contattati",
  responded: "Risposta",
  call: "Call",
  interested: "Interesse",
  committed: "Impegno",
};

export type Milestones = {
  contactedOn: string | null;
  respondedOn: string | null;
  callOn: string | null;
  interestedOn: string | null;
  committedOn: string | null;
};

const MILESTONE_FIELD: Record<FunnelStage, keyof Milestones> = {
  contacted: "contactedOn",
  responded: "respondedOn",
  call: "callOn",
  interested: "interestedOn",
  committed: "committedOn",
};

/** Le tappe che uno stato implica (un «no» vuol dire che hanno risposto). */
export const STATUS_IMPLIES: Record<RoundStatus, FunnelStage[]> = {
  da_contattare: [],
  contattato: ["contacted"],
  bloccato: [],
  risposto: ["contacted", "responded"],
  call: ["contacted", "responded", "call"],
  interessato: ["contacted", "responded", "interested"],
  impegno: ["contacted", "responded", "interested", "committed"],
  no: ["contacted", "responded"],
  in_pausa: [],
};

/** Stati del percorso principale: tornarci sopra è una correzione. */
const MAIN_PATH: RoundStatus[] = ["contattato", "risposto", "call", "interessato", "impegno"];

/**
 * Tappe dopo un cambio di stato. Si aggiungono quelle implicate (alla data
 * data). Tornare indietro sul percorso principale è una correzione: le tappe
 * oltre quella dello stato nuovo si tolgono (un clic sbagliato su «Ha
 * risposto» non resta nell'imbuto). «No», «In pausa» e «Bloccato» invece non
 * tolgono niente: un «no» dopo la call conta ancora come call. «Da
 * contattare» azzera tutto. Con `onlyAdd` (una voce di storico) si aggiunge
 * e basta.
 */
export function milestonesAfterStatus(
  current: Milestones,
  status: RoundStatus,
  onYmd: string,
  opts: { onlyAdd?: boolean } = {},
): Milestones {
  if (status === "da_contattare") {
    return { contactedOn: null, respondedOn: null, callOn: null, interestedOn: null, committedOn: null };
  }
  const next = { ...current };
  const implied = STATUS_IMPLIES[status];
  for (const stage of implied) {
    const field = MILESTONE_FIELD[stage];
    if (!next[field]) next[field] = onYmd;
  }
  if (!opts.onlyAdd && MAIN_PATH.includes(status)) {
    const highest = Math.max(...implied.map((s) => FUNNEL_STAGES.indexOf(s)));
    for (const stage of FUNNEL_STAGES.slice(highest + 1)) next[MILESTONE_FIELD[stage]] = null;
  }
  return next;
}

export type FunnelInvestor = Milestones & {
  status: RoundStatus;
  category: RoundCategory;
  excluded: boolean;
  commitmentCents: number | null;
};

export type RoundSummary = {
  total: number;
  excluded: number;
  byStatus: Record<RoundStatus, number>;
  byCategory: Record<RoundCategory, { total: number; byStatus: Record<RoundStatus, number> }>;
  funnel: Record<FunnelStage, number>;
  /** Risposte / contattati, null se nessun contattato. */
  responseRate: number | null;
  committedCents: number;
};

const zeroStatuses = () =>
  Object.fromEntries(ROUND_STATUSES.map((s) => [s, 0])) as Record<RoundStatus, number>;

/** Conteggi della dashboard. Gli esclusi stanno fuori da tutto tranne il loro contatore. */
export function summarize(investors: FunnelInvestor[]): RoundSummary {
  const byStatus = zeroStatuses();
  const byCategory = Object.fromEntries(
    ROUND_CATEGORIES.map((c) => [c, { total: 0, byStatus: zeroStatuses() }]),
  ) as RoundSummary["byCategory"];
  const funnel = Object.fromEntries(FUNNEL_STAGES.map((s) => [s, 0])) as Record<FunnelStage, number>;
  let excluded = 0;
  let committedCents = 0;
  let total = 0;

  for (const inv of investors) {
    if (inv.excluded) {
      excluded += 1;
      continue;
    }
    total += 1;
    byStatus[inv.status] += 1;
    byCategory[inv.category].total += 1;
    byCategory[inv.category].byStatus[inv.status] += 1;
    for (const stage of FUNNEL_STAGES) if (inv[MILESTONE_FIELD[stage]]) funnel[stage] += 1;
    if (inv.status === "impegno" && inv.commitmentCents) committedCents += inv.commitmentCents;
  }

  return {
    total,
    excluded,
    byStatus,
    byCategory,
    funnel,
    responseRate: funnel.contacted ? funnel.responded / funnel.contacted : null,
    committedCents,
  };
}

export const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);
