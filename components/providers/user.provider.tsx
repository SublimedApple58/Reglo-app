"use client";

import { useAtom, useSetAtom } from "jotai";
import type { WritableAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import { getSession, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Session } from "next-auth";

import {
  userAvatarUrlAtom,
  userRefreshAtom,
  userSessionAtom,
} from "@/atoms/user.store";
import { getCurrentUserAvatarUrl } from "@/lib/actions/storage.actions";

export function UserDataProvider({
  children,
  // Sessione risolta lato server e passata al primo render. Serve perché il
  // login è una server action che fa un redirect: il SessionProvider di
  // next-auth NON si rimonta e può restare con in cache la sessione (vuota)
  // della pagina di accesso, lasciando l'app senza sessione lato client finché
  // non si ricarica — è così che spariva l'hamburger al primo accesso (REG-466).
  initialSession,
}: {
  children: ReactNode;
  initialSession?: Session | null;
}) {
  type HydrateTuple = readonly [
    WritableAtom<unknown, [unknown], unknown>,
    unknown,
  ];
  const hydrateValues: HydrateTuple[] = initialSession
    ? [[userSessionAtom as WritableAtom<unknown, [unknown], unknown>, initialSession]]
    : [];
  useHydrateAtoms(hydrateValues);

  const { data: session, status, update } = useSession();
  const setSession = useSetAtom(userSessionAtom);
  const setAvatarUrl = useSetAtom(userAvatarUrlAtom);
  const [refresh, setRefresh] = useAtom(userRefreshAtom);
  const avatarRequestIdRef = useRef(0);
  const resyncedRef = useRef(false);
  // L'oggetto sessione del server è nuovo a ogni render RSC: negli effetti
  // usiamo valori stabili, non la sua identità.
  const hasServerSession = Boolean(initialSession);
  const sessionUserId = (session ?? initialSession)?.user?.id ?? null;

  const loadAvatar = useCallback(async () => {
    const requestId = avatarRequestIdRef.current + 1;
    avatarRequestIdRef.current = requestId;

    const res = await getCurrentUserAvatarUrl();
    if (avatarRequestIdRef.current !== requestId) return;
    if (!res.success || !res.data) return;

    setAvatarUrl(res.data.url ?? null);
  }, [setAvatarUrl]);

  useEffect(() => {
    if (status === "loading") return;
    // Il server ci ha dato una sessione: un null del client è la cache stantia
    // di prima del login, non un logout. Teniamo il dato del server.
    if (!session && hasServerSession) return;
    setSession(session ?? null);
  }, [session, status, setSession, hasServerSession]);

  useEffect(() => {
    // Stessa situazione vista dall'altra parte: riallinea la cache di next-auth
    // (una volta sola), così anche chi usa useSession() direttamente vede la
    // sessione giusta senza ricaricare.
    if (status !== "unauthenticated" || !hasServerSession) return;
    if (resyncedRef.current) return;
    resyncedRef.current = true;
    void update();
  }, [status, hasServerSession, update]);

  useEffect(() => {
    if (!sessionUserId) {
      setAvatarUrl(null);
      return;
    }
    void loadAvatar();
  }, [sessionUserId, loadAvatar, setAvatarUrl]);

  useEffect(() => {
    if (!refresh) return;
    setRefresh(false);

    let isActive = true;
    const run = async () => {
      const freshSession = await getSession();
      if (!isActive) return;

      setSession(freshSession ?? null);

      if (!freshSession) {
        setAvatarUrl(null);
        return;
      }

      const res = await getCurrentUserAvatarUrl();
      if (!isActive) return;
      if (!res.success || !res.data) return;

      setAvatarUrl(res.data.url ?? null);
    };

    void run();
    return () => {
      isActive = false;
    };
  }, [refresh, setRefresh, setSession, setAvatarUrl]);

  return <>{children}</>;
}
