import { atom } from "jotai";
import type { Session } from "next-auth";

export const userSessionAtom = atom<Session | null>(null);
export const userAvatarUrlAtom = atom<string | null>(null);
export const userRefreshAtom = atom<boolean>(false);
