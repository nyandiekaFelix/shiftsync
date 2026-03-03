import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Auth cookies are currently set by the API domain.
  // Next middleware runs on the web domain and cannot reliably read that cookie,
  // so route protection must happen client-side via AuthProvider checkAuth().
  void request;
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
