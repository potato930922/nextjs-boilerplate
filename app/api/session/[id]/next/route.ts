// app/api/session/[id]/next/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = params.id;
  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  // 아직 완료/스킵/삭제되지 않은, 잠금 안 걸린 row 하나
  // (active_locks 뷰가 있다면 left join으로 제외)
  const { data: row, error: e1 } = await supabaseAdmin
    .from('rows')
    .select('row_id, session_id, order_no, prev_name, category, src_img_url, main_thumb_url, selected_idx, baedaji, skip, delete, status, updated_at, edited_by, version')
    .eq('session_id', sessionId)
    .eq('status', 'pending')
    .order('order_no', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (e1) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: true, row: null, candidates: [] });
  }

  const { data: candidates, error: e2 } = await supabaseAdmin
    .from('candidates')
    .select('idx, img_url, detail_url, price, promo_price, sales, seller')
    .eq('row_id', row.row_id)
    .order('idx', { ascending: true });

  if (e2) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row, candidates });
}
