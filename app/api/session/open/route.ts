// app/api/session/open/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPin, signToken } from '@/lib/auth';
import { z } from 'zod';

const bodySchema = z.object({
  session_id: z.string().min(1),
  title: z.string().optional(),
  pin: z.string().min(4).max(12),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parse = bodySchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  const { session_id, title, pin } = parse.data;

  // 세션 upsert
  const { error } = await supabaseAdmin
    .from('sessions')
    .upsert(
      {
        session_id,
        title: title ?? null,
        pin_hash: hashPin(pin),
        status: 'active',
      },
      { onConflict: 'session_id' }
    );
  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }

  // ✅ 토큰은 반드시 await
  const token = await signToken({ session_id });

  const res = NextResponse.json({ ok: true });
  // ✅ 객체 형태로 설정 (타입 안전)
  res.cookies.set({
    name: 's_token',
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7d
    path: '/',
  });
  return res;
}
