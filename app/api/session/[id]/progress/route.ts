// app/api/session/[id]/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await ctx.params;

    const store = await cookies();
    const token = store.get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // 전체 row 수
    const { count: total, error: e1 } = await supabaseAdmin
      .from('rows')
      .select('row_id', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 500 });

    // done 수
    const { count: done, error: e2 } = await supabaseAdmin
      .from('rows')
      .select('row_id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'done');
    if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });

    const t = total ?? 0;
    const d = done ?? 0;
    const ratio = t ? Math.min(1, d / t) : 1;

    return NextResponse.json({ ok: true, done: d, total: t, ratio });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'progress_failed' }, { status: 500 });
  }
}
