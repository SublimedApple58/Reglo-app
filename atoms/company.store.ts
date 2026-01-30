import { atom } from "jotai";
import type { CompanyServiceInfo } from "@/lib/services";

export type CompanyInfo = {
  id: string;
  name: string;
  role: "admin" | "member";
  logoUrl: string | null;
  services?: CompanyServiceInfo[];
};

export type CompanySummary = {
  id: string;
  name: string;
  role: "admin" | "member";
  logoUrl: string | null;
  plan: string;
  services?: CompanyServiceInfo[];
};

export const companyAtom = atom<CompanyInfo | null>(null);
export const companyListAtom = atom<CompanySummary[]>([]);
export const companyRefreshAtom = atom<boolean>(false);
