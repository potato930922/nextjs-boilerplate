// app/api/session/[id]/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ParamCtx, getParam } from '@/lib/route15';

export async function GET(req: NextRequest, context: ParamCtx<'id'>) {
  const sessionId = await getParam(context, 'id');

  try {
    const { data: rows, error } = await supabaseAdmin
      .from('rows')
      .select('row_id')
      .eq('session_id', sessionId);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const total = rows?.length ?? 0;

    // 처리된 개수 = candidates가 한 개라도 존재하는 row 수
    const { data: doneRows, error: e2 } = await supabaseAdmin
      .from('candidates')
      .select('row_id', { count: 'exact', head: true })
      .in('row_id', rows?.map(r => r.row_id) ?? []);
    if (e2) {
      return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });
    }
    const processed = doneRows?.length ?? 0;
    const ratio = total > 0 ? processed / total : 0;

    return NextResponse.json({ ok: true, total, processed, ratio });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'progress_failed' }, { status: 500 });
  }
}
