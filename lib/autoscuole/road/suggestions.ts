import { normalizeSentiment } from "@/lib/autoscuole/road/catalog";

/**
 * REG-638 Road «mappa corta» — logica pura della tab Road: allievi suggeriti
 * (con il motivo) e briefing per voce delle ultime guide Road di un allievo.
 * Nessun accesso al DB: il service carica le righe e chiama queste funzioni.
 */

/** Quanti volti propone la tab. */
export const SUGGESTION_COUNT = 3;
/** «Esame vicino»: esame in agenda entro questi giorni. */
export const EXAM_NEAR_DAYS = 30;
/** «Fermo»: nessuna guida svolta da almeno questi giorni. */
export const IDLE_DAYS = 7;
/** Il briefing guarda le ultime N guide Road dell'allievo. */
export const BRIEFING_SESSIONS = 5;
/** Voci massime del briefing. */
export const BRIEFING_LINES = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = "Europe/Rome";

export type SuggestionKind = "agenda" | "exam" | "idle" | "frequent";

export type SuggestionCandidate = {
  id: string;
  name: string;
  licenseCategory: string | null;
  /** Guide con me negli ultimi 60 giorni (frequenza). */
  withMe: number;
  /** Guide svolte (con chiunque), per «14ª guida» e le ore. */
  doneCount: number;
  doneMinutes: number;
  lastDoneAt: Date | null;
  nextExamAt: Date | null;
  /** Guida in agenda che sta per iniziare con me. */
  agendaAt: Date | null;
};

export type Suggestion = {
  id: string;
  name: string;
  kind: SuggestionKind;
  /** Riga secondaria del volto/riga: il motivo. */
  reason: string;
  /** Riga sotto il nome nel foglio «Parti con»: «Patente B · 14ª guida · 11 h fatte». */
  detail: string;
};

const dayKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const hm = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** «oggi», «ieri», «giovedì» (entro la settimana), altrimenti «12 ottobre». */
export function relativeDay(d: Date, now = new Date()) {
  const days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(d))) / DAY_MS);
  if (days <= 0) return "oggi";
  if (days === 1) return "ieri";
  if (days < 7) return d.toLocaleDateString("it-IT", { weekday: "long", timeZone: TZ });
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: TZ });
}

function hoursLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}

