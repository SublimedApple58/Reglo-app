import { cookies } from "next/headers";
import { GLOBAL_ADMIN_EMAIL, GLOBAL_ADMIN_PASSWORD } from "@/lib/constants";
import { hash } from "@/lib/encrypt";

export const BACKOFFICE_COOKIE = "reglo_backoffice_auth";

export async function createBackofficeToken() {
  return hash(`${GLOBAL_ADMIN_EMAIL}:${GLOBAL_ADMIN_PASSWORD}`);
}

export async function setBackofficeCookie() {
  const token = await createBackofficeToken();
  const cookieStore = await cookies();
  cookieStore.set(BACKOFFICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearBackofficeCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(BACKOFFICE_COOKIE);
}

export async function validateBackofficeCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(BACKOFFICE_COOKIE)?.value;
  if (!token) return false;
  const expected = await createBackofficeToken();
  return token === expected;
}
