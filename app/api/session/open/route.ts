// app/api/session/open/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { session_id } = await req.json();
  if (!session_id) return NextResponse.json({ ok: false, error: 'session_required' }, { status: 400 });

  const jwt = signToken({ session_id });
  const res = NextResponse.json({ ok: true, session_id });
  res.cookies.set('s_token', jwt, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  return res;
}
