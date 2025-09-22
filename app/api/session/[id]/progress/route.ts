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

    // 1) 세션의 모든 row_id 수집
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('rows')
      .select('row_id')
      .eq('session_id', sessionId);

    if (rowsErr) {
      return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });
    }

    const total = rows?.length ?? 0;
    if (!total) {
      return NextResponse.json({ ok: true, total: 0, done: 0, ratio: 1 });
    }

    const rowIds = (rows ?? []).map((r) => r.row_id);

    // 2) 후보가 1개 이상 생성된 row_id 집합
    const { data: cands, error: candErr } = await supabaseAdmin
      .from('candidates')
      .select('row_id')
      .in('row_id', rowIds);

    if (candErr) {
      return NextResponse.json({ ok: false, error: candErr.message }, { status: 500 });
    }

    const doneSet = new Set<number>((cands ?? []).map((c) => c.row_id));
    const done = doneSet.size;
    const ratio = total ? Math.max(0, Math.min(1, done / total)) : 1;

    return NextResponse.json({ ok: true, total, done, ratio });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'progress_failed' }, { status: 500 });
  }
}
