/* eslint-disable @typescript-eslint/no-explicit-any */
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/db/prisma';
import { cookies } from 'next/headers';
import { compare, hash } from './lib/encrypt';
import { GLOBAL_ADMIN_EMAIL, GLOBAL_ADMIN_PASSWORD } from '@/lib/constants';
import { verifyImpersonationGrant } from '@/lib/impersonation-grant';
import CredentialsProvider from 'next-auth/providers/credentials';

export const config = {
  pages: {
    signIn: '/sign-in',
    error: '/sign-in',
  },
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        if (credentials == null) return null;

        // Find user in database
        const user = await prisma.user.findFirst({
          where: {
            email: credentials.email as string,
          },
        });

        // Auto-provision global admin (first access)
        if (!user) {
          const isGlobalAdmin =
            (credentials.email as string) === GLOBAL_ADMIN_EMAIL &&
            (credentials.password as string) === GLOBAL_ADMIN_PASSWORD;

          if (isGlobalAdmin) {
            const created = await prisma.user.create({
              data: {
                email: GLOBAL_ADMIN_EMAIL,
                password: await hash(GLOBAL_ADMIN_PASSWORD),
                role: 'admin',
                name: GLOBAL_ADMIN_EMAIL.split('@')[0] ?? 'admin',
              },
            });
            return {
              id: created.id,
              name: created.name,
              email: created.email,
              role: created.role,
            };
          }
        }

        // Check if user exists and if the password matches
        if (user && user.password) {
          const isMatch = await compare(
            credentials.password as string,
            user.password
          );

          // If password is correct, return user
          if (isMatch) {
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
            };
          }
        }
        // If user does not exist or password does not match return null
        return null;
      },
    }),
    CredentialsProvider({
      id: 'impersonation',
      name: 'Impersonation',
      credentials: {
        token: { type: 'text' },
      },
      // Login backoffice "Accedi come titolare": consuma un grant firmato (coniato
      // SOLO dopo requireGlobalAdmin) e logga come l'owner reale dell'autoscuola.
      async authorize(credentials) {
        const grant = verifyImpersonationGrant(
          credentials?.token as string | undefined
        );
        if (!grant) return null;

        // Ri-deriva l'autorità dal DB: il target deve essere ancora admin di quella
        // azienda — non ci si fida del payload del grant.
        const member = await prisma.companyMember.findFirst({
          where: {
            companyId: grant.companyId,
            userId: grant.targetUserId,
            role: 'admin',
          },
          include: { user: true },
        });
        if (!member?.user) return null;

        return {
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          role: member.user.role,
          impersonating: true,
          impersonatingCompanyId: grant.companyId,
        } as any;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, user, trigger, token }: any) {
      // Set the user ID from the token
      session.user.id = token.sub;
      session.user.role = token.role;
      session.user.name = token.name;
      session.user.image = token.image;

      // If there is an update, set the user name
      if (trigger === 'update') {
        session.user.name = user.name;
        session.user.image = user.image ?? session.user.image;
      }

      // Impersonazione backoffice: espone il claim (solo nel nostro cookie) così
      // getActiveCompanyContext punta alla company giusta e il resto dell'app tratta
      // l'operatore come l'owner reale.
      if (token.impersonating) {
        session.impersonation = { companyId: token.impersonatingCompanyId };
      }

      return session;
    },
    async jwt({ token, user, trigger, session }: any) {
      // Assign user fields to token
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.image = user.image;

        // Porta il claim di impersonazione nel JWT (dal provider `impersonation`).
        if (user.impersonating) {
          token.impersonating = true;
          token.impersonatingCompanyId = user.impersonatingCompanyId;
        }

        // If user has no name then use the email
        if (user.name === 'NO_NAME') {
          token.name = user.email!.split('@')[0];

          // Update database to reflect the token name
          await prisma.user.update({
            where: { id: user.id },
            data: { name: token.name },
          });
        }
      }

      // Handle session updates
      if (session?.user.name && trigger === 'update') {
        token.name = session.user.name;
      }

      if (trigger === 'update' && session?.user?.image !== undefined) {
        token.image = session.user.image;
      }

      return token;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
