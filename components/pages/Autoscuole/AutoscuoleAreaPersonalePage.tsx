"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import { useSession } from "next-auth/react";
import {
  Camera,
  CircleUserRound,
  CreditCard,
  Download,
  FileText,
  Loader2,
  Receipt,
} from "lucide-react";

import { userAvatarUrlAtom, userRefreshAtom, userSessionAtom } from "@/atoms/user.store";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCompanyDocumentDownloadUrl,
  getCompanyDocuments,
} from "@/lib/actions/company-documents.actions";
import { formatDocumentSize, type CompanyDocumentDto } from "@/lib/company-documents";
import {
  getCompanyPlan,
  type CompanyPlanDto,
  type LicensePurchaseDto,
} from "@/lib/actions/company-plan.actions";
import { BILLING_PERIOD_SUFFIX, formatEuroCents } from "@/lib/company-plan";
import { cn } from "@/lib/utils";

type PaneKey = "profilo" | "documenti" | "abbonamento";

const PANES: Array<{ key: PaneKey; label: string; icon: React.ReactNode }> = [
  { key: "profilo", label: "Il tuo profilo", icon: <CircleUserRound className="size-6" strokeWidth={1.9} /> },
  { key: "documenti", label: "Contratto e fattura", icon: <FileText className="size-6" strokeWidth={1.9} /> },
  { key: "abbonamento", label: "Abbonamento", icon: <CreditCard className="size-6" strokeWidth={1.9} /> },
];

const RESET_INPUT_CLASS =
  "h-11 w-full rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-[#c1c1c1] hover:border-[#929292] focus:border-[#222222]";

/** Pane unica "Il tuo profilo": foto personale (cerchio 132px con badge
 * Modifica, stesso pattern della foto autoscuola) + sezione Credenziali:
 * email dell'account e reimpostazione password con codice OTP via email
 * (stessi endpoint del flusso mobile `/api/mobile/auth/password-reset`). */
