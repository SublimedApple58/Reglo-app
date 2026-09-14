/**
 * Analisi della saturazione agenda, scuola per scuola e mese per mese.
 * SOLA LETTURA. Rifà il calcolo del KPI fuori dall'app per poterlo scomporre:
 * stesse regole (fasce settimanali + eccezioni giornaliere, meno blocchi e
 * festivi, solo ore passate, guide non annullate con istruttore).
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const GIORNI = Number(process.env.GIORNI ?? 90);
const MIN = 60_000;
const merge = (iv) => {
  const v = iv.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out = [];
  for (const c of v) {
    const l = out[out.length - 1];
    if (l && c.start <= l.end) l.end = Math.max(l.end, c.end);
    else out.push({ ...c });
  }
  return out;
};
const subtract = (base, holes) => {
  const out = [];
  for (const p of merge(base)) {
    let cur = p.start;
    for (const h of merge(holes)) {
      if (h.end <= cur || h.start >= p.end) continue;
      if (h.start > cur) out.push({ start: cur, end: Math.min(h.start, p.end) });
      cur = Math.max(cur, h.end);
      if (cur >= p.end) break;
    }
    if (cur < p.end) out.push({ start: cur, end: p.end });
  }
  return out.filter((i) => i.end > i.start);
};
const intersect = (a, b) => {
  const L = merge(a), R = merge(b), out = [];
  let i = 0, j = 0;
  while (i < L.length && j < R.length) {
    const s = Math.max(L[i].start, R[j].start), e = Math.min(L[i].end, R[j].end);
    if (e > s) out.push({ start: s, end: e });
    L[i].end < R[j].end ? i++ : j++;
  }
  return out;
};
const ore = (iv) => merge(iv).reduce((n, i) => n + (i.end - i.start) / MIN, 0) / 60;
const clamp = (iv, w) => iv.map((i) => ({ start: Math.max(i.start, w.start), end: Math.min(i.end, w.end) })).filter((i) => i.end > i.start);
const romeInstant = (y, m, d, minutes) => {
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0) + minutes * MIN;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(naive));
  const g = (t) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return naive - (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute")) - naive);
};
const ymdRome = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const parseRanges = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r.startMinutes === "number" && typeof r.endMinutes === "number");
};

const now = new Date();
const from = new Date(now.getTime() - GIORNI * 86_400_000);
from.setHours(0, 0, 0, 0);

const services = await prisma.companyService.findMany({ where: { serviceKey: "AUTOSCUOLE" }, select: { companyId: true, limits: true, status: true } });
const escluse = new Set(services.filter((s) => { const l = s.limits ?? {}; return l.excludeFromKpis === true || l.seedDemo === true; }).map((s) => s.companyId));
const companies = await prisma.company.findMany({ select: { id: true, name: true } });
const nome = new Map(companies.map((c) => [c.id, c.name]));

const istruttori = await prisma.autoscuolaInstructor.findMany({
  where: { status: { not: "inactive" }, userId: { not: null }, user: { companyMembers: { some: { autoscuolaRole: { in: ["INSTRUCTOR", "INSTRUCTOR_OWNER"] } } } } },
  select: { id: true, companyId: true, name: true, status: true },
});
const attivi = istruttori.filter((i) => !escluse.has(i.companyId));
const ids = attivi.map((i) => i.id);

const [weekly, overrides, blocchi, festivi, guide] = await Promise.all([
  prisma.autoscuolaWeeklyAvailability.findMany({ where: { ownerType: "instructor", ownerId: { in: ids } } }),
  prisma.autoscuolaDailyAvailabilityOverride.findMany({ where: { ownerType: "instructor", ownerId: { in: ids }, date: { gte: from } } }),
  prisma.autoscuolaInstructorBlock.findMany({ where: { instructorId: { in: ids }, startsAt: { lt: now }, endsAt: { gt: from } }, select: { instructorId: true, startsAt: true, endsAt: true, reason: true } }),
  prisma.autoscuolaHoliday.findMany({ where: { date: { gte: from } }, select: { companyId: true, date: true } }),
  prisma.autoscuolaAppointment.findMany({ where: { startsAt: { gte: from, lt: now }, instructorId: { in: ids }, status: { not: "cancelled" } }, select: { companyId: true, instructorId: true, startsAt: true, endsAt: true, type: true } }),
]);

const weeklyBy = new Map(weekly.map((w) => [w.ownerId, w]));
const overBy = new Map();
for (const o of overrides) overBy.set(`${o.ownerId}:${o.date.toISOString().slice(0, 10)}`, parseRanges(o.ranges));
const blocchiBy = new Map();
for (const b of blocchi) { const l = blocchiBy.get(b.instructorId) ?? []; l.push({ start: b.startsAt.getTime(), end: b.endsAt.getTime() }); blocchiBy.set(b.instructorId, l); }
const festiviBy = new Map();
for (const f of festivi) { const s = festiviBy.get(f.companyId) ?? new Set(); s.add(f.date.toISOString().slice(0, 10)); festiviBy.set(f.companyId, s); }
const guideBy = new Map();
for (const g of guide) { const l = guideBy.get(g.instructorId) ?? []; const st = g.startsAt.getTime(); l.push({ start: st, end: g.endsAt ? g.endsAt.getTime() : st + 60 * MIN, type: g.type }); guideBy.set(g.instructorId, l); }

const giorni = [];
for (let t = from.getTime(); t < now.getTime(); t += 86_400_000) giorni.push(new Date(t + 43_200_000));
const finestra = { start: from.getTime(), end: now.getTime() };

const fasceDelGiorno = (w, dow, ymd, ownerId) => {
  const ov = overBy.get(`${ownerId}:${ymd}`);
  if (ov !== undefined) return ov;
  if (!w) return [];
  if (w.rangesByDay && typeof w.rangesByDay === "object") {
    const r = parseRanges(w.rangesByDay[String(dow)]);
    return r;
  }
  if (!Array.isArray(w.daysOfWeek) || !w.daysOfWeek.includes(dow)) return [];
  const r = parseRanges(w.ranges);
  if (r.length) return r;
  return [{ startMinutes: w.startMinutes, endMinutes: w.endMinutes }];
};

// Per il conto mensile si guardano solo le scuole che nel periodo hanno
// lavorato: le ferme diluiscono tutto (è la regola già usata dal KPI).
const conGuide = new Set();
{
  const g = await prisma.autoscuolaAppointment.groupBy({ by: ["companyId"], where: { startsAt: { gte: from, lt: now }, instructorId: { not: null }, status: { not: "cancelled" } }, _count: { _all: true } });
  for (const r of g) if (!escluse.has(r.companyId)) conGuide.add(r.companyId);
}
const MESI_INCLUDI = conGuide;
const perScuola = new Map();
const perMese = new Map();
const perIstruttore = [];

for (const istr of attivi) {
  const w = weeklyBy.get(istr.id);
  const chiusure = festiviBy.get(istr.companyId) ?? new Set();
  const slots = [];
  const slotsPerMese = new Map();
  for (const g of giorni) {
    const ymd = ymdRome(g);
    if (chiusure.has(ymd)) continue;
    const [Y, M, D] = ymd.split("-").map(Number);
    const dow = new Date(romeInstant(Y, M, D, 720)).getUTCDay();
    for (const r of fasceDelGiorno(w, dow, ymd, istr.id)) {
      const iv = { start: romeInstant(Y, M, D, r.startMinutes), end: romeInstant(Y, M, D, r.endMinutes) };
      slots.push(iv);
      const k = ymd.slice(0, 7);
      slotsPerMese.set(k, [...(slotsPerMese.get(k) ?? []), iv]);
    }
  }
  const libere = subtract(clamp(slots, finestra), clamp(blocchiBy.get(istr.id) ?? [], finestra));
  const gl = clamp(guideBy.get(istr.id) ?? [], finestra);
  const dentro = intersect(merge(gl), libere);
  const disp = ore(libere), occ = ore(dentro), fuori = ore(merge(gl)) - occ;

  const s = perScuola.get(istr.companyId) ?? { disp: 0, occ: 0, fuori: 0, istr: 0, istrSenzaGuide: 0, blocchi: 0 };
  s.disp += disp; s.occ += occ; s.fuori += fuori; s.istr += 1;
  if (ore(merge(gl)) < 1) s.istrSenzaGuide += 1;
  s.blocchi += ore(clamp(blocchiBy.get(istr.id) ?? [], finestra));
  perScuola.set(istr.companyId, s);
  perIstruttore.push({ companyId: istr.companyId, scuola: nome.get(istr.companyId), istr: istr.name, disp, occ, guideOre: ore(merge(gl)), pct: disp > 0 ? occ / disp : 0 });

  if (!MESI_INCLUDI.has(istr.companyId)) continue;
  for (const [mese, iv] of slotsPerMese) {
    const m = perMese.get(mese) ?? { disp: 0, occ: 0 };
    const lib = subtract(clamp(iv, finestra), clamp(blocchiBy.get(istr.id) ?? [], finestra));
    m.disp += ore(lib);
    m.occ += ore(intersect(merge(gl), lib));
    perMese.set(mese, m);
  }
}

const attive = [...perScuola.entries()].filter(([, s]) => s.occ > 0);
console.log(`\n═══ SATURAZIONE PER SCUOLA — ultimi ${GIORNI} giorni ═══`);
console.log("scuola".padEnd(34), "disp".padStart(7), "occ".padStart(7), "sat".padStart(6), "istr".padStart(5), "senza guide".padStart(12), "blocchi h".padStart(10), "fuori fascia".padStart(13));
for (const [id, s] of attive.sort((a, b) => b[1].occ / b[1].disp - a[1].occ / a[1].disp)) {
  console.log(
    (nome.get(id) ?? id).slice(0, 33).padEnd(34),
    Math.round(s.disp).toString().padStart(7),
    Math.round(s.occ).toString().padStart(7),
    ((s.occ / s.disp) * 100).toFixed(0).padStart(5) + "%",
    String(s.istr).padStart(5),
    String(s.istrSenzaGuide).padStart(12),
    Math.round(s.blocchi).toString().padStart(10),
    Math.round(s.fuori).toString().padStart(13),
  );
}
const tot = attive.reduce((a, [, s]) => ({ disp: a.disp + s.disp, occ: a.occ + s.occ }), { disp: 0, occ: 0 });
console.log("TOTALE".padEnd(34), Math.round(tot.disp).toString().padStart(7), Math.round(tot.occ).toString().padStart(7), ((tot.occ / tot.disp) * 100).toFixed(1).padStart(5) + "%");

console.log(`\n═══ PER MESE (solo scuole attive) ═══`);
for (const [mese, m] of [...perMese.entries()].sort()) {
  console.log(mese, Math.round(m.disp).toString().padStart(7), "disp", Math.round(m.occ).toString().padStart(6), "occ", ((m.occ / (m.disp || 1)) * 100).toFixed(0).padStart(4) + "%");
}

console.log(`\n═══ FESTIVI / CHIUSURE REGISTRATE nel periodo ═══`);
const perC = new Map();
for (const f of festivi) { if (escluse.has(f.companyId)) continue; perC.set(f.companyId, (perC.get(f.companyId) ?? 0) + 1); }
for (const [id] of attive) console.log((nome.get(id) ?? id).slice(0, 33).padEnd(34), String(perC.get(id) ?? 0).padStart(3), "giorni");

console.log(`\n═══ ISTRUTTORI CHE DICHIARANO MA NON GUIDANO (>20h disp, <1h guide) ═══`);
const fantasmi = perIstruttore.filter((i) => i.disp > 20 && i.occ < 1);
for (const f of fantasmi) console.log(f.scuola.slice(0, 26).padEnd(27), f.istr.slice(0, 24).padEnd(25), Math.round(f.disp).toString().padStart(6), "h dichiarate, 0 guide");
console.log("ore buttate da questi:", Math.round(fantasmi.reduce((n, f) => n + f.disp, 0)), "su", Math.round(tot.disp), `(${((fantasmi.reduce((n, f) => n + f.disp, 0) / tot.disp) * 100).toFixed(1)}%)`);

// ── Simulazioni ────────────────────────────────────────────────────────────
const dentro = perIstruttore.filter((i) => conGuide.has(i.companyId));
const somma = (arr) => arr.reduce((a, i) => ({ disp: a.disp + i.disp, occ: a.occ + i.occ }), { disp: 0, occ: 0 });
const pct = (t) => ((t.occ / (t.disp || 1)) * 100).toFixed(1) + "%";
const base = somma(dentro);
const senzaFantasmi = somma(dentro.filter((i) => i.guideOre >= 1));
const easy = dentro.filter((i) => i.scuola === "Easy Driver di Jerry");
const senzaEntrambi = somma(dentro.filter((i) => i.guideOre >= 1 && i.scuola !== "Easy Driver di Jerry"));
console.log(`\n═══ SIMULAZIONI ═══`);
console.log("così com'è oggi                                  ", pct(base), `(${Math.round(base.occ)}/${Math.round(base.disp)})`);
console.log("escludendo gli istruttori con 0 guide nel periodo ", pct(senzaFantasmi), `(${Math.round(senzaFantasmi.occ)}/${Math.round(senzaFantasmi.disp)})`);
console.log("...e anche Easy Driver (agenda di fatto non usata)", pct(senzaEntrambi), `(${Math.round(senzaEntrambi.occ)}/${Math.round(senzaEntrambi.disp)})`);
console.log("istruttori esclusi dal filtro:", dentro.filter((i) => i.guideOre < 1).length, "su", dentro.length);

const senzaIstruttore = await prisma.autoscuolaAppointment.count({ where: { startsAt: { gte: from, lt: now }, instructorId: null, status: { not: "cancelled" } } });
console.log(`\nGuide senza istruttore assegnato (non contate come occupate): ${senzaIstruttore}`);
console.log("Eccezioni giornaliere usate nel periodo:", overrides.length);
await prisma.$disconnect();
