"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Stethoscope,
  Link2,
  MessageCircleQuestion,
  Inbox,
  Plus,
  Trash2,
  Check,
  X,
  ExternalLink,
  MailWarning,
} from "lucide-react";

import {
  getRenewalSettings,
  setRenewalPublicSlug,
  updateRenewalSettings,
  requestDocumentIntegration,
  listRenewalMedici,
  createRenewalMedico,
  updateRenewalMedico,
  deleteRenewalMedico,
  setMedicoAvailability,
  listRenewalFaqs,
  createRenewalFaq,
  updateRenewalFaq,
  deleteRenewalFaq,
  listRenewalRequests,
  getRenewalRequest,
  updateRenewalRequestStatus,
  updateRenewalDocumentStatus,
} from "@/lib/actions/renewal.actions";
import {
  RENEWAL_REQUEST_STATUS_LABELS,
  RENEWAL_DOCUMENT_LABELS,
  type RenewalDocumentType,
  type RenewalRequestStatus,
} from "@/lib/renewal/constants";

// ── Local view types (Prisma types are erased on the client) ──────────────────

type Availability = { daysOfWeek: number[]; startMinutes: number; endMinutes: number };
type Medico = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  visitDurationMinutes: number;
  status: string;
  availabilities: Availability[];
};
type Faq = { id: string; question: string; answer: string; sortOrder: number; active: boolean };
type RequestRow = {
  id: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  createdAt: string;
  booking: { startAt: string; medico: { name: string } | null } | null;
  _count: { documents: number };
};

const DAYS: { idx: number; label: string }[] = [
  { idx: 1, label: "Lun" },
  { idx: 2, label: "Mar" },
  { idx: 3, label: "Mer" },
  { idx: 4, label: "Gio" },
  { idx: 5, label: "Ven" },
  { idx: 6, label: "Sab" },
  { idx: 0, label: "Dom" },
];

const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hhmmToMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type Tab = "settings" | "medici" | "faq" | "requests";

export function AutoscuoleRenewalPage() {
  const [tab, setTab] = useState<Tab>("settings");
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">Rinnovo patenti</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Modulo pubblico per il rinnovo patente: link cittadino, medici, disponibilità, FAQ del
        chatbot e revisione delle richieste.
      </p>

      <div className="mb-5 flex flex-wrap gap-1 rounded-full bg-pink-50/80 p-1.5">
        {(
          [
            { id: "settings", label: "Link pubblico", icon: Link2 },
            { id: "medici", label: "Medici", icon: Stethoscope },
            { id: "faq", label: "FAQ", icon: MessageCircleQuestion },
            { id: "requests", label: "Richieste", icon: Inbox },
          ] as { id: Tab; label: string; icon: typeof Link2 }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition " +
              (tab === t.id ? "bg-white text-pink-700 shadow-sm" : "text-pink-800/50 hover:text-pink-800")
            }
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-pink-200 bg-pink-50 px-4 py-2 text-sm text-pink-800">
          {notice}
        </div>
      )}

      {tab === "settings" && <SettingsTab onNotice={setNotice} />}
      {tab === "medici" && <MediciTab onNotice={setNotice} />}
      {tab === "faq" && <FaqTab onNotice={setNotice} />}
      {tab === "requests" && <RequestsTab onNotice={setNotice} />}
    </div>
  );
}

// ── Settings (public slug) ────────────────────────────────────────────────────

