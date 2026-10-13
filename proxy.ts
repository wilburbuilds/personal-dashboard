import { NextResponse, type NextRequest } from 'next/server';

/** `?beta=1` or `?beta=0` sets the beta-tabs cookie for this and later requests. */
export function proxy(req: NextRequest) {
  const beta = req.nextUrl.searchParams.get('beta');
  if (beta !== '1' && beta !== '0') return NextResponse.next();
  const headers = new Headers(req.headers);
  const others = (req.headers.get('cookie') || '').split(/;\s*/).filter((c) => c && !c.startsWith('hd-beta='));
  headers.set('cookie', [...others, `hd-beta=${beta}`].join('; '));
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set('hd-beta', beta, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}

export const config = { matcher: ['/', '/t/:path*'] };
