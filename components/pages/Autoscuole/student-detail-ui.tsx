"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useUserPhotoUrl } from "@/components/ui/user-photo";

/**
 * Primitivi condivisi del dettaglio allievo (lista + drawer): avatar, pill di
 * stato, etichette di sezione e link-azione blu. Vivevano dentro
 * `AutoscuoleStudentsPage`; sono qui perché il drawer allievo del CONSORZIO
 * (REG-465) usa lo STESSO linguaggio visivo di quello delle autoscuole normali
 * invece di ridisegnarne uno parallelo. Vedi docs/features/consorzio.md.
 */

const AVATAR_COLORS = [
  "#222222",
  "#3f3f3f",
  "#6a6a6a",
  "#460479",
  "#428bff",
  "#1a7f50",
  "#c13515",
  "#b45309",
];

export const avatarColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

export const initialsOf = (firstName: string, lastName: string) =>
  `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

/** "Mario Rossi Verdi" → { firstName: "Mario", lastName: "Rossi Verdi" } */
export const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
};

export type PillTone = "green" | "red" | "amber" | "violet" | "blue" | "gray" | "pink";

const PILL_TONES: Record<PillTone, string> = {
  green: "border-[#c5e8d4] bg-[#f0faf4] text-[#1a7f50]",
  red: "border-[#fad4cc] bg-[#fff4f2] text-[#c13515]",
  amber: "border-[#f0e060] bg-[#fffce0] text-[#7a6a00]",
  violet: "border-[#e2d0fa] bg-[#f3e8ff] text-[#7c3aed]",
  blue: "border-[#c5d8fa] bg-[#f0f4ff] text-[#1a4fa0]",
  gray: "border-[#dddddd] bg-[#f7f7f7] text-[#929292]",
  pink: "border-[#f0c8df] bg-[#fdf0f6] text-[#92174d]",
};

export function Pill({
  tone,
  className,
  children,
}: {
  tone: PillTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[3px] text-[12px] font-semibold",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StudentAvatar({
  student,
  size = 40,
  photoUrl: photoUrlProp,
}: {
  student: { id: string; firstName: string; lastName: string };
  size?: number;
  photoUrl?: string | null;
}) {
  const fetchedPhotoUrl = useUserPhotoUrl(student.id);
  const photoUrl = photoUrlProp ?? fetchedPhotoUrl;
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={`${student.firstName} ${student.lastName}`}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: avatarColor(student.id),
        fontSize: size >= 96 ? 30 : size >= 56 ? 20 : 12,
      }}
    >
      {initialsOf(student.firstName, student.lastName)}
    </div>
  );
}

/** Etichetta di sezione del drawer ("Anagrafica", "Guide"…). */
export const sectionLabelClass = "mb-4 text-[12px] font-semibold text-[#929292]";

/** Link-azione blu inline (proto #428bff) */
export const blueLinkClass =
  "cursor-pointer text-[12px] font-medium text-[#428bff] hover:underline disabled:cursor-default disabled:opacity-50";
