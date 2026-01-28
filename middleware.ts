import NextAuth, { NextAuthRequest } from 'next-auth';
import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { authConfig } from './auth.config';
import { routing } from './i18n/routing';
import { publicRoutes } from './lib/constants';

const handleI18nRouting = createMiddleware(routing);

const { auth } = NextAuth(authConfig);

const isPublicRoute = (req: NextRequest) => {
  const localePrefix = new RegExp(`^/(${routing.locales.join('|')})`, 'i');
  const normalizedPath = req.nextUrl.pathname.replace(localePrefix, '');

  if (
    normalizedPath.startsWith('/public/documents/') ||
    normalizedPath === '/public/documents'
  ) {
    return true;
  }

  if (normalizedPath === '/invite' || normalizedPath.startsWith('/invite/')) {
    return true;
  }

  const publicPathnameRegex = RegExp(
      `^(/(${routing.locales.join('|')}))?(${publicRoutes
        .flatMap((p) => (p === '/' ? ['', '/'] : p))
        .join('|')})/?$`,
      'i'
    ),
    isPublicRoute = publicPathnameRegex.test(req.nextUrl.pathname);

  return isPublicRoute;
};

const authMiddleware = auth((req: NextAuthRequest) => {
  const isAuthenticated = !!req.auth;

  if (isAuthenticated) {
    return handleI18nRouting(req);
  } else {
    const redirectUrl = new URL('/sign-in', req.url);
    redirectUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);

    return NextResponse.redirect(redirectUrl);
  }
});

export default function middleware(req: NextRequest) {
  const isPublic = isPublicRoute(req);

  if (isPublic) {
    return handleI18nRouting(req);
  } else {
    return (authMiddleware as any)(req);
  }
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
