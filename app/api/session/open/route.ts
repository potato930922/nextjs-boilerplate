import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sign, hashPin } from '@/lib/auth';
import { z } from 'zod';

const bodySchema = z.object({
  session_id: z.string().min(1),
  pin: z.string().min(4).max(8),
});

export async function POST(req: NextRequest) {
  const json = await req.json();
  const { session_id, pin } = bodySchema.parse(json);

  const pinHash = hashPin(pin);
  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('session_id, status, pin_hash')
    .eq('session_id', session_id)
    .single();

  if (error || !data) return NextResponse.json({ ok:false, error:'no_session' }, { status: 404 });
  if (data.status !== 'active') return NextResponse.json({ ok:false, error:'closed' }, { status: 403 });
  if (data.pin_hash !== pinHash) return NextResponse.json({ ok:false, error:'bad_pin' }, { status: 401 });

  const token = await sign({ session_id });
  const res = NextResponse.json({ ok:true });
  res.cookies.set('s_token', token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 60*60*24*7 });
  return res;
}
