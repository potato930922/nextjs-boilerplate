// app/api/session/[id]/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ Next 15: Promise 형태
) {
  const { id: sessionId } = await context.params; // ✅ await 필요

  try {
    // 인증
    const token = cookies().get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // 전체 row 수
    const { count: totalCount } = await supabaseAdmin
      .from('rows')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    // 후보가 1개 이상 들어간 row 수
    const { data: rows } = await supabaseAdmin
      .from('rows')
      .select('row_id')
      .eq('session_id', sessionId);

    let done = 0;
    if (rows?.length) {
      const ids = rows.map((r) => r.row_id);
      const { data: anyCand } = await supabaseAdmin
        .from('candidates')
        .select('row_id')
        .in('row_id', ids);

      if (anyCand?.length) {
        const set = new Set(anyCand.map((c) => c.row_id));
        done = [...set].length;
      }
    }

    const total = totalCount ?? 0;
    const ratio = total ? Math.min(1, done / total) : 0;

    return NextResponse.json({ ok: true, total, done, ratio });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'progress_failed' }, { status: 500 });
  }
}
