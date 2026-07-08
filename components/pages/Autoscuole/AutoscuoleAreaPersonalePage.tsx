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
  FileText,
  Loader2,
  Receipt,
} from "lucide-react";

import { userAvatarUrlAtom, userRefreshAtom, userSessionAtom } from "@/atoms/user.store";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
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
 * Area personale (overlay full-screen stile Impostazioni, dal proto
 * #section-areapersonale). Profilo e credenziali (email + reset password OTP)
 * sono funzionanti; contratto/fatture e abbonamento non hanno ancora backend —
 * quelle pane mostrano lo scaffold del design con stati onesti.
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

            {pane === "documenti" && (
              <div>
                <h2 className="mb-9 text-2xl font-bold tracking-[-0.3px] text-foreground">
                  Contratto e fattura
                </h2>
                <div className="mb-8 flex max-w-[680px] items-center gap-[18px] rounded-[14px] border border-[#ebebeb] px-[22px] py-5">
                  <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[10px] bg-[#eef4ff]">
                    <FileText className="size-[22px] text-[#2a6fdb]" strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-foreground">
                      Contratto di servizio Reglo
                    </div>
                    <div className="mt-0.5 text-[13px] font-medium text-[#929292]">
                      Sarà disponibile qui non appena caricato dal team Reglo.
                    </div>
                  </div>
                </div>
                <div className="max-w-[680px]">
                  <div className="flex flex-col items-center rounded-[14px] border border-dashed border-[#dddddd] px-6 py-10 text-center">
                    <Receipt className="mb-3 size-7 text-[#c1c1c1]" strokeWidth={1.5} />
                    <div className="mb-1 text-sm font-semibold text-foreground">
                      Nessuna fattura disponibile
                    </div>
                    <div className="text-[13px] font-medium text-[#929292]">
                      Le fatture del tuo abbonamento compariranno qui.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {pane === "abbonamento" && (
              <div>
                <h2 className="mb-8 text-2xl font-bold tracking-[-0.3px] text-foreground">
                  Abbonamento
                </h2>
                <div className="max-w-[680px] rounded-[14px] border border-[#ebebeb] p-[22px]">
                  <div className="text-[17px] font-bold text-foreground">Il tuo piano</div>
                  <div className="mt-1.5 text-[13.5px] font-medium text-[#929292]">
                    Il dettaglio del piano, con il riepilogo delle voci e il totale mensile, sarà
                    disponibile qui a breve.
                  </div>
                  <div className="my-[18px] h-px bg-[#efefef]" />
                  <div className="text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
                    Per modifiche al piano, posti istruttore o disdette contatta il team Reglo:
                    ti rispondiamo in giornata.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
