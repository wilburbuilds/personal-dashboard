import { NextResponse, type NextRequest } from 'next/server';

/** The beta gate is gone: `?beta=…` and any old hd-beta cookie are ignored; the cookie is cleared if present. */
export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  if (req.cookies.has('hd-beta')) res.cookies.delete('hd-beta');
  return res;
}

export const config = { matcher: ['/', '/t/:path*'] };