function SettingsTab({ onNotice }: { onNotice: (m: string) => void }) {
  const [slug, setSlug] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publicActive, setPublicActive] = useState(true);
  const [anamnesticRequired, setAnamnesticRequired] = useState(false);

  useEffect(() => {
    getRenewalSettings().then((res) => {
      if (res.success && res.data) {
        setSlug(res.data.publicSlug ?? "");
        setSaved(res.data.publicSlug ?? null);
        setPublicActive(res.data.publicActive);
        setAnamnesticRequired(res.data.anamnesticRequired);
      }
      setLoading(false);
    });
  }, []);

  const saveSetting = async (patch: {
    publicActive?: boolean;
    anamnesticRequired?: boolean;
  }) => {
    const res = await updateRenewalSettings(patch);
    if (res.success) onNotice("Impostazione aggiornata.");
    else onNotice(res.message ?? "Errore.");
  };

  const save = async () => {
    const res = await setRenewalPublicSlug({ slug });
    if (res.success && res.data) {
      setSaved(res.data.publicSlug);
      onNotice("Link pubblico aggiornato.");
    } else {
      onNotice(res.message ?? "Errore.");
    }
  };

  const publicUrl =
    saved && typeof window !== "undefined" ? `${window.location.origin}/rinnovo/${saved}` : null;

  if (loading) return <p className="text-sm text-neutral-400">Caricamento…</p>;

  return (
    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-800">
          Indirizzo pubblico
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-400">/rinnovo/</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="nome-autoscuola"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-pink-400"
          />
          <button
            onClick={save}
            className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600"
          >
            Salva
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Solo lettere minuscole, numeri e trattini. È il link che condividi con i cittadini.
        </p>
      </div>

      {publicUrl && (
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-200"
        >
          <ExternalLink className="h-4 w-4" />
          {publicUrl}
        </a>
      )}

      <div className="space-y-2 border-t border-neutral-200 pt-4">
        <ToggleRow
          title="Servizio attivo"
          description="Se lo spegni il link pubblico non è più raggiungibile (es. medico in ferie). Il modulo resta configurato."
          checked={publicActive}
          onChange={(v) => {
            setPublicActive(v);
            void saveSetting({ publicActive: v });
          }}
        />
        <ToggleRow
          title="Certificato anamnestico obbligatorio"
          description="Attivalo se il tuo medico richiede a tutti il certificato anamnestico del medico curante. Se spento resta un caricamento facoltativo."
          checked={anamnesticRequired}
          onChange={(v) => {
            setAnamnesticRequired(v);
            void saveSetting({ anamnesticRequired: v });
          }}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 hover:bg-neutral-50">
      <div>
        <p className="text-sm font-medium text-neutral-800">{title}</p>
        <p className="text-xs text-neutral-500">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-pink-500"
      />
    </label>
  );
}

// ── Medici + availability ─────────────────────────────────────────────────────

