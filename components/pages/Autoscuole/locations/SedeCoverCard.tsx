"use client";

import { useRef, useState } from "react";
import { ImageIcon } from "lucide-react";

import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";

/** Lato lungo inviato al server: sotto il limite body di Vercel, il server poi normalizza a 1600 px. */
const UPLOAD_MAX_SIDE = 2000;

/**
 * Rimpicciolisce nel browser (JPEG, rotazione EXIF applicata) così anche le
 * foto da 10+ MB del telefono passano il limite di 4,5 MB delle funzioni.
 */
async function shrinkForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.88),
  );
}

type Props = {
  name: string;
  address: string;
  coverPhotoUrl: string | null;
  onChange: (url: string | null) => void;
};

/**
 * «Foto della sede» in cima a Sede e luoghi (REG-639, anteprima approvata da
 * Tiziano il 28/10): la copertina che gli istruttori vedono nell'app, in
 * Disponibilità. Solo la sede ce l'ha, non i luoghi extra (parcheggi, punti di
 * ritrovo). Senza foto l'app mostra un'immagine d'esempio di Reglo.
 */
export function SedeCoverCard({ name, address, coverPhotoUrl, onChange }: Props) {
  const toast = useFeedbackToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);

  const pick = () => {
    if (!busy) inputRef.current?.click();
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) {
      toast.error({ description: "Scegli una foto (JPG, PNG o WebP)." });
      return;
    }
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", await shrinkForUpload(file), "sede.jpg");
      const res = await fetch("/api/uploads/location-cover", { method: "POST", body });
      const json = (await res.json()) as { success: boolean; data?: { url: string | null }; message?: string };
      if (!json.success) {
        toast.error({ description: json.message ?? "Caricamento non riuscito." });
        return;
      }
      onChange(json.data?.url ?? null);
      toast.success({ description: "Foto della sede aggiornata." });
    } catch {
      toast.error({ description: "Caricamento non riuscito." });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy("remove");
    try {
      const res = await fetch("/api/uploads/location-cover", { method: "DELETE" });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!json.success) {
        toast.error({ description: json.message ?? "Rimozione non riuscita." });
        return;
      }
      onChange(null);
      toast.success({ description: "Foto della sede rimossa." });
    } catch {
      toast.error({ description: "Rimozione non riuscita." });
    } finally {
      setBusy(null);
    }
  };

  const linkClass =
    "cursor-pointer text-sm font-semibold underline decoration-1 underline-offset-2 transition-colors hover:decoration-2 disabled:cursor-default";

  return (
    <div className="rounded-[12px] border border-[#e8e8e8] p-5" data-testid="sede-cover-card">
      <div className="text-sm font-semibold text-foreground">Foto della sede</div>
      <div className="mt-0.5 max-w-[520px] text-xs font-medium leading-[1.45] text-[#929292]">
        La copertina che i tuoi istruttori vedono nell&apos;app, in Disponibilità. Meglio una foto
        orizzontale dell&apos;ingresso o dell&apos;aula.
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          {coverPhotoUrl ? (
            <div className="relative aspect-[402/212] overflow-hidden rounded-[12px] bg-[#f6f6f6]">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL pubblico R2, niente ottimizzatore */}
              <img src={coverPhotoUrl} alt={`Foto di ${name}`} className="size-full object-cover" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_60%,rgba(0,0,0,0.18))]" />
              {busy === "upload" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <LoadingDots className="text-foreground" />
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={pick}
              disabled={busy !== null}
              data-testid="sede-cover-upload"
              className="flex aspect-[402/212] w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[12px] border border-dashed border-[#d6d6d6] bg-[#fafafa] transition-colors hover:border-[#222222] disabled:cursor-default"
            >
              {busy === "upload" ? (
                <LoadingDots className="min-h-5 text-foreground" />
              ) : (
                <>
                  <ImageIcon className="size-[26px] text-foreground" strokeWidth={1.5} />
                  <span className="text-sm font-semibold text-foreground underline decoration-1 underline-offset-[3px]">
                    Carica una foto
                  </span>
                  <span className="text-xs font-medium text-[#929292]">JPG, PNG o WebP · foto orizzontale</span>
                </>
              )}
            </button>
          )}

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{name}</div>
              <div className="mt-0.5 truncate text-xs font-medium text-[#929292]">Sede principale · {address}</div>
            </div>
            {coverPhotoUrl ? (
              <div className="flex shrink-0 gap-3.5">
                <button type="button" onClick={pick} disabled={busy !== null} className={`${linkClass} text-foreground`}>
                  Sostituisci
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy !== null}
                  className={`${linkClass} text-[#6a6a6a]`}
                  data-testid="sede-cover-remove"
                >
                  {busy === "remove" ? <LoadingDots /> : "Rimuovi"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-[18px] border-t border-[#f0f0f0] pt-4 text-xs font-medium text-[#929292]">
        Senza foto, l&apos;app mostra un&apos;immagine d&apos;esempio di Reglo.
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
        data-testid="sede-cover-input"
      />
    </div>
  );
}
