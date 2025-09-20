// app/api/session/open/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sign, hashPin } from '@/lib/auth';
import { z } from 'zod';
import { cookies } from 'next/headers';

const schema = z.object({
  session_id: z.string().min(1),
  pin: z.string().min(4),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  const { session_id, pin } = parsed.data;

  const pinHash = hashPin(pin);

  const { data: ses, error } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('session_id', session_id)
    .eq('pin_hash', pinHash)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
  if (!ses) {
    return NextResponse.json({ ok: false, error: 'invalid_pin_or_session' }, { status: 401 });
  }

  const jwt = sign({ session_id });

  // HttpOnly 쿠키로 내려줌
  (await cookies()).set('s_token', jwt, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7d
  });

  return NextResponse.json({ ok: true });
}
