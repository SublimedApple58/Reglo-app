"use client";

import { useAtom, useSetAtom } from "jotai";
import { getSession, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import {
  userAvatarUrlAtom,
  userRefreshAtom,
  userSessionAtom,
} from "@/atoms/user.store";
import { getCurrentUserAvatarUrl } from "@/lib/actions/storage.actions";

export function UserDataProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const setSession = useSetAtom(userSessionAtom);
  const setAvatarUrl = useSetAtom(userAvatarUrlAtom);
  const [refresh, setRefresh] = useAtom(userRefreshAtom);
  const avatarRequestIdRef = useRef(0);

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
    setSession(session ?? null);
  }, [session, status, setSession]);

  useEffect(() => {
    if (!session) {
      setAvatarUrl(null);
      return;
    }
    void loadAvatar();
  }, [session, loadAvatar, setAvatarUrl]);

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