export function suggestionDetail(c: SuggestionCandidate) {
  const parts = [
    c.licenseCategory ? `Patente ${c.licenseCategory}` : null,
    `${c.doneCount + 1}ª guida`,
    c.doneMinutes > 0 ? `${hoursLabel(c.doneMinutes)} fatte` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

const idleDays = (c: SuggestionCandidate, now: Date) =>
  c.lastDoneAt ? Math.floor((now.getTime() - c.lastDoneAt.getTime()) / DAY_MS) : null;

/**
 * Ordine deciso da Tiziano (27/10): prima la guida in agenda, poi l'esame
 * vicino, poi chi è fermo da più tempo, poi chi guidi più spesso.
 */
export function rankSuggestions(candidates: SuggestionCandidate[], now = new Date(), limit = SUGGESTION_COUNT): Suggestion[] {
  const examUntil = now.getTime() + EXAM_NEAR_DAYS * DAY_MS;
  const kindOf = (c: SuggestionCandidate): SuggestionKind => {
    if (c.agendaAt) return "agenda";
    if (c.nextExamAt && c.nextExamAt.getTime() >= now.getTime() && c.nextExamAt.getTime() <= examUntil) return "exam";
    const idle = idleDays(c, now);
    if (idle != null && idle >= IDLE_DAYS) return "idle";
    return "frequent";
  };
  const order: Record<SuggestionKind, number> = { agenda: 0, exam: 1, idle: 2, frequent: 3 };
  const ranked = candidates
    .map((c) => ({ c, kind: kindOf(c) }))
    .sort((a, b) => {
      if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
      if (a.kind === "agenda") return a.c.agendaAt!.getTime() - b.c.agendaAt!.getTime();
      if (a.kind === "exam") return a.c.nextExamAt!.getTime() - b.c.nextExamAt!.getTime();
      if (a.kind === "idle") return (idleDays(b.c, now) ?? 0) - (idleDays(a.c, now) ?? 0);
      return b.c.withMe - a.c.withMe || a.c.name.localeCompare(b.c.name, "it");
    });

  return ranked.slice(0, limit).map(({ c, kind }) => {
    let reason: string;
    if (kind === "agenda") reason = `In agenda alle ${hm(c.agendaAt!)}`;
    else if (kind === "exam") {
      reason = `Esame il ${c.nextExamAt!.toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: TZ })}`;
    } else if (kind === "idle") reason = `Nessuna guida da ${idleDays(c, now)} giorni`;
    else {
      reason = [`${c.doneCount + 1}ª guida`, c.lastDoneAt ? `ultima ${relativeDay(c.lastDoneAt, now)}` : null]
        .filter(Boolean)
        .join(" · ");
    }
    return { id: c.id, name: c.name, kind, reason, detail: suggestionDetail(c) };
  });
}

// ─── briefing ────────────────────────────────────────────────────────────────

export type BriefingMarker = {
  sessionId: string;
  kind: string;
  label: string;
  street: string | null;
  note: string | null;
  sentiment: string | null;
  recordedAt: Date;
};

export type BriefingLine = {
  kind: string;
  label: string;
  tone: "good" | "bad" | "neutral";
  /** Dopo il nome della voce: «da migliorare 4 volte nelle ultime 5», «corso Vittorio». */
  detail: string | null;
};

export type Briefing = {
  /** «L'ultima volta» oppure «Nelle ultime 5 guide». */
  title: string;
  sessions: number;
  lastAt: string;
  lines: BriefingLine[];
};

/**
 * Riassunto per voce delle ultime guide Road (sessioni dalla più recente).
 * Una voce che torna in più guide si riassume («da migliorare 4 volte nelle
 * ultime 5», «fatta bene 3 volte di fila»); se no si racconta l'ultima volta
 * (via o nota). Prima le cose da migliorare, poi le altre.
 */
export function buildBriefing(
  sessions: Array<{ id: string; startedAt: Date }>,
  markers: BriefingMarker[],
): Briefing | null {
  const recent = sessions.slice(0, BRIEFING_SESSIONS);
  if (!recent.length) return null;
  const rank = new Map(recent.map((s, i) => [s.id, i]));
  const mine = markers.filter((m) => rank.has(m.sessionId));
  if (!mine.length) return null;

  type Group = { kind: string; label: string; bad: Set<number>; good: Set<number>; latest: BriefingMarker; latestRank: number };
  const groups = new Map<string, Group>();
  for (const m of mine) {
    const key = `${m.kind}|${m.label.toLowerCase()}`;
    const r = rank.get(m.sessionId)!;
    const g = groups.get(key) ?? { kind: m.kind, label: m.label, bad: new Set(), good: new Set(), latest: m, latestRank: r };
    const sg = normalizeSentiment(m.sentiment);
    if (sg === "bad") g.bad.add(r);
    if (sg === "good") g.good.add(r);
    if (r < g.latestRank || (r === g.latestRank && m.recordedAt > g.latest.recordedAt)) {
      g.latest = m;
      g.latestRank = r;
    }
    groups.set(key, g);
  }

  const n = recent.length;
  const lines = [...groups.values()].map((g) => {
    const latestTone = normalizeSentiment(g.latest.sentiment);
    const tone: BriefingLine["tone"] = g.bad.size >= g.good.size && g.bad.size > 0 ? "bad" : g.good.size > 0 ? "good" : latestTone === "bad" ? "bad" : "neutral";
    let detail: string | null;
    const goodStreak = (() => {
      let k = 0;
      while (k < n && g.good.has(k) && !g.bad.has(k)) k += 1;
      return k;
    })();
    if (tone === "bad" && g.bad.size >= 2) detail = `da migliorare ${g.bad.size} volte nelle ultime ${n}`;
    else if (tone === "good" && goodStreak >= 2) detail = `fatta bene ${goodStreak} volte di fila`;
    else detail = g.latest.note?.trim() ? `«${g.latest.note.trim()}»` : g.latest.street ?? null;
    return { line: { kind: g.kind, label: g.label, tone, detail }, weight: g.bad.size * 10 + g.good.size, rank: g.latestRank };
  });
  lines.sort((a, b) => {
    const t = (x: BriefingLine["tone"]) => (x === "bad" ? 0 : x === "good" ? 1 : 2);
    return t(a.line.tone) - t(b.line.tone) || b.weight - a.weight || a.rank - b.rank;
  });

  const span = Math.max(...mine.map((m) => rank.get(m.sessionId)!)) + 1;
  return {
    title: span <= 1 ? "L'ultima volta" : `Nelle ultime ${span} guide`,
    sessions: span,
    lastAt: recent[0].startedAt.toISOString(),
    lines: lines.slice(0, BRIEFING_LINES).map((l) => l.line),
  };
}
