import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("access_token")?.value;
  const isAuthPage = request.nextUrl.pathname.startsWith("/login");
  const isExpiredRedirect = request.nextUrl.searchParams.has("expired");

  // If no token and not on an auth page, redirect to login
  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If we have a token and are on the login page:
  // ONLY redirect to dashboard if this ISN'T an explicit 'expired' session flow.
  if (token && isAuthPage && !isExpiredRedirect) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
