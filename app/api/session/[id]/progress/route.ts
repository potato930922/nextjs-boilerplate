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

    // 인증
    const store = await cookies();
    const token = store.get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // 전체 row 수
    const { data: allRows, error: rErr } = await supabaseAdmin
      .from('rows')
      .select('row_id', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });

    const total = (allRows as any)?.length ?? (typeof (allRows as any) === 'number' ? (allRows as any) : (rErr ? 0 : (rErr as any)));
    // 위 count/head 사용 시 data는 비어 있으므로 count는 PostgREST의 헤더로 넘어오는데
    // supabase-js에서는 count를 반환값의 'count' 속성으로 제공합니다.
    // 안전하게 다시 한 번 가져옵니다:
    const { count: totalCount, error: cErr } = await supabaseAdmin
      .from('rows')
      .select('row_id', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    const totalRows = totalCount ?? 0;

    // 세션의 row_id 목록
    const { data: rowList, error: listErr } = await supabaseAdmin
      .from('rows')
      .select('row_id')
      .eq('session_id', sessionId);

    if (listErr) return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });

    const ids = (rowList ?? []).map(r => r.row_id);
    if (!ids.length) return NextResponse.json({ ok: true, ratio: 1, done: 0, total: 0 });

    // candidates에 존재하는 고유 row_id 수
    const { data: candRows, error: candErr } = await supabaseAdmin
      .from('candidates')
      .select('row_id')
      .in('row_id', ids);

    if (candErr) return NextResponse.json({ ok: false, error: candErr.message }, { status: 500 });

    const doneSet = new Set<number>((candRows ?? []).map(c => c.row_id));
    const done = doneSet.size;
    const totalN = totalRows || ids.length;
    const ratio = totalN ? Math.min(1, done / totalN) : 1;

    return NextResponse.json({ ok: true, done, total: totalN, ratio });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'progress_failed' }, { status: 500 });
  }
}
