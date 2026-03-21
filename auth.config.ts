/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  providers: [], // Required by NextAuthConfig type
  callbacks: {
    authorized({ request, auth }: any) {
      const protectedPaths = [
        /\/profile/,
        /\/user\/(.*)/,
        /\/admin/,
      ];

      const { pathname } = request.nextUrl;
      if (!auth && protectedPaths.some((p) => p.test(pathname))) return false;

      return true;
    },
  },
} satisfies NextAuthConfig;
