"use client";

import React from "react";
import { useAtom } from "jotai";
import { Camera } from "lucide-react";

import { cn } from "@/lib/utils";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { companyAtom } from "@/atoms/company.store";
import { getCurrentCompany, updateCompanyName } from "@/lib/actions/company.actions";
import { getMyProfile, updateProfile } from "@/lib/actions/user.actions";

type FieldId = "nome" | "autoscuola" | "telefono";

type FieldDef = {
  id: FieldId;
  label: string;
  value: string;
  sub?: string;
};

/** Maschera un'email come nel proto: r***7@gmail.com */
const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  if (!domain || local.length <= 2) return email;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
};

/**
 * Pane "Informazioni aziendali" dell'overlay Impostazioni (proto
 * #config-tab-impostazioni): foto profilo tonda 132px con Modifica (upload
 * logo company) + campi con edit inline (label 16/600, valore grigio, link
 * sottolineato Modifica/Aggiungi a destra).
 */
export function BusinessInfoPane() {
  const toast = useFeedbackToast();
  const [company, setCompany] = useAtom(companyAtom);
  const [loading, setLoading] = React.useState(true);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [companyName, setCompanyName] = React.useState("");
  const [profile, setProfile] = React.useState<{ name: string; email: string; phone: string | null } | null>(null);

  const [editing, setEditing] = React.useState<FieldId | null>(null);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let active = true;
    Promise.all([getCurrentCompany(), getMyProfile()]).then(([companyRes, profileRes]) => {
      if (!active) return;
      if (companyRes.success && companyRes.data) {
        setCompanyName(companyRes.data.name ?? "");
        setLogoUrl(companyRes.data.logoUrl ?? null);
      }
      if (profileRes.success) {
        setProfile({
          name: profileRes.data.name ?? "",
          email: profileRes.data.email ?? "",
          phone: profileRes.data.phone ?? null,
        });
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const initials = React.useMemo(() => {
    const source = companyName || profile?.name || "";
    return (
      source
        .replace(/[^A-Za-zÀ-ÿ ]/g, "")
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "AU"
    );
  }, [companyName, profile?.name]);

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !company?.id || uploading) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", company.id);
      const res = await fetch("/api/uploads/company-logo", { method: "POST", body: formData });
      const json = (await res.json()) as { success: boolean; data?: { url: string }; message?: string };
      if (!json.success || !json.data) {
        toast.error({ description: json.message ?? "Caricamento non riuscito." });
        return;
      }
      setLogoUrl(json.data.url);
      const url = json.data.url;
      setCompany((prev) => (prev ? { ...prev, logoUrl: url } : prev));
      toast.success({ description: "Foto aggiornata." });
    } catch {
      toast.error({ description: "Caricamento non riuscito." });
    } finally {
      setUploading(false);
    }
  };

  const startEdit = (field: FieldDef) => {
    setEditing(field.id);
    setDraft(field.value);
  };

  const handleSave = async (field: FieldDef) => {
    if (saving) return;
    const value = draft.trim();
    if (field.id !== "telefono" && !value) {
      toast.error({ description: "Il campo non può essere vuoto." });
      return;
    }
    setSaving(true);
    try {
      if (field.id === "autoscuola") {
        if (!company?.id) return;
        const res = await updateCompanyName({ companyId: company.id, name: value });
        if (!res.success) {
          toast.error({ description: res.message ?? "Errore nel salvataggio." });
          return;
        }
        setCompanyName(value);
        setCompany((prev) => (prev ? { ...prev, name: value } : prev));
      } else {
        if (!profile) return;
        const res = await updateProfile({
          name: field.id === "nome" ? value : profile.name,
          email: profile.email,
          ...(field.id === "telefono" ? { phone: value || null } : {}),
        });
        if (!res.success) {
          toast.error({ description: res.message ?? "Errore nel salvataggio." });
          return;
        }
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                ...(field.id === "nome" ? { name: value } : {}),
                ...(field.id === "telefono" ? { phone: value || null } : {}),
              }
            : prev,
        );
      }
      toast.success({ description: "Salvato." });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[640px]">
        <div className="mb-10 flex justify-center">
          <Skeleton className="size-[132px] rounded-full" />
        </div>
        <div className="flex flex-col">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "flex items-start justify-between gap-6 py-5",
                i < 3 && "border-b border-[#ebebeb]",
              )}
            >
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="mt-2.5 h-3.5 w-56 max-w-full" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const fields: FieldDef[] = [
    { id: "nome", label: "Nome e cognome", value: profile?.name ?? "" },
    { id: "autoscuola", label: "Nome Autoscuola", value: companyName },
    {
      id: "telefono",
      label: "Numero di telefono",
      value: profile?.phone ?? "",
      sub: "Recapito dove (se attivata la segreteria AI) possono contattarti allievi o persone interessate.",
    },
  ];

  return (
    <FadeIn className="max-w-[640px]">
      {/* ── Foto profilo ── */}
      <div className="mb-10 flex justify-center">
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
            onChange={handlePhotoChange}
          />
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Foto autoscuola"
              className="size-[132px] rounded-full object-cover"
            />
          ) : (
            <span className="flex size-[132px] items-center justify-center rounded-full bg-navy-900 text-[30px] font-bold tracking-[-1px] text-white">
              {initials}
            </span>
          )}
          {/* Pill dal proto (photoBtnStyle): niente bordo, all'hover si aggiunge
              un ring 1px #d9d9d9 dentro la box-shadow */}
          <span className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-[7px] whitespace-nowrap rounded-full bg-white px-[15px] py-2 shadow-[0_3px_10px_rgba(0,0,0,0.14)] transition-shadow duration-150 hover:shadow-[0_3px_10px_rgba(0,0,0,0.14),0_0_0_1px_#d9d9d9]">
            {uploading ? (
              <LoadingDots className="min-h-5 text-foreground" />
            ) : (
              <>
                <Camera className="size-4 text-foreground" strokeWidth={1.7} />
                <span className="text-sm font-semibold text-foreground">Modifica</span>
              </>
            )}
          </span>
        </button>
      </div>

      {/* ── Campi inline edit ── */}
      <div className="flex flex-col">
        {fields.map((field, index) => {
          const hasValue = Boolean(field.value.trim());
          const isEditing = editing === field.id;
          return (
            <div
              key={field.id}
              className={cn("py-5", index < fields.length && "border-b border-[#ebebeb]")}
            >
              {isEditing ? (
                <div className="w-full">
                  <p className="mb-2.5 text-base font-semibold text-foreground">{field.label}</p>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleSave(field);
                      if (event.key === "Escape") setEditing(null);
                    }}
                    className="w-full max-w-[420px] rounded-[10px] border-[1.5px] border-[#222222] px-3.5 py-3 text-[15px] font-medium text-foreground outline-none"
                  />
                  <div className="mt-3.5 flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSave(field)}
                      className="flex min-h-[40px] min-w-[78px] cursor-pointer items-center justify-center rounded-[8px] bg-[#222222] px-[18px] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
                    >
                      {saving ? <LoadingDots /> : "Salva"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="cursor-pointer rounded-[8px] px-[18px] py-2.5 text-sm font-semibold text-foreground hover:text-navy-900"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex w-full items-start justify-between">
                  <div>
                    <p className="text-base font-semibold text-foreground">{field.label}</p>
                    <p className="mt-1 text-sm font-medium text-[#6a6a6a]">
                      {hasValue ? field.value : "Non fornito"}
                    </p>
                    {field.sub && (
                      <p className="mt-1.5 max-w-[520px] text-[13px] font-medium leading-relaxed text-[#929292]">
                        {field.sub}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(field)}
                    className="ml-6 shrink-0 cursor-pointer whitespace-nowrap text-sm font-semibold text-foreground underline underline-offset-2 hover:decoration-2"
                  >
                    {hasValue ? "Modifica" : "Aggiungi"}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Email — sola lettura (il cambio email passa dall'assistenza) */}
        <div className="py-5">
          <div className="flex w-full items-start justify-between">
            <div>
              <p className="text-base font-semibold text-foreground">Indirizzo email</p>
              <p className="mt-1 text-sm font-medium text-[#6a6a6a]">
                {profile?.email ? maskEmail(profile.email) : "Non fornito"}
              </p>
              <p className="mt-1.5 max-w-[520px] text-[13px] font-medium leading-relaxed text-[#929292]">
                L&apos;email è il tuo identificativo di accesso: per modificarla contatta l&apos;assistenza Reglo.
              </p>
            </div>
          </div>
        </div>
      </div>
    </FadeIn>
  );
}