function MediciTab({ onNotice }: { onNotice: (m: string) => void }) {
  const [medici, setMedici] = useState<Medico[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await listRenewalMedici();
    if (res.success && res.data) setMedici(res.data as unknown as Medico[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-neutral-400">Caricamento…</p>;

  return (
    <div className="space-y-4">
      {medici.map((m) => (
        <MedicoCard key={m.id} medico={m} onChanged={load} onNotice={onNotice} />
      ))}

      {adding ? (
        <MedicoForm
          onCancel={() => setAdding(false)}
          onSubmit={async (data) => {
            const res = await createRenewalMedico(data);
            if (res.success) {
              setAdding(false);
              onNotice("Medico aggiunto.");
              void load();
            } else onNotice(res.message ?? "Errore.");
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          <Plus className="h-4 w-4" /> Aggiungi medico
        </button>
      )}
    </div>
  );
}

function MedicoForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Medico>;
  onSubmit: (data: {
    name: string;
    phone: string | null;
    email: string | null;
    visitDurationMinutes: number;
    status: "active" | "inactive";
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [duration, setDuration] = useState(initial?.visitDurationMinutes ?? 20);
  const [status, setStatus] = useState<"active" | "inactive">(
    (initial?.status as "active" | "inactive") ?? "active",
  );

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome medico"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-pink-400"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefono (facoltativo)"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-pink-400"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (facoltativa)"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-pink-400"
        />
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={5}
            max={120}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-pink-400"
          />
          <span className="text-sm text-neutral-500">min / visita</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
            className="ml-auto rounded-lg border border-neutral-300 px-2 py-2 text-sm"
          >
            <option value="active">Attivo</option>
            <option value="inactive">Non attivo</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            onSubmit({
              name,
              phone: phone || null,
              email: email || null,
              visitDurationMinutes: duration,
              status,
            })
          }
          className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600"
        >
          Salva
        </button>
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-neutral-500">
          Annulla
        </button>
      </div>
    </div>
  );
}

function MedicoCard({
  medico,
  onChanged,
  onNotice,
}: {
  medico: Medico;
  onChanged: () => void;
  onNotice: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [windows, setWindows] = useState<Availability[]>(medico.availabilities);

  const addWindow = () =>
    setWindows((w) => [...w, { daysOfWeek: [1], startMinutes: 9 * 60, endMinutes: 12 * 60 }]);
  const saveAvailability = async () => {
    const res = await setMedicoAvailability({ medicoId: medico.id, windows });
    if (res.success) onNotice("Disponibilità salvata.");
    else onNotice(res.message ?? "Errore.");
  };

  if (editing) {
    return (
      <MedicoForm
        initial={medico}
        onCancel={() => setEditing(false)}
        onSubmit={async (data) => {
          const res = await updateRenewalMedico({ id: medico.id, ...data });
          if (res.success) {
            setEditing(false);
            onNotice("Medico aggiornato.");
            onChanged();
          } else onNotice(res.message ?? "Errore.");
        }}
      />
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-neutral-900">
            {medico.name}{" "}
            {medico.status !== "active" && (
              <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                non attivo
              </span>
            )}
          </p>
          <p className="text-xs text-neutral-500">
            {medico.visitDurationMinutes} min/visita
            {medico.phone ? ` · ${medico.phone}` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
          >
            Modifica
          </button>
          <button
            onClick={async () => {
              const res = await deleteRenewalMedico({ id: medico.id });
              if (res.success) {
                onNotice("Medico eliminato.");
                onChanged();
              } else onNotice(res.message ?? "Errore.");
            }}
            className="rounded-lg p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-neutral-50 p-3">
        <p className="mb-2 text-xs font-medium text-neutral-600">Quando viene il medico</p>
        <div className="space-y-2">
          {windows.map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1">
                {DAYS.map((d) => (
                  <button
                    key={d.idx}
                    onClick={() =>
                      setWindows((prev) =>
                        prev.map((x, xi) =>
                          xi === i
                            ? {
                                ...x,
                                daysOfWeek: x.daysOfWeek.includes(d.idx)
                                  ? x.daysOfWeek.filter((v) => v !== d.idx)
                                  : [...x.daysOfWeek, d.idx],
                              }
                            : x,
                        ),
                      )
                    }
                    className={
                      "h-7 w-8 rounded text-xs font-medium " +
                      (w.daysOfWeek.includes(d.idx)
                        ? "bg-pink-500 text-white"
                        : "bg-white text-neutral-500 ring-1 ring-neutral-200")
                    }
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <input
                type="time"
                value={minToHHMM(w.startMinutes)}
                onChange={(e) =>
                  setWindows((prev) =>
                    prev.map((x, xi) =>
                      xi === i ? { ...x, startMinutes: hhmmToMin(e.target.value) } : x,
                    ),
                  )
                }
                className="rounded border border-neutral-300 px-2 py-1 text-xs"
              />
              <span className="text-xs text-neutral-400">→</span>
              <input
                type="time"
                value={minToHHMM(w.endMinutes)}
                onChange={(e) =>
                  setWindows((prev) =>
                    prev.map((x, xi) =>
                      xi === i ? { ...x, endMinutes: hhmmToMin(e.target.value) } : x,
                    ),
                  )
                }
                className="rounded border border-neutral-300 px-2 py-1 text-xs"
              />
              <button
                onClick={() => setWindows((prev) => prev.filter((_, xi) => xi !== i))}
                className="rounded p-1 text-neutral-400 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={addWindow}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5" /> Fascia
          </button>
          <button
            onClick={saveAvailability}
            className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Salva disponibilità
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

function FaqTab({ onNotice }: { onNotice: (m: string) => void }) {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");

  const load = useCallback(async () => {
    const res = await listRenewalFaqs();
    if (res.success && res.data) setFaqs(res.data as unknown as Faq[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-neutral-400">Caricamento…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Il chatbot risponde ai cittadini <strong>solo</strong> in base a queste FAQ. Aggiungi costi,
        tempi e requisiti che vuoi far comunicare.
      </p>

      {faqs.map((f) => (
        <div key={f.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-neutral-900">{f.question}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{f.answer}</p>
            </div>
            <button
              onClick={async () => {
                const res = await deleteRenewalFaq({ id: f.id });
                if (res.success) {
                  onNotice("FAQ eliminata.");
                  void load();
                } else onNotice(res.message ?? "Errore.");
              }}
              className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      <div className="space-y-2 rounded-2xl border border-dashed border-neutral-300 bg-white p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Domanda (es. Quanto costa il rinnovo?)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-pink-400"
        />
        <textarea
          value={a}
          onChange={(e) => setA(e.target.value)}
          placeholder="Risposta"
          rows={3}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-pink-400"
        />
        <button
          onClick={async () => {
            if (!q.trim() || !a.trim()) return;
            const res = await createRenewalFaq({
              question: q,
              answer: a,
              sortOrder: faqs.length,
              active: true,
            });
            if (res.success) {
              setQ("");
              setA("");
              onNotice("FAQ aggiunta.");
              void load();
            } else onNotice(res.message ?? "Errore.");
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600"
        >
          <Plus className="h-4 w-4" /> Aggiungi FAQ
        </button>
      </div>
    </div>
  );
}

// ── Requests ──────────────────────────────────────────────────────────────────

function RequestsTab({ onNotice }: { onNotice: (m: string) => void }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listRenewalRequests();
    if (res.success && res.data) setRows(res.data as unknown as RequestRow[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-neutral-400">Caricamento…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-neutral-400">Nessuna richiesta ancora.</p>;

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id}>
          <button
            onClick={() => setOpenId(openId === r.id ? null : r.id)}
            className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left hover:bg-neutral-50"
          >
            <div>
              <p className="text-sm font-medium text-neutral-900">
                {[r.firstName, r.lastName].filter(Boolean).join(" ") || "Cittadino"}
              </p>
              <p className="text-xs text-neutral-500">
                {fmtDate(r.createdAt)} · {r._count.documents} documenti
                {r.booking ? ` · visita ${fmtDate(r.booking.startAt)}` : ""}
              </p>
            </div>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
              {RENEWAL_REQUEST_STATUS_LABELS[r.status as RenewalRequestStatus] ?? r.status}
            </span>
          </button>
          {openId === r.id && (
            <RequestDetail
              id={r.id}
              onNotice={onNotice}
              onChanged={load}
            />
          )}
        </div>
      ))}
    </div>
  );
}

type Detail = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  codiceFiscale: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  birthDate: string | null;
  status: string;
  reviewNotes: string | null;
  booking: { startAt: string; medico: { name: string } | null } | null;
  documents: { id: string; type: string; status: string; url: string }[];
  messages: { role: string; content: string; createdAt: string }[];
};

function RequestDetail({
  id,
  onNotice,
  onChanged,
}: {
  id: string;
  onNotice: (m: string) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    const res = await getRenewalRequest({ id });
    if (res.success && res.data) {
      setDetail(res.data as unknown as Detail);
      setNotes((res.data as unknown as Detail).reviewNotes ?? "");
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!detail) return <div className="px-4 py-2 text-xs text-neutral-400">Caricamento…</div>;

  const setStatus = async (status: RenewalRequestStatus) => {
    const res = await updateRenewalRequestStatus({ id, status, reviewNotes: notes });
    if (res.success) {
      onNotice("Richiesta aggiornata.");
      onChanged();
      void load();
    } else onNotice(res.message ?? "Errore.");
  };

  return (
    <div className="mt-1 space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      {/* Structured data */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Field label="Email" value={detail.email} />
        <Field label="Telefono" value={detail.phone} />
        <Field label="Codice fiscale" value={detail.codiceFiscale} />
        <Field label="N. patente" value={detail.licenseNumber} />
        <Field
          label="Scad. patente"
          value={detail.licenseExpiresAt ? fmtDate(detail.licenseExpiresAt).split(",")[0] : null}
        />
        <Field
          label="Data nascita"
          value={detail.birthDate ? fmtDate(detail.birthDate).split(",")[0] : null}
        />
      </div>

      {detail.booking && (
        <p className="text-sm text-neutral-700">
          <strong>Visita:</strong> {fmtDate(detail.booking.startAt)}
          {detail.booking.medico ? ` · ${detail.booking.medico.name}` : ""}
        </p>
      )}

      {/* Documents */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-neutral-600">Documenti</p>
        <div className="flex flex-wrap gap-2">
          {detail.documents.length === 0 && (
            <span className="text-xs text-neutral-400">Nessun documento caricato.</span>
          )}
          {detail.documents.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs"
            >
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-neutral-700 hover:text-pink-600"
              >
                {RENEWAL_DOCUMENT_LABELS[d.type as RenewalDocumentType] ?? d.type}
              </a>
              <button
                title="Approva"
                onClick={async () => {
                  await updateRenewalDocumentStatus({ id: d.id, status: "approved" });
                  void load();
                }}
                className={
                  "rounded p-0.5 " +
                  (d.status === "approved" ? "text-emerald-600" : "text-neutral-300 hover:text-emerald-600")
                }
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                title="Rifiuta"
                onClick={async () => {
                  await updateRenewalDocumentStatus({ id: d.id, status: "rejected" });
                  void load();
                }}
                className={
                  "rounded p-0.5 " +
                  (d.status === "rejected" ? "text-red-500" : "text-neutral-300 hover:text-red-500")
                }
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Transcript */}
      {detail.messages.length > 0 && (
        <details className="rounded-lg bg-white p-2">
          <summary className="cursor-pointer text-xs font-medium text-neutral-600">
            Conversazione ({detail.messages.length})
          </summary>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
            {detail.messages.map((m, i) => (
              <p key={i} className={m.role === "user" ? "text-neutral-800" : "text-pink-700"}>
                <strong>{m.role === "user" ? "Cittadino" : "Bot"}:</strong> {m.content}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* Review actions */}
      <div className="space-y-2">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Note interne…"
          rows={2}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs outline-none focus:border-pink-400"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={async () => {
              const rejected = detail.documents
                .filter((d) => d.status === "rejected")
                .map((d) => d.type);
              const res = await requestDocumentIntegration({
                id,
                missingTypes: rejected,
                message: notes || undefined,
              });
              if (res.success) {
                onNotice("Email di richiesta integrazione inviata al cittadino.");
                onChanged();
                void load();
              } else onNotice(res.message ?? "Errore.");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
            title="Invia al cittadino un'email con link per ricaricare i documenti"
          >
            <MailWarning className="h-3.5 w-3.5" />
            Richiedi integrazione
          </button>
          <button
            onClick={() => setStatus("approved")}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            Approva
          </button>
          <button
            onClick={() => setStatus("completed")}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Completata
          </button>
          <button
            onClick={() => setStatus("rejected")}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Rifiuta
          </button>
          <button
            onClick={() => setStatus("cancelled")}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Annulla visita
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="text-xs text-neutral-400">{label}: </span>
      <span className="text-neutral-800">{value || "—"}</span>
    </div>
  );
}
