import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  export interface Session {
    user: {
      role: string;
    } & DefaultSession['user'];
    // Presente solo nelle sessioni di impersonazione backoffice ("Accedi come
    // titolare"). Vive esclusivamente nel cookie dell'operatore Reglo.
    impersonation?: { companyId: string };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    impersonating?: boolean;
    impersonatingCompanyId?: string;
  }
}
