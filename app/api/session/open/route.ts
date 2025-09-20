// app/api/session/open/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPin, signToken } from '@/lib/auth';
import { z } from 'zod';

const bodySchema = z.object({
  session_id: z.string().min(1),
  pin: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  const { session_id, pin } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('pin_hash, status')
    .eq('session_id', session_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (data.status !== 'active') {
    return NextResponse.json({ ok: false, error: 'closed' }, { status: 403 });
  }

  const ok = data.pin_hash === hashPin(pin);
  if (!ok) {
    return NextResponse.json({ ok: false, error: 'pin_mismatch' }, { status: 401 });
  }

  const token = signToken({ session_id });
  const res = NextResponse.json({ ok: true });
  res.cookies.set('s_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return res;
}
