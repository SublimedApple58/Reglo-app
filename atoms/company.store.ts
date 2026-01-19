import { atom } from "jotai";

export type CompanyInfo = {
  id: string;
  name: string;
  role: "admin" | "member";
  logoUrl: string | null;
};

export const companyAtom = atom<CompanyInfo | null>(null);
export const companyRefreshAtom = atom<boolean>(false);
