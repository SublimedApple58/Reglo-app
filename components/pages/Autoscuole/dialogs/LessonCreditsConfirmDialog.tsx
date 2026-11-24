"use client";

import React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * REG-784 — avviso allo staff che prenota per un allievo senza crediti
 * sufficienti («Servono crediti per prenotare» acceso). Salvadanaio ambra,
 * titolo corto dal server («Vittoria non ha crediti», «A Vittoria mancano 30
 * minuti») e una riga: «La guida resterà da pagare.».
 *
 * `ask(title, message)` apre il dialogo e risolve true se lo staff prenota lo
 * stesso, false se annulla.
 */
export function useLessonCreditsConfirm() {
  const [state, setState] = React.useState<{ title: string; message: string } | null>(null);
  const resolver = React.useRef<((ok: boolean) => void) | null>(null);

  const ask = React.useCallback((title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setState({ title, message });
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState(null);
  };

  const dialog = (
    <AlertDialog open={state !== null} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent className="sm:max-w-[460px]" data-testid="lesson-credits-confirm">
        <div className="flex items-center gap-4">
          <div className="relative flex size-[76px] shrink-0 items-center justify-center">
            <span
              aria-hidden
              className="absolute bottom-3 h-[18px] w-12 rounded-full bg-[rgba(245,165,36,0.2)] shadow-[0_0_28px_18px_rgba(245,165,36,0.2)]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/3d/salvadanaio-ambra.png"
              alt=""
              width={76}
              height={76}
              className="relative size-[76px] animate-in fade-in-0 zoom-in-95 duration-300"
            />
          </div>
          <div className="min-w-0">
            <AlertDialogTitle className="text-[20px] font-semibold leading-tight tracking-[-0.4px]">
              {state?.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-1 text-[14.5px] font-medium text-[#6a6a6a]">
              {state?.message}
            </AlertDialogDescription>
          </div>
        </div>
        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel onClick={() => close(false)}>Annulla</AlertDialogCancel>
          <AlertDialogAction className="bg-[#111111] hover:bg-[#000000]" onClick={() => close(true)}>
            Prenota comunque
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { ask, dialog };
}