function ProfiloPane() {
  const toast = useFeedbackToast();
  const { data: sessionData, update: updateSession } = useSession();
  const session = useAtomValue(userSessionAtom);
  const avatarUrl = useAtomValue(userAvatarUrlAtom);
  const setUserRefresh = useSetAtom(userRefreshAtom);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [resetRequesting, setResetRequesting] = React.useState(false);
  const [resetSubmitting, setResetSubmitting] = React.useState(false);
  const [resetCode, setResetCode] = React.useState("");
  const [resetPassword, setResetPassword] = React.useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = React.useState("");

  const name = session?.user?.name ?? "";
  const email = session?.user?.email ?? "";

  const requestResetCode = async () => {
    if (!email || resetRequesting) return;
    setResetRequesting(true);
    try {
      const res = await fetch("/api/mobile/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        toast.error({ description: json.message ?? "Invio del codice non riuscito." });
        return;
      }
      setResetOpen(true);
    } catch {
      toast.error({ description: "Invio del codice non riuscito." });
    } finally {
      setResetRequesting(false);
    }
  };

  const cancelReset = () => {
    setResetOpen(false);
    setResetCode("");
    setResetPassword("");
    setResetPasswordConfirm("");
  };

  const confirmReset = async () => {
    if (resetSubmitting) return;
    if (resetCode.trim().length !== 6) {
      toast.error({ description: "Il codice è di 6 cifre." });
      return;
    }
    if (resetPassword.length < 6) {
      toast.error({ description: "La nuova password deve avere almeno 6 caratteri." });
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      toast.error({ description: "Le password non coincidono." });
      return;
    }
    setResetSubmitting(true);
    try {
      const res = await fetch("/api/mobile/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: resetCode.trim(),
          password: resetPassword,
          confirmPassword: resetPasswordConfirm,
        }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        toast.error({ description: json.message ?? "Reimpostazione non riuscita." });
        return;
      }
      cancelReset();
      toast.success({
        title: "Password aggiornata",
        description: "Dalla prossima volta accedi con la nuova password (anche sull'app).",
      });
    } catch {
      toast.error({ description: "Reimpostazione non riuscita." });
    } finally {
      setResetSubmitting(false);
    }
  };
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "R";

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/avatar", { method: "POST", body: formData });
      const json = (await res.json()) as { success: boolean; data?: { key: string }; message?: string };
      if (!res.ok || !json.success || !json.data) {
        toast.error({ description: json.message ?? "Caricamento non riuscito." });
        return;
      }
      if (sessionData) {
        await updateSession({
          ...sessionData,
          user: { ...sessionData.user, image: json.data.key },
        });
      }
      setUserRefresh(true);
      toast.success({ description: "Foto profilo aggiornata." });
    } catch {
      toast.error({ description: "Caricamento non riuscito." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h2 className="mb-8 text-2xl font-bold tracking-[-0.3px] text-foreground">
        Il tuo profilo
      </h2>
      <div className="flex max-w-[680px] flex-col items-center">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative size-[132px] cursor-pointer"
          title="Modifica foto"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Foto profilo"
              className="size-[132px] rounded-full object-cover"
            />
          ) : (
            <span className="flex size-[132px] items-center justify-center rounded-full bg-[#f2f2f2] text-[30px] font-bold tracking-[-1px] text-[#6a6a6a]">
              {initials}
            </span>
          )}
          <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[#dddddd] bg-white px-3.5 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
            {uploading ? (
              <Loader2 className="size-4 animate-spin text-foreground" />
            ) : (
              <Camera className="size-4 text-foreground" strokeWidth={1.7} />
            )}
            <span className="text-sm font-semibold text-foreground">Modifica</span>
          </span>
        </button>
        <div className="mt-5 text-center">
          {name && <div className="text-base font-bold text-foreground">{name}</div>}
          <p className="mt-1 max-w-[380px] text-[13px] font-medium leading-relaxed text-[#929292]">
            Foto personale del tuo account, separata da quella dell&apos;autoscuola.
          </p>
        </div>
      </div>

      {/* ── Credenziali: email account + reimposta password (OTP email) ── */}
      <div className="mt-12 max-w-[680px]">
        <h3 className="mb-[18px] text-lg font-bold tracking-[-0.3px] text-foreground">
          Credenziali
        </h3>
        <div className="overflow-hidden rounded-2xl border border-[#ebebeb]">
          <div className="px-[22px] py-[18px]">
            <div className="border-b border-[#f2f2f2] py-[11px]">
              <div className="mb-[5px] text-xs font-semibold text-[#929292]">Email</div>
              <div className="truncate text-base font-semibold text-foreground">
                {email || "—"}
              </div>
            </div>
            {!resetOpen ? (
              <div className="flex items-center justify-between gap-4 pt-[11px]">
                <div className="min-w-0">
                  <div className="mb-[5px] text-xs font-semibold text-[#929292]">Password</div>
                  <div className="font-mono text-base font-semibold tracking-[0.5px] text-foreground">
                    ••••••••••••
                  </div>
                </div>
                <button
                  type="button"
                  onClick={requestResetCode}
                  disabled={resetRequesting}
                  className="flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-[10px] border border-[#dddddd] px-4 py-2.5 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-[#f7f7f7] disabled:pointer-events-none disabled:opacity-60"
                >
                  {resetRequesting && <Loader2 className="size-4 animate-spin" />}
                  Reimposta password
                </button>
              </div>
            ) : (
              <div className="pt-[11px]">
                <div className="mb-[5px] text-xs font-semibold text-[#929292]">Password</div>
                <p className="mb-4 text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
                  Ti abbiamo inviato un codice di 6 cifre a{" "}
                  <span className="font-semibold text-foreground">{email}</span>. Inseriscilo
                  qui sotto insieme alla nuova password: la userai anche per accedere
                  all&apos;app.
                </p>
                <div className="mb-3">
                  <div className="mb-2 text-xs font-semibold text-[#555555]">Codice</div>
                  <input
                    value={resetCode}
                    onChange={(e) =>
                      setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    inputMode="numeric"
                    placeholder="000000"
                    className={cn(
                      RESET_INPUT_CLASS,
                      "w-[160px] font-mono text-base tracking-[4px]",
                    )}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs font-semibold text-[#555555]">
                      Nuova password
                    </div>
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="Minimo 6 caratteri"
                      className={RESET_INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-semibold text-[#555555]">
                      Conferma password
                    </div>
                    <input
                      type="password"
                      value={resetPasswordConfirm}
                      onChange={(e) => setResetPasswordConfirm(e.target.value)}
                      placeholder="Ripeti la password"
                      className={RESET_INPUT_CLASS}
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={cancelReset}
                    className="cursor-pointer select-none rounded-[10px] border border-[#dddddd] px-4 py-2.5 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-[#f7f7f7]"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={confirmReset}
                    disabled={resetSubmitting}
                    className="flex cursor-pointer select-none items-center gap-2 rounded-[10px] bg-[#222222] px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-black disabled:pointer-events-none disabled:opacity-60"
                  >
                    {resetSubmitting && <Loader2 className="size-4 animate-spin" />}
                    Conferma nuova password
                  </button>
                  <button
                    type="button"
                    onClick={requestResetCode}
                    disabled={resetRequesting}
                    className="ml-auto cursor-pointer select-none text-[13px] font-semibold text-[#6a6a6a] underline underline-offset-2 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
                  >
                    Invia di nuovo il codice
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Pane "Contratto e fattura": documenti caricati dal team Reglo via
 * backoffice (CompanyDocument) — contratto di servizio, fatture, altri
 * documenti — con download tramite URL firmato. Riservata al titolare
 * (OWNER/INSTRUCTOR_OWNER): agli altri ruoli l'action risponde con errore
 * e mostriamo la nota dedicata.
 */
function DocumentiPane() {
  const toast = useFeedbackToast();
  const [docs, setDocs] = React.useState<CompanyDocumentDto[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [restricted, setRestricted] = React.useState(false);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    getCompanyDocuments().then((res) => {
      if (!active) return;
      if (res.success && res.data) setDocs(res.data);
      else setRestricted(true);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const download = async (doc: CompanyDocumentDto) => {
    setDownloadingId(doc.id);
    try {
      const res = await getCompanyDocumentDownloadUrl(doc.id);
      if (!res.success || !res.data) {
        toast.error({ description: res.message ?? "Download non riuscito." });
        return;
      }
      window.open(res.data.url, "_blank", "noopener");
    } finally {
      setDownloadingId(null);
    }
  };

  const contract = docs.find((d) => d.kind === "contract") ?? null;
  const invoices = docs.filter((d) => d.kind === "invoice");
  const others = docs.filter((d) => d.kind === "other");

  const dateLabel = (iso: string) =>
    new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

  const DownloadButton = ({ doc }: { doc: CompanyDocumentDto }) => (
    <button
      type="button"
      onClick={() => void download(doc)}
      disabled={downloadingId === doc.id}
      title="Scarica"
      className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-[#dddddd] text-[#444444] transition-colors hover:border-[#929292] hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
    >
      {downloadingId === doc.id ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" strokeWidth={1.7} />
      )}
    </button>
  );

  const DocRow = ({ doc, icon }: { doc: CompanyDocumentDto; icon: React.ReactNode }) => (
    <div className="flex items-center gap-3.5 rounded-[12px] border border-[#ebebeb] px-[18px] py-3.5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f5f5f5]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-semibold text-foreground">{doc.title}</div>
        <div className="mt-px truncate text-[12.5px] font-medium text-[#929292]">
          {dateLabel(doc.createdAt)} · {formatDocumentSize(doc.sizeBytes)}
        </div>
      </div>
      <DownloadButton doc={doc} />
    </div>
  );

  if (!loaded) {
    return (
      <div>
        <h2 className="mb-9 text-2xl font-bold tracking-[-0.3px] text-foreground">
          Contratto e fattura
        </h2>
        <div className="max-w-[680px] space-y-3">
          <Skeleton className="h-[88px] rounded-[14px]" />
          <Skeleton className="h-[66px] rounded-[12px]" />
          <Skeleton className="h-[66px] rounded-[12px]" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-9 text-2xl font-bold tracking-[-0.3px] text-foreground">
        Contratto e fattura
      </h2>
      <FadeIn className="max-w-[680px]">
        {restricted ? (
          <div className="flex flex-col items-center rounded-[14px] border border-dashed border-[#dddddd] px-6 py-10 text-center">
            <FileText className="mb-3 size-7 text-[#c1c1c1]" strokeWidth={1.5} />
            <div className="mb-1 text-sm font-semibold text-foreground">
              Sezione riservata al titolare
            </div>
            <div className="text-[13px] font-medium text-[#929292]">
              Contratto e fatture sono visibili solo all&apos;account del titolare.
            </div>
          </div>
        ) : (
          <>
            {/* ── Contratto ── */}
            <div className="mb-8 flex items-center gap-[18px] rounded-[14px] border border-[#ebebeb] px-[22px] py-5">
              <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[10px] bg-[#eef4ff]">
                <FileText className="size-[22px] text-[#2a6fdb]" strokeWidth={1.7} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-foreground">
                  {contract?.title ?? "Contratto di servizio Reglo"}
                </div>
                <div className="mt-0.5 truncate text-[13px] font-medium text-[#929292]">
                  {contract
                    ? `${dateLabel(contract.createdAt)} · ${formatDocumentSize(contract.sizeBytes)}`
                    : "Sarà disponibile qui non appena caricato dal team Reglo."}
                </div>
              </div>
              {contract && <DownloadButton doc={contract} />}
            </div>

            {/* ── Fatture ── */}
            <div className="mb-3 text-[15px] font-bold text-foreground">Fatture</div>
            {invoices.length > 0 ? (
              <div className="space-y-2.5">
                {invoices.map((doc) => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    icon={<Receipt className="size-[18px] text-[#6a6a6a]" strokeWidth={1.7} />}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-[14px] border border-dashed border-[#dddddd] px-6 py-10 text-center">
                <Receipt className="mb-3 size-7 text-[#c1c1c1]" strokeWidth={1.5} />
                <div className="mb-1 text-sm font-semibold text-foreground">
                  Nessuna fattura disponibile
                </div>
                <div className="text-[13px] font-medium text-[#929292]">
                  Le fatture del tuo abbonamento compariranno qui.
                </div>
              </div>
            )}

            {/* ── Altri documenti (solo se presenti) ── */}
            {others.length > 0 && (
              <>
                <div className="mb-3 mt-8 text-[15px] font-bold text-foreground">
                  Altri documenti
                </div>
                <div className="space-y-2.5">
                  {others.map((doc) => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      icon={<FileText className="size-[18px] text-[#6a6a6a]" strokeWidth={1.7} />}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </FadeIn>
    </div>
  );
}

/**
 * Pane "Abbonamento" (proto #ap-tab-abbonamento): il piano assegnato dal team
 * Reglo via backoffice (CompanyPlan) — card "Il tuo piano" con rinnovo, righe
 * con icone 3D (posti istruttore, licenza formazione, Segretaria AI) e totale
 * per periodo. "Gestisci" porta alla chat del centro assistenza (le modifiche
 * al piano passano dal team). Riservata al titolare.
 */
function AbbonamentoPane() {
  const router = useRouter();
  const [plan, setPlan] = React.useState<CompanyPlanDto | null>(null);
  const [purchases, setPurchases] = React.useState<LicensePurchaseDto[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [restricted, setRestricted] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    getCompanyPlan().then((res) => {
      if (!active) return;
      if (res.success && res.data) {
        setPlan(res.data.plan);
        setPurchases(res.data.licensePurchases);
      } else setRestricted(true);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const renewLabel = plan?.renewsAt
    ? `Si rinnova il ${new Date(plan.renewsAt).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`
    : plan?.billingPeriod === "monthly"
      ? "Rinnovo mensile"
      : "Rinnovo annuale";

  // Nella card del piano stanno SOLO le voci ricorrenti: la licenza
  // formazione (una tantum) vive in un blocco separato sotto, fuori dal
  // totale — così non sembra parte del costo annuale/mensile.
  const rows = plan
    ? [
        plan.instructorSeats > 0
          ? {
              key: "seats",
              icon: (
                <Image
                  src="/images/settings/istruttore-nuovo.png"
                  alt=""
                  width={34}
                  height={34}
                  className="block size-[34px] rounded-full object-cover"
                />
              ),
              label: "Posti istruttore",
              detail: `${plan.instructorSeats} × ${formatEuroCents(plan.instructorSeatPriceCents)}`,
              amount: formatEuroCents(plan.instructorSeats * plan.instructorSeatPriceCents),
            }
          : null,
        plan.voiceEnabled
          ? {
              key: "voice",
              icon: (
                <Image
                  src="/images/plan/icon-segretaria.png"
                  alt=""
                  width={34}
                  height={34}
                  className="block size-[34px] object-contain"
                />
              ),
              label: "Segretaria AI",
              detail: "Assistente automatica",
              amount: formatEuroCents(plan.voicePriceCents),
            }
          : null,
      ].filter((row): row is NonNullable<typeof row> => row !== null)
    : [];

  if (!loaded) {
    return (
      <div>
        <h2 className="mb-8 text-2xl font-bold tracking-[-0.3px] text-foreground">
          Abbonamento
        </h2>
        <Skeleton className="h-[280px] max-w-[680px] rounded-[14px]" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-8 text-2xl font-bold tracking-[-0.3px] text-foreground">Abbonamento</h2>
      <FadeIn className="max-w-[680px]">
        {restricted ? (
          <div className="flex flex-col items-center rounded-[14px] border border-dashed border-[#dddddd] px-6 py-10 text-center">
            <CreditCard className="mb-3 size-7 text-[#c1c1c1]" strokeWidth={1.5} />
            <div className="mb-1 text-sm font-semibold text-foreground">
              Sezione riservata al titolare
            </div>
            <div className="text-[13px] font-medium text-[#929292]">
              Il piano dell&apos;autoscuola è visibile solo all&apos;account del titolare.
            </div>
          </div>
        ) : (
          <>
            {!plan ? (
              <div className="rounded-[14px] border border-[#ebebeb] p-[22px]">
                <div className="text-[17px] font-bold text-foreground">Il tuo piano</div>
                <div className="mt-1.5 text-[13.5px] font-medium text-[#929292]">
                  Il dettaglio del piano, con il riepilogo delle voci e il totale, sarà
                  disponibile qui non appena attivato dal team Reglo.
                </div>
              </div>
            ) : (
              <div className="rounded-[14px] border border-[#ebebeb] p-[22px]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[17px] font-bold text-foreground">Il tuo piano</div>
                    <div className="mt-1.5 text-[13.5px] font-medium text-[#929292]">
                      {renewLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/user/autoscuole/assistenza")}
                    className="shrink-0 cursor-pointer text-sm font-semibold text-foreground underline decoration-1 underline-offset-2 transition-all hover:text-black hover:decoration-2"
                  >
                    Gestisci
                  </button>
                </div>
                <div className="my-[18px] h-px bg-[#efefef]" />
                <div className="flex flex-col gap-[11px]">
                  {rows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-[13px]">
                        <div className="flex size-9 shrink-0 items-center justify-center">
                          {row.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">
                            {row.label}
                          </div>
                          <div className="mt-px text-[12.5px] font-medium text-[#929292]">
                            {row.detail}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 whitespace-nowrap text-sm font-semibold text-foreground">
                        {row.amount}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="my-[18px] h-px bg-[#efefef]" />
                <div className="flex items-center justify-between gap-4">
                  <div className="text-[15px] font-bold text-foreground">Totale</div>
                  <div className="shrink-0 whitespace-nowrap text-[17px] font-bold text-foreground">
                    {formatEuroCents(plan.totalCents)}
                    {BILLING_PERIOD_SUFFIX[plan.billingPeriod]}
                  </div>
                </div>
              </div>
            )}

            {/* ── Acquisti una tantum: registro degli acquisti licenze ── */}
            {purchases.length > 0 && (
              <div className="mt-4 rounded-[14px] border border-[#ebebeb] p-[22px]">
                <div className="text-[15px] font-bold text-foreground">Acquisti una tantum</div>
                <div className="mt-1 text-[12.5px] font-medium text-[#929292]">
                  Fuori dal totale ricorrente: quando le licenze si esauriscono, se ne
                  acquistano altre.
                </div>
                <div className="my-4 h-px bg-[#efefef]" />
                <div className="flex flex-col gap-[11px]">
                  {purchases.map((purchase) => (
                    <div key={purchase.id} className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-[13px]">
                        <div className="flex size-9 shrink-0 items-center justify-center">
                          <Image
                            src="/images/plan/icon-licenza.png"
                            alt=""
                            width={34}
                            height={34}
                            className="block size-[34px] object-contain"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">
                            Licenza formazione
                          </div>
                          <div className="mt-px text-[12.5px] font-medium text-[#929292]">
                            {purchase.seats} × {formatEuroCents(purchase.seatPriceCents)} ·{" "}
                            {new Date(purchase.purchasedAt).toLocaleDateString("it-IT", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 whitespace-nowrap text-sm font-semibold text-foreground">
                        {formatEuroCents(purchase.totalCents)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-4 text-[13px] font-medium leading-relaxed text-[#929292]">
              Per modifiche al piano, posti istruttore, nuove licenze formazione o disdette
              contatta il team Reglo: ti rispondiamo in giornata.
            </p>
          </>
        )}
      </FadeIn>
    </div>
  );
}

/**
 * Area personale (overlay full-screen stile Impostazioni, dal proto
 * #section-areapersonale). Profilo/credenziali (reset password OTP),
 * "Contratto e fattura" (documenti dal backoffice) e Abbonamento (piano
 * dal backoffice) sono funzionanti.
 */
export function AutoscuoleAreaPersonalePage() {
  const router = useRouter();
  const [pane, setPane] = React.useState<PaneKey>("profilo");

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-white"
      data-testid="autoscuole-area-personale-page"
    >
      {/* ── Header overlay ── */}
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#dddddd] px-6 lg:px-10">
        <Image
          src="/images/nav/logo-reglo-tight.png"
          alt="Reglo"
          width={30}
          height={30}
          className="select-none object-contain"
        />
        <button
          type="button"
          onClick={() => router.push("/user/autoscuole")}
          className="cursor-pointer select-none rounded-full px-[22px] py-2 text-sm font-medium text-foreground transition-colors hover:bg-[#f2f2f2]"
        >
          Fatto
        </button>
      </div>

      <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
        <div className="grid w-full max-w-[1280px] min-h-0 grid-cols-1 md:grid-cols-[400px_1fr]">
          {/* ── Sidebar ── */}
          <div className="min-h-0 overflow-y-auto border-b border-[#ebebeb] px-6 py-6 md:border-b-0 md:border-r md:py-12 md:pl-10 md:pr-12 lg:pl-0">
            <h1 className="mb-8 text-[28px] font-bold tracking-[-0.6px] text-foreground">
              Area personale
            </h1>
            <div className="flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-0.5">
              {PANES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPane(item.key)}
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-4 rounded-[10px] px-5 py-4 text-left text-lg transition-colors",
                    pane === item.key
                      ? "bg-[#e8e8e8] font-semibold text-foreground"
                      : "font-medium text-[#444444] hover:bg-[#ebebeb] hover:text-foreground",
                  )}
                >
                  {item.icon}
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Content ── */}
          <div className="min-h-0 min-w-0 overflow-y-auto px-6 py-8 md:px-10 md:py-12 lg:pl-12 lg:pr-0">
            {pane === "profilo" && <ProfiloPane />}

            {pane === "documenti" && <DocumentiPane />}

            {pane === "abbonamento" && <AbbonamentoPane />}
          </div>
        </div>
      </div>
    </div>
  );
}
