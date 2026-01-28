import { atom } from "jotai";

export type CompanyInfo = {
  id: string;
  name: string;
  role: "admin" | "member";
  logoUrl: string | null;
};

export type CompanySummary = {
  id: string;
  name: string;
  role: "admin" | "member";
  logoUrl: string | null;
  plan: string;
};

export const companyAtom = atom<CompanyInfo | null>(null);
export const companyListAtom = atom<CompanySummary[]>([]);
export const companyRefreshAtom = atom<boolean>(false);
