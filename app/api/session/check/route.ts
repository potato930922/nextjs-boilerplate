// app/api/session/check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const store = await cookies();
  const token = store.get('s_token')?.value;
  const payload = verifyToken(token);
  const want = req.nextUrl.searchParams.get('sid') ?? undefined;

  if (!payload) {
    return NextResponse.json({ ok: false, error: 'no_cookie' }, { status: 401 });
  }
  if (want && payload.session_id !== want) {
    return NextResponse.json({ ok: false, error: 'sid_mismatch', session_id: payload.session_id }, { status: 401 });
  }
  return NextResponse.json({ ok: true, session_id: payload.session_id });
}
