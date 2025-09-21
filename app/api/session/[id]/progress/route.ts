// app/api/session/[id]/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await ctx.params;

  const store = await cookies();
  const token = store.get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  // 전체 rows
  const { data: rows, error: rowErr } = await supabaseAdmin
    .from('rows')
    .select('row_id, status')
    .eq('session_id', sessionId);

  if (rowErr) return NextResponse.json({ ok:false, error: rowErr.message }, { status:500 });

  const total = rows?.length ?? 0;
  const ready = (rows ?? []).filter(r => r.status === 'ready').length;

  const ratio = total ? Math.max(0, Math.min(1, ready / total)) : 1;
  return NextResponse.json({ ok: true, ratio, total, ready }, { status: 200 });
}
