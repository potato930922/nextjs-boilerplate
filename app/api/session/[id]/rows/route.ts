// app/api/session/[id]/rows/route.ts
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

  const { data: rows, error } = await supabaseAdmin
    .from('rows')
    .select('row_id, order_no, prev_name, category, src_img_url, main_thumb_url, selected_idx, baedaji, skip, delete, status')
    .eq('session_id', sessionId)
    .order('order_no');

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });

  const rowIds = (rows ?? []).map(r => r.row_id);
  if (!rowIds.length) return NextResponse.json({ ok:true, rows: [] });

  const { data: cands, error: cErr } = await supabaseAdmin
    .from('candidates')
    .select('row_id, idx, img_url, promo_price, price, sales, seller, detail_url')
    .in('row_id', rowIds)
    .order('idx');

  if (cErr) return NextResponse.json({ ok:false, error: cErr.message }, { status:500 });

  const byRow: Record<number, any[]> = {};
  (cands ?? []).forEach((c) => {
    (byRow[c.row_id] ||= [])[c.idx] = c;
  });

  const out = (rows ?? []).map((r) => ({
    ...r,
    candidates: (byRow[r.row_id] ?? []).slice(0,8).map((x, i) => x ?? ({
      img_url:'', promo_price:null, price:null, sales:null, seller:null, detail_url:''
    })),
  }));

  return NextResponse.json({ ok:true, rows: out }, { status:200 });
}
