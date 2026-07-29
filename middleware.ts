import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protects /dashboard with HTTP Basic Auth. The username can be anything; only the
// password (DASHBOARD_PASSWORD env var) is checked.
export function middleware(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Basic ')) {
    const decoded = atob(authHeader.slice(6));
    const separatorIndex = decoded.indexOf(':');
    const password = separatorIndex !== -1 ? decoded.slice(separatorIndex + 1) : '';
    if (password === process.env.DASHBOARD_PASSWORD) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ASP Dashboard"' },
  });
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
