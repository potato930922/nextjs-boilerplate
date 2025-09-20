// app/api/session/[id]/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sessionId = params.id;

  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  const { count: total, error: e1 } = await supabaseAdmin
    .from('rows')
    .select('row_id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 500 });

  const { count: done, error: e2 } = await supabaseAdmin
    .from('rows')
    .select('row_id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'done');
  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });

  const ratio = total ? (done! / total!) : 0;
  return NextResponse.json({ ok: true, total, done, ratio });
}
