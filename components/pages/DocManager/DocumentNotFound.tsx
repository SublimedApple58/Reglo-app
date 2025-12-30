"use client";

import React from "react";
import Link from "next/link";

type DocumentNotFoundProps = {
  backHref?: string;
};

export function DocumentNotFound({
  backHref = "/user/doc_manager",
}: DocumentNotFoundProps): React.ReactElement {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Documento non trovato</h1>
      <Link href={backHref} className="text-sm font-semibold text-primary">
        Torna ai documenti
      </Link>
    </div>
  );
}
