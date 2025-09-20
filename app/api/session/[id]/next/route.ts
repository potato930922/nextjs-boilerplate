// app/api/session/[id]/next/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // sessionId
  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== id) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  // 다음 pending 1건
  const { data: row, error: rowErr } = await supabaseAdmin
    .from('rows')
    .select('row_id, order_no, prev_name, category, src_img_url, selected_idx, baedaji, skip, delete, status')
    .eq('session_id', id)
    .eq('status', 'pending')
    .order('order_no', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: true, row: null, candidates: [] }); // 끝
  }

  const { data: candidates } = await supabaseAdmin
    .from('candidates')
    .select('idx, img_url, detail_url, price, promo_price, sales, seller')
    .eq('row_id', row.row_id)
    .order('idx', { ascending: true });

  return NextResponse.json({ ok: true, row, candidates: candidates ?? [] });
}
